---
date: 2026-08-16
topic: multi-size-2-7-support
---

# Multi-Size Cube Support (2–7) — Requirements

## Summary

Add a size selector for cube sizes 2 through 7, remembering the last selected
size and a separate saved state per size. Flat, basic, and basic-2 views are
targeted for all six sizes in the first phase (pending a CSS-geometry
inventory); circular view works only for sizes with a conforming SVG (initially
3×3), with the remaining sizes landing in a later phase. Scramble works for
every size.

## Problem Frame

The app currently hardcodes a 3×3 cube at startup (`new CubeController()` in
`src/application.ts`). The core model layer was built size-agnostic and the view
layer was prepared for multi-size in May 2026
(`docs/brainstorms/multi-size-readiness-overview.md`), but there is still no
user-facing way to create or switch to a cube of another size. The goal is a
personal "cube in your pocket" — a mobile-friendly tool for simulating and
scrambling cubes of size 2–7. No solver is needed.

## Key Decisions

- **Per-size state, not one shared state.** Switching size must not discard an
  in-progress cube of another size. Each size keeps its own saved slot.
- **Size selector in the UI with per-size memory.** Chosen over a URL parameter
  so the feature is visible and usable on mobile.
- **Scramble length scales with size.** A fixed 20 moves is too few for a 7×7
  and more than needed for a 2×2.
- **Virtual center cubies stay.** They are not a blocker for even sizes; only
  the state-restore/import path needs a small fix (see R12). Removal and
  replacement with an explicit orientation-tracking mechanism is a separate
  refactor, not part of this feature.
- **Circular view is sequenced.** Flat/basic/basic-2 are the first-phase target
  for all six sizes; authoring per-N SVG files for circular goes into a separate
  phase, in an order decided at that phase.

## Requirements

**Size selection and switching**

- R1. A size selector offers cube sizes 2 through 7.
- R2. Selecting a size activates a cube of that size.
- R3. The last selected size is remembered and restored on the next launch.
- R4. Each size keeps its own cube state; switching sizes does not discard
  another size's progress.

**Per-size state persistence**

- R5. Auto-save and restore operate per size (distinct stored slot per size).
- R6. On launch, the app restores the last selected size and that size's saved
  state (or a solved cube when none is saved). On first launch with no
  remembered size, the app defaults to 3×3.

**View size capability**

- R7. Each view declares the sizes it supports.
- R8. The UI offers and renders only the views that support the active size.
- R9. When the active size changes, open views that do not support the new size
  are hidden; switching back to a supported size re-shows them. Unsupported
  views remain visible in the view picker as disabled, with a neutral note
  (e.g., "Current size unsupported").

**Scramble**

- R10. Scramble works for every supported size (2–7).
- R11. Scramble move count scales with cube size — a minimum of `8 × N` moves
  (e.g., 56 for 7×7, 16 for 2×2). The exact formula beyond this floor is a
  planning decision.

**Even-size support**

- R12. Restoring or importing an even-size state (2, 4, 6) must not emit
  spurious errors or skip sticker-color handling caused by non-integer
  virtual-center positions; virtual-center cubies are excluded from color
  reconstruction.

**Rendering**

- R13. Basic and basic-2 render all sizes 2–7 correctly; sticker sizing,
  spacing, and face geometry adapt to non-3×3 sizes (visual, not structural).
- R14. Flat view renders all sizes 2–7 correctly with no remaining hardcoded-3
  assumptions.

**Circular view**

- R15. Circular view supports only sizes with a conforming SVG — initially 3×3.
  Sizes 2, 4, 5, 6, and 7 land in a later phase, in an order decided at that
  phase.

**Move simulation**

- R16. A face move and a whole-cube rotation at every size 2–7 produce a legal,
  correctly permuted and oriented state with no errors.

## Key Flows

- F1. Select a size
  - **Trigger:** User picks size N from the selector.
  - **Steps:** The current size's state is saved; a new or restored N-sized cube
    becomes active; the view list is filtered to those supporting N; unsupported
    open views are hidden.
  - **Outcome:** The active cube is size N and only supported views are shown.

- F2. Return to a previously used size
  - **Trigger:** User switches back to a size they used before.
  - **Steps:** That size's saved state is restored.
  - **Outcome:** The cube is exactly as the user left it for that size.

## Acceptance Examples

- AE1. **Covers R9.** With circular view open at 3×3, switching to 4×4 hides
  circular; switching back to 3×3 re-shows it.
- AE2. **Covers R4, R6.** Scramble a 4×4, switch to a solved 5×5, then switch
  back to 4×4 — the scrambled 4×4 state is intact.
- AE3. **Covers R12.** Import a 2×2 state — it loads correctly with no error log
  about virtual-center sticker positions.
- AE4. **Covers R11.** A 7×7 scramble produces at least 56 moves and more moves
  than a 2×2 scramble.
- AE5. **Covers R12.** Scramble a 4×4, save, restore, and re-import — the state
  round-trips with no errors and legal notation.
- AE6. **Covers R16.** Apply a face move and a whole-cube rotation at 2×2 and
  6×6 — the resulting state is legal with no errors.

## Success Criteria

- 3×3 behavior is unchanged across all views and scramble (no regression).
- All sizes 2–7 are selectable; flat, basic, and basic-2 render and rotate
  correctly at each size.
- Scramble completes without error at every size.
- The existing test suite passes and coverage thresholds do not regress.

## Scope Boundaries

**Deferred for later**

- Circular view sizes 2, 4, 5, 6, 7 (separate phase; per-N SVG authoring; order
  decided at that phase).
- Removal and replacement of virtual-center cubies (separate refactor).

**Outside this feature**

- Solver and parity algorithms for any size.
- Sizes above 7.
- Cross-device or cloud state sync.

## Dependencies / Assumptions

- The core layer (`CubeController`, invariants, move engine, notation,
  serialization) is already size-agnostic; verified against the current code.
- Circular multi-size depends on per-N conforming SVG files, per
  `docs/brainstorms/circular-view-multi-size-prep-requirements.md`.
- Basic/basic-2 CSS geometry adjustments are visual-only and do not change their
  structure.

## Outstanding Questions

**Deferred to Planning**

- Exact scramble move-count formula per size (above the `8 × N` floor).
- CSS geometry tuning specifics for basic/basic-2 at each non-3 size.
- The phase order and scheduling for the remaining circular sizes.
