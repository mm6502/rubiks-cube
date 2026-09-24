---
date: 2026-09-24
topic: view-gesture-inference-fixes
---

# View Gesture & Inference Fixes — Requirements

## Summary

Four view-interaction fixes, all in the same family: make gesture **inference**
and its **visual feedback** correct in the Basic and Flat views. The Basic view
must carry a rotation's ±180° sign from the gesture into the animation instead
of re-deriving it from the matrix, and must resolve a drag's sticker from model
state instead of the flying DOM. The Flat view must show the same inference
cross/line the Basic view already shows, and must promote a far whole-cube drag
to its `2` variant.

---

## Problem Frame

The two cube views already share a move-inference core (`inferMoveFromDrag` and
friends), but each view leaks correctness at a different boundary.

In the Basic view, a whole-cube rotation is a discrete orientation change driven
by a background drag (or keyboard). The animation is derived from the
orientation matrix, and the matrix is mathematically unable to distinguish a
+180° turn from a −180° turn — they are the same rotation, so the sign is gone
by the time the animation reads it. One of the two directions therefore animates
the wrong way round. The sign is knowable at gesture time, the same way layer
moves already distinguish `HALF` from `HALF_NEG`.

The Basic view has a second, related defect: a move is animated by reparenting
cubies into a pivot, so while the animation runs, the DOM element under the
pointer is mid-flight. Hit-testing reads the face/position off that element, so
a drag started before the previous animation settles targets the layer of where
the sticker _looks_ like it is, not the layer the user grabbed — the reported "D
move then expect L′ but get B′" case.

The Flat view has the mirror-image gaps: it does not show the inference
cross/line during a drag (the Basic view does), and its whole-cube legend drag
only ever emits quarter turns — it never promotes a far drag to the `2` variant
even though layer drags do exactly that.

The remedy for all four lives in this document. Implementation stays in
planning; the product behaviour and acceptance are fixed here.

---

## Key Decisions

- **The ±180° sign comes from the gesture, not the matrix.** The matrix is a
  lossy encoding of the sign at 180°; the source of truth must be the signed
  angle the gesture already carries. This mirrors the existing `HALF` /
  `HALF_NEG` distinction the layer-move path already makes.

- **Animation stays a visual artefact; the hit-test stops looking at it.** A
  drag's sticker is resolved from the model's sticker identity/position, not
  from the transient face/position attributes of a reparented DOM element. The
  animation keeps running; only the input path detaches from it.

- **Rapid moves are accepted and chained, not dropped or queued.** The point is
  that the next move targets the correct layer, not that it waits.

- **Flat view reuses the Basic view's cross/line pattern** rather than inventing
  a flat-specific indicator, so the two views show the same feedback for the
  same gesture.

- **Flat whole-cube `2` variants reuse the existing far-drag threshold.** The
  same distance that promotes a layer drag to a double promotes a legend drag to
  `x2`/`y2`/`z2`.

---

## Requirements

### Basic View — signed 180° animation

- R1. A whole-cube rotation initiated by a gesture carries a **signed** angle
  (±180°) from the gesture to the animation; the sign is never re-derived from
  the orientation matrix.
- R2. When two quarter-steps of one gesture compose into a half turn, the
  composed turn keeps the gesture's sense: a doubled clockwise turn animates as
  +180° and a doubled counter-clockwise turn as −180°.
- R3. The animation does not take a shorter arc to the same orientation: a +180°
  sweep travels 180° in the gesture's direction, never 180° the other way and
  never ±90°.

### Basic View — hit-test detached from mid-flight DOM

- R4. A drag started before the previous move animation has settled targets the
  layer of the sticker the user actually grabbed, independent of where that
  sticker's element is mid-flight.
- R5. The sticker hit is resolved from the model's current sticker identity and
  position, not from the face/position attributes of the DOM element under the
  pointer (which lag until the post-move rebuild).
- R6. A chain of rapid moves is accepted in sequence, and every move in the
  chain targets the correct layer.

### Flat View — inference cross / line

- R7. During a drag in the Flat view, an inference cross/line is displayed that
  matches the Basic view's existing cross/line feedback.
- R8. The indicator updates as the gesture resolves its direction, and hides
  when no move is inferred or when the gesture ends.

### Flat View — whole-cube `2` variants

- R9. A far whole-cube drag in the Flat view promotes to the doubled variant
  (`x2`/`y2`/`z2`), the same way a far layer drag promotes to a double.
- R10. The promotion uses the same far-drag distance threshold the rest of the
  app already applies to layer drags.

---

## Acceptance Examples

- AE1. **Covers R1–R3.** Given a background drag whose composition is a +180°
  whole-cube rotation, when it animates, the sweep is +180° in the gesture's
  direction — and the mirror gesture animates as −180°, visibly travelling the
  other way.

- AE2. **Covers R4–R6.** Given a D move on cubie FLD, when a second mousedown+up
  starts before the D animation settles, the second move is L′ — not B′ —
  because the hit resolves to the sticker the user grabbed.

- AE3. **Covers R9–R10.** Given a legend drag past the far-drag threshold in the
  Flat view, the emitted notation is a `2` variant of the whole-cube move; the
  same drag shorter than the threshold emits the plain quarter turn.

---

## Scope Boundaries

- **Deferred for later:** merging the two views' touch handlers into one shared
  implementation. Each fix lands in its own view; the shared inference core is
  reused, not restructured.
- **Outside this work:** keyboard `2` variants for whole-cube rotations — the
  Flat `2` gap is drag-inference only. Whole-cube `2` already exists as commands
  and notation; only the drag path is missing the promotion.

---

## Sources / Research

- `src/interaction/move-inference.ts` — the shared inference core, including
  `inferQuarterTurnAngle` (`HALF`/`HALF_NEG`), `toFar`, and
  `notationForSignedAngle`.
- `src/views/basic/rotation-math.ts` — `axisAngleFromMatrix` documents that a
  matrix cannot distinguish +180° from −180°; `sliceRotationForViewTurn` and
  `mergeSameAxis` carry the sign through as a signed angle.
- `src/views/basic/touch-handler.ts` — background-drag → view-rotation path and
  `getStickerHitFromPoint` (the `elementFromPoint` +
  `data-face`/`data-basic-pos` read that lags mid-flight); also the Basic
  cross/line implementation to reuse.
- `src/views/basic/cubie-rendering.ts` — `renderCubieFaces` sets
  `data-face`/`data-sticker-id`; sticker identities are stable, positions are
  transient.
- `src/views/flat/legend-drag.ts` — `inferLegendMove` emits only quarter turns
  and ignores distance; no `2` promotion.
- `src/views/flat/touch-handler-interaction.ts` — `inferMoveNotationForGesture`
  already promotes far layer drags via `toFar`; the whole-cube path does not.

---

## Outstanding Questions

- **Deferred to Planning:** where the signed angle is threaded through the Basic
  view's rotation plan so it reaches the animation without being re-derived from
  the matrix.
