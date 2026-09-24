---
date: 2026-09-23
topic: cubie-sealed-body
---

# Cubie Sealed Body — Requirements

## Summary

Každý cubie sa stane plne uzavretým telom — šiestimi nepriehľadnými, vzájomne
priliehajúcimi stenami v rovine tváre, s nálepkou (farebným štvorcom so
zaoblenými rohmi a rámom) ako filmom navrchu na 1–3 z nich. Odstráni sa plochý
quad v centre cubie (zdroj symptómu [1]) a steny bez nálepky sa zaoblia tak, aby
vizuálne lícovali s nálepkami. Kocka si zachová dnešný vzhľad: tmavé telo
presvitá len v zaoblených rohoch a medzi nálepkami, nikdy cez ne nepresvitá
far-side.

---

## Problem Frame

Po fixe backface-flash (`b07d1ea`) kocka v Basic view presvitá na troch
miestach:

1. Element `.cubie` (ktorý mal byť len kontajnerom) presvitá cez sticker ako
   čiara cez stred nálepky pri rotácii.
2. Cez škáry medzi stenami cubie presvitá sticker zo steny za nimi.
3. Steny cubie bez nálepky sú štvorcové, čo je viditeľné práve vďaka [2].

Príčina je štrukturálna, nie chyba farby: fix pridal `background-color` priamo
na `.cubie`. Keďže cubie je iba translatované (nikdy nerotované), jeho
background je plochý quad v **centrálnej rovine z=0**, o pol hrany vzdialenej od
prednej tváre (z=±h). Škáry — zaoblené rohy nálepiek a medzery medzi cubies —
ležia v rovine tváre, takže ich centrálny quad nedokáže utesniť, a pri graze
uhloch naopak sám presvitá cez nálepky. Meraním (A/B diff v Chromium): quad
zakrýva 143 px bielych a 102 px modrých nálepkových pixelov už v pokoji; po jeho
odstránení sa leak cez škáry ešte zhorší (red 614→381 px), čo potvrdzuje, že
dnes utesňuje len čiastočne a v zlej rovine.

Symptóm [1] a [2] tak majú jeden koreň — nesprávne umiestnené tesnenie — a rieši
ich jediná zmena: posunúť tesnenie zo stredu kocky do roviny tváre, kde škáry
skutočne sú.

---

## Key Decisions

- **Uzavreté telo namiesto centrálneho quadru.** Occlusion vychádza z
  nepriehľadných stien v rovine tváre, nie z `backface-visibility` ani z quadru
  v strede. Stena v rovine z=±h tesní škáru presne tam, kde vzniká, a žiadny
  element nestojí medzi nálepkou a pozorovateľom.
- **Nálepka si necháva svoj border.** Border dnes robí dvojitú službu: vizuálne
  „presvitajúce telo" v zaoblenom rohu, a zároveň selection / hover highlight.
  Presunúť highlight z nálepky by znamenalo prerobiť selection/hover — mimo
  scope. Nálepka preto zostáva samostatným, klikateľným elementom navrchu tela.
- **Prototype-first s vizuálnou bránou.** Z-offset a poradie elementov (stena
  vs. nálepka) sa nedajú overiť headless — pri koplanárnom usporiadaní nastáva
  z-fighting. Preto najprv vznikne nedestruktívny preview (dočasný zásah do
  DOM/CSS), ktorý používateľ skontroluje v reálnom Firefoxe a Edge, a až po
  schválení sa ide do reálnej implementácie.

---

## Requirements

### Telo cubie

- R1. Každý renderovaný cubie nesie šesť nepriehľadných stien, jednu na každú
  tvár, s farbou `--color-domain-cube-interior`.
- R2. Všetkých šesť stien je veľkosťou 100 % × 100 % cubie, `transform-origin` v
  strede cubie, a poziciovaných výhradne transformom tváre (translateZ / rotateY
  / rotateX), takže tvoria tuhý box v lokálnom rámci cubie.
- R3. Cubie element sám už nenesie žiadny `background-color` — plochý quad v
  centrálnej rovine zmizne.
- R4. Cubie element sa stále iba translatuje, nikdy nerotuje; box zostáva tuhý a
  otáča sa len jeho predok (cube pri view rotácii, pivot pri ťahu vrstvy).

### Nálepka

- R5. Nálepka zostáva samostatným klikateľným elementom navrchu tela, ktorý
  nesie farbu, zaoblené rohy, border a `data-sticker-id`.
- R6. Nálepka je k stene mierne odsadená pozdĺž svojej normály tak, aby nikdy
  nezdieľala rovinu so stenou (žiadny z-fighting); odsadenie je vizuálne
  nepostrehnuteľné.
- R7. Click, hover a selection logika zostáva viazaná na nálepku; telo je
  `pointer-events: none`.

### Vzhľad a konzistencia

- R8. V pokoji a pri rotácii sa cez zaoblené rohy a škáry ukazuje len tmavé telo
  (`--color-domain-cube-interior`), nikdy farba nálepky z far-side.
- R9. Steny bez nálepky majú zaoblené rohy lícujúce s rohmi nálepiek (rovnaký
  tvar rohu), takže škára okolo nálepky vyzerá rovnako na všetkých stenách.
  **Doplnené 2026-09-24:** týka sa LEN stien bez nálepky. Stena, ktorá nálepku
  má, je hranatá — dôvod je v
  `docs/plans/2026-09-23-001-fix-seal-cubie-face-planes-plan.md` (R9, KTD2).
- R10. Vizuálny vzhľad kocky sa oproti súčasnosti nemení okrem odstránenia
  presvitania — žiadny plastový rám, žiadne zmenšené nálepky.

### Výkon

- R11. Na 7×7 (218 povrchových cubies) ostáva resize a rýchla rotácia plynulá;
  nárast počtu elementov oproti dnešku je obmedzený na jednu stenu navyše pri
  nálepkách (celkovo 7–9 elementov na cubie namiesto 6).

---

## Key Flows

- F1. Rotácia pohľadu s uzavretým telom
  - **Trigger:** Používateľ otočí pohľad (Alt+šípka alebo drag pozadia).
  - **Actors:** Cube element, cubie boxy, nálepky.
  - **Steps:** Cube element rotuje; každý cubie box zostáva tuhý; škáry a rohy
    ukazujú výhradne tmavé telo; žiadna far-side nálepka sa neobjaví.
  - **Covered by:** R1, R3, R4, R8, R9.

- F2. Ťah vrstvy s uzavretým telom
  - **Trigger:** Používateľ vykoná ťah vrstvy.
  - **Actors:** Pivot, cubie boxy, nálepky.
  - **Steps:** Pivot rotuje vrstvu; boxy sa otáčajú ako tuhé telesá; nálepky idú
    s nimi; žiadny element nestojí medzi nálepkou a pozorovateľom.
  - **Covered by:** R2, R4, R5, R6.

- F3. Vizuálna brána
  - **Trigger:** Preview prototyp je pripravený.
  - **Actors:** Používateľ, reálny Firefox a Edge.
  - **Steps:** Používateľ otvorí preview, skontroluje presvitanie v pokoji aj
    pri rotácii na 3×3 a 7×7, a schváli alebo vráti na úpravu.
  - **Covered by:** R8, R10, R11.

---

## Acceptance Examples

- AE1. **Covers R1, R8.** Pri graze uhle rotácie sa cez žiadnu nálepku neukáže
  čiara ani farba z inej tváre; viditeľné sú len farby nálepiek a tmavé telo v
  škárach.
- AE2. **Covers R6, R7.** Klik na nálepku vyberie sticker; klik na škáru ani
  telo neurobí nič.
- AE3. **Covers R9.** Škára okolo nálepky na stene so stickerom aj na stene bez
  stickera vyzerá rovnako (rovnaký tvar rohu).
- AE4. **Covers R11.** Na 7×7 prebehne resize a séria rýchlych rotácií bez
  viditeľného trhania alebo poklesu pod bežnú plynulosť.

---

## Scope Boundaries

- **V scope:** uzavreté telo cubie; odstránenie centrálneho quadru; zaoblenie
  stien bez nálepky; prototype-first preview; vizuálna brána vo Firefoxe a Edge.
- **Deferred for later:** explicitné varianty stred/hrana/roh ako samostatné
  komponenty — všetky cubies budú identické uzavreté boxy, líšia sa len počtom
  nálepiek.
- **Outside this product's identity:** zmena vizuálnej identity kocky (plastový
  rám, zmenšené nálepky); oprava ostatných nezrovnalostí z `TODO.md` (rotácia
  ±180°, rýchle ťahy, resize flicker).

---

## Dependencies / Assumptions

- **Dependency:** reálny Firefox a Edge pre vizuálnu validáciu — headless
  Chromium/Playwright nedokáže overiť depth-sorting (známe obmedzenie tohto
  prostredia).
- **Assumption:** 7–9 elementov na cubie je pre prehliadač bez výkonnostného
  dopadu aj pri 7×7; overí sa v rámci R11.
- **Assumption:** malé odsadenie nálepky od steny (R6) je vizuálne
  nepostrehnuteľné; potvrdí sa vo vizuálnej bráne.

---

## Outstanding Questions

- **Deferred to Planning:** presná veľkosť odsadenia nálepky (R6); spôsob
  vyhotovenia nedestruktívneho preview; či sa steny bez nálepky generujú vždy
  alebo len tam, kde ich treba; úprava existujúcich testov
  (`backface-culling.contract.test.ts`, `cubie-rendering.test.ts`).

---

## Sources / Research

- `src/views/basic/cubie-rendering.ts` — `buildCubieElement`,
  `renderCubieFaces`, `getFaceTransform`, `isSurfaceCubie`; dnes 6 elementov na
  cubie a quad v centre.
- `src/views/basic/basic-view.module.css` — `.cubie`, `.sticker`,
  `.cubie-interior`; zdroj `background-color` na `.cubie` z `b07d1ea`.
- `src/views/basic/backface-culling.contract.test.ts` — CSS kontrakt, ktorý
  treba aktualizovať.
- `docs/solutions/ui-bugs/backface-culling-flash-during-view-rotation.md` —
  pôvodný fix a jeho merania.
- `docs/visuals/firefox-color-leak.png` — používateľov screenshot presvitania.
