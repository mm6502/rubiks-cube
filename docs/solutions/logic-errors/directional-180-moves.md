---
title: Directional 180° moves — signed half-turns end-to-end
date: 2026-05-12
category: logic-errors
module: cube-notation-animation
problem_type: logic_error
component: development_workflow
symptoms:
  - '180° moves discarded gesture direction — `inferQuarterTurnAngle()` always
    returned `180` for far drags'
  - 'No `-180` value in `QuarterTurn` type — direction could not reach the type
    system'
  - '`getInverseMove("U2")` returned `"U2"` (self-inverse) — consecutive U2
    gestures collapsed into undo'
  - 'Adjacent-ring sticker animation non-deterministic at exactly ±180° — ring
    belt flickered'
  - '`MoveExecutedEvent.definition` was optional — undo/redo emitted events
    without structured definition'
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - directional-180
  - quarter-turn
  - move-notation
  - animation
  - undo-redo
  - move-parser
---

# Directional 180° moves — signed half-turns end-to-end

## Problem

180° moves (U2, R2, etc.) are mathematically directionless — both CW and CCW
produce the same cube state. However, the **user experience** is not: the drag
gesture has a direction, the animation arc has a direction, and undo should
visually reverse the original motion.

The system had three compounding gaps:

1. **Gesture direction discarded** — `inferQuarterTurnAngle()` computed the drag
   direction (`plusScore`/`minusScore`) then threw it away for far drags.
2. **Type system blocked direction** — `QuarterTurn` was `90 | -90 | 180 | 270`
   with no `-180` value.
3. **Notation was direction-blind** — `getInverseMove("U2")` returned `"U2"`,
   causing consecutive U2 gestures to be detected as undo-of-self (auto-undo
   collapse bug).

Additionally, the adjacent-ring sticker animation had a floating-point
non-determinism at exactly ±180° where the ring belt could flicker in either
direction.

## Symptoms

- Dragging CW or CCW on a far drag both produced `"U2"` notation — no way to
  distinguish direction.
- Undo of a 180° move played the same CW arc as the forward move — no visual
  reversal.
- Two consecutive U2 gestures: the second was detected as undo of the first
  (`getInverseMove("U2") === "U2"`), resulting in zero history entries.
- Adjacent-ring stickers sometimes arced CW and sometimes CCW for the same U2
  move — non-deterministic at the ±180° boundary.
- Undo/redo events omitted `MoveExecutedEvent.moveDetails.definition`, relying
  on a fallback path in the animation layer.

## What Didn't Work

- **Treating 180° as directionless.** True for cube state, wrong for user
  experience. Direction must travel through the full pipeline even when the end
  state is identical.
- **Adding `-180` to the union type only.** The existing `QuarterTurn` union
  (`90 | -90 | 180 | 270`) would accept `-180`, but all consumers used bare
  numeric literals (`90`, `180`) that would silently bypass the new value. A
  const-object with named constants was needed to make direction explicit at
  every call site.
- **Keeping `getInverseMove("U2") === "U2"`.** The old self-inverse behavior was
  algebraically correct but broke the auto-undo detection at
  `cube-controller.ts:74`. Flipping to `"U2'"` makes the string comparison fail,
  fixing the U2+U2 collapse automatically.
- **Relying on geometry-based arc inference in animation.** The animation layer
  already had access to `currentCenter`/`targetCenter` vectors, but inferring
  direction from geometry alone is fragile at exactly ±180°. Passing direction
  through the type system is more reliable.

## Solution

### 1. `QuarterTurn` — union → const-object with named constants

**File:** `src/cube/types/common.ts`

Converted from a bare union type to a const-object so every consumer must
reference named constants, making `-180` impossible to miss:

```ts
export const QuarterTurn = {
  QUARTER: 90,
  QUARTER_NEG: -90,
  HALF: 180,
  HALF_NEG: -180,
  THREE_QUARTER: 270,
} as const;

export type QuarterTurn = (typeof QuarterTurn)[keyof typeof QuarterTurn];
```

This required updating **all** consumers: `cube-invariants.ts` (move
definitions), `move-inference.ts` (angle computation), `sticker-position.ts`
(axis computation), `move-icon-generator.ts` (icon rendering), and all test
files that used bare numeric literals.

### 2. Gesture direction — `inferQuarterTurnAngle()` returns `±180`

**File:** `src/interaction/move-inference.ts`

The function already computed `plusScore` and `minusScore` encoding the drag
direction. Changed the far-drag branch from:

```ts
// before
if (isFar) return 180;

// after
if (isFar) {
  return plusScore >= minusScore ? QuarterTurn.HALF : QuarterTurn.HALF_NEG;
}
```

Added `toFar(notation: string): string` helper for converting quarter-turn
notation to directional 180°: `"R"` → `"R2"`, `"R'"` → `"R2'"`.

### 3. Notation — `buildMoveNotation` emits `"U2'"` for CCW

**File:** `src/interaction/move-inference.ts`

```ts
if (angle === QuarterTurn.HALF || angle === QuarterTurn.HALF_NEG) {
  const defaultAngle = getDefaultAngle(moveBase);
  const isNaturalDirection = angle > 0 === defaultAngle > 0;
  return isNaturalDirection ? `${moveBase}2` : `${moveBase}2'`;
}
```

The `isNaturalDirection` check compares the sign of the angle against the face's
primary direction (CW for U/R/B, CCW for D/L/F). This ensures `"U2"` animates
like `U` (CW from top) and `"U2'"` animates like `U'` (CCW from top).

### 4. Parser — accepts `"U2'"` → `angle: -180`

**File:** `src/cube/core/move-parser.ts`

Updated the regex from `(['2]?)` to `(['2]|2')?` to capture the two-character
`"2'"` suffix. When the suffix is `"2'"`, the parser looks up the canonical
`"U2"` definition and negates the angle:

```ts
const lookupSuffix = suffix === "2'" ? '2' : (suffix ?? '');
const canonical = `${prefix}${canonicalLetters}${lookupSuffix}`;
const move = getMoveDefinition(invariants, canonical);

if (suffix === "2'") {
  return { ...move, angle: -move.angle as typeof move.angle };
}
```

### 5. `getInverseMove` — flip `'` on 2-moves

**File:** `src/cube/core/move-parser.ts`

All three branches now flip the apostrophe on 2-moves:

```ts
// Short branch (single-char face/slice)
if (modifier === '2') return `${face}2'`;

// Regex branch
if (modifier === '2') return `${prefix}${face}${wide}2'`;
if (modifier === "2'") return `${prefix}${face}${wide}2`;

// Fallback
if (move.endsWith("2'")) return move.slice(0, -1);
if (move.endsWith('2')) return move + "'";
```

This fixes Bug A automatically: `getInverseMove("U2") === "U2'"` ≠ `"U2"`, so
the auto-undo collapse check no longer fires for consecutive 180° moves.

### 6. Animation — sign pass-through + Bug B tiebreaker

**File:** `src/views/circular/animations.ts`

`getFaceRotationAxis` already negated the angle for inverted faces
(`-angle as QuarterTurn`). With `-180` now a valid `QuarterTurn`, the negation
works correctly: inverted face with `-180` → `effectiveAngle = 180` (CW arc,
correct from the opposite viewing side).

Bug B fix — epsilon tiebreaker for adjacent-ring stickers:

```ts
// After while-loop normalization of rotationAngle to (-180, 180]:
if (Math.abs(Math.abs(rotationAngle) - 180) <= 1e-9) {
  rotationAngle = adjacentAngle >= 0 ? 180 : -180;
}
```

This runs before the existing direction-enforcement block, ensuring all stickers
on the same ring arc in the same direction at the ±180° boundary.

### 7. `MoveExecutedEvent.definition` — non-optional

**File:** `src/types/events.ts`

Changed `definition?: MoveDefinition` to `definition: MoveDefinition`. The undo
and redo emission sites in `cube-controller.ts` now parse the inverse notation
with `parseStringMove()` to produce the definition for emission.

### 8. `cube-invariants.ts` — all move definitions use `QuarterTurn` constants

Every face, wide, slice, and cube-rotation move definition now uses
`QuarterTurn.QUARTER` / `QuarterTurn.QUARTER_NEG` instead of bare `90` / `-90`
literals. Two-move variants use `QuarterTurn.HALF` / `QuarterTurn.HALF_NEG`
based on the parent move's sign.

## Why This Works

Direction travels through the full pipeline as a **signed angle**:

```plaintext
Drag gesture
  └─ inferQuarterTurnAngle() → 180 or -180
       └─ buildMoveNotation() → "U2" or "U2'"
            └─ parseStringMove("U2'") → MoveDefinition{ angle: -180 }
                 ├─ MoveHistory.addMove("U2'")  notation carries direction
                 ├─ MoveExecutedEvent{ definition }  definition always present
                 │    └─ animateMove(event)
                 │         ├─ getFaceRotationAxis(face, -180) → effectiveAngle ±180
                 │         └─ animateAdjacentStickers … → epsilon tiebreaker
                 └─ getInverseMove("U2'") → "U2"  (undo notation)
```

The key insight: **direction lives in the signed `QuarterTurn` channel**,
consistent with the existing `90`/`-90` convention. No new properties on
`MoveDefinition`, no structural changes to `MoveHistory`. The notation string
(`"U2"` vs `"U2'"`) is the human-readable serialization of the signed angle.

## Prevention

- **Named constants over literals.** When a type carries semantic meaning
  (direction, sign, state), use a const-object with named constants instead of
  bare numeric literals. This forces every consumer to acknowledge the value
  explicitly.
- **Test inverse laws.** For any move-notation feature, verify:
  `getInverseMove(getInverseMove(move)) === move` for all forms including
  directional 180° (`"U2'"`).
- **Guard animation boundaries.** At exact ±180° transitions, floating-point
  normalization alone is insufficient. Add an epsilon tiebreaker that uses
  available direction context (`adjacentAngle` sign) to break the tie
  deterministically.
- **Make structured data required.** When an event carries structured data
  (`MoveDefinition`), make it non-optional in the type. The compiler will flag
  every emission site that omits it — type-driven architecture.

## Related

- [circular-ghost-selective-hide-2026-05-03.md](../ui-bugs/circular-ghost-selective-hide-2026-05-03.md)
  — related UI bug fix in the same area
- [move-notation-casing-2026-05-12.md](../conventions/move-notation-casing-2026-05-12.md)
  — notation casing conventions established alongside this feature
