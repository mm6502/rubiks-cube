---
date: 2026-05-09
topic: directional-180-moves
status: active
ideation: docs/ideation/2026-05-09-directional-180-moves.md
---

# Directional 180° Moves

## Summary

Extend the move system so that 180° moves carry a direction (CW vs CCW) through
the full pipeline: gesture → type → notation → history → animation → undo/redo.
Fixes two independent bugs that exist today regardless of the direction feature.
No changes to cube state math or external notation compatibility.

---

## Problem Frame

A 180° move (`U2`) is mathematically its own inverse — both CW and CCW produce
the same cube state. WCA notation is direction-blind. The **experience** is not:
the user's gesture has a direction, the animation arc has a direction, and undo
feels natural only if it visually reverses the original motion.

Today the system discards gesture direction at `inferQuarterTurnAngle()`, cannot
represent directional 180° at the type level, silently picks an arc in the
animation layer, and emits the same event for undo as for a fresh forward move.
Two independent bugs compound the problem (§ Bugs below).

---

## Decisions

| Decision                          | Resolution                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Representation                    | `-180` added to `QuarterTurn`. No new properties on `MoveDefinition`. Direction lives in the signed-angle channel, consistent with `90`/`-90`.            |
| Notation                          | `buildMoveNotation(-180)` → `"U2'"`. Parser recognises `"U2'"` → `angle: -180`. Reuses existing `'` convention — not a new token.                         |
| Default direction                 | Primary direction of the face per notation: `"U2"` animates like `U` (CW viewed from outside), `"U2'"` animates like `U'` (CCW).                          |
| History storage                   | `MoveHistory` stays `string[]`. Direction is encoded in the notation string (`"U2"` vs `"U2'"`). No structural change.                                    |
| `getInverseMove`                  | Sémantika sa mení: `"U2" → "U2'"`, `"U2'" → "U2"`. Rovnaká logika ako `"U" → "U'"`. Algebraicky stále správne (oba sú self-inverse z pohľadu cube state). |
| Legacy saves                      | Non-issue — `"U2"` bez smeru animuje s default direction (CW).                                                                                            |
| [E2] geometry fallback            | Dropped — [K] makes it unnecessary.                                                                                                                       |
| [E]/[F] MoveDefinition in history | Dropped — [K] makes it unnecessary.                                                                                                                       |

---

## Requirements

### R1 — Type: `-180` in `QuarterTurn`

`src/cube/types/common.ts`:

```
QuarterTurn = 90 | -90 | 180 | 270 | -180
```

State math (`rotatePosition3D`) normalises mod 360 — `-180` and `180` produce
identical face permutations. No changes to state computation.

**Before adding `-180`:** audit all code paths that consume `QuarterTurn` or
`MoveDefinition.angle`. Fix any existing unit tests that are incorrect or would
spuriously fail. **After adding `-180`:** add unit tests covering `-180` in
every touched area.

---

### R2 — Gesture: preserve drag direction for 180°

`src/interaction/move-inference.ts`, `inferQuarterTurnAngle()`:

- Current: `if (isFar) return 180` — direction discarded.
- Required: `if (isFar) return plusScore >= minusScore ? 180 : -180`

The variables `plusScore` and `minusScore` already encode the drag direction and
are computed just before this line. This is a two-character fix.

---

### R3 — Animation: `getFaceRotationAxis` passes ±180 sign through

`src/views/circular/animations.ts` (or wherever `getFaceRotationAxis` lives):

Audit that `getFaceRotationAxis(face, -180)` produces the correct rotation axis
and sign. If the function normalises `-180 → 180` before computing the axis, fix
it to preserve sign. This is the closing bracket for R1+R2 — without it,
direction is captured but never reaches pixels.

---

### R4 — Notation: `buildMoveNotation` emits `"U2'"`

`src/cube/core/move-parser.ts` (or `buildMoveNotation` wherever it lives):

| `angle` | output  |
| ------- | ------- |
| `180`   | `"U2"`  |
| `-180`  | `"U2'"` |

All other angles: unchanged.

---

### R5 — Parser: recognise `"U2'"`

Move parser must accept `"U2'"` and produce `angle: -180`. `"U2"` continues to
produce `angle: 180`.

---

### R6 — `getInverseMove`: flip `'` on 180° moves

`src/cube/core/move-parser.ts`, `getInverseMove()`:

| input   | output (new) | output (old) |
| ------- | ------------ | ------------ |
| `"U2"`  | `"U2'"`      | `"U2"`       |
| `"U2'"` | `"U2"`       | `"U2'"`      |

Same logic as `"U" → "U'"`. Applies to all face/wide/slice 2-moves.

Existing tests at lines 132–134 of `src/cube/core/move-parser.test.ts` assert
the old self-inverse behaviour and **must be updated** (not deleted) before this
change lands.

---

### R7 — `MoveExecutedEvent.definition` non-optional

`src/types/events.ts` (or wherever `MoveExecutedEvent` is defined):

Promote `definition?: MoveDefinition` to `definition: MoveDefinition`. The
TypeScript compiler will flag every emission site that omits it — fix each. This
is a quality gate, not a feature gate.

---

## Bugs Fixed by This Work

### Bug A — U2+U2 history collapse (§1)

**Location:** `src/cube-controller.ts ~L74`

Auto-undo detection: `if (getInverseMove(lastMove) === move)`. Today
`getInverseMove("U2") === "U2"` is always true, so a second U2 is incorrectly
treated as an undo of the first — two gestures, zero history entries, undo does
nothing.

**Fix:** R6 changes `getInverseMove("U2") → "U2'"`. The comparison
`"U2'" === "U2"` is false → bug disappears automatically. No separate fix
needed.

### Bug B — Ring sticker float non-determinism ([I])

**Location:** `animateFaceStickersCurved()`, adjacent-ring sticker normalization
loop.

When `angleDiff` is exactly ±π,
`while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI` is a floating-point
boundary condition. The sign of the raw diff before normalization depends on
floating-point precision — the ring belt can flicker non-deterministically.

**Fix:** Once direction is available from R1+R2, pass it as a tiebreaker to the
adjacent sticker animation loop rather than relying on float normalization
alone.

---

## Out of Scope

- **[J] Decompose U2 to [U, U]:** Major refactor, long-range option only.
- **User preference for direction:** Moot — direction is determined by notation
  convention, not preference.
- **[E2] Geometry-based animation fallback:** Dropped — [K]/R4 makes it
  unnecessary.
- **`isUndo`/`origin` on `MoveExecutedEvent`:** No current subscriber uses it.
  Revisit when a view actually needs it.

---

## Affected Files (preliminary)

| File                                | Change                                                 |
| ----------------------------------- | ------------------------------------------------------ |
| `src/cube/types/common.ts`          | Add `-180` to `QuarterTurn`                            |
| `src/interaction/move-inference.ts` | R2 — preserve drag direction                           |
| `src/cube/core/move-parser.ts`      | R4 `buildMoveNotation`, R5 parser, R6 `getInverseMove` |
| `src/types/events.ts`               | R7 — `definition` non-optional                         |
| `src/views/circular/animations.ts`  | R3 audit + fix, Bug B fix                              |
| `src/cube-controller.ts`            | Update undo emission to include `definition`           |
| `src/cube/core/move-parser.test.ts` | Update 180° inverse tests before R6                    |

Unit tests must be updated/added in each touched area per R1 discipline.
