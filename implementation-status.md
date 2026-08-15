# Implementation Status

For current code quality evaluation, see
[code quality evaluation](code-quality-evaluation.md).

Last quality snapshot: 2026-08-15 (92 test files passing; 2071 tests passing).

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

🚧 **Planned**

(nothing atm)

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

- [!] Basic view: rotations in Firefox rotations over 180° unwinded rapidly in
  the opposite direction

### Long Term (almost certainly not, aka NOT planned)

- [-] 2×2, 4×4, 5×5+ cube visualizations
- [-] Solver algorithms
