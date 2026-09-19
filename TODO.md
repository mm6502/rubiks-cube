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

- [ ] Consolidate the duplicated Circular layout parameters. The shipped ellipse
      values exist in three unsynchronised places:
      `src/views/circular/svg-generator/parameters.json` (what the app uses),
      the `PROPOSALS` block in `scripts/circular-layout/render-previews.ts`, and
      configuration `B` in `scripts/circular-layout/analyse-tangency.ts`.
      Nothing keeps them in sync, so a change to one silently leaves the others
      describing a different layout.

- [ ] Port the Circular view's selection-recovery path to Basic and Flat. Both
      currently dead-end when no sticker is selected: arrow keys return "not
      handled" (so the browser scrolls the page), Space does nothing, and M/E/S
      are inert. Reachable after load because tapping the background deselects.
      Deferred because it changes arrow-key semantics.

- [ ] Replace the private `toFacePosition` in
      `src/views/circular/svg-generator/ghosts.ts` with the exported
      `calculateStickerPositionOnFace` — a genuine near-duplicate, but in the
      geometry layer, so folding it in is a behaviour question rather than a
      rename.

- [ ] Resolve package overrides due to security concerns, should any arise.
