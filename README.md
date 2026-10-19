# Kamýk / Kamaik v ANNO

Katalog zmínek jména Kamaik v historických novinách [ANNO](https://anno.onb.ac.at/), archivu Österreichische Nationalbibliothek. Německé jméno Kamaik patří nejméně dvěma obcím: Kamýku nad Vltavou a Kamýku u Litoměřic.

Každý řádek katalogu je jedna zmínka. Kliknutí otevře originál z OCR vlevo a překlad do současné češtiny vpravo. Celá čísla novin se nestahují. Překlady jsou v `data/translations/`.

## Spuštění

```bash
npm install
npm run dev -- --port 38471
```

Katalog je na [http://127.0.0.1:38471](http://127.0.0.1:38471).

## Sběr

```bash
python3 harvester/harvest.py
```

Skript lze přerušit a spustit znovu. Postup je v `data/state.json`. Nejdřív uloží seznam vydání (`data/issues.jsonl`), potom úryvky (`data/snippets.jsonl`). Mezi požadavky je pauza, aby archiv nedostával souvislý proud.

Dotaz je přesné slovo `Kamaik`. Dne 15. října 2026 ho ANNO hlásilo v 5 299 vydáních, nejvíc v Leitmeritzer Zeitung a v pražských listech, s vrcholem mezi lety 1870 a 1920.

Vyhledávání vrací jen krátké okolí jména. Delší úsek u vyhlášky a souvislé zprávy bere `python3 harvester/widen.py`: vyšší výřez téže stránky, přečtený frakturou. Seznamy a inzeráty neprodlužuje. Skript lze přerušit a spustit znovu, hotové stránky jsou v `data/widen-done.txt`. Celé stránky se neukládají.

Běžné chyby OCR se v katalogu opraví samy. Seznam je v [docs/ocr.md](docs/ocr.md). Hromadný překlad v `data/translations/early.jsonl` vznikl z krátkých rozbitých úseků a v katalogu se nezobrazuje. Český text delšího úseku je v `data/translations/prose.jsonl`. `harvester/passages.py` čte text z `annoshow`, ale jen tam, kde ANNO nepostaví ověření Cloudflare.

## Veřejná stránka

`npm run dev` čte data z disku a běží jen na stroji, kde je spuštěný. Veřejná stránka je statický snímek ve složce `out/`.

```bash
npm ci
npm run export:site
```

Na mini PC, na kořeni domény nebo na Cloudflare Pages stačí nasadit obsah `out/`. Když má adresa předponu, třeba `https://ucet.github.io/kamaik-katalog/`:

```bash
NEXT_PUBLIC_BASE_PATH=/kamaik-katalog npm run export:site
```

### GitHub Pages

Workflow `.github/workflows/pages.yml` se spustí při pushi na `main`. U repozitáře `ucet.github.io` je stránka na kořeni, u ostatních na `https://ucet.github.io/nazev-repo/`. V nastavení repozitáře jednou zvolte Pages → Source → GitHub Actions, pokud to GitHub nenastaví sám. Účet se nepřebírá a náhled nevyprší.
