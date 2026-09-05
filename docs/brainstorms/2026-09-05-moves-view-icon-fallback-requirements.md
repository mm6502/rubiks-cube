---
date: 2026-09-05
topic: moves-view-icon-fallback
---

# Moves View Icon Fallback for Size-Specific Moves (Requirements)

## Summary

Make the Moves view's icon mode readable on cubes larger than 3×3 by reusing the
existing icon set: when a valid size-specific move (numbered slice `3E`, wide
`Rw`, etc.) has no dedicated icon, the view shows the icon of the move's
canonical family (`E`, `M`, `S`, `R`, `U`, ...) with the full original notation
as the label overlay. This is a pure normalization/mapping change — zero new SVG
assets — so it does not bloat the single-file build.

## Problem Frame

The multi-size feature added size selector and engine support for 2–7, and the
Basic/Flat/Basic 2 views were made size-aware. The Moves view was not. In icon
mode (`Show Icons`, Ctrl+2), moves are rendered through `MOVE_ICONS`, a Proxy
that returns `undefined` for any notation not in `MOVE_ICON_PRESETS`. Numbered
slice moves such as `2M`, `3E`, `4S` (which are exactly what user drag/keyboard
gestures generate on inner layers of a 4×4+ cube) fall through to the plain-text
branch, while ordinary moves like `B'` render as icons. On a 5×5 cube, a history
of inner-slice moves therefore renders as a list of bare text tokens next to
icon-backed face moves — visually inconsistent and harder to scan than the 3×3
experience, where every notation has an exact icon.

The prior plan
`docs/plans/2026-08-16-002-fix-multi-size-rendering-and-move-notation-plan.md`
(U5, R6) already scoped this fix as a "notation-family normalization" that must
not introduce a large new icon set. It stalled on a genuine tension: naive
fallback options range from "one generic icon for everything" (loses axis
meaning) to "author a new glyph per notation" (bloats the single-file build with
near-duplicate SVGs). This brainstorm resolves that tension: the canonical
family icons that already exist are direction- and axis-meaningful, so the
fallback only needs to pick the right existing family glyph and label it with
the exact notation.

## Key Decisions

- **Reuse existing family glyphs; author zero new SVGs.** Every family the
  fallback needs already exists in `src/icons/move-icon-sprite.svg` — slice
  `M`/`E`/`S`, faces `F`/`R`/`U`/`D`/`L`/`B`, rotations `x`/`y`/`z`, each with
  base/prime/2/2′ symbol variants. The fallback maps a size-specific notation to
  an existing family glyph plus the notation label. No new assets, no measurable
  single-file growth (a small mapping function only).
- **Family base glyph + full-notation label overlay.** A numbered slice keeps
  its distinguishing number in the label (`3E` → E base icon with a "3E"
  overlay), so the layer number is never lost and the axis/direction reading
  stays intact. Fallback items always use the family's base glyph (never the
  suffix-variant glyph) and carry the full notation in the overlay, which
  replaces any default label — matching the existing label-overlay mechanism
  already used for icon moves.
- **The precomputed move table in cube invariants is the authority for what is a
  valid notation.** `getCubeInvariants(size).moveDefinitions` already knows
  every valid move name per size (faces, bare slices, numbered slices, wide
  moves, rotations). The icon resolver does not duplicate validity rules; it
  asks the invariants table whether a notation is valid for the active size and,
  if so, which canonical family it belongs to. `MoveDefinition` currently stores
  only `name`/`axis`/`layerIndices`/`angle`, so this work extends it with an
  explicit canonical-family field that `buildMoveDefinitions` assigns at
  generation time (slice `M`/`E`/`S`, face, wide, or rotation is known in the
  builder) — keeping validity and family under one authority with no
  notation-string parsing in the icon layer.
- **3×3 behavior is unchanged.** On a 3×3 cube every valid notation already has
  an exact icon, so the fallback path is never taken and existing rendering is
  byte-for-byte identical. R7 from the prior plan holds.

## Requirements

**Icon resolution**

- R1. When icon mode is on, every valid move notation in the current history
  renders as an icon (not bare text), for every supported cube size.
- R2. A notation with an exact icon match (`M`, `E`, `S`, `R`, `U`, `F`, `B`,
  `D`, `L`, `x`/`y`/`z` and their `'`/`2`/`2'` variants) keeps that exact icon,
  unchanged from today.
- R3. A numbered slice notation (`2M`, `3E`, `4S`, `2M'`, `3E2`, ...) renders
  the canonical family **base** glyph (`M`, `E`, or `S`) with the full original
  notation as its label overlay. The overlay occupies the same fixed label slot
  as exact-match icons and is the single carrier of the modifier (`'`, `2`, and
  the layer number); the base glyph is never swapped for a suffix-variant glyph.
- R4. A wide notation — numbered or not (`Rw`, `Uw`, `Rw2`, `Uw'`, `2Rw`,
  `3Rw2`, `4Uw'`, ...) — renders the canonical face **base** glyph (`R`, `U`,
  ...) with the full original notation as its label overlay, following the same
  fixed-slot overlay rule as R3. A recognizable wide form gets an icon even if
  the notation is not (yet) present in the engine's move table.
- R5. A valid size-specific notation whose label overlay would collide with the
  glyph's existing default label position still renders legibly. For fallback
  items the overlay is the notation itself and replaces any default label, so
  the notation and the modifier appear in exactly one place; this matches how
  exact-match icons already display their notation.
- R5b. The full-notation overlay scales to fit the glyph's existing label area
  without clipping or overlapping adjacent tiles at the smallest icon-mode row
  size, including labels up to 4–5 characters (e.g. `3Rw2`, `4Uw'`, `3E2'`).

**Validation authority**

- R6. The resolver derives move validity from the precomputed move table
  (`moveDefinitions` in cube invariants for the active cube size), not from
  duplicated pattern rules in the icon layer. **Exception:** if the move table
  is not extended to cover numbered-wide forms (path C of the open question), a
  single notation-pattern exception for the wide family is permitted as the
  fallback so recognizable wide moves still get their face glyph.
- R7. Malformed or unrecognized notations — where no family/icon can be
  determined (e.g. `ZZ9`) — keep the existing text fallback and never crash the
  renderer or drop the history entry. Recognizable wide forms are covered by R4,
  not by this text fallback.

**Non-regression**

- R8. Rendering for cube size 3 is unchanged: no notation that has an exact icon
  today changes appearance, and no 3×3-valid notation falls back to a family
  glyph when it already has an exact match.
- R9. Long move histories continue to render in the correct current-item state
  and scroll position after a move (existing renderer behavior is preserved).
- R10. No new SVG assets are added to `src/icons/move-icon-sprite.svg`, and the
  single-file build does not grow measurably from this change.

## Acceptance Examples

- AE1. A 5×5 history containing `4E 3M' 2E 2S' B' 3E 4S 4E' 2E` in icon mode
  renders every numbered slice with an `E`/`M`/`S`-family icon and its notation
  label, and `B'` with its exact icon — no bare-text tokens remain.
- AE2. A 7×7 history containing `3Rw2 4Uw'` renders `3Rw2` with the R-family
  icon labeled `3Rw2` and `4Uw'` with the U-family icon labeled `4Uw'`.
- AE3. A 3×3 history renders identically before and after this change for every
  notation in the standard set (`R R' R2 R2' L ... M ... x ... z2'`).
- AE4. A history containing a malformed token (e.g. `ZZ9`) still renders that
  entry as text, does not throw, and does not disturb adjacent entries.
- AE5. Switching between icon and text mode on a non-3 cube keeps every entry
  readable in both modes, with the same history order and current-item marker.
- AE6. A 7×7 history row containing the long fallback labels `3Rw2`, `4Uw'`, and
  `3E2'` renders each label fully (no clipping or overlap with adjacent tiles)
  at the smallest icon-mode row size.

## Scope Boundaries

**Deferred for later**

- A distinct visual treatment that distinguishes wide moves from single-layer
  face moves at a glance (a true "two-layer" glyph family). Today both reuse the
  face glyph and differ only by label; acceptable because the notation label is
  always present.
- A full design cleanup of the Moves view layout beyond the fallback mapping.
- New glyph authoring for a future notation that has no family ancestor in the
  current sprite.

**Outside this product's identity**

- New SVG assets per notation — explicitly rejected to avoid single-file bloat.
- Circular view multi-size assets (separate phase under its own requirement
  doc).

## Dependencies / Assumptions

- The active cube size is available where the Moves view renders (via the model
  state `cubeSize`), so the resolver can consult the correct invariants table.
- The resolver is reachable from `src/views/moves/renderer.ts` without creating
  an import cycle (icons layer may read cube core; cube core does not import
  icons — verified).
- Wide moves are not currently produced by scramble or drag/keyboard gestures;
  they only enter history via state import. They are in scope because the engine
  supports them and import is a plausible future path, and the fallback cost is
  the same mapping rule already required for numbered slices.

## Sources / Research

- `docs/plans/2026-08-16-002-fix-multi-size-rendering-and-move-notation-plan.md`
  — U5 unit and R6 requirement this work satisfies; notation fallback matrix
  (M/E/S families) and its "no large new icon set" constraint.
- `src/icons/move-icon-generator.ts` — `MOVE_ICON_PRESETS`, `isMoveNotation`,
  `MoveNotation` union, label positions; the current exact-match boundary.
- `src/icons/index.ts` — `MOVE_ICONS` Proxy that returns `undefined` for
  non-preset notations; `COMMANDS_ICONS`.
- `src/icons/move-icon-sprite.svg` — existing family glyphs reused by the
  fallback (slice `m/e/s`, faces `f/r/u/d/l/b`, rotations `x/y/z` and their
  variants).
- `src/views/moves/renderer.ts` — `createMoveItem` icon-vs-text branch
  (`this.showAsIcons && this.moveIcons[move]`); label overlay mechanism.
- `src/cube/core/cube-invariants.ts` — `buildMoveDefinitions` generates the
  authoritative move-name set per size (faces, bare + numbered slices, wide,
  rotations); `moveDefinitions` map is the validity authority for R6.
- `src/interaction/move-inference.ts` — `axisLayerToMoveBase` proves numbered
  slices (`${layerIndex + 1}M`) are what user gestures generate on n>3.
- `src/cube-controller.ts` — scramble excludes wide/whole-cube; history on n>3
  contains numbered slices from user moves.

## Deferred / Open Questions

### From 2026-09-05 review

- **Numbered-wide notations absent from validated move table** — AE2 / R6 / R4
  (P1, feasibility + scope-guardian, confidence 100)

  AE2 cannot pass as written: `3Rw2`/`4Uw'` are not generated by the move
  builder (only bare `Rw`/`Uw`/... plus `'`/`2`/`2'` variants exist), so under
  R6/R7 they are "not present in the invariants table for the active size" and
  must keep the text fallback, contradicting AE2's icon expectation. R4's own
  `2Rw` example points at the same gap. The requirements must decide whether
  numbered-wide forms are in-vocabulary (an unstated engine/import extension) or
  revise AE2/R4 to table-valid wide forms, or acceptance testing will fail
  against the documented authority.

  > **Smerovanie (2026-09-06, premietnuté do R4/R6/R7):** Číslované wide ťahy
  > (`2Rw`, `3Rw`, `4Uw`, ...) **majú dostať ikonu** — symetricky k číslovaným
  > M/E/S slice ťahom, ktoré engine už generuje. Nevidíme dôvod, prečo by wide
  > mali byť obmedzené len na nečíslovanú dvojvrstvovú formu, keď slice rodina
  > číslované varianty má. Platí dvojcestná stratégia (zapísaná v R4/R6/R7):
  >
  > - **A (happy path):** Rozšíriť `buildMoveDefinitions` o číslované wide (n
  >   vrstiev z okraja pre n>2) — `2Rw`, `3Rw`, `4Uw`, ... aj s `'`/`2`/`2'`
  >   variantmi. Potom R6/R7 fungujú jednotne: notácia je v tabuľke → fallback
  >   ikona. Renderer sa pýta tabuľky a nič neduplikuje.
  > - **C (núdzová cesta / exceptions):** Aj keby engine rozšírenie neprešlo
  >   (výrazné problémy v pláne), fallback má rozoznať štruktúru wide notácie
  >   (napr. regex maska `/^\d*[UDLRFB]w['2]*$/` na wide ťahy) a zobraziť
  >   príslušný face base glyf s presným labelom — nie text. Wide notácia tak
  >   dostane ikonu **vždy**, nezávisle od engine podpory. R6 túto vedomú
  >   výnimku povoľuje len ak sa move tabuľka nerozširuje; R4 zaručuje ikonu pre
  >   rozpoznateľné wide formy; R7 text fallback ostáva len pre ťahy, kde
  >   rodinu/ikonu nevieme určiť.
  >
  > **Rozhodnuté:** Ak pri písaní plánu feasibility check neukáže výrazné
  > problémy → **A** (rozšíriť engine, R4/AE2 s číselnými wide prejdú priamo).
  > Ak by problémy boli → **aspoň C** (fallback regex maska), takže
  > `2Rw`/`3Rw2`/`4Uw'` majú ikonu + presný label v oboch prípadoch. AE2 ostáva
  > platný v oboch vetvách (ikonu dostanú tak či tak).

- **Scramble pool a rozloženie pravdepodobnosti po rozšírení o číselné wide** —
  `src/cube-controller.ts` (`isEligibleScrambleMove`, `buildScramblePool`) (P1)

  Ak sa cesta A (rozšírenie `moveDefinitions` o číselné wide) implementuje,
  treba pri písaní plánu **skontrolovať scramble logiku**. Dnešný scramble plán
  (`docs/plans/2026-09-05-001-fix-scramble-layer-coverage-plan.md`, completed)
  zámerne vylúčil wide ťahy z poolu: _"Wide moves are compositions of face+slice
  (no new scrambling entropy) and over-represent outer layers."_ Overené v kóde:
  `isEligibleScrambleMove` už dnes wide drží von cez `layerIndices.length !== 1`
  (wide má n vrstiev), a `buildScramblePool` grupuje podľa fyzickej identity
  `axis:layer:angle`, takže rozšírenie tabuľky samo o sebe pool nezmení.
  **Napriek tomu treba pri pláne overiť:** (1) či číselné wide (`2Rw` = vrstvy
  [last, last-1]) nezdieľajú fyzickú identitu s existujúcimi pool ťahmi tak, že
  by sa zmenilo rozloženie pravdepodobnosti výberu; (2) či zámerné vylúčenie
  wide zo scramble zostáva zachované (R2 scramble plánu: _"Wide moves ... are
  excluded"_) a nie je potrebné ho meniť; (3) či `isEligibleScrambleMove` /
  `isNumberedSliceName` / `buildScramblePool` potrebujú update, aby pool zostal
  korektný a distribúcia ťahov (face + numbered slice, žiadne wide) sa
  nezmenila. Ak sa zistí vplyv na pravdepodobnosť → updatnúť eligible-moves
  logiku a scramble testy.

  <!-- dedup-key: section="deferred open questions / scramble pool" title="scramble pool a rozlozenie pravdepodobnosti po rozsireni o ciselne wide" evidence="Wide moves are compositions of face+slice (no new scrambling entropy) and over-represent outer layers." -->

  <!-- dedup-key: section="ae2 / r6 / r4 (acceptance examples / validation authority)" title="numbered-wide notations absent from validated move table" evidence="AE2. A 7×7 history containing `3Rw2 4Uw'` renders `3Rw2` with the R-family icon labeled `3Rw2` and `4Uw'` with the U-family icon labeled `4Uw'`." -->
