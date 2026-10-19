"use client";

import { useEffect, useState } from "react";

type Mention = {
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
  expanded?: boolean;
};

type CatalogResponse = {
  state: { phase?: string; total?: number | null; snippets?: number };
  totalIssues: number;
  withSnippets: number;
  totalMentions: number;
  translated: number;
  matched: number;
  page: number;
  pages: number;
  kinds: { id: string; label: string; count: number }[];
  decades: { id: string; count: number }[];
  papers: { acronym: string; title: string; count: number }[];
  mentions: Mention[];
  generatedAt?: string;
};

type Snapshot = {
  generatedAt: string;
  state: CatalogResponse["state"];
  totalIssues: number;
  withSnippets: number;
  totalMentions: number;
  translated: number;
  mentions: Mention[];
};

const PAGE_SIZE = 25;
const STATIC = process.env.NEXT_PUBLIC_STATIC === "1";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || "";

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

function present(snapshot: Snapshot, q: string, decade: string, paper: string, kind: string, page: number): CatalogResponse {
  const query = q.trim().toLowerCase();
  const filtered = snapshot.mentions.filter((mention) => matches(mention, query, decade, paper, kind));
  const start = (page - 1) * PAGE_SIZE;
  const decades = new Map<string, number>();
  const papers = new Map<string, { acronym: string; title: string; count: number }>();
  const kinds = new Map<string, number>();
  for (const mention of snapshot.mentions) {
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
  }
  return {
    generatedAt: snapshot.generatedAt,
    state: snapshot.state,
    totalIssues: snapshot.totalIssues,
    withSnippets: snapshot.withSnippets,
    totalMentions: snapshot.totalMentions,
    translated: snapshot.translated,
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
  };
}

const KIND_LABELS: Record<string, string> = {
  hrad: "Hrad a zámek",
  obec: "Obec",
  inzerat: "Inzerát",
  osoba: "Osoba",
  uredni: "Úřední zpráva",
  hasici: "Hasiči",
  "skola-cirkev": "Škola a kostel",
  zminka: "Zmínka",
};

function formatStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Prague",
  }).format(date);
}

function formatDate(value: string | number | null) {
  if (value == null || value === "") return "bez data";
  const text = String(value);
  const [year, month, day] = text.split("-");
  if (!month) return year;
  return `${Number(day)}. ${Number(month)}. ${year}`;
}

function preview(mention: Mention) {
  const source = mention.czech || mention.text;
  return source.replace(/\s+/g, " ").replace(/^\.+/, "").trim();
}

function OriginalText({ text }: { text: string }) {
  const parts = text.split(/(Kamaik\p{L}*)/iu);
  return (
    <>
      {parts.map((part, index) =>
        /^Kamaik/i.test(part) ? (
          <mark key={index} className="bg-transparent text-rule underline decoration-rule">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export default function Catalog() {
  const [apiData, setApiData] = useState<CatalogResponse | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [decade, setDecade] = useState("");
  const [paper, setPaper] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!STATIC) return;
    let cancelled = false;
    fetch(`${BASE_PATH}/catalog.json`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((payload: Snapshot) => {
        if (!cancelled) {
          setSnapshot(payload);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Katalog se nepodařilo načíst. Obnovte stránku za chvíli.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (STATIC) return;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (decade) params.set("decade", decade);
    if (paper) params.set("paper", paper);
    if (kind) params.set("kind", kind);
    params.set("page", String(page));
    let cancelled = false;
    const load = () => {
      fetch(`/api/catalog?${params.toString()}`)
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          return response.json();
        })
        .then((payload: CatalogResponse) => {
          if (!cancelled) {
            setApiData(payload);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError("Katalog se nepodařilo načíst. Obnovte stránku za chvíli.");
        });
    };
    load();
    const timer = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [q, decade, paper, kind, page]);

  const data = STATIC && snapshot ? present(snapshot, q, decade, paper, kind, page) : apiData;

  useEffect(() => {
    if (!data || selectedId) return;
    const openFirst = new URLSearchParams(window.location.search).get("detail") === "1";
    if (openFirst && data.mentions[0]) setSelectedId(data.mentions[0].id);
  }, [data, selectedId]);

  const mentions = data?.mentions ?? [];
  const selected = mentions.find((mention) => mention.id === selectedId) ?? null;
  const selectedIndex = mentions.findIndex((mention) => mention.id === selectedId);
  const maxDecade = Math.max(1, ...(data?.decades.map((item) => item.count) ?? [1]));
  const phase = data?.state.phase;
  const running = phase === "issues" || phase === "snippets";

  function openMention(mention: Mention) {
    setSelectedId((current) => (current === mention.id ? null : mention.id));
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="border-b border-rule pb-6">
        <p className="text-xs tracking-[0.22em] text-rule uppercase">ANNO · Österreichische Nationalbibliothek</p>
        <h1 className="mt-2 font-serif text-4xl text-ink sm:text-5xl">Kamýk / Kamaik</h1>
        <p className="mt-3 max-w-3xl text-lg text-muted">
          Každý řádek je jedna zmínka. Otevře originál z novin vlevo. Český text vpravo je jen u úseků, které jsou
          přeložené z delšího čtení stránky. Jméno Kamaik patří Kamýku nad Vltavou, Kamýku u Litoměřic a ještě
          Kamýku ve Velkých Přílepech.
        </p>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={data ? String(data.totalMentions) : "…"} label="Zmínek v katalogu" />
        <Stat value={data ? String(data.translated) : "…"} label="Ověřený překlad" />
        <Stat value={data ? String(data.withSnippets) : "…"} label="Vydání s úryvkem" />
        <Stat value={data?.state.total ? String(data.state.total) : "5299"} label="Vydání v ANNO" />
      </section>

      {STATIC && data?.generatedAt ? (
        <p className="mt-4 border border-line bg-card px-3 py-2 text-sm text-muted">
          Veřejný snímek z {formatStamp(data.generatedAt)}. V tu chvíli bylo úryvků {data.withSnippets} z{" "}
          {data.totalIssues} vydání. Nové řádky se na této adrese samy nepřidávají.
        </p>
      ) : running ? (
        <p className="mt-4 border border-line bg-card px-3 py-2 text-sm text-muted">
          {phase === "snippets"
            ? `Úryvky se ještě stahují: ${data?.state.snippets ?? data?.withSnippets ?? 0} z ${data?.totalIssues ?? "5299"} vydání. Nové řádky se objevují samy.`
            : "Seznam vydání se ještě kompletuje."}
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-rule">{error}</p> : null}

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Zmínky podle desetiletí</h2>
        <div className="mt-3 flex items-end gap-1 overflow-x-auto pb-2">
          {(data?.decades ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setDecade(decade === item.id ? "" : item.id);
                setPage(1);
                setSelectedId(null);
              }}
              className="flex w-11 shrink-0 flex-col items-center gap-1"
              title={`${item.id}: ${item.count} zmínek`}
            >
              <span
                className={decade === item.id ? "w-full bg-rule" : "w-full bg-ink/80"}
                style={{ height: `${Math.max(4, Math.round((item.count / maxDecade) * 96))}px` }}
              />
              <span className="text-[9px] text-muted">{item.id}</span>
            </button>
          ))}
        </div>
      </section>

      <form
        className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(draft.trim());
          setPage(1);
          setSelectedId(null);
        }}
      >
        <label className="block">
          <span className="text-sm text-muted">Hledat ve zmínce, překladu nebo listu</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="mt-1 w-full border border-line bg-card px-3 py-2 text-ink outline-none focus:border-rule"
            placeholder="například mlýn, Schmeißel, Vltava"
          />
        </label>
        <button type="submit" className="justify-self-start self-end border border-ink bg-ink px-4 py-2 text-paper">
          Hledat
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <FilterSelect
          label="Noviny"
          value={paper}
          onChange={(value) => {
            setPaper(value);
            setPage(1);
            setSelectedId(null);
          }}
          options={(data?.papers ?? []).map((item) => ({
            value: item.acronym,
            label: `${item.title} (${item.count})`,
          }))}
        />
        <FilterSelect
          label="Druh zmínky"
          value={kind}
          onChange={(value) => {
            setKind(value);
            setPage(1);
            setSelectedId(null);
          }}
          options={(data?.kinds ?? []).map((item) => ({
            value: item.id,
            label: `${item.label} (${item.count})`,
          }))}
        />
        {decade || paper || kind || q ? (
          <button
            type="button"
            className="self-end border border-line px-3 py-2 text-sm"
            onClick={() => {
              setDecade("");
              setPaper("");
              setKind("");
              setQ("");
              setDraft("");
              setPage(1);
              setSelectedId(null);
            }}
          >
            Zrušit filtr
          </button>
        ) : null}
      </div>

      <p className="mt-6 text-sm text-muted">
        {data
          ? `${data.matched} zmínek odpovídá filtru. Strana ${data.page} z ${data.pages}.`
          : "Načítám katalog…"}
      </p>

      <div className="mt-3 border border-line bg-card">
        <div className="hidden border-b border-line px-3 py-2 text-xs tracking-wide text-muted uppercase sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)_8rem_minmax(0,2fr)] sm:gap-2">
          <span>Datum</span>
          <span>List</span>
          <span>Druh</span>
          <span>Zmínka</span>
        </div>
        {mentions.map((mention) => {
          const open = mention.id === selectedId;
          return (
            <div key={mention.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => openMention(mention)}
                aria-expanded={open}
                className={`grid w-full grid-cols-1 gap-1 px-3 py-3 text-left sm:grid-cols-[6.5rem_minmax(0,1fr)_8rem_minmax(0,2fr)] sm:items-baseline sm:gap-2 ${open ? "bg-paper" : "bg-card"}`}
              >
                <span>{formatDate(mention.date)}</span>
                <span className="truncate">{mention.paper}</span>
                <span className="text-muted">{KIND_LABELS[mention.kind] ?? mention.kind}</span>
                <span className="truncate text-muted sm:text-ink">{preview(mention)}</span>
              </button>
              {open && selected ? (
                <Detail
                  mention={selected}
                  onPrevious={
                    selectedIndex > 0 ? () => setSelectedId(mentions[selectedIndex - 1].id) : undefined
                  }
                  onNext={
                    selectedIndex >= 0 && selectedIndex < mentions.length - 1
                      ? () => setSelectedId(mentions[selectedIndex + 1].id)
                      : undefined
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {data && mentions.length === 0 ? (
        <p className="mt-6 text-muted">
          {data.totalMentions === 0
            ? "Úryvky se ještě stahují. První řádky se objeví, jakmile dorazí text."
            : "Tomuto filtru neodpovídá žádná zmínka."}
        </p>
      ) : null}

      {data && data.pages > 1 ? (
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            className="border border-ink px-3 py-2 disabled:opacity-40"
            onClick={() => {
              setPage((current) => Math.max(1, current - 1));
              setSelectedId(null);
            }}
          >
            Starší
          </button>
          <button
            type="button"
            disabled={page >= data.pages}
            className="border border-ink px-3 py-2 disabled:opacity-40"
            onClick={() => {
              setPage((current) => current + 1);
              setSelectedId(null);
            }}
          >
            Novější
          </button>
          <span className="text-sm text-muted">Od nejstarších zmínek.</span>
        </div>
      ) : null}

      <footer className="mt-10 border-t border-line pt-4 text-sm text-muted">
        U vyhlášky a souvislé zprávy je v originále delší úsek stránky, ne jen pár slov kolem jména. Seznam a
        inzerát zůstávají krátké. Hromadný překlad z těch krátkých úseků se nezobrazuje. Odkaz vede na stránku
        v ANNO. Místo se doplní jen tam, kde to z textu plyne: Vltava nebo Rakovnicko jako Kamýk nad Vltavou,
        Litoměřicko jako Kamýk u Litoměřic. Statenice, Přílepy a Smíchov jsou třetí Kamýk a zůstanou bez přiřazení.
      </footer>
    </main>
  );
}

function Detail({
  mention,
  onPrevious,
  onNext,
}: {
  mention: Mention;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  return (
    <div className="border-b border-rule bg-paper px-3 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-serif text-xl">
          {mention.paper}
          <span className="ml-2 text-base text-muted">{formatDate(mention.date)}</span>
        </p>
        <p className="text-sm text-muted">
          {KIND_LABELS[mention.kind] ?? mention.kind}
          {mention.page ? ` · strana ${mention.page}` : ""}
          {mention.placeHint ? ` · ${mention.placeHint}` : ""}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted">
        Vyšlo v {mention.publishedIn ?? "neuvedeném místě"}
        {mention.medium ? `, ${mention.medium}` : ""}.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="border border-line bg-card p-4">
          <h3 className="text-xs tracking-[0.16em] text-muted uppercase">Originál</h3>
          <p className="mt-1 text-sm text-muted">
            {mention.expanded
              ? "Odstavec z textu stránky, po opravě běžných chyb OCR."
              : "Krátký úsek z vyhledávání, po opravě běžných chyb OCR. Celý článek to není."}
          </p>
          <p className="mt-2 font-serif text-lg leading-relaxed">
            <OriginalText text={mention.text} />
          </p>
        </section>
        <section className="border border-line bg-card p-4 md:border-l-rule">
          <h3 className="text-xs tracking-[0.16em] text-muted uppercase">Čeština</h3>
          <p className="mt-1 text-sm text-muted">
            {mention.expanded
              ? "Překlad delšího úseku. Nejisté místo v OCR je označené."
              : "U seznamu a inzerátu zůstává krátký úsek. Hromadný překlad z rozbitého OCR se nezobrazuje."}
          </p>
          {mention.czech ? (
            <p className="mt-2 text-lg leading-relaxed">{mention.czech}</p>
          ) : (
            <p className="mt-2 text-muted">Překlad této zmínky se ještě připravuje.</p>
          )}
        </section>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {mention.url ? (
          <a className="text-sm underline" href={mention.url}>
            Otevřít stránku v ANNO
          </a>
        ) : null}
        <button type="button" className="text-sm underline disabled:opacity-40" disabled={!onPrevious} onClick={onPrevious}>
          Předchozí zmínka
        </button>
        <button type="button" className="text-sm underline disabled:opacity-40" disabled={!onNext} onClick={onNext}>
          Další zmínka
        </button>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border border-line bg-card px-3 py-3">
      <div className="font-serif text-2xl">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="text-sm text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block max-w-full border border-line bg-card px-2 py-2 text-ink"
      >
        <option value="">Vše</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
