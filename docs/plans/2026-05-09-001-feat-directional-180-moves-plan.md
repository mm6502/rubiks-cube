---
title: 'feat: Add directional 180° moves'
type: feat
status: active
date: 2026-05-09
origin: docs/brainstorms/directional-180-moves-requirements.md
---

# feat: Add directional 180° moves

## Summary

Extend the move pipeline so that 180° moves carry a CW vs CCW direction
end-to-end: gesture → type → notation → history → animation → undo/redo. Six
implementation units thread `-180` through `QuarterTurn`,
`buildMoveNotation`/parser, the drag-inference heuristic, and the animation
layer, then tighten `MoveExecutedEvent.definition` from optional to required.
Two pre-existing bugs are fixed as side effects of the core changes.

---

## Problem Frame

Today the system discards drag direction at `inferQuarterTurnAngle()`, has no
`-180` value in `QuarterTurn`, and emits the same event shape for forward moves,
undo, and redo. Two bugs compound the problem: a second `U2` incorrectly
collapses undo history, and the adjacent-ring sticker animation direction is
non-deterministic at exactly ±180°. (see origin:
`docs/brainstorms/directional-180-moves-requirements.md`)

---

## Requirements

- R1. `QuarterTurn` extended to include `-180` in `src/cube/types/common.ts`.
- R2. `inferQuarterTurnAngle()` returns `-180` when drag direction is CCW for a
  far drag.
- R3. `getFaceRotationAxis(face, -180)` passes the sign through correctly to
  `effectiveAngle`.
- R4. `buildMoveNotation(-180, …)` emits `"U2'"` (apostrophe suffix on 2-moves).
- R5. Move parser accepts `"U2'"` and produces `angle: -180`.
- R6. `getInverseMove("U2") → "U2'"` and `getInverseMove("U2'") → "U2"` (flip
  `'` on 2-moves).
- R7. `MoveExecutedEvent.moveDetails.definition` promoted from optional to
  required; all three emission sites (forward move, undo, redo) in
  `cube-controller.ts` must supply it.
- Bug A. U2+U2 history collapse fixed automatically by R6 (no separate unit
  needed).
- Bug B. Adjacent-ring sticker direction non-determinism at ±180° fixed in
  animations.ts.

---

## Scope Boundaries

- `[J]` Decompose `U2` into `[U, U]` — deferred; major refactor unrelated to
  this feature.
- User preference for default direction — moot; direction is determined by
  notation convention.
- `isUndo`/`origin` fields on `MoveExecutedEvent` — no current subscriber needs
  them.
- Changes to cube state math (`rotatePosition3D`) — `-180` and `180` are
  state-equivalent; no state computation changes required.
- WCA-export compatibility — `"U2'"` is a notation-layer extension used
  internally for animation; serialised history that already contains `"U2"`
  animates with default (CW) direction.

---

## Context & Research

### Relevant Code and Patterns

- `src/cube/types/common.ts` — `QuarterTurn = 90 | -90 | 180 | 270`; target type
  to extend.
- `src/cube/utils/sticker-position.ts` —
  `getFaceRotationAxis(face, angle: QuarterTurn)`; already uses
  `-angle as QuarterTurn`; no logic change needed, just type update.
- `src/interaction/move-inference.ts` — `inferQuarterTurnAngle()` (returns
  `QuarterTurn`) and `buildMoveNotation()` (local helper, not exported from
  `move-parser.ts`). Both live here.
- `src/cube/core/move-parser.ts` — `getInverseMove()` and
  `parseStringMove()`/`parseNotationToken()`. `getInverseMove` has three
  branches: slice (short-form), wide/regular (regex), fallback. All three
  currently return `move` unchanged for `modifier === '2'`.
- `src/cube-controller.ts` — three `MOVE_EXECUTED` emission sites: forward move
  (~L93), undo (~L188), redo (~L219). Undo and redo currently omit `definition`.
- `src/types/events.ts` —
  `MoveExecutedEvent.moveDetails.definition?: MoveDefinition`.
- `src/views/circular/animations.ts` — `animateFaceStickersCurved` calls
  `getFaceRotationAxis(face, move.angle as QuarterTurn)`.
  `animateAdjacentStickersAroundAxis` uses `move.angle` directly as
  `adjacentAngle`; direction enforcement at ~L551–555 uses strict-inequality
  direction checks that can land on the wrong arc at exactly ±180°.

### Institutional Learnings

- No directly applicable `docs/solutions/` learnings found for this specific
  feature area.

### External References

- WCA notation spec: `'` suffix means counter-clockwise; `2` suffix means 180°
  (direction unspecified by WCA). The `U2'` form reuses the existing apostrophe
  convention rather than introducing a new token.

---

## Key Technical Decisions

- **`-180` as the CCW signal, not a new property**: Direction lives in the
  signed `QuarterTurn` channel, consistent with `90`/`-90`. No structural
  changes to `MoveDefinition` or `MoveHistory`.
- **`MoveHistory` stays `string[]`**: Direction encoded in notation string
  `"U2'"` vs `"U2"`. History is portable, human-readable, and
  backward-compatible.
- **`getInverseMove` semantic shift**: From algebraic self-inverse
  (`"U2" → "U2"`) to notation-flip (`"U2" → "U2'"`). Algebraically still correct
  (both produce the same cube state). Enables undo animation to visually reverse
  the original arc.
- **Bug A fixed automatically**: After R6, `getInverseMove("U2") = "U2'"` ≠
  `"U2"`, so the auto-undo collapse check in `cube-controller.ts ~L74` no longer
  fires spuriously.
- **`getFaceRotationAxis` needs no logic change**: `-(-180) = 180` for inverted
  faces (L, F, D); `-180` passes through for non-inverted (R, U, B). The
  existing negation pattern is correct once `-180` is a valid `QuarterTurn`.
- **Tests updated before behavior changes (R6)**: The three assertions at
  `move-parser.test.ts:132–134` that assert `"U2" → "U2"` must be updated (not
  deleted) before `getInverseMove` is changed, to keep the test suite green
  throughout.

---

## Open Questions

### Resolved During Planning

- **Where is `buildMoveNotation`?** In `src/interaction/move-inference.ts`, not
  `move-parser.ts`. Requirements doc file hint was approximate. (see origin §R4)
- **Does `getFaceRotationAxis` need logic changes?** No. The
  `-angle as QuarterTurn` pattern already handles `-180` correctly; only the
  type union needs updating.
- **Does the adjacent sticker direction enforcement already handle the ±180°
  float case?** Partially — the while-loop normalization is strict (`> 180` /
  `< -180`), so `angleDiff = 180.0` stays positive and the direction check
  `adjacentAngle < 0 && rotationAngle > 0` would then overcorrect it to `-180`.
  Bug B manifests when float noise places `rotationAngle` just above or below
  ±180 inconsistently across stickers in the same frame, causing them to arc in
  opposite directions. Fix: after normalization, use the sign of `adjacentAngle`
  as an explicit tiebreaker for values within ε of ±180 before the
  direction-enforcement comparisons run.

### Deferred to Implementation

- **Exact epsilon threshold for Bug B tiebreaker**: Depends on the actual
  floating-point spread seen at runtime; `1e-9` is a reasonable starting value
  but can be tuned if visual artifacts persist in testing.
- **Wide-move and slice-move `"X2'"` parsing coverage**: The parser regex and
  `getInverseMove` fallback path cover wide and slice moves; test coverage
  should confirm all of `Rw2`, `M2`, `2Rw2` also round-trip correctly through
  the inverse after R6.

---

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should treat
> it as context, not code to reproduce._

### Data flow: gesture → pixels

```
Drag gesture
  └─ inferQuarterTurnAngle()     [move-inference.ts]  (R2) returns 180 or -180
       └─ buildMoveNotation()    [move-inference.ts]  (R4) "U2" or "U2'"
            └─ applyMove(move)   [cube-controller.ts]
                 ├─ parseStringMove("U2'")            (R5) → MoveDefinition{ angle: -180 }
                 ├─ MoveHistory.addMove("U2'")        notation string carries direction
                 └─ MoveExecutedEvent{ definition }   (R7) definition always present
                      └─ animateMove(event)           [animations.ts]
                           ├─ getFaceRotationAxis(face, -180)  (R3) effectiveAngle = ±180
                           └─ animateAdjacentStickers …        (Bug B) sign tiebreaker
```

### `getInverseMove` semantic change

| Input   | Old output | New output         |
| ------- | ---------- | ------------------ |
| `"U2"`  | `"U2"`     | `"U2'"`            |
| `"U2'"` | `"U2'"`    | `"U2"`             |
| `"R"`   | `"R'"`     | `"R'"` (unchanged) |
| `"U'"`  | `"U"`      | `"U"` (unchanged)  |

---

## Implementation Units

- U1. **Extend `QuarterTurn` to include `-180`**

**Goal:** Make `-180` a valid `QuarterTurn` value so downstream type-checks and
exhaustive patterns accept it without `as` casts.

**Requirements:** R1

**Dependencies:** None

**Files:**

- Modify: `src/cube/types/common.ts`
- Audit: `src/cube/utils/sticker-position.ts` (no change expected — existing
  `-angle as QuarterTurn` already handles `-(-180)`)
- Audit: `src/cube/utils/sticker-position.test.ts` (confirm no test asserts
  QuarterTurn is never `-180`)

**Approach:**

- Add `-180` to the union: `QuarterTurn = 90 | -90 | 180 | 270 | -180`.
- After adding, run the full type-check (`tsc --noEmit`) and test suite to
  surface any consumer that uses an exhaustive switch or narrows away `-180`.
  Fix any compile errors before proceeding. Do not add the `-180` tests yet —
  those belong to the units that introduce the behavior.
- Key consumers to audit manually: `getFaceRotationAxis` (sticker-position.ts),
  `buildMoveNotation` (move-inference.ts), `animateFaceStickersCurved`
  (animations.ts — uses `move.angle as QuarterTurn`).

**Patterns to follow:**

- Existing union in `src/cube/types/common.ts`; same JSDoc comment style.

**Test scenarios:**

- Test expectation: none — this unit is a type extension and audit pass.
  Behavioral tests are added in U3, U4, and U5 once the values are produced and
  consumed.

**Verification:**

- `tsc --noEmit` passes. `vitest run` passes (all existing tests still green).

---

- U2. **Update `getInverseMove` tests to expect new semantics**

**Goal:** Bring test expectations in sync with the about-to-change behavior so
the suite stays green throughout the implementation, and so the tests document
intent rather than accident.

**Requirements:** R6 (pre-condition)

**Dependencies:** U1

**Files:**

- Modify: `src/cube/core/move-parser.test.ts`

**Approach:**

- Locate the `'should invert moves with 2 modifier'` block (~lines 132–134).
  Update the three assertions to expect the flip:
  `getInverseMove('R2') → "R2'"`, `getInverseMove('U2') → "U2'"`,
  `getInverseMove('F2') → "F2'"`.
- Similarly update wide-move tests (`Rw2`, `2Rw2`) and slice-move tests (`M2`,
  `E2`, `S2`... or whatever currently asserts self-inverse for `'2'` modifier).
- Do NOT change the implementation yet — these tests will now fail until U3
  lands.

**Execution note:** Update tests first; verify they fail (red) before proceeding
to U3.

**Patterns to follow:**

- Existing `it('should invert …')` test structure in `move-parser.test.ts`.

**Test scenarios:**

- Happy path: `getInverseMove('R2') → "R2'"`, `getInverseMove('U2') → "U2'"`,
  `getInverseMove('F2') → "F2'"`.
- Happy path: `getInverseMove("R2'") → "R2"`, `getInverseMove("U2'") → "U2"`.
- Happy path (wide): `getInverseMove('Rw2') → "Rw2'"`,
  `getInverseMove("Rw2'") → "Rw2"`.
- Happy path (wide+num): `getInverseMove('2Rw2') → "2Rw2'"`,
  `getInverseMove("2Rw2'") → "2Rw2"`.
- Happy path (slice): `getInverseMove('M2') → "M2'"`,
  `getInverseMove("M2'") → "M2"`.
- Regression: `getInverseMove('R') → "R'"`, `getInverseMove("U'") → "U"` —
  non-2-moves unchanged.

**Verification:**

- Tests now fail for `'2'`-modifier cases (expected). All other tests
  (non-2-moves) still pass.

---

- U3. **Implement parser changes: `getInverseMove` flip and `"U2'"` parsing**

**Goal:** Make `getInverseMove` flip the apostrophe on 2-moves, and make the
parser produce `angle: -180` from `"U2'"` notation.

**Requirements:** R5, R6

**Dependencies:** U1, U2

**Files:**

- Modify: `src/cube/core/move-parser.ts`
- Modify: `src/cube/core/move-parser.test.ts`

**Approach:**

- **`getInverseMove`**: Three branches, all need updating for
  `modifier === '2'`:
  - Short branch (slice/single-char): `if (modifier === '2') return move` →
    change to
    `return `${face}2'``. Also handle incoming `"M2'"`(length 3, ends with`'2'`no — wait,`"M2'"`has modifier sequence`2'`). Audit the branch guard (`move.length
    === 2 && move[1] === '2'`) — it doesn't currently handle `"M2'"` (length 3).
    Extend the branch condition or let it fall through to the regex branch.
  - Wide/regular regex branch: `if (modifier === '2') return move` → change to
    `return `${prefix}${face}${wide}2'``. Also handle incoming modifier `"2'"`(not currently matched by`['2]?`— extend the regex capture group to`['2]?'?`or similar to accept`2'`).
  - Fallback: `if (move.endsWith('2')) return move` → change to
    `return move + "'"`. Also add
    `if (move.endsWith("2'")) return move.slice(0, -1)` before the
    `endsWith('2')` check.
- **`parseNotationToken` / `parseStringMove`**: The regex
  `^(\d*)([A-Za-z]+)(['2]?)$` only captures a single trailing char. `"U2'"` has
  suffix `2'` (two chars). Update the suffix capture group to `(['2]|2')` or
  equivalent. Then, when suffix is `"2'"`, look up the move definition for
  `"U2"` and override the angle to `-180`, or teach `getMoveDefinition` to
  accept `"U2'"`. Choose the approach that keeps `getMoveDefinition` clean —
  overriding angle post-lookup is simpler than teaching the engine a new token.
- Add new test cases to `move-parser.test.ts` covering parse and inverse
  round-trips for `"U2'"`.

**Patterns to follow:**

- Existing regex in `parseNotationToken`, `getInverseMove` branch structure.

**Test scenarios:**

- Happy path — inverse flip: `getInverseMove('U2') → "U2'"`,
  `getInverseMove("U2'") → "U2"`. (Updated in U2; should now pass.)
- Happy path — slice inverse: `getInverseMove('M2') → "M2'"`,
  `getInverseMove("M2'") → "M2"`.
- Happy path — parse CCW 2-move:
  `parseStringMove("U2'") → [{ angle: -180, … }]`.
- Happy path — parse CW 2-move: `parseStringMove("U2") → [{ angle: 180, … }]`
  (unchanged).
- Happy path — round trip:
  `parseStringMove(getInverseMove("U2'")) === parseStringMove("U2")`.
- Edge case — wide move: `parseStringMove("Rw2'")` parses without error,
  `angle: -180`.
- Edge case — numbered wide: `parseStringMove("2Rw2'")` parses without error,
  `angle: -180`.
- Regression — non-2-moves unaffected: `getInverseMove('R') → "R'"`,
  `parseStringMove("R'")` unchanged.

**Verification:**

- U2 tests now pass. All existing move-parser tests green. New CCW parse tests
  pass.

---

- U4. **Gesture direction preservation and `buildMoveNotation(-180)` emit**

**Goal:** Wire up the two-character gesture fix so far drags return `180` or
`-180` based on drag direction, and update `buildMoveNotation` to emit `"U2'"`
for `angle === -180`.

**Requirements:** R2, R4

**Dependencies:** U1, U3 (parser must accept `"U2'"` before inference emits it)

**Files:**

- Modify: `src/interaction/move-inference.ts`
- Modify: `src/interaction/move-inference.test.ts`

**Approach:**

- **`inferQuarterTurnAngle`**: Change `if (isFar) return 180` to
  `if (isFar) return plusScore >= minusScore ? 180 : -180`. The variables
  `plusScore` and `minusScore` are already computed just above this line.
- **`buildMoveNotation`**: Add an `else if (angle === -180)` branch that returns
  `${moveBase}2'` (after the existing `if (angle === 180)` branch). The existing
  `getDefaultAngle` / `defaultAngle` pattern for `±90` does not apply here —
  handle `-180` explicitly before the default-angle logic.
- Add tests covering both changes.

**Patterns to follow:**

- Existing `inferQuarterTurnAngle` test structure in `move-inference.test.ts`.
- Existing `buildMoveNotation` coverage patterns.

**Test scenarios:**

- Happy path — far drag CW: when `plusScore > minusScore` and `isFar`, result is
  `180`.
- Happy path — far drag CCW: when `minusScore > plusScore` and `isFar`, result
  is `-180`.
- Edge case — equal scores (isFar): result is `180` (CW tiebreak via `>=`).
- Happy path — `buildMoveNotation` with `angle = -180`: produces notation ending
  in `"2'"` for each face.
- Happy path — `buildMoveNotation` with `angle = 180`: still produces notation
  ending in `"2"` (unchanged).
- Integration: full `inferMove()` call with a CCW far drag produces a notation
  string ending in `"2'"`.
- Regression: near drag (not far) still returns `90` or `-90` as before.

**Verification:**

- `inferQuarterTurnAngle` returns `-180` for CCW far drags. `buildMoveNotation`
  emits `"U2'"`. All existing move-inference tests still pass.

---

- U5. **Animation: sign pass-through audit and Bug B tiebreaker fix**

**Goal:** Confirm `getFaceRotationAxis` passes ±180 sign through correctly; fix
the adjacent-ring sticker direction non-determinism at exactly ±180°.

**Requirements:** R3, Bug B

**Dependencies:** U1, U3, U4 (need `-180` reachable before animation tests are
meaningful)

**Files:**

- Modify: `src/cube/utils/sticker-position.test.ts` (add `-180` cases for
  `getFaceRotationAxis`)
- Modify: `src/views/circular/animations.ts` (Bug B tiebreaker in
  `animateAdjacentStickersAroundAxis`)
- No logic change to `src/cube/utils/sticker-position.ts` — verified correct
  during planning

**Approach:**

- **`getFaceRotationAxis` audit (R3)**: The function negates angle for inverted
  faces (`-angle as QuarterTurn`). For `angle = -180`: non-inverted face returns
  `effectiveAngle = -180` (CCW arc); inverted face returns
  `effectiveAngle = 180` (CW arc, correct since inverted faces are viewed from
  the opposite side). No code change needed — add test cases to confirm.
- **Bug B fix**: In `animateAdjacentStickersAroundAxis`, after the `while`-loop
  normalization of `rotationAngle` to (−180, 180]:
  - The current direction-enforcement code
    (`adjacentAngle > 0 && rotationAngle < 0 → +=360`) uses strict inequalities.
    At exactly `rotationAngle = 180`, neither direction check fires, leaving the
    value ambiguous when `adjacentAngle < 0`. Add an epsilon-guarded tiebreaker
    immediately after normalization: if `|rotationAngle - 180| < ε` and
    `adjacentAngle < 0`, snap `rotationAngle = -180`; if
    `|rotationAngle + 180| < ε` and `adjacentAngle > 0`, snap
    `rotationAngle = 180`. This runs before the existing direction-enforcement
    block, so the block still handles the non-boundary cases as before.
  - `adjacentAngle` is already computed from `move.angle` (which is now `180` or
    `-180` after U3/U4); no additional plumbing needed.

**Patterns to follow:**

- `getFaceRotationAxis` test structure in `sticker-position.test.ts` (~line
  210).
- Existing normalization + direction-enforcement loop in
  `animateAdjacentStickersAroundAxis`.

**Test scenarios:**

- Happy path (`getFaceRotationAxis` non-inverted, `-180`):
  `getFaceRotationAxis(Face.U, -180)` →
  `{ axis: Axis.Y, effectiveAngle: -180 }`.
- Happy path (`getFaceRotationAxis` non-inverted, `+180`): unchanged —
  `{ axis: Axis.Y, effectiveAngle: 180 }`.
- Happy path (`getFaceRotationAxis` inverted face, `-180`):
  `getFaceRotationAxis(Face.L, -180)` → `{ axis: Axis.X, effectiveAngle: 180 }`.
- Happy path (`getFaceRotationAxis` inverted face, `+180`):
  `getFaceRotationAxis(Face.L, 180)` → `{ axis: Axis.X, effectiveAngle: -180 }`.
- Regression: existing `90` / `-90` / `180` / `270` cases for all faces
  unaffected.
- Test expectation for Bug B: `animateAdjacentStickersAroundAxis` is private;
  verify the tiebreaker logic via an integration-style animation test or inspect
  the `rotationAngle` path through a unit extraction if test infrastructure
  allows. If not directly testable, document with a comment and verify visually.

**Verification:**

- `sticker-position.test.ts` passes with new `-180` cases. Type-check clean. No
  TypeScript errors from `as QuarterTurn` casts (since `-180` is now in the
  union). Animation direction for a `U2'` gesture visually arcs CCW; undo arcs
  CW.

---

- U6. **Promote `definition` to required in `MoveExecutedEvent`**

**Goal:** Remove the optional marker from `definition` in `MoveExecutedEvent`
and fix all three emission sites in `cube-controller.ts` to always supply it.

**Requirements:** R7

**Dependencies:** U3, U4 (parser must produce `MoveDefinition` for undo's
`getInverseMove` path)

**Files:**

- Modify: `src/types/events.ts`
- Modify: `src/cube-controller.ts`
- Modify: `src/types/events.test.ts` (if it tests the optional shape)

**Approach:**

- **`events.ts`**: Change `definition?: MoveDefinition` to
  `definition: MoveDefinition` inside `MoveExecutedEvent.moveDetails`. Remove
  the associated optional comment.
- **`cube-controller.ts` — forward move emission (~L88)**: `lastDefinition` is
  already populated from the parse loop. No change needed except removing the
  optional-access pattern if any.
- **`cube-controller.ts` — undo emission (~L188)**: Currently omits
  `definition`. The undo path calls `getInverseMove(lastMove)` to get
  `inverseMove`, then `applyMove(inverseMove, true)`. The `applyMove` return
  value (`MoveResult | null`) does not carry the `MoveDefinition` — it carries
  `MoveResult`. Instead, call `parseStringMove(inverseMove)` (already imported)
  to obtain the `MoveDefinition` and include it in the emission.
- **`cube-controller.ts` — redo emission (~L219)**: Same pattern — `move` is the
  notation string; parse it with `parseStringMove(move)` to get the definition
  for emission.
- Let TypeScript's compile errors guide the fix — once `definition` is required,
  the compiler flags every emission site that omits it.

**Patterns to follow:**

- Forward move emission in `applyMove` for the correct event shape.
- `parseStringMove` usage pattern already present in `applyMove`.

**Test scenarios:**

- Happy path — forward move event contains `definition` with correct `axis`,
  `layerIndices`, `angle`.
- Happy path — undo event: emitted with `definition` matching the inverse move
  (e.g., undoing `"U2'"` emits `definition` for `"U2"`).
- Happy path — redo event: emitted with `definition` matching the original move.
- Edge case — `parseStringMove` returns an array for multi-token notation;
  redo/undo always single moves — verify the `[0]` element is used.
- Regression: `definition.angle === -180` for a `"U2'"` forward move event.

**Verification:**

- `tsc --noEmit` passes — no TypeScript errors at emission sites. All
  `cube-controller` tests green. Animation layer receives `definition` on every
  event including undo and redo.

---

## System-Wide Impact

- **Interaction graph:** `animateMove` in `animations.ts` reads
  `event.moveDetails.definition` and falls back to `getMoveDefinition` when
  absent — after R7 the fallback path is still reachable for external callers
  that construct `MoveExecutedEvent` manually (tests, scripts). No removal of
  the fallback is planned.
- **Error propagation:** `parseStringMove` throws on invalid notation. If
  `getInverseMove` returns a malformed string (e.g., `"U2''"` — double
  apostrophe bug), the undo path will throw. Guard the getInverseMove
  implementation against double-apostrophe accumulation.
- **State lifecycle risks:** `MoveHistory` stays `string[]`; direction is opaque
  to the history model. Importing a saved state containing `"U2'"` is safe —
  `parseStringMove` will decode it. Importing a state containing `"U2"` is also
  safe — animates with default (CW) direction.
- **API surface parity:** `getInverseMove` is exported and called by
  `cube-controller.ts`. Any external caller that assumed
  `getInverseMove("U2") === "U2"` will see a behaviour change. No external
  consumers are known outside this repo.
- **Integration coverage:** The full gesture-to-animation path (drag → notation
  → event → animation) is not covered by existing unit tests; verify end-to-end
  manually or with a browser-level integration test after U4 and U5 land.
- **Unchanged invariants:** Cube state mathematics (`rotatePosition3D`) are
  unchanged. `MoveHistory.getLastMove`, `addMove`, `undo`, `redo`, and `clear`
  interfaces are unchanged. `MoveDefinition.axis`, `MoveDefinition.layerIndices`
  are unchanged — only `angle` gains a new value.

---

## Risks & Dependencies

| Risk                                                                                     | Mitigation                                                                                                                 |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Double-apostrophe accumulation: `getInverseMove("U2'")` must return `"U2"`, not `"U2''"` | Round-trip test in U3: `getInverseMove(getInverseMove("U2'")) === "U2'"`                                                   |
| Regex in `parseNotationToken` doesn't match `"U2'"` suffix                               | Extend suffix capture group; verify with `parseStringMove("U2'")` test in U3                                               |
| Existing tests assume `getInverseMove("U2") === "U2"`                                    | U2 updates assertions before U3 changes behavior; suite stays green                                                        |
| Animation direction visually wrong for `-180` after R3                                   | `getFaceRotationAxis(-180)` test in U5 verifies sign; visual manual test confirms arc direction                            |
| Bug B epsilon threshold too large, incorrectly snaps non-180° rotations                  | Bound epsilon tightly (≤ 1e-9 deg); the geometry values that hit ±180 exactly are only from antipodal stickers on the ring |
| `undo`/`redo` emit a stale `MoveDefinition` if `parseStringMove` is expensive            | `parseStringMove` is synchronous and fast (single token); no performance risk                                              |

---

## Sources & References

- **Origin document:**
  [docs/brainstorms/directional-180-moves-requirements.md](docs/brainstorms/directional-180-moves-requirements.md)
- **Ideation doc:**
  [docs/ideation/2026-05-09-directional-180-moves.md](docs/ideation/2026-05-09-directional-180-moves.md)
- Related code: `src/cube/types/common.ts`, `src/cube/core/move-parser.ts`,
  `src/interaction/move-inference.ts`, `src/views/circular/animations.ts`,
  `src/cube/utils/sticker-position.ts`, `src/types/events.ts`,
  `src/cube-controller.ts`
