#!/usr/bin/env python3
"""Pull ANNO issue metadata and page snippets for the exact term Kamaik.

ANNO is the Austrian National Library newspaper archive. Kamaik is the
historical German name of Kamýk u Litoměřic. This stores short keyword-in-context
snippets and citation links, not full newspaper pages.

Requests are paced. Progress is written after every response so a restart
continues where it stopped.
"""

from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ISSUES = DATA / "issues.jsonl"
SNIPPETS = DATA / "snippets.jsonl"
STATE = DATA / "state.json"

QUERY = "Kamaik"
SEARCH = "https://anno.onb.ac.at/anno-suche/rest/search/complex"
SNIPPET = "https://anno.onb.ac.at/anno-suche/rest/search/snippet"
USER_AGENT = "kamaik-catalog/0.1 (personal historical research; paced)"
PAUSE_SECONDS = 1.25
PAGE_STEP = 10

TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


def clean_snippet(raw: str) -> str:
    text = raw.replace("<br/>", " ").replace("<br>", " ").replace("</br>", " ")
    text = TAG_RE.sub("", text)
    text = html.unescape(text)
    text = SPACE_RE.sub(" ", text).strip()
    return text


def classify(text: str) -> str:
    folded = text.lower()
    if any(word in folded for word in ("burg", "ruine", "schloss", "kastell")):
        return "hrad"
    if any(word in folded for word in ("gemeinde", "ortsvorstand", "bürgermeister", "gemeindeamt")):
        return "obec"
    if any(word in folded for word in ("inserat", "zu verkaufen", "verkauf", "anzeige")):
        return "inzerat"
    if any(word in folded for word in ("herr ", "frau ", "frl.", "witwe", "geboren")):
        return "osoba"
    if any(word in folded for word in ("kundmachung", "amtsblatt", "verordnung", "gericht")):
        return "uredni"
    if any(word in folded for word in ("feuerwehr", "brand")):
        return "hasici"
    if any(word in folded for word in ("schule", "lehrer", "pfarrer", "kirche", "kapelle")):
        return "skola-cirkev"
    return "zminka"


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"phase": "issues", "next_from": 0, "total": None, "snippet_index": 0}


def save_state(state: dict) -> None:
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def load_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    ids: set[str] = set()
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        ids.add(json.loads(line)["docId"])
    return ids


def request_json(url: str) -> dict:
    delay = PAUSE_SECONDS
    last_error: Exception | None = None
    for attempt in range(6):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                payload = json.load(response)
            time.sleep(PAUSE_SECONDS)
            return payload
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in (429, 500, 502, 503, 504):
                raise
        except (urllib.error.URLError, TimeoutError) as error:
            last_error = error
        time.sleep(delay)
        delay = min(delay * 2, 60)
    raise RuntimeError(f"ANNO request failed after retries: {url}") from last_error


def issue_record(document: dict) -> dict:
    uid = document.get("uid") or {}
    date = (uid.get("annoDate") or {}).get("date")
    if not date and uid.get("owner") == "ANNOP":
        date = uid.get("date") or uid.get("year")
    if isinstance(date, int):
        date = str(date)
    return {
        "docId": document["docId"],
        "date": date,
        "title": document.get("displayTitle"),
        "acronym": uid.get("acronym"),
        "place": (document.get("places") or [None])[0],
        "medium": document.get("type"),
        "language": (document.get("languages") or [None])[0],
        "hits": document.get("totalHitsInDoc"),
        "pageCount": document.get("pageCount"),
        "url": document.get("openUrl"),
        "thumbnail": document.get("thumbnailURL"),
    }


def harvest_issues(state: dict) -> None:
    seen = load_ids(ISSUES)
    next_from = int(state.get("next_from") or 0)
    total = state.get("total")
    with ISSUES.open("a", encoding="utf-8") as handle:
        while total is None or next_from <= total:
            params = urllib.parse.urlencode(
                [("text", QUERY), ("from", str(next_from)), ("sort", "date asc"), ("facets", "false")]
            )
            payload = request_json(f"{SEARCH}?{params}")
            total = int(payload["totalHits"])
            documents = payload.get("documents") or []
            if not documents:
                break
            fresh = 0
            for document in documents:
                record = issue_record(document)
                if record["docId"] in seen:
                    continue
                seen.add(record["docId"])
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
                fresh += 1
            handle.flush()
            next_from += PAGE_STEP
            state.update({"phase": "issues", "next_from": next_from, "total": total, "issues": len(seen)})
            save_state(state)
            print(f"issues {len(seen)}/{total} from={next_from} fresh={fresh}", flush=True)
            if next_from > total + PAGE_STEP:
                break
    state.update({"phase": "snippets", "total": total, "issues": len(seen)})
    save_state(state)


def harvest_snippets(state: dict) -> None:
    issues = []
    for line in ISSUES.read_text().splitlines():
        if line.strip():
            issues.append(json.loads(line))
    done = load_ids(SNIPPETS)
    start = int(state.get("snippet_index") or 0)
    with SNIPPETS.open("a", encoding="utf-8") as handle:
        for index, issue in enumerate(issues):
            if index < start or issue["docId"] in done:
                continue
            params = urllib.parse.urlencode([("documentId", issue["docId"]), ("query", QUERY)])
            payload = request_json(f"{SNIPPET}?{params}")
            snippets = []
            for page in payload.get("snippetPages") or []:
                for snippet in page.get("snippets") or []:
                    text = clean_snippet(snippet.get("text") or "")
                    if not text:
                        continue
                    snippets.append(
                        {
                            "page": snippet.get("page", page.get("page")),
                            "text": text,
                            "url": snippet.get("openURL") or page.get("openURL") or issue.get("url"),
                            "kind": classify(text),
                        }
                    )
            record = {
                "docId": issue["docId"],
                "date": issue.get("date"),
                "title": issue.get("title"),
                "place": issue.get("place"),
                "medium": issue.get("medium"),
                "hits": issue.get("hits"),
                "url": issue.get("url"),
                "snippets": snippets,
            }
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            handle.flush()
            done.add(issue["docId"])
            state.update({"phase": "snippets", "snippet_index": index + 1, "snippets": len(done)})
            save_state(state)
            if index % 25 == 0:
                print(f"snippets {len(done)}/{len(issues)} {issue['docId']} n={len(snippets)}", flush=True)
    state.update({"phase": "done", "snippet_index": len(issues), "snippets": len(done)})
    save_state(state)
    print("done", flush=True)


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    state = load_state()
    print(f"resume phase={state.get('phase')} from={state.get('next_from')} snippet={state.get('snippet_index')}", flush=True)
    if state.get("phase") in (None, "issues"):
        harvest_issues(state)
        state = load_state()
    if state.get("phase") == "snippets":
        harvest_snippets(state)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("stopped", file=sys.stderr)
        raise
