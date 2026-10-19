import fs from "fs";
import path from "path";
import { normalizeOcr } from "./ocr.ts";

export type Snippet = {
  page: number | null;
  text: string;
  url: string | null;
  kind: string;
  czech?: string;
};

export type Issue = {
  docId: string;
  date: string | number | null;
  title: string | null;
  acronym: string | null;
  place: string | null;
  medium: string | null;
  language: string | null;
  hits: number | null;
  pageCount: number | null;
  url: string | null;
  snippets: Snippet[];
};

export type HarvestState = {
  phase?: string;
  next_from?: number;
  total?: number | null;
  issues?: number;
  snippet_index?: number;
  snippets?: number;
};

const DATA = path.join(process.cwd(), "data");

function readTranslationDir(): { docId: string; page: number | null; text: string; czech: string }[] {
  const dir = path.join(DATA, "translations");
  if (!fs.existsSync(dir)) return [];
  const rows: { docId: string; page: number | null; text: string; czech: string }[] = [];
  const names = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl") && name !== "override.jsonl" && name !== "early.jsonl")
    .sort();
  if (fs.existsSync(path.join(dir, "override.jsonl"))) names.push("override.jsonl");
  for (const name of names) {
    rows.push(
      ...readJsonl<{ docId: string; page: number | null; text: string; czech: string }>(
        path.join("translations", name),
      ),
    );
  }
  return rows;
}

function readJsonl<T>(filename: string): T[] {
  const full = path.join(DATA, filename);
  if (!fs.existsSync(full)) return [];
  const rows: T[] = [];
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as T);
  }
  return rows;
}

export function readState(): HarvestState {
  const full = path.join(DATA, "state.json");
  if (!fs.existsSync(full)) return { phase: "waiting" };
  return JSON.parse(fs.readFileSync(full, "utf8")) as HarvestState;
}

export function readCatalog(): Issue[] {
  const issues: Issue[] = readJsonl<Issue>("issues.jsonl").map((issue) => ({
    ...issue,
    snippets: [] as Snippet[],
  }));
  const byId = new Map(issues.map((issue) => [issue.docId, issue]));
  for (const row of readJsonl<{ docId: string; snippets?: Snippet[] }>("snippets.jsonl")) {
    const issue = byId.get(row.docId);
    if (issue && row.snippets) {
      issue.snippets = row.snippets.map((snippet) => ({
        ...snippet,
        kind: classifySnippet(snippet.text),
      }));
    }
  }
  const translations = [
    ...readJsonl<{
      docId: string;
      page: number | null;
      text: string;
      czech: string;
    }>("translations.jsonl"),
    ...readTranslationDir(),
  ];
  const translationKey = (docId: string, page: number | null, text: string) =>
    `${docId}|${page ?? ""}|${text}`;
  const translated = new Map(
    translations.map((row) => [translationKey(row.docId, row.page, row.text), row.czech]),
  );
  for (const issue of issues) {
    for (const snippet of issue.snippets) {
      const czech = translated.get(translationKey(issue.docId, snippet.page, snippet.text));
      if (czech) snippet.czech = czech;
    }
  }
  return issues;
}

export function classifySnippet(text: string): string {
  const folded = text.toLowerCase();
  if (["burg", "ruine", "schloss", "kastell"].some((word) => folded.includes(word))) return "hrad";
  if (
    ["gemeinde", "ortsvorstand", "bürgermeister", "gemeindeamt", "markt", "städtchen", "stadtchen"].some(
      (word) => folded.includes(word),
    )
  ) {
    return "obec";
  }
  if (["inserat", "zu verkaufen", "verkauf", "anzeige", "lizitaz"].some((word) => folded.includes(word))) {
    return "inzerat";
  }
  if (["herr ", "frau ", "frl.", "witwe", "geboren"].some((word) => folded.includes(word))) return "osoba";
  if (["kundmachung", "amtsblatt", "verordnung", "gericht", "feilbietung"].some((word) => folded.includes(word))) {
    return "uredni";
  }
  if (["feuerwehr", "brand"].some((word) => folded.includes(word))) return "hasici";
  if (["schule", "lehrer", "pfarrer", "kirche", "kapelle"].some((word) => folded.includes(word))) {
    return "skola-cirkev";
  }
  return "zminka";
}

export type Mention = {
  id: string;
  docId: string;
  date: string | number | null;
  title: string | null;
  paper: string;
  acronym: string | null;
  publishedIn: string | null;
  medium: string | null;
  page: number | null;
  text: string;
  czech: string | null;
  url: string | null;
  kind: string;
  placeHint: string | null;
  expanded: boolean;
};

export function placeHint(text: string): string | null {
  const folded = text.toLowerCase();
  if (["leitmeritz", "litoměřice", "plešivec", "eisberg"].some((word) => folded.includes(word))) {
    return "Kamýk u Litoměřic";
  }
  // Stattenitz, Přílepy and the Smíchov district are a third Kamaik, in the
  // cadastre of Velké Přílepy. A Rakovník-circle mention there is not the Vltava town.
  if (
    ["statteniß", "stattenitz", "stattenit", "statteni", "prilep", "přílep", "smichow", "smíchov"].some(
      (word) => folded.includes(word),
    )
  ) {
    return null;
  }
  if (
    ["moldau", "moldaw", "rakonitz", "rakonit", "rakoniz", "zduchow", "zdüchow", "zduchovic"].some((word) =>
      folded.includes(word),
    )
  ) {
    return "Kamýk nad Vltavou";
  }
  return null;
}

export function shortPaper(title: string | null, acronym: string | null): string {
  if (!title) return acronym ?? "noviny";
  return title
    .replace(/\s+\d{1,2}\.\s+\p{L}+\.?\s+\d{4}.*$/u, "")
    .replace(/\s+\d{4}.*$/u, "")
    .trim();
}

function readPassages(): Map<string, string> {
  const passages = new Map<string, string>();
  for (const row of readJsonl<{ docId: string; page: number | null; text: string; passage: string }>(
    "passages.jsonl",
  )) {
    if (row.passage) passages.set(`${row.docId}|${row.page ?? ""}|${row.text}`, row.passage);
  }
  return passages;
}

function readPageCzech(): Map<string, string> {
  const pages = new Map<string, string>();
  for (const row of readJsonl<{ docId: string; page: number | null; czech: string }>(
    "translations/prose.jsonl",
  )) {
    if (row.czech) pages.set(`${row.docId}|${row.page ?? ""}`, row.czech);
  }
  return pages;
}

export function listMentions(issues: Issue[]): Mention[] {
  const passages = readPassages();
  const pageCzech = readPageCzech();
  const mentions: Mention[] = [];
  for (const issue of issues) {
    issue.snippets.forEach((snippet, index) => {
      if (!snippet.text) return;
      const passage = passages.get(`${issue.docId}|${snippet.page ?? ""}|${snippet.text}`);
      const source = passage && passage.length > snippet.text.length + 40 ? passage : snippet.text;
      const expanded = source !== snippet.text;
      const czech = expanded
        ? pageCzech.get(`${issue.docId}|${snippet.page ?? ""}`) ?? null
        : snippet.czech;
      mentions.push({
        id: `${issue.docId}:${index}`,
        docId: issue.docId,
        date: issue.date,
        title: issue.title,
        paper: shortPaper(issue.title, issue.acronym),
        acronym: issue.acronym,
        publishedIn: issue.place,
        medium: issue.medium,
        page: snippet.page,
        text: normalizeOcr(source),
        czech: czech ? normalizeOcr(czech) : null,
        url: snippet.url ?? issue.url,
        kind: snippet.kind,
        placeHint: placeHint(normalizeOcr(source)),
        expanded,
      });
    });
  }
  return mentions;
}

export const KIND_LABELS: Record<string, string> = {
  hrad: "Hrad a zámek",
  obec: "Obec",
  inzerat: "Inzerát",
  osoba: "Osoba",
  uredni: "Úřední zpráva",
  hasici: "Hasiči",
  "skola-cirkev": "Škola a kostel",
  zminka: "Zmínka",
};
