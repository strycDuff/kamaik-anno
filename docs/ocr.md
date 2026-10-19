# OCR v katalogu Kamaik

Vyhledávání ANNO vrací jen krátké okolí slova, kolem 140 znaků. U souvislého oznámení se proto bere vyšší výřez téže stránky a přečte se frakturou (`harvester/widen.py`). V katalogu je pak celý odstavec, ne jen jméno uprostřed věty. Seznamy a inzeráty se neprodlužují. Hromadný překlad v `data/translations/early.jsonl` vznikl z těch krátkých a rozbitých úseků a v katalogu se nezobrazuje. Český text u delšího úseku je v `data/translations/prose.jsonl`.

Delší text má smysl u vyhlášky, zprávy o obci, dvoru nebo soudu. Nemá smysl u inzerátu, seznamu jmen, hostů nebo cholera-tabulky: tam je jméno Kamaik jen položka a okolní řádky jsou jiné obce. Periodika (`ANNOP_`) text stránky vůbec nevystavují, u nich krátký úsek zůstane.

Text jedné novinové stránky je na `https://anno.onb.ac.at/cgi-content/annoshow?text=zkratka|RRRRMMDD|strana`. Z tohoto stroje ta adresa vrací jen ověření Cloudflare, ne OCR. Skript `harvester/passages.py` z stránky vybere odstavec kolem Kamaik a uloží ho do `data/passages.jsonl`. Spouští se tam, kde ověření projde. Celé stránky se neschovávají.

## Co se v katalogu opraví samo

Počty jsou z úseků uložených 15. října 2026. Oprava je v `src/lib/ocr.ts` a platí pro originál i pro češtinu, takže se přepsané znaky neukazují dál.

| Co OCR udělalo | Příklad z novin | V katalogu | Kolikrát v úsecích |
| --- | --- | --- | --- |
| Dlouhé ſ místo s | `iſt`, `joſef`, `Wiſſenſchaft` | `ist`, `josef`, `Wissenschaft` | 16 373 výskytů |
| Měkké rozdělení slova (U+00AD) | slovo rozbité uprostřed | spojí se | 562 úseků |
| Frakturové h přečtené jako `<` | `gedac<mten`, `gemac<t`, `verpoc<htet`, `landwirthsc<aftlich` | `gedachten`, `gemacht`, `verpachtet`, `landwirthschaftlich` | 13 úseků |
| `<` ve `Städt<hen` | `im Städt<hen Kamaik` | `im Städtchen Kamaik` | 1, ale je to celé slovo |
| Rovná se na konci řádku | `gelege= ne` | `gelegene` | řídké, hlavně 1819–1822 |
| `Kainaik` | `Kainaiker Mähl` | `Kamaiker Mahl` | první vyhláška, 26. 12. 1819 |
| `unfer` | `unfer N. 36` | `unter N. 36` | táž vyhláška |
| `öfentlich` | `öfentlich bekannt` | `öffentlich bekannt` | 4 |
| `desfelben`, `linfen` | `Lage desfelben`, `linfen Moldawufer` | `desselben`, `linken` | po jednom |
| `Brettwühle`, `Mähl`, `Maßl` | mlýn a pila č. 36 | `Brettmühle`, `Mahl` | první vyhlášky |
| `ſiküirke` | vedle `ſituirte` o dva dny později | `situierte` | jen 26. 12. 1819 |
| `verpoc<htet` | 28. 12. 1819, totéž oznámení | `verpachtet` | 1 |
| `zten` / `aten` před `Tagfahrt` | `weder bey der zten noch zten Tagfahrt` | `zweiten` / `dritten` | číslice 2 a 3 ve fraktuře splynuly |

`Moldaw` se nechává, ale pro zařazení místa platí stejně jako Moldau: Kamýk nad Vltavou. Statenice, Přílepy a Smíchov se kvůli slovu Rakovnicko na Kamýk nad Vltavou nepřepisují.

## Co se samo neopravuje

Automat neháďá jména, čísla popisná ani rozbité zbytky. Ty patří do překladu jen jako `[nejisté: …]`, nebo se vynechají, když z nich věta není.

- `Zuny` je skoro jistě `Juni`, `d. I.` je `d. J.` (tohoto roku), `45. Juny` ve sledu 13., 14., 15. je patnáctý. V prvních vyhláškách je to tak přeložené ručně. Samo se to nepřepisuje, protože `Zuny` může být i zbytek jiného slova.
- `Jelder, 25 Mz. 1 m. Wiesen` je výměra, ne věta. V překladu je `[nejisté: výměra polí a luk]`.
- `voetrwävnmx`, `Wirthſchaftszebäude`, `Meyeryof`, `Podhor3` se neopravují na slepo.
- `Marks te` a `Mark2 ie` jsou `Markte` rozbité mezerou. Bez stránky nepoznáme, jestli tam mezera byla schválně.
- Seznamy (`Herr`, `Frau`, cholera, hosté, firmy) se neprodlužují a nepřekládají slovo od slova, když je Kamaik jen jedna položka.

## Jak překládat dál

1. Nejdřív nechat projít opravu výše. Překlad se dělá z opraveného úseku, ne z surového OCR.
2. U inzerátu a seznamu stačí ten krátký úsek.
3. U vyhlášky a souvislé zprávy vzít odstavec z `annoshow`, ne jen tři tečky z vyhledávání.
4. Když číslice nebo jméno nejde přečíst, nechat `[nejisté: …]`. Nepřidávat větu, která v úseku není.
5. `Statteniß und Kamaik` je statek u Statenic, ne Kamýk nad Vltavou, i když je v rakovnickém kraji.

Ručně srovnané překlady prvních čitelných vyhlášek jsou v `data/translations/override.jsonl` a mají přednost před hromadným překladem.
