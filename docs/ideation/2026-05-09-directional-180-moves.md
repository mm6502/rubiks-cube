---
title: Directional 180° Moves — Notation, Undo/Redo, and Animation
date: 2026-05-09
status: ideation-complete
topic: feature-design
tags: [moves, animation, undo, circular-view, notation]
---

# Directional 180° Moves

**Question:** How should the app interpret 180° moves as directional (CW vs
CCW)? **Scope:** Effects on notation, undo/redo, and animation in Circular and
Basic views.

---

## Problem Statement

A 180° move (`U2`) is mathematically its own inverse — both CW and CCW rotations
produce the same cube state. WCA notation is direction-blind. However, the
**experience** is not: the user's gesture has a direction, the animation arc has
a direction, and undo feels natural only if it visually reverses the original
motion.

Today the system:

1. **Discards** gesture direction at `inferQuarterTurnAngle()` with the comment
   _"direction doesn't matter for 180°"_ — true for state, wrong for experience
2. **Cannot represent** directional 180° at the type level
   (`QuarterTurn = 90 | -90 | 180 | 270`, no `-180`)
3. **Picks an arc silently** in `animateFaceStickersCurved()` — the comment
   claims it forces the correct direction but the value passed is always
   unsigned `180`
4. **Emits the same event** for undo as for a fresh forward U2 — the view cannot
   distinguish them

There is also a **pre-existing independent bug** (see §3) that any direction
work should be aware of.

---

## Grounding: Key System Facts

| Layer             | Location                                  | Current state                                                                                                                  |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Type              | `src/cube/types/common.ts`                | `QuarterTurn = 90 \| -90 \| 180 \| 270` — no `-180`                                                                            |
| Gesture inference | `src/interaction/move-inference.ts ~L155` | `if (isFar) return 180` — direction discarded                                                                                  |
| Notation          | `buildMoveNotation()`                     | Always emits `U2`, never directional                                                                                           |
| Inverse           | `getInverseMove("U2")`                    | Returns `"U2"` (self-inverse)                                                                                                  |
| Move execution    | `CubeInvariants.moveDefinitions`          | Precomputed map from notation string to `MoveDefinition`                                                                       |
| Event bridge      | `MoveExecutedEvent`                       | `{ moveDetails: { notation, definition? }, preState, postState }` — `definition` is optional, no `isUndo` or `direction` field |
| Animation         | `animateFaceStickersCurved()` `~L314`     | Calls `getFaceRotationAxis(face, move.angle as QuarterTurn)` — `move.angle` is always `180`                                    |
| History           | `MoveHistory`                             | `private moves: string[]` — direction-unaware                                                                                  |
| Undo              | `cube-controller.ts ~L169`                | Calls `getInverseMove(lastMove)`, emits plain `MoveExecutedEvent` with no `isUndo` flag                                        |
| Auto-undo         | `cube-controller.ts ~L74`                 | `if (getInverseMove(lastMove) === move)` — string equality, **fails for consecutive U2s**                                      |

---

## §1 — Independent Bug: Silent U2+U2 History Collapse

> **This is a bug that exists today, independent of the direction feature.**

The auto-undo detection at `cube-controller.ts:74` fires when
`getInverseMove(lastMove) === move`. For any 180° move,
`getInverseMove("U2") === "U2"` is always true. Therefore:

- User executes U2 → recorded in history
- User executes another U2 → **detected as undo of the first** →
  `moveHistory.undo()` is called instead of `addMove()`
- Net result: two distinct gestures, zero history entries, undo does nothing

**This should be fixed before or alongside any direction work.** The root fix
(compare definitions algebraically: `(a.angle + b.angle) % 360 === 0`) becomes
clean once definitions are stored in history, but a short-term fix is to gate
the auto-undo check on `modifier !== '2'` in the notation string.

**Sources:** Frame 1/I2, Frame 4/I7

---

## §2 — Candidate Ideas (deduplicated across 6 ideation frames)

Ideas are grouped by the layer they primarily affect. Confidence stars reflect
cross-frame convergence and implementation clarity.

---

### [A] Add `-180` to `QuarterTurn` — type anchor

**Confidence:** ★★★★★ **Sources:** All 6 frames — strongest cross-frame
convergence **Prerequisites:** None

`QuarterTurn` already includes `270` as the sign-carrying equivalent of `-90`.
Adding `-180` fills the same symmetry gap. State math is unaffected —
`rotatePosition3D` normalizes angle mod 360, so `180` and `-180` produce
identical face permutations. `buildMoveNotation` maps both to `"U2"`.

This is the single upstream type decision that every downstream fix branches
from. Without it, direction must travel as a parallel out-of-band field,
fragmenting the model.

> _"270 is already in the union as the rotational equivalent of -90; -180 fills
> the same symmetry gap."_ — Frame 4

---

### [B] Fix the gesture drop point — 2 lines

**Confidence:** ★★★★★ **Sources:** Frames 1, 2, 4, 5 **Prerequisites:** [A]

`inferQuarterTurnAngle()` already computes `plusScore` and `minusScore` encoding
the user's drag direction — then discards them with `if (isFar) return 180`. The
fix:

```ts
// before
if (isFar) return 180;
// after
if (isFar) return plusScore >= minusScore ? 180 : -180;
```

`buildMoveNotation` still emits `"U2"` either way. `MoveDefinition.angle` now
carries the signed direction. This is the **last point in the call chain where
the drag vector is in scope** — direction is irrecoverable after this function
returns.

> _"The code already computes the right answer and throws it away."_ — Frame 2

---

### [C] Verify/fix `getFaceRotationAxis` to distinguish ±180

**Confidence:** ★★★★☆ **Sources:** Frames 4, 5 **Prerequisites:** [A], [B]

`animateFaceStickersCurved()` calls `getFaceRotationAxis(face, move.angle)`. If
this function normalizes `–180 → 180`, then [A]+[B] are inert at render time —
direction is captured but discarded again at the animation entry point. **Audit
required:** confirm the function passes the sign through to `effectiveAngle`. If
not, the fix is minimal (one branch).

This is the **closing bracket** for [A]+[B]. Without it, direction information
never reaches pixels.

---

### [D] Make `MoveExecutedEvent.definition` non-optional

**Confidence:** ★★★★☆ **Sources:** Frame 4 **Prerequisites:** [A]

`definition?: MoveDefinition` in `MoveExecutedEvent` lets the undo path emit an
event with no definition — just a notation string. The Circular view animation
entry point accepts `MoveDefinition` as its first argument; it silently falls
back for undo moves.

Promoting `definition` to required:

1. Forces the compiler to flag the undo emission gap at
   `cube-controller.ts:184–188`
2. Makes the architecture self-enforcing — any new event emission path gets the
   same guarantee

> _"Remove the `?` on `definition`. Does the compiler now flag the undo
> emission? That's the leverage — the type system finds every place that needs
> to be updated."_ — Frame 4

---

### [E] Enrich `MoveHistory` — store `MoveDefinition` alongside notation

**Confidence:** ★★★★☆ **Sources:** Frames 2, 3, 4, 5, 6 — strong convergence
**Prerequisites:** [A]

Replace `private moves: string[]` with
`{ notation: string; definition: MoveDefinition }[]`. Public API unchanged
(`getCurrentMoves()` still returns `string[]`). Serialization ignores the
definition field (backward compatible).

This single internal change enables **three future capabilities**:

1. Directional undo animation (see [F])
2. Sequence optimizer using algebraic definition comparison (see §1 bug fix)
3. A move log UI showing CW vs CCW 180° with distinct symbols

> _"The payoff compounds with every feature that reads history."_ — Frame 4

---

### [F] Fix undo to compute and emit the inverse `MoveDefinition`

**Confidence:** ★★★★☆ **Sources:** Frames 2, 3, 4, 5, 6 — strong convergence
**Prerequisites:** [A], [D], [E]

With [E], the undo path at `cube-controller.ts:169` can retrieve the original
`MoveDefinition` and compute:

```ts
const inverseDefinition = {
  ...originalDef,
  angle: -originalDef.angle as QuarterTurn,
};
```

Pass this to both `applyMove` and the `MoveExecutedEvent`. The animation layer
receives a fully-specified definition with the correct inverse arc direction —
without any changes to the animation code itself.

The animation layer is **already parameterized on `MoveDefinition`**. This is
architecture doing its job.

---

### [E2] Self-contained animation fallback — geometry-based arc inference

**Confidence:** ★★★☆☆ **Sources:** Frames 2, 4, 6 **Prerequisites:** None

`animateFaceStickersCurved()` already has access to `currentCenter` and
`targetCenter` for each sticker. For 180° moves, `Math.atan2` on those vectors
relative to `faceCenter` encodes which way to sweep. This inference is **fully
automatable inside `animations.ts`** using data already present — zero changes
to any external API.

**Best use:** Fallback/belt-and-suspenders for history replays that predate
direction capture. Also good as a safety net — if upstream direction is somehow
missing, the animation still picks a geometrically coherent arc instead of an
arbitrary one.

**Limitation:** Works for forward animation direction only; doesn't help undo
direction without [F].

---

### [H] Contextual inference — zero-storage heuristic

**Confidence:** ★★★☆☆ **Sources:** Frames 3, 5, 6 **Prerequisites:** None

Pure function `inferVisualDirection(moveIndex, history) → 'cw' | 'ccw'`: if the
preceding move on the same face was directional, continue that direction;
otherwise default CW.

**Best use:** Complement to [E2] for legacy history replays (e.g., old saves
from before direction was captured). Handles the common case (most 180° moves
appear in momentum-consistent sequences in real algorithms) with zero storage
cost. Lives entirely in the animation layer.

> _Analogous to Unicode BiDi context-resolution: a direction-neutral character
> inherits direction from surrounding strong-directional characters._ — Frame 5

---

### [I] Floating-point adjacent-ring sticker non-determinism

**Confidence:** ★★★☆☆ (as a distinct bug) **Sources:** Frame 1/I6

When `currentAngle` and `targetAngle` for a ring sticker are exactly π apart
(the 180° case), the `angleDiff` normalization loop
`while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI` is a boundary condition.
The sign of the raw diff before normalization depends on floating-point
precision, not gesture intent. This can cause the **ring belt to flicker in
either direction non-deterministically** for adjacent stickers.

Fix: once direction is available from [B]+[A], pass it as a tiebreaker to the
adjacent sticker animation rather than relying on floating-point normalization
alone.

---

### [J] Exploratory: Decompose U2 to [U, U]

**Confidence:** ★★☆☆☆ **Sources:** Frames 6 **Prerequisites:** Major refactor

Treat `U2` as purely a user shortcut — decompose to `[U, U]` or `[U', U']` at
input time. The model only knows quarter-turns. Undo is trivially a reversed
list; arc direction is unambiguous (90° arcs).

**Assessment:** Most architecturally clean but high migration cost. Worth noting
as a long-range option if the codebase later moves toward richer animation
primitives. Not suitable near-term.

---

### [K] Directional 180° notation — `U2'` as serialized form

**Confidence:** ★★★★★ **Prerequisites:** [A]

The `'` modifier already has a precise, universally understood meaning in WCA
notation: **reversal of the primary direction**. Primary directions are
explicitly defined for every move in the system (see
`src/docs/move-notation.md`):

- Face moves (R, L, U, D, F, B): CW when viewed from outside the face
- Slice moves: M follows L, E follows D, S follows F
- Cube rotations: x/y/z follow R/U/F respectively

`U2'` is therefore not a new convention — it is the **logical application of an
existing one**. `U` → `U'` (reverse primary direction) is exactly the same
relationship as `U2` → `U2'`. No new syntax is introduced.

**Serialization contract:**

| `MoveDefinition.angle` | `buildMoveNotation` output |
| ---------------------- | -------------------------- |
| `180`                  | `"U2"`                     |
| `-180`                 | `"U2'"`                    |

**Parser changes:** `"U2'"` parses to `angle: -180`. `"U2"` parses to
`angle: 180`. Both are self-inverse: `getInverseMove("U2'") === "U2'"`,
`getInverseMove("U2") === "U2"`.

**Why this matters for undo/redo:** History stored as `["U", "U2'", "R"]` is
human-readable, round-trip correct, and unambiguous. A developer reading the
move log can immediately see which arc was taken. Animation replays load the
direction without inference.

**Scope of change:** `buildMoveNotation` (one branch), the move parser (one
branch), `getInverseMove` (no change needed — already self-inverse for `"U2"`,
same logic applies to `"U2'"`). Zero changes to state math — `-180` and `180`
produce identical cube states.

**Distinction from deferred `U2+`/`U2-`:** Those are invented tokens with no
basis in existing notation. `U2'` reuses the `'` convention already present in
every move in the system. The complexity concern does not apply.

---

## §3 — Cross-Cutting Combinations: Implementation Paths

### Path 1: Surgical Minimal (recommended first step)

> **Scope:** Forward gesture → animation direction. No undo direction changes.

1. `[A]` Add `-180` to `QuarterTurn`
2. `[B]` Fix `inferQuarterTurnAngle` to return `±180` based on drag score
3. `[C]` Audit and fix `getFaceRotationAxis` for ±180 pass-through
4. `[E2]` Add geometry-based fallback in `animateFaceStickersCurved` for legacy
   replays

**Result:** User drags CW → arc goes CW. User drags CCW → arc goes CCW. Undo
still picks default direction (not reversed). Zero changes to notation, history,
or undo path. **Risk:** Very low. Each change is independently reviewable.
**Prerequisite for:** Path 2.

---

### Path 2: Complete Direction Loop (adds undo correctness)

> **Scope:** Full undo/redo direction fidelity.

Path 1 + 5. `[D]` Make `MoveExecutedEvent.definition` non-optional 6. `[E]`
Enrich `MoveHistory` with `MoveDefinition` 7. `[F]` Fix undo path to emit
inverse definition

**Result:** Every 180° animates in the correct direction. Undoing a CW U2 plays
a CCW arc. Multi-step undo sequences animate directionally coherent. **Risk:**
Medium. MoveHistory internal type change + undo path change. Covered by existing
tests if state outcomes are unchanged.

---

### Path 3: Semantic Enrichment (optional, adds UX metadata)

> **Scope:** View-level semantic context.

Any of the above + 8. Bug fix: U2+U2 auto-undo collapse (§1) 9. `[I]` Bug fix:
ring sticker float non-determinism

---

### Prerequisite Map

```plaintext
[A] ──┬──→ [B] ──→ [C]   (Surgical Minimal — forward direction)
      │
      ├──→ [D]            (quality gate for event definition)
      │
      ├──→ [E] ──→ [F]   (Complete Loop — undo direction)
      │
      └──→ [K]            (directional notation — buildMoveNotation + parser)

[E2] ──── standalone      (animation fallback, any time)
Bug: §1 auto-undo collapse — standalone, address immediately
Bug: [I] float tiebreaker — after [A]+[B]
```

---

## §4 — Open Questions for Team Discussion

1. ~~**Should undo always animate the reverse arc, even if the original
   direction wasn't captured?** E.g., for sessions loaded from old saves — use
   [H] contextual inference, [E2] geometry inference, or default to CW?~~
   **Resolved:** Legacy saves with `"U2"` (no direction) are a non-issue —
   acceptable to animate with default direction.

2. ~~**Is `-180` the right representation, or should `MoveDefinition` gain a
   separate `direction` field?**~~ **Resolved:** `-180` in `QuarterTurn` (option
   A). No new properties on `MoveDefinition` — direction stays in the existing
   signed-angle channel, consistent with `90`/`-90` convention. A `direction`
   field would introduce a second source of truth for the same concept.

   **Implementation discipline:**
   - Identify all code areas touched by `QuarterTurn` / `MoveDefinition.angle`
   - Before adding `-180`: audit existing unit tests for correctness; fix any
     tests that are wrong or that would spuriously fail (not because of the new
     value, but because they were already incorrect)
   - After adding `-180`: add unit tests covering `-180` in every touched area

3. ~~**Where is the right default arc direction for U2 when no gesture was
   recorded?** Options: always CW, user preference setting, infer from preceding
   move, geometry-based.~~ **Resolved:** Default follows the primary direction
   of the face per notation convention — `"U2"` animates like `U` (CW viewed
   from top), `"U2'"` animates like `U'` (CCW). No inference needed; the
   notation itself is the answer.

4. ~~**Should `MoveHistory` store `MoveDefinition` internally, or is a thin
   `{ notation, directionHint?: -1 | 1 }` sufficient?**~~ **Resolved:** Neither
   — `[K]` makes this moot. History stores notation strings as today (`"U2"`,
   `"U2'"`), and the direction is encoded in the notation itself. No structural
   change to `MoveHistory` required.

---

## §5 — Non-Obvious Findings

These emerged from the ideation that might be missed in a direct implementation:

| Finding                                                                                                                                          | Impact                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **The comment _"direction doesn't matter for 180°"_ conflates state-equivalence with experience-equivalence** — it's right about the wrong thing | Any developer reading it stops looking; the fix is as much a comment deletion as code change      |
| **The `plusScore/minusScore` direction signal already exists and is discarded immediately** — direction is _computed_, then thrown away          | The fix is 2 characters, not an architectural change                                              |
| **`MoveExecutedEvent.definition` is currently optional** — the undo path silently emits an event without it                                      | Promoting to required makes the compiler identify every gap; type-driven architecture             |
| **The `U2 + U2 = undo` bug** is independent of direction and exists today                                                                        | Should be fixed regardless of direction feature; algebraic definition comparison is the clean fix |
| **The adjacent-ring sticker float boundary condition** — non-deterministic animation for belt stickers at exactly ±π                             | Deterministic behavior requires a direction tiebreaker, not just normalization                    |
| **`270` is already in `QuarterTurn` as the equivalent of `-90`** — `-180` is the logical parallel                                                | Precedent exists in the existing type for signed half-values                                      |

---

## §6 — Deferred / Not Recommended Near-Term

- **Decompose U2 to [U, U]:** Cleanest long-term model but major refactor. File
  for later.
- **Extended notation (`U2+`/`U2-` as internal tokens):** Adds notation
  complexity without clear benefit over signed angle. The type change [A] is
  cleaner. Note: `U2'` is **not** in this category — it is a natural extension
  of existing `'` convention and is promoted to [K].
- **User-preference setting for direction:** Valid accessibility angle, but best
  added after the infrastructure exists. Low priority.
- **CQRS `MoveCompensatedEvent`:** Architecturally elegant but adds event type
  proliferation. `isUndo` flag on the existing event is sufficient.
- **History topology as direction (Git merge parent analogy):** Intellectually
  interesting, overkill for this problem.
