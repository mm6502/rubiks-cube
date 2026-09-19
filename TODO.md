# TODO List

This document lists actionable tasks. For the completeness record — what has
shipped, what is planned, known issues, and the quality snapshot — see
[implementation-status.md](implementation-status.md). The two deliberately do
not repeat each other's content, so they cannot drift apart.

## Current tasks

- [x] M/E/S slice moves follow the active view's selection on n>3 (target layer
      from the selected sticker, notation emitted as `2M`/`3E`/`4S`); M/E/S are
      unavailable on 2×2 and while nothing is selected. 3×3 keeps the fixed
      conventional middle slice (`M`/`E`/`S`). See
      [src/docs/move-notation.md](src/docs/move-notation.md).

- [x] Moves view icon fallback for size-specific moves — numbered slice/wide
      moves (`2M`, `3E`, `4S`, `2Rw`, ...) render the canonical family glyph
      with the full notation as a label, reusing the existing icon set (zero new
      SVG assets). Shipped; see
      [docs/plans/2026-09-06-001-feat-moves-view-icon-fallback-plan.md](docs/plans/2026-09-06-001-feat-moves-view-icon-fallback-plan.md).

- [x] Circular view support for custom cube sizes (2×2–7×7) — all sizes served
      from one generated SVG per size, or built on demand when no asset is
      committed. Shipped; see
      [docs/plans/2026-09-17-001-feat-circular-svg-generator-plan.md](docs/plans/2026-09-17-001-feat-circular-svg-generator-plan.md).

- [x] Size-correct default selection across Basic, Flat and Circular. Shipped;
      see
      [docs/plans/2026-09-19-001-fix-default-selection-and-doc-truth-up-plan.md](docs/plans/2026-09-19-001-fix-default-selection-and-doc-truth-up-plan.md).

## Future Tasks

This section outlines tasks that may be addressed in the future, though they are
not currently scheduled for implementation.

- [x] Unify the deselect behaviour across the three views. Circular was the only
      view that cleared the _sticker_ selection (tapping the halo, or the same
      sticker/face again); Basic and Flat only ever toggle the _face_ highlight
      and keep the selection. Circular's `recoverSelection` existed only to
      recover from the state its own deselect created, so the asymmetry was
      costing a whole recovery path plus a three-tier fallback.

      Resolved by removing Circular's deselect rather than porting recovery:
      `onStickerSelected` no longer accepts `undefined`, `recoverSelection` is
      deleted, and tapping the halo now just clears the face highlight. All three
      views behave the same way, and navigation with nothing selected reports the
      key as unhandled — the same answer Basic and Flat already gave.

      The item's original justification did not survive checking, and is recorded
      so it is not re-derived: it claimed the dead-end was "reachable after load
      because tapping the background deselects". It never was — in Basic, tapping
      the background clears the face but still passes a real sticker id, and
      across all production sources only Circular ever passed `undefined`.

      Side effect worth knowing: deselect was the only way to reach the
      "nothing selected" state at n>3, where `slice-target.ts` disables M/E/S.
      Those commands are now always available when a cube is selected on n>3.

## Closed

- [x] Document the Circular layout parameters as an intentional experiment
      surface rather than a duplication to collapse. `PROPOSALS` in
      `render-previews.ts` deliberately mirrors the shape `analyse-*` solves in,
      so a candidate layout can be pasted in and previewed before anything
      ships; pointing it at `loadParameters()` would delete exactly that
      ability. The ownership note in the file now says so, and warns against
      "fixing" it.

- [x] Fix the stale range comment in `PROPOSALS`
      (`scripts/circular-layout/render-previews.ts`): sizes 6 and 7 were
      annotated "Beyond the sizes the app ships", but `SUPPORTED_SIZES` is
      `[2..7]` and `parameters.json` already described both as "Served at every
      cube size". They now match the JSON.

- [x] Fix the misleading header on `analyse-labels.ts`, a **fourth** copy of the
      geometry (`C` ellipse values plus a `RING` table). Its comment called the
      rings "matching the renderer's proposal table"; they do not — the `RING`
      table is configuration **B**'s, and its N=4 `rMin` of 79.533 is the
      pre-ghost value, not the shipped 87.5. The comments now name C and B as
      superseded and warn against syncing them to `parameters.json`, which would
      silently rewrite what that analysis reports.

- [x] Replace the private `toFacePosition` in
      `src/views/circular/svg-generator/ghosts.ts` with the shared
      `calculateStickerPositionOnFace` (`59bea86`). Equivalence was established
      before the swap rather than assumed — 834 combinations (every size 2–7 ×
      every face × every cell) with zero mismatches — and the generated ghost
      set is unchanged at all six sizes afterwards.

- [x] Resolve package overrides due to security concerns. `package.json` carries
      `"overrides": {}` — an empty block, so there is nothing to resolve. Keep
      as a standing place to record a real pin if one is ever needed; no action
      now.
