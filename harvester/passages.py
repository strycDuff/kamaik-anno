#!/usr/bin/env python3
"""Pull a longer OCR passage for prose mentions.

ANNO's search snippet is only the words around Kamaik. This asks the page-text
CGI for newspapers (not periodicals) and keeps the paragraph around the name.
Lists and advertisements stay on the short snippet. Full pages are not stored.

The CGI currently answers this network with a Cloudflare check instead of text.
The script stops when it sees that page, so the check is not saved as OCR.
"""

from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNIPPETS = ROOT / "data" / "snippets.jsonl"
PASSAGES = ROOT / "data" / "passages.jsonl"
OCR_URL = "https://anno.onb.ac.at/cgi-content/annoshow"
USER_AGENT = "kamaik-catalog/0.1 (personal historical research; paced)"
PAUSE_SECONDS = 1.25
DOC_ID = re.compile(r"^(ANNO)_([a-z]+)(\d{8})$")
CHALLENGE = ("Sicherheitsüberprüfung", "challenges.cloudflare.com", "Just a moment")


def keep_short(text: str, kind: str) -> bool:
    if kind == "inzerat":
        return True
    commas = text.count(",") + text.count(";")
    return commas >= 4 and text.count(".") <= 1 and len(text) < 240


def fetch_page(acronym: str, reference: str, page: int) -> str:
    params = urllib.parse.urlencode([("text", f"{acronym}|{reference}|{page}")])
    request = urllib.request.Request(
        f"{OCR_URL}?{params}",
        headers={"User-Agent": USER_AGENT, "Accept": "text/plain,text/html"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read().decode("utf-8", "replace")
    if any(marker in raw for marker in CHALLENGE):
        raise RuntimeError(
            "ANNO vrátilo ověření Cloudflare místo textu stránky. "
            "Skript je potřeba spustit z prohlížeče nebo ze sítě, kde ověření projde."
        )
    text = re.sub(r"^.*?\n", "", raw, count=1)
    text = text.replace("\r", "")
    text = re.sub(r"­[ \t]*\n[ \t]*", "", text)
    text = text.replace("­", "")
    return html.unescape(text).strip()


def around_kamaik(page_text: str) -> str | None:
    match = re.search(r"kamaik\w*", page_text, re.I)
    if not match:
        return None
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", page_text) if part.strip()]
    chosen = next((part for part in paragraphs if match.start() >= page_text.find(part) and match.start() < page_text.find(part) + len(part)), "")
    if len(chosen) < 280:
        index = paragraphs.index(chosen) if chosen in paragraphs else 0
        block = paragraphs[max(0, index - 1) : index + 2]
        chosen = "\n".join(block)
    if len(chosen) > 1600:
        start = max(0, match.start() - 500)
        chosen = page_text[start : match.end() + 900].strip()
    chosen = re.sub(r"\s+", " ", chosen).strip()
    return chosen


def main() -> None:
    done: set[str] = set()
    if PASSAGES.exists():
        for line in PASSAGES.read_text().splitlines():
            if line.strip():
                row = json.loads(line)
                done.add(f"{row['docId']}|{row.get('page')}|{row['text']}")
    written = 0
    with PASSAGES.open("a", encoding="utf-8") as handle:
        for line in SNIPPETS.read_text().splitlines():
            if not line.strip():
                continue
            issue = json.loads(line)
            parsed = DOC_ID.match(issue["docId"])
            if not parsed:
                continue
            _, acronym, reference = parsed.groups()
            for snippet in issue.get("snippets") or []:
                text = snippet.get("text") or ""
                key = f"{issue['docId']}|{snippet.get('page')}|{text}"
                if not text or key in done or keep_short(text, snippet.get("kind") or ""):
                    continue
                page = snippet.get("page")
                if not isinstance(page, int):
                    continue
                body = fetch_page(acronym, reference, page)
                time.sleep(PAUSE_SECONDS)
                passage = around_kamaik(body)
                if not passage or len(passage) <= len(text) + 40:
                    continue
                handle.write(
                    json.dumps(
                        {
                            "docId": issue["docId"],
                            "page": page,
                            "text": text,
                            "passage": passage,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                handle.flush()
                done.add(key)
                written += 1
                print(f"{issue['docId']} p{page} {len(passage)} chars", flush=True)
    print(f"passages {written}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        sys.exit(1)
