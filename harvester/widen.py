#!/usr/bin/env python3
"""Read a taller strip of the newspaper page around each Kamaik hit.

ANNO's search window is only a couple of lines. The same response carries an
IIIF address of that strip. This asks for a much taller strip, reads it with
Fraktur OCR, and keeps the notice that contains the name. The image is not
stored. Lists and advertisements stay on the short snippet. Periodicals have
no usable page image of this kind and are skipped.
"""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNIPPETS = ROOT / "data" / "snippets.jsonl"
PASSAGES = ROOT / "data" / "passages.jsonl"
DONE = ROOT / "data" / "widen-done.txt"
USER_AGENT = "kamaik-catalog/0.1 (personal historical research; paced)"
PAUSE_SECONDS = 1.25
SNIPPET_URL = "https://anno.onb.ac.at/anno-suche/rest/search/snippet"
REGION = re.compile(r"/(\d+),(\d+),(\d+),(\d+)/[^/]+/")


def fetch(url: str) -> bytes:
    delay = PAUSE_SECONDS
    last: Exception | None = None
    for _ in range(5):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                payload = response.read()
            time.sleep(PAUSE_SECONDS)
            return payload
        except Exception as error:
            last = error
            time.sleep(delay)
            delay = min(delay * 2, 40)
    raise RuntimeError(f"request failed: {url}") from last


def looks_like_list(text: str) -> bool:
    """Gazetteers, guest registers and roundups of unrelated sales. A lease
    notice can list fields and still be one text, so commas alone are not enough.
    """
    separators = text.count(",") + text.count(";") + text.count("|")
    sentences = len(re.findall(r"[a-zäöüßſ]{3}[.] ", text))
    folded = text.lower()
    if folded.count("ex. f") + folded.count("ex.f") >= 2:
        return True
    if folded.count("brechruhr") >= 3:
        return True
    if folded.count("kreis") >= 4 and separators >= 4:
        return True
    names = folded.count("bürger") + folded.count(", herr") + folded.count(", frau")
    if names >= 4:
        return True
    if separators >= 10 and separators > sentences * 4 and len(text) / separators < 28:
        return True
    return False


def keep_short(text: str, kind: str) -> bool:
    if kind == "inzerat" or looks_like_list(text):
        return True
    commas = text.count(",") + text.count(";")
    return commas >= 5 and text.count(".") <= 1 and len(text) < 220


def widen_url(image_url: str, width: int, height: int) -> str | None:
    match = REGION.search(image_url)
    if not match:
        return None
    x, y, w, h = (int(part) for part in match.groups())
    # The search strip is only the lines around the hit. The notice starts a
    # little above that and usually continues well below it.
    above = min(y, 900)
    below = min(max(0, height - (y + h)), 2600)
    new_y = max(0, y - above)
    new_h = min(height - new_y, above + h + below)
    new_x = max(0, x - 36)
    new_w = min(max(1, width - new_x), w + 72)
    region = f"/{new_x},{new_y},{new_w},{new_h}/1000,/"
    return REGION.sub(region, image_url, count=1)


def ocr(image: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".jpg") as handle:
        handle.write(image)
        handle.flush()
        result = subprocess.run(
            ["tesseract", handle.name, "stdout", "-l", "Fraktur", "--psm", "4"],
            check=False,
            capture_output=True,
            text=True,
        )
    return result.stdout or ""


# Fraktur OCR often splits or decorates the name: Kamaik, Kamaäik, Kamäiker, Kaïmnaiker.
KAMAIK = re.compile(r"ka[\wï]{1,6}ik", re.IGNORECASE)
HEADING = re.compile(
    r"^(?:verpachtung|kundmachung|anzeige|lizitaz|edikt|verkauf|versteigerung|feilbietung|bekanntmachung)\b",
    re.IGNORECASE,
)
HEADING_WORD = re.compile(
    r"\b(verpachtung|kundmachung|anzeige|lizitaz\w*|edikt|bekanntmachung)\b",
    re.IGNORECASE,
)
AD_NUMBER = re.compile(r"^\d{3,5}\b")
CLOSING = re.compile(
    r"(\b1[78]\d\d\b|\b(?:j[aä]n(?:ner|uar)?|febr|m[aä]rz|april|mai|jun[iy]?|jul[iy]?|aug|sept|okt|nov|dez|dezem)\w*)",
    re.IGNORECASE,
)
NEXT_ITEM = re.compile(r"^(?:ferner|weiters|sodann|schlie[sß]lich)\b", re.IGNORECASE)
CONTINUATION = re.compile(
    r"^(?:und|oder|wobei|worauf|hierzu|dazu|sowie|welcher|welche|welches|derselbe|dieselbe|dieser|diese|dieses)\b",
    re.IGNORECASE,
)
NEXT_NOTICE = re.compile(
    r"\b1[78]\d\d\b\s*[.)]?\s+(?=lizitaz|verpachtung|kundmachung|anzeige|edikt\b)",
    re.IGNORECASE,
)
# A following advertisement smashed against this one: "…1822 Lizitazion einer Mahlmühle".
# "Verpachtung des Wirthshauses" inside the same notice must stay.
LATER_TITLE = re.compile(r"lizitaz\w*\s+einer\b", re.IGNORECASE)


def join_lines(lines: list[str]) -> str:
    parts: list[str] = []
    buffer = ""
    for line in lines:
        line = line.strip(" |")
        if not line:
            continue
        if buffer.endswith("-") or buffer.endswith("="):
            buffer = buffer[:-1] + line
        elif buffer and buffer[-1].isalpha() and line[:1].islower():
            buffer = f"{buffer} {line}"
        else:
            if buffer:
                parts.append(buffer)
            buffer = line
    if buffer:
        parts.append(buffer)
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def paragraphs(text: str) -> list[str]:
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in text.splitlines():
        if line.strip():
            current.append(line.strip())
            continue
        if current:
            blocks.append(current)
            current = []
    if current:
        blocks.append(current)
    return [joined for block in blocks if (joined := join_lines(block))]


def is_closing(paragraph: str) -> bool:
    if len(paragraph) > 200 or HEADING.match(paragraph) or AD_NUMBER.match(paragraph):
        return False
    return bool(CLOSING.search(paragraph))


def sentence_window(text: str) -> str:
    # "12. August" and "l. J." are not sentence ends. Split only after a real word.
    parts = [
        part.strip()
        for part in re.split(r"(?<=[a-zäöüßſ]{2}[.!;])\s+(?=[A-ZÄÖÜ])", text)
        if part.strip()
    ]
    if len(parts) <= 1:
        return text[:1600]
    hits = [index for index, part in enumerate(parts) if KAMAIK.search(part)]
    if not hits:
        return text[:1600]
    start, end = hits[0], hits[-1]

    def length(left: int, right: int) -> int:
        return sum(len(parts[index]) for index in range(left, right + 1))

    while start > 0 and length(start - 1, end) < 1200:
        previous = parts[start - 1]
        if NEXT_ITEM.match(parts[start]) or NEXT_ITEM.match(previous) or HEADING.match(previous):
            break
        if not CONTINUATION.match(parts[start]) and len(parts[start]) > 220:
            break
        start -= 1
    while end + 1 < len(parts) and length(start, end + 1) < 1200:
        nxt = parts[end + 1]
        if NEXT_ITEM.match(nxt) or HEADING.match(nxt):
            break
        if is_closing(nxt):
            end += 1
            break
        if not CONTINUATION.match(nxt) and len(parts[end]) > 220:
            break
        end += 1
    return " ".join(parts[start : end + 1])


def trim_to_heading(passage: str) -> str:
    hit = KAMAIK.search(passage)
    if not hit:
        return passage
    heading = None
    for match in HEADING_WORD.finditer(passage):
        if match.start() <= hit.start():
            heading = match
    if heading and hit.start() - heading.start() < 500:
        return passage[heading.start() :]
    return passage


def notice(text: str) -> str | None:
    blocks = paragraphs(text)
    hits = [index for index, block in enumerate(blocks) if KAMAIK.search(block)]
    if not hits:
        return None
    start, end = hits[0], hits[-1]
    if start > 0:
        previous = blocks[start - 1]
        if (
            len(previous) < 160
            and not is_closing(previous)
            and not AD_NUMBER.match(previous)
            and (HEADING.match(previous) or (len(previous) < 100 and not previous.endswith(".")))
        ):
            start -= 1
    while end + 1 < len(blocks):
        nxt = blocks[end + 1]
        if AD_NUMBER.match(nxt) or (HEADING.match(nxt) and not KAMAIK.search(nxt)):
            break
        if is_closing(nxt):
            end += 1
            break
        current = blocks[end]
        if len(current) < 500 and not re.search(r"[.!?]\s*$", current):
            end += 1
            if sum(len(blocks[index]) for index in range(start, end + 1)) > 1800:
                break
            continue
        break
    passage = " ".join(blocks[start : end + 1])
    # A short edict is one notice and must stay whole, including its date line.
    # A long column with "Ferner wurde" is several decisions; keep the one with the name.
    if len(passage) > 900 or NEXT_ITEM.search(passage):
        passage = sentence_window(passage)
    passage = trim_to_heading(passage)
    passage = cut_later_title(passage)
    cut = NEXT_NOTICE.search(passage)
    if cut and cut.start() > 140:
        passage = passage[: cut.end()]
    passage = tidy_tail(passage)
    passage = re.sub(r"\s+", " ", passage).strip(" ,.;_-")
    if looks_like_list(passage):
        return None
    return passage if len(passage) > 80 else None


def cut_later_title(passage: str) -> str:
    hit = KAMAIK.search(passage)
    if not hit:
        return passage
    later = LATER_TITLE.search(passage, hit.end() + 40)
    if later:
        return passage[: later.start()]
    return passage


def tidy_tail(passage: str) -> str:
    """Drop a rule or the next advertisement's number after the notice is dated."""
    match = None
    for match in re.finditer(r"\b1[78]\d\d\b", passage):
        pass
    if not match:
        return passage
    tail = passage[match.end() :]
    if len(tail) > 12 and len(re.findall(r"[a-zäöüß]", tail)) < 10:
        return passage[: match.end()]
    return passage


def load_done() -> set[str]:
    if not DONE.exists():
        return set()
    return {line.strip() for line in DONE.read_text().splitlines() if line.strip()}


def main() -> None:
    import sys

    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10**9
    issues = [json.loads(line) for line in SNIPPETS.read_text().splitlines() if line.strip()]
    done = load_done()
    written = 0
    PASSAGES.parent.mkdir(parents=True, exist_ok=True)
    with PASSAGES.open("a", encoding="utf-8") as passages, DONE.open("a", encoding="utf-8") as finished:
        for issue in issues:
            doc_id = issue["docId"]
            if not doc_id.startswith("ANNO_"):
                continue
            by_key: dict[str, list[dict]] = {}
            for snippet in issue.get("snippets") or []:
                key = f"{doc_id}|{snippet.get('page')}"
                if key in done:
                    continue
                if keep_short(snippet.get("text") or "", snippet.get("kind") or ""):
                    done.add(key)
                    finished.write(key + "\n")
                    finished.flush()
                    continue
                by_key.setdefault(key, []).append(snippet)
            if not by_key:
                continue
            if written >= limit:
                break
            params = urllib.parse.urlencode([("documentId", doc_id), ("query", "Kamaik")])
            payload = json.loads(fetch(f"{SNIPPET_URL}?{params}"))
            by_page: dict[int, dict] = {}
            for page in payload.get("snippetPages") or []:
                for snippet in page.get("snippets") or []:
                    page_no = snippet.get("page", page.get("page"))
                    if isinstance(page_no, int) and page_no not in by_page and snippet.get("imageURL"):
                        by_page[page_no] = snippet
            for key, snippets in by_key.items():
                if written >= limit:
                    break
                page_no = snippets[0].get("page")
                remote = by_page.get(page_no) if isinstance(page_no, int) else None
                passage = None
                if remote and remote.get("imageURL"):
                    url = widen_url(
                        remote["imageURL"],
                        int(remote.get("imageWidth") or 2400),
                        int(remote.get("imageHeight") or 4000),
                    )
                    if url:
                        image = fetch(url)
                        if image[:2] == b"\xff\xd8":
                            passage = notice(ocr(image))
                if passage:
                    for snippet in snippets:
                        passages.write(
                            json.dumps(
                                {
                                    "docId": doc_id,
                                    "page": page_no,
                                    "text": snippet.get("text") or "",
                                    "passage": passage,
                                },
                                ensure_ascii=False,
                            )
                            + "\n"
                        )
                    passages.flush()
                    written += 1
                    print(f"{key} {len(passage)}", flush=True)
                else:
                    print(f"{key} no-passage", flush=True)
                done.add(key)
                finished.write(key + "\n")
                finished.flush()
    print(f"widened {written}", flush=True)


if __name__ == "__main__":
    main()
