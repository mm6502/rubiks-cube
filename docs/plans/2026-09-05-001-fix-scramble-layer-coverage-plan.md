---
title: 'fix: Scramble mixes inner layers and centers for every size'
type: fix
status: completed
date: 2026-09-05
origin: docs/brainstorms/2026-08-16-multi-size-2-7-support-requirements.md
---

# fix: Scramble mixes inner layers and centers for every size

## Summary

Rework `CubeController.scramble()` so it selects moves from the cube's existing
move table instead of hardcoded face turns. The pool is face plus numbered slice
moves (no wide, no whole-cube rotations, no bare `M`/`E`/`S`), consecutive moves
always differ in rotation axis, and the default length scales as
`max(11, 20·(n−2))`. This fixes the defect where inner layers and centers never
scrambled for sizes 4–7, and updates the upstream requirements doc's
scramble-length rule.

---

## Problem Frame

The current `scramble()` in `src/cube-controller.ts` hardcodes
`faces = [U, D, F, B, R, L]` × `['', "'", '2']` and never touches inner layers.
For a 3×3 this is sufficient — centers are fixed to the core and face turns
generate the full group. For sizes 4–7 the inner layers hold real, movable
pieces (centers, wing edges) that face turns cannot reach, so a large cube comes
out of a scramble with its centers still solved. The move engine already
generates a complete move table per size (face, wide, slice, numbered slice,
rotations), so the fix is to select from that table instead of re-inventing a
narrower move set.

---

## Requirements

**Move selection**

- R1. Scramble works at every supported size (2–7) and permutes every movable
  layer, including inner layers and centers for sizes 4–7.
- R2. Scramble moves are drawn from the cube's existing move table, restricted
  to face moves and numbered slice moves (sizes 4+ only). Wide moves, whole-cube
  rotations, and bare `M`/`E`/`S` moves are excluded.

**Scramble quality**

- R3. No two consecutive scramble moves share the same rotation axis.
- R4. The default scramble length is `max(11, 20·(n−2))`; an explicit move-count
  argument overrides the default.

**Testability**

- R5. Scramble accepts an injectable random source (defaulting to the platform
  RNG) so sequences are deterministically reproducible in tests.

**Documentation**

- R6. The multi-size requirements doc is updated so its scramble-length rule
  matches the new formula.

---

## Key Technical Decisions

- **Pool = face + numbered slice.** Wide moves are compositions of face+slice
  (no new scrambling entropy) and over-represent outer layers; whole-cube
  rotations reorient without adding entropy. Face moves alone generate the full
  3×3 group; face + inner-slice generate the full group for larger sizes.
- **Bare `M`/`E`/`S` are never in the pool.** For 3×3 they are redundant (`M` ≡
  `R` + `L'` plus a rotation — no entropy, centers are fixed). For 4+ they
  duplicate the numbered slices on layer 1 (`M` ≡ `2M`), which would
  double-weight layer 1. Only numbered slices (`2M`…`(n−1)M` and their `E`/`S`
  counterparts) are used for sizes 4+.
- **Axis-differ rule only, no layer or angle checks.** Layers are axis-relative,
  so a different axis implies a different plane — layer overlap cannot occur
  across axes. Angle is frozen into the move name (not a free dimension), so a
  separate angle check is meaningless. Filtering `axis !== previousAxis` is
  sufficient and never deadlocks (three axes always leave two candidates).
- **Random source is injectable.** The scramble signature accepts an optional
  uniform `[0,1)` generator function, defaulting to `Math.random`, so tests can
  pass a seeded deterministic generator without a new dependency.
- **Length `max(11, 20·(n−2))`.** This tracks WCA-calibrated scramble lengths
  (11 for 2×2, 20 for 3×3, 40 for 4×4, 60 for 5×5, 80 for 6×6, 100 for 7×7)
  better than the previous `8×N`, which was too short for large cubes and too
  long for small ones.

---

## Implementation Units

### U1. Rework scramble generation and its tests

- **Goal** — Replace the hardcoded face-loop scramble with pool-based,
  axis-constrained, injectably-random move selection, and bring the tests onto
  the new contract.
- **Requirements** — R1, R2, R3, R4, R5
- **Dependencies** — none
- **Files** — `src/cube-controller.ts`, `src/cube/types/model.ts`,
  `src/cube-controller.core.test.ts`
- **Approach** — Clear the move history at the start (matching current
  behavior), then build the move pool once per scramble by filtering the move
  table for the active size. Classify moves by `layerIndices`, not by name: face
  = exactly one layer at index `0` or `n−1`; numbered slice = exactly one layer
  with index in `1..n−2` (exists only for sizes 4+); wide = more than one layer;
  whole-cube rotation = all layers. Exclude wide and rotation moves, and exclude
  bare `M`/`E`/`S` by dropping the unnumbered single-inner-layer slice names
  (for 4+ they duplicate `2M`/`2E`/`2S`; for 3×3 they are redundant). Default
  length is `max(11, 20·(n−2))` when no explicit count is passed. Each iteration
  picks uniformly from candidates whose axis differs from the previous move's
  axis, applies it without history recording or logging (the exact `applyMove`
  call shape mirrors the existing scramble's `applyMove(move, true, true)`,
  which skips undo history and suppresses logging), and records the axis for the
  next pick. The public signature gains an optional random-source parameter.
  Directional sketch (not a specification):

  ```text
  clearMoveHistory()
  pool      = [m in moveDefinitions(cubeSize) if isFace(m) or isNumberedSlice(m)]
  length    = moveCount ?? max(11, 20 * (cubeSize - 2))
  prevAxis  = null
  repeat length times:
      candidates = [m in pool if m.axis != prevAxis]
      move       = candidates[floor(random() * candidates.length)]
      apply(move.name)          # skip undo logic, silent
      prevAxis   = move.axis
  ```

- **Patterns to follow** — Existing `scramble(moveCount = …)` signature and its
  `applyMove(move, true, true)` call shape in `src/cube-controller.ts`;
  `getCubeInvariants` access pattern in `src/cube/core/cube-invariants.ts`;
  `LayerManager.isWholeCubeRotation` for rotation detection.
- **Test scenarios**
  - Happy path: default length per size — 2→11, 3→20, 4→40, 5→60, 6→80, 7→100.
  - Happy path: explicit `scramble(10)` still yields exactly 10 moves at any
    size.
  - Happy path: no two consecutive moves share an axis, across every supported
    size.
  - Happy path: a seeded generator produces an identical move sequence across
    two `scramble` calls with the same seed.
  - Happy path: for size 4+ the scramble displaces at least one center cubie
    from its original position (proves inner layers actually scramble).
  - Edge case: every returned move parses via the existing move parser and is
    either a face move or a numbered slice — never a wide move, a rotation, or a
    bare `M`/`E`/`S`.
  - Edge case: the resulting state is legal (`checkStateLegality`) and
    non-solved for sizes 2, 4, and 7.
  - Edge case: move history is cleared after a scramble.
- **Verification** — Type-check clean; full test suite passes; coverage
  thresholds do not regress.

### U2. Update the upstream requirements doc

- **Goal** — Bring the multi-size requirements doc's scramble rule in line with
  the new behavior.
- **Requirements** — R6
- **Dependencies** — none
- **Files** —
  `docs/brainstorms/2026-08-16-multi-size-2-7-support-requirements.md`
- **Approach** — Replace the `8 × N` minimum in the Scramble requirement with
  the `max(11, 20·(n−2))` formula; update the accompanying acceptance example
  that asserts a 7×7 scramble produces at least 56 moves to the new count (100)
  and that scramble now also covers inner layers/centers for sizes 4+.
- **Test scenarios** — Test expectation: none — documentation only.

---

## Scope Boundaries

**Deferred to Follow-Up Work**

- Updating the earlier multi-size implementation plan's scramble unit, which
  still documents the `8 × N` formula. It is superseded by this plan's behavior
  and is not edited here unless explicitly requested.

**Outside this change**

- Wide moves and whole-cube rotations in the scramble pool.
- Solver and parity algorithms for any size.
- Sizes above 7.

---

## Risks & Dependencies

- The existing `should return valid move strings` test asserts a face-only
  format and will fail once slice moves appear in scrambles; it is rewritten in
  U1 rather than force-fit to the new pool.
- Slice move notation (`2M`, `3M2`, …) is longer than the old two-character face
  format, so any assertion elsewhere that depends on a fixed move-string shape
  must be reviewed — the only such assertion is the one updated in U1.
- No new runtime dependency is introduced; the injectable random source is a
  plain function parameter.

---

## Sources / Research

- `src/cube/core/cube-invariants.ts` — `getCubeInvariants` builds the per-size
  move table (face, wide, slice, numbered slice, rotations) with `axis`,
  `layerIndices`, and `angle` per move.
- `src/cube-controller.core.test.ts` — current scramble tests pin `8 × N`
  lengths and face-only move strings.
- `docs/plans/2026-08-16-001-feat-multi-size-cube-support-plan.md` (U5) — the
  earlier scramble sizing decision this plan supersedes.
- Verified at planning time via a temporary runtime dump: for size 5 the table
  holds 81 moves and `M` ≡ `2M` (axis X, layer `[1]`, −90°); for size 3 the
  center cubies do not relocate under any single move.
