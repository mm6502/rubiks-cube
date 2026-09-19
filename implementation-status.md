# Implementation Status

For current code quality evaluation, see
[code quality evaluation](code-quality-evaluation.md).

Last quality snapshot: **2026-09-19 at commit `dc4e7d0`** — 103 test files
passing, 2328 tests passing, 94.33% statements / 85.78% branches / 96.30%
functions / 95.46% lines. (Counts are pinned to that commit because later work
adds tests; re-measure rather than trusting the figure after any change.)

This document owns the completeness record. [TODO.md](TODO.md) owns actionable
tasks and deliberately does not repeat this checklist, so the two cannot drift
apart.

✅ **Complete (100%)**

- [x] (Dec 2025) Core type system with discrete cubie model
- [x] (Dec 2025) All core components (CubieManager, StateManager, LayerManager,
      MoveEngine)
- [x] (Dec 2025) CubeInvariants with pre-computed move tables
- [x] (Dec 2025) Virtual center cubies for face tracking
- [x] (Jan 2026) MoveHistory for undo/redo
- [x] (Feb 2026) State serialization/persistence
- [x] (Feb 2026) Mobile-First Responsive Redesign
- [x] (Mar 2026) Mouse/touch support for performing moves (Flat and Circular
      views)
- [x] (Apr 2026) Mouse/touch support for performing moves in Basic view
- [x] (Apr 2026) Fix Basic view (rotations, face labels)
- [x] (Apr 2026) Fix Basic view (cube walking)
- [x] (Apr 2026) Enable Arrow Keys to perform moves with selected cubie (all
      views)
- [x] (Apr 2026) Ghost hint stickers (Flat and Circular views)
- [x] (May 2026) Refactor token system in
      [tokens.scss](./src/styles/tokens.scss)
- [x] (Jul 2026) Implement Basic 2 as a cubie-based clone of Basic view to
      enable move animations
- [x] (Jul 2026) Address Basic 2 review-thread issues and event-bus doc
      follow-up
- [x] (Aug 2026) Solid cube interior for Basic 2 view with per-cubie interior
      faces and blocker removal
- [x] (Aug 2026) Scope linked rotations by view family for Basic and Basic 2,
      keeping Basic and Basic 2 toggles independent while preserving same-family
      propagation
- [x] (Sep 2026) Multi-size cube support (2×2–7×7) across the Flat, Basic and
      Basic 2 views — size selector, per-size saved state, and per-view size
      capability declarations
- [x] (Sep 2026) Cut over Basic 2 to replace the Basic view — the animated
      per-cubie engine is now the single Basic view (see
      [docs/brainstorms/2026-09-05-basic2-cutover-requirements.md](docs/brainstorms/2026-09-05-basic2-cutover-requirements.md))
- [x] (Sep 2026) Moves view icon fallback for size-specific moves — every valid
      notation renders as an icon, with numbered slices and wide moves reusing
      the family glyph plus a full-notation label (zero new SVG assets). See
      [docs/plans/2026-09-06-001-feat-moves-view-icon-fallback-plan.md](docs/plans/2026-09-06-001-feat-moves-view-icon-fallback-plan.md)
- [x] (Sep 2026) Circular view support for every cube size (2×2–7×7) — one
      generated SVG per size, resolved by active cube size. Assets are optional:
      a size with no committed file is built in the browser from its parameter
      set on first use. See
      [docs/plans/2026-09-17-001-feat-circular-svg-generator-plan.md](docs/plans/2026-09-17-001-feat-circular-svg-generator-plan.md)
- [x] (Sep 2026) Size-correct default selection — one shared helper derives the
      centre face position from the active cube size, replacing two hardcoded
      3×3-only positions and an inconsistent recovery formula. See
      [docs/plans/2026-09-19-001-fix-default-selection-and-doc-truth-up-plan.md](docs/plans/2026-09-19-001-fix-default-selection-and-doc-truth-up-plan.md)

🚧 **Planned**

(nothing atm — see Future Enhancements below)

## Future Enhancements

### Short Term (probably)

(nothing atm)

### Medium Term (maybe)

- [?] Move sequence "optimization" (eg. canceling out moves - like U followed by
  U' becomes no move; U followed by U becomes U2; z,z,z becomes z')
- [?] Add interactive features to Moves View (select, copy, see
  [TODO](./src/views/moves/todo.md))
- [?] Allow manual marks in move history (ie. first layer solved)
- [?] (Implement automatic marks in move history (ie. first layer solved))

### Known Issues (acknowledged, not planned to fix)

- [!] Basic view (the sole 3D cube view since the Basic 2 cutover): rotations in
  Firefox over 180° unwind rapidly in the opposite direction (matrix3d scheme)

  Kept deliberately, not carried over by default: this is a real
  browser-specific behaviour of the `matrix3d` + `transition: transform` scheme
  that whole-cube view rotation still uses, and move-layer animations are
  unaffected because they take the WAAPI `rotate3d` path. Removing this entry
  would require first confirming it still reproduces in Firefox.

### Long Term (almost certainly not, aka NOT planned)

- [-] Solver algorithms (solving a scrambled cube programmatically)
- [-] Additional view types beyond Flat, Basic, Circular and Moves

> Multi-size visualisations (2×2, 4×4, 5×5+) used to be listed here as not
> planned. They shipped — see the Complete section above.
