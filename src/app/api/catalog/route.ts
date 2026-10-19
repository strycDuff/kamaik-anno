import { NextRequest, NextResponse } from "next/server";
import {
  KIND_LABELS,
  listMentions,
  readCatalog,
  readState,
  type Mention,
} from "@/lib/catalog";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

function decadeOf(date: string | number | null): string | null {
  if (date == null || date === "") return null;
  const year = Number(String(date).slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return String(Math.floor(year / 10) * 10);
}

function matches(mention: Mention, q: string, decade: string, paper: string, kind: string) {
  if (decade && decadeOf(mention.date) !== decade) return false;
  if (paper && mention.acronym !== paper) return false;
  if (kind && mention.kind !== kind) return false;
  if (!q) return true;
  return [mention.paper, mention.title, mention.publishedIn, mention.placeHint, mention.text, mention.czech]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const decade = params.get("decade") ?? "";
  const paper = params.get("paper") ?? "";
  const kind = params.get("kind") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const issues = readCatalog();
  const mentions = listMentions(issues);
  const state = readState();
  const filtered = mentions.filter((mention) => matches(mention, q, decade, paper, kind));
  const start = (page - 1) * PAGE_SIZE;

  const decades = new Map<string, number>();
  const papers = new Map<string, { acronym: string; title: string; count: number }>();
  const kinds = new Map<string, number>();
  let translated = 0;
  for (const mention of mentions) {
    const decadeKey = decadeOf(mention.date);
    if (decadeKey) decades.set(decadeKey, (decades.get(decadeKey) ?? 0) + 1);
    if (mention.acronym) {
      const current = papers.get(mention.acronym) ?? {
        acronym: mention.acronym,
        title: mention.paper,
        count: 0,
      };
      current.count += 1;
      papers.set(mention.acronym, current);
    }
    kinds.set(mention.kind, (kinds.get(mention.kind) ?? 0) + 1);
    if (mention.czech) translated += 1;
  }

  const withSnippets = issues.filter((issue) => issue.snippets.length > 0).length;

  return NextResponse.json({
    state,
    totalIssues: issues.length,
    withSnippets,
    totalMentions: mentions.length,
    translated,
    matched: filtered.length,
    page,
    pages: Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    kinds: [...kinds.entries()]
      .map(([id, count]) => ({ id, label: KIND_LABELS[id] ?? id, count }))
      .sort((a, b) => b.count - a.count),
    decades: [...decades.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    papers: [...papers.values()].sort((a, b) => b.count - a.count).slice(0, 12),
    mentions: filtered.slice(start, start + PAGE_SIZE),
  });
}
