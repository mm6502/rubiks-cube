# Implementation Status

For current code quality evaluation, see [code quality evaluation](code-quality-evaluation.md).

Last quality snapshot: 2026-04-03 (1290 tests passing; coverage: 90.06% stmts, 80.51% branches, 90.99% lines, 93.45% funcs).

✅ **Complete (100%)**

- [x] (Dec 2025) Core type system with discrete cubie model
- [x] (Dec 2025) All core components (CubieManager, StateManager, LayerManager, MoveEngine)
- [x] (Dec 2025) CubeInvariants with pre-computed move tables
- [x] (Dec 2025) Virtual center cubies for face tracking
- [x] (Jan 2026) MoveHistory for undo/redo
- [x] (Feb 2026) State serialization/persistence
- [x] (Feb 2026) Mobile-First Responsive Redesign
- [x] (Mar 2026) Mouse/touch support for performing moves (Flat and Circular views)

🚧 **Planned**

- [ ] Debug / Fix Basic view (cube walking, rotations, face labels)
- [ ] Add mouse/touch support for performing moves in Basic view
- [ ] Refactor Circular view helper classes / break to smaller components
- [ ] Refactor Flat view helper classes / break to smaller components
- [ ] Refactor Basic view helper classes / break to smaller components
- [?] Make clone of Basic view with separate cubies to enable animations
- [?] Enable Arrow Keys to perform moves with selected cubie (all views?)

## Future Enhancements

### Short Term (probably)

(nothing atm)

### Medium Term (maybe)

- [?] Move sequence "optimization" (eg. canceling out moves - like U followed by U' becomes no move; U followed by U becomes U2; z,z,z becomes z')
- [?] Add interactive features to Moves View (select, copy, see [TODO](./src/views/moves/todo.md))
- [?] Allow manual marks in move history (ie. first layer solved)
- [?] (Implement automatic marks in move history (ie. first layer solved))
- [?] Improved Basic View interactions (cube walking, rotations)

### Long Term (almost certainly not, aka NOT planned)

- [-] 2×2, 4×4, 5×5+ cube visualizations
- [-] Solver algorithms
