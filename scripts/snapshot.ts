import fs from "fs";
import path from "path";
import { listMentions, readCatalog, readState } from "../src/lib/catalog.ts";

const issues = readCatalog();
const mentions = listMentions(issues);
const state = readState();
const payload = {
  generatedAt: new Date().toISOString(),
  state,
  totalIssues: issues.length,
  withSnippets: issues.filter((issue) => issue.snippets.length > 0).length,
  totalMentions: mentions.length,
  translated: mentions.filter((mention) => mention.czech).length,
  mentions,
};

const out = path.join(process.cwd(), "public", "catalog.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(payload));
const bytes = fs.statSync(out).size;
console.log(
  `catalog.json ${payload.totalMentions} mentions, ${payload.translated} translated, ${bytes} bytes`,
);
