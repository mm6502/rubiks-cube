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
      values are mirrored in the `PROPOSALS` block of
      `scripts/circular-layout/render-previews.ts`: same numbers, held in a
      different shape (`d`/`rMin`/`step`/`margin`/`oN`/`oF`/`aspect` versus
      `triangleSide`/`innerRadius`/`ringStep`/`ellipseMargin`/...), so a change
      to one silently leaves the other describing a different layout.

      **Corrected during review.** This item previously named configuration `B`
      in `scripts/circular-layout/analyse-tangency.ts` as the third copy. It is
      not a copy: `B` is the deliberate pre-tangency *baseline* the solver
      compares against — its comment says "the starting point", and its values
      differ on purpose (at N=4 it carries `rMin 79.533, margin 2.0, oN/oF 0.2`
      where the shipped layout has `rMin 87.5, margin 2.2, oN 0, oF 0.1`).
      Folding it in would destroy the comparison it exists to make. The real
      duplication is the two-way mirror between `parameters.json` and
      `PROPOSALS`.

- [ ] Fix the stale range comment in `PROPOSALS`
      (`scripts/circular-layout/render-previews.ts`): sizes 6 and 7 are
      annotated "Beyond the sizes the app ships", but `SUPPORTED_SIZES` is
      `[2..7]`. The comment predates 6 and 7 shipping. Small, and worth folding
      into the item above rather than its own change.

- [ ] Reassess whether Basic and Flat need a selection-recovery path. **The
      original justification for this item did not survive checking** and is
      recorded here so it is not re-derived: it claimed the dead-end is
      "reachable after load because tapping the background deselects". It is not
      reachable. In Basic, tapping the background clears the _face_ selection
      but still calls `onStickerSelected(hit.stickerId)` with a real id, and
      `handleTap` never passes `undefined`; across all production sources only
      Circular ever calls `onStickerSelected(undefined)`
      (`touch-handler-interaction.ts:229`, the halo-deselect path). Both views
      also establish a default selection in `create()`. So with no production
      path clearing the sticker selection in Basic or Flat, the "arrows return
      not-handled and the page scrolls" scenario cannot currently arise, and
      Circular's `recoverSelection` is defending a state its siblings cannot
      enter. What remains worth deciding is the opposite question: whether the
      recovery path is _dead code_ in effect, or whether Basic and Flat should
      gain an explicit deselect (making recovery genuinely necessary). That is a
      behaviour decision, not a port.

## Closed

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
