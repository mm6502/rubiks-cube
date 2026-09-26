---
title: 'Ctrl+Arrow slice turned the wrong way in a rotated view'
date: 2026-09-20
category: logic-errors
module: src/views/basic
problem_type: logic_error
component: frontend_stimulus
symptoms:
  - 'Ctrl+Arrow turned the wrong layer direction once the view was rotated with
    Alt+Arrow; the default orientation was always correct.'
  - 'At the reported orientation (3x3, Alt+Right then Alt+Down, then Ctrl+Right)
    the press produced S where M was expected.'
  - 'Raw inference over the full matrix (6 orientations x 4 arrows = 24 cases):
    16/24 correct, and every failure was a pure sign flip on a correct axis —
    the layer and axis were right and the prime was wrong.'
  - 'The rotation axis did not match the equivalent view rotation: Ctrl+Right
    turned about Z where the matching view rotation turns about X.'
  - 'A 48-test suite asserted the opposite rule (the selected sticker travels
    along the screen direction the key points), so the defect stayed green.'
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - testing_framework
tags:
  - basic-view
  - keyboard-input
  - slice-move
  - rotation-math
  - view-rotation
  - reference-frame
  - matrix3d
  - test-oracle
---

# Ctrl+Arrow slice turned the wrong way in a rotated view

## Problem

In the Basic 3D view, `Ctrl+Arrow` turns the selected sticker's layer. In a
**rotated** view it turned the wrong way, so the key's meaning depended on the
view orientation rather than on the direction it names. With no face selected,
`Ctrl+Arrow` was routed through `inferMoveFromDrag`, which reads a
`DragDirection` as **face-intrinsic** — "along this model face's own right
vector". Once the view is rotated, the face's own right vector and screen-right
disagree, and the press silently changed meaning: at the orientation reached by
`Alt+Right, Alt+Down`, `Ctrl+Right` performed `S` (a rotation about Z,
screen-down for that sticker) where the matching view rotation is a rotation
about X, and the required move was `M`.

Reported at 3×3: from the base position, `Alt+Right` then `Alt+Down` then
`Ctrl+Right` produced `S` where `M` was expected.

The stated requirement is about the **sense of the rotation**, not about where
the sticker lands on screen: the turn must go the same way round as the view
rotation — if `Alt+Right` turns +90, then `Ctrl+Right` must turn +90 too.

## Symptoms

- `Alt+Right`, `Alt+Down`, `Ctrl+Right` → `S`; expected `M`.
- Raw inference over the full matrix (6 orientations × 4 arrows = **24 cases**):
  **16/24 correct**. Every failure was a pure sign flip on a correct axis — the
  layer and the axis were right, the prime was wrong:

  | Orientation                   | Key          | Required | Produced |
  | ----------------------------- | ------------ | -------- | -------- |
  | after `Alt+Right`             | `Ctrl+Right` | `E`      | `E'`     |
  | after `Alt+Right`             | `Ctrl+Left`  | `E'`     | `E`      |
  | after `Alt+Right`, `Alt+Down` | `Ctrl+Right` | `M`      | `M'`     |
  | after `Alt+Right`, `Alt+Down` | `Ctrl+Left`  | `M'`     | `M`      |
  | after `Alt+Right`, `Alt+Down` | `Ctrl+Up`    | `S`      | `S'`     |
  | after `Alt+Right`, `Alt+Down` | `Ctrl+Down`  | `S'`     | `S`      |

- The default orientation was unaffected, which is why the defect survived:
  every existing keyboard test exercised the un-rotated view, where
  face-intrinsic and screen directions coincide.

## What Didn't Work

**1. `remapDirection` via the interaction adapter's `mapDragDirection`.** That
callback projects a screen-space drag direction onto a model face's own basis
and returns the face-intrinsic direction. It is the **correct** concept for a
drag — a drag is a push on a particular face, and the touch path already uses
it. Applied to the keyboard path it was **measurably ineffective: 16/24 before
and 16/24 after**. It maps _which direction within a face_ a gesture means; the
keyboard contract is about _the sense of the cube rotation_, which is
independent of which face the selection happens to sit on. Reverted.

**2. A test file that encoded the wrong requirement.**
`basic-view.keyboard-move.test.ts` asserted, across 48 tests, that the selected
sticker _travels along the screen direction the key points_ (measuring screen
displacement with `screenX = dot(p, viewRight)`, `screenY = -dot(p, viewUp)`).
That rule is false, and it contradicts the app's own long-shipped behaviour: the
shipped `Ctrl+Right` → `E` carries the front-centre sticker screen-**left**,
while the `Alt+Right` view rotation carries it screen-**right**. The two rules
disagree _at the default orientation_. The tests passed because nothing in the
suite had ever pinned the two rules against each other, and the file was
mutation-verified (removing the remap failed 22 tests) — which proves it pinned
_something_, not that the something was correct. Resolved by **rewriting** the
file, not retuning it.

**3. The naive conjugation `Q = A · R · A`.** Self-consistent, passes every
base-orientation anchor, fails the reported case (yields `U'` where `M` is
required).

**4. The formula `Q = Mᵀ · A · R · A · M`.** Also self-consistent and also
passes every base-orientation anchor; scores **6/7** anchors, failing only the
reported composed case (yields `M'` where `M` is required).

Four candidate approaches, three of which were "self-consistent and right at the
base orientation". The base orientation alone cannot discriminate, because there
`M` is the identity and every conjugation collapses to the same answer.

## Solution

### 1. New primitive: the layer turn equivalent to a view rotation

`src/views/basic/rotation-math.ts`

```ts
/**
 * A turn of one layer, signed about the **positive** unit axis.
 *
 * Kept separate from {@link AxisAngle} because the two carry the sign differently:
 * a rotation of −Y by +90 and one of +Y by −90 are the same matrix, so `AxisAngle`
 * folds the sign into a negated axis and reports a principal angle in [0, 180]. The
 * notation convention needs the opposite spelling — which *one* of `E`/`E'` was
 * meant — so the sign has to survive as a sign rather than as an axis.
 */
export type LayerTurn = {
  axis: Axis;
  /** Degrees, clockwise-positive about the positive axis: +90, −90, or 180. */
  angle: number;
};

/** Q = A · Mᵀ · M' · A */
export function sliceRotationForViewTurn(
  current: Orientation,
  turned: Orientation
): LayerTurn {
  const screen = multiply(cssMatrix(current), CSS_FLIP);
  const screenTurned = multiply(cssMatrix(turned), CSS_FLIP);
  const { axis, angle } = axisAngleFromMatrix(
    multiply(transpose(screen), screenTurned)
  );

  const name = axis.x !== 0 ? Axis.X : axis.y !== 0 ? Axis.Y : Axis.Z;
  const unit = axis.x !== 0 ? axis.x : axis.y !== 0 ? axis.y : axis.z;

  // axisAngleFromMatrix reports the principal angle in [0,180] and puts the sign in
  // the axis, so a turn about -Y by +90 arrives as axis -Y, angle 90. Multiplying the
  // principal angle by the axis component recovers the signed turn.
  const principal = Math.round(angle / 90) * 90;
  if (principal === 180) return { axis: name, angle: 180 };
  return { axis: name, angle: principal * unit };
}
```

`A = CSS_FLIP = diag(1, −1, −1)` is the model→CSS flip (CSS negates model Y and
Z), and is its own inverse. `transpose` was added alongside the existing
`multiply`.

### 2. Split the keyboard handler into two cases

`src/views/basic/basic-view.ts` — **before**, one path with both meanings
collapsed into it:

```ts
const notation = inferKeyboardMove({
  stickerId: this.state.currentSelected,
  selectedFace: this.touchHandler.getSelectedFace(),
  faceDirectMode: this.touchHandler.isFaceDirectMode(),
  direction,
  doubleTurn: event.shiftKey,
  model: this.state.model, // → inferMoveFromDrag, direction read as face-intrinsic
});
```

**After**, the face case is deliberately left alone and only the no-face case is
re-derived:

```ts
const selectedFace = this.touchHandler.getSelectedFace();
const faceDirectMode = this.touchHandler.isFaceDirectMode();

if (selectedFace === undefined && !faceDirectMode) {
  const notation = this.inferViewRelativeSlice(event, direction);
  if (!notation) return;
  Application.eventBus.emit(EventName.MOVE_REQUESTED, {
    moveNotation: notation,
    viewId: this.state.viewType,
    tentative: false,
  });
  return;
}

const notation = inferKeyboardMove({
  /* unchanged face-turn path */
});
```

**A face is selected** (explicitly, or via face-direct mode): the key names a
turn _of that face_, so "clockwise" is read on the face itself and the view
orientation is deliberately irrelevant — a user turning the F face means
`F`/`F'` however the view is rotated.

**No face selected**: the arrow names a direction _on screen_. The layer is
chosen from the selected sticker's coordinate along `Q`'s axis, which falls out
of the sticker's own position and needs no special case for larger cubes:

```ts
const turn = sliceRotationForViewTurn(current, step(current));
const position = facePositionTo3D(
  sticker.facePosition,
  sticker.currentFace,
  cubeSize
);
const layerIndex =
  turn.axis === Axis.X
    ? position.x
    : turn.axis === Axis.Y
      ? position.y
      : position.z;

// A half turn keeps the sense it was doubled from: +90 → 180, −90 → −180.
const angle = event.shiftKey
  ? ((turn.angle > 0 ? 180 : -180) as QuarterTurn)
  : (turn.angle as QuarterTurn);

return notationForSignedAngle(turn.axis, layerIndex, angle, cubeSize);
```

`Ctrl+Shift+Arrow` deliberately does **not** route through `toDoubleTurn`, which
strips the prime — right for a face turn, wrong here, because a signed slice
turn must keep its sense (`2` vs `2'`).

### 3. Export the prime convention instead of restating it

`notationForSignedAngle` is exported from `src/interaction/move-inference.ts` so
"which spelling takes the prime" is defined once. A second copy in the Basic
view is a divergence waiting to happen.

## Why This Works

With `M` the orientation basis — whose **rows** are `viewRight`, `viewUp`,
`viewForward`, a deliberate convention because CSS `matrix3d` takes its sixteen
arguments column-major, so `matrix3d(vR.x, vU.x, vF.x, …)` places the three
vectors in the matrix's _rows_ — a view rotation replaces `M` with `M'`. The
cube is rendered as `M · A`. On screen the turn is therefore `(M'·A)·(M·A)ᵀ`,
and the layer turn producing the same _visible motion_ about the cube's own axes
is that same rotation expressed in model space, conjugated back by `A` on both
sides:

```
Q = A · Mᵀ · M' · A
```

computed as `transpose(M·A) · (M'·A)`. Because `M` is orthogonal, `Mᵀ` is its
inverse. (The conjugation settles as `A·Q·A = Mᵀ·M'`, which is the _transpose_
of the view turn `R = M'·Mᵀ`. Asserting `A·Q·A = R` looks just as plausible and
fails — which is why the expected matrix is constructed in the test rather than
reasoned about.)

Two properties follow from deriving this in model space rather than screen
space:

- **The answer is independent of which face the sticker sits on** — exactly the
  property attempt 1 lacked, and the reason attempt 1 measured as a no-op. A
  view rotation is a motion of the whole cube, not a push on one face.
- **The sign survives.** `axisAngleFromMatrix` reports a principal angle in
  `[0, 180]` and folds the sign into a negated axis, because `−Y by +90` and
  `+Y by −90` are the same matrix. Notation needs the opposite spelling, so
  `sliceRotationForViewTurn` multiplies the principal angle by the axis
  component to recover a signed turn about a _positive_ axis. That is why a new
  type was required rather than reusing `AxisAngle`.

### How the correct formula was chosen

Three candidate placements of the conjugation are all self-consistent and all
agree at the base orientation, so they can only be told apart at a composed
orientation. Rather than reasoning about signs — which had already produced
contradictory hand-derivations — each candidate was scored against **seven
anchors fixed outside this work**:

1–4. The four shipped base-orientation notations: `Ctrl+Right` → `E`,
`Ctrl+Left` → `E'`, `Ctrl+Up` → `M'`, `Ctrl+Down` → `M` 5–6. The pre-existing
top-row / bottom-row layer behaviour (`U'` for a top-row sticker, `D` for the
bottom row), which pins the _layer_ independently of the rotation formula 7. The
user's reported case: after `Alt+Right, Alt+Down`, `Ctrl+Right` must be `M`

| Candidate            | Score   |
| -------------------- | ------- |
| `A · Mᵀ · M' · A`    | **7/7** |
| `Mᵀ · A · R · A · M` | 6/7     |
| `A · R · A`          | 6/7     |

Both losers pass every base-orientation anchor and fail only the reported case.
A self-consistent formula can still be the wrong formula, so it must be anchored
to at least one value fixed outside the derivation.

**Verification:** full suite 2723 tests / 117 files pass (2714 before); coverage
94.87% lines against a 70% threshold; `type-check`, `lint:imports`, `format`,
`build` clean. Replacing the conjugation with the naive screen-space form fails
**29 of the 53** tests in the new behavioural suite, **including all four
reported cases**.

## Prevention

### Anchor any derived formula to values fixed outside the derivation

Passing a self-consistent derivation is not evidence. Hardcode the anchors, with
a comment saying _why_ they are hardcoded — three of the seven below are shipped
behaviours the user already accepted:

```ts
describe('anchors: the shipped base-orientation notations', () => {
  // Externally-fixed values, hardcoded on purpose. The formula above is
  // self-consistent whether or not it is right, so these pin it to behaviour that
  // predates this work and that the user already accepted.
  it.each([
    ['ArrowRight', 'E', 'front face, screen-right'],
    ['ArrowLeft', "E'", 'front face, screen-left'],
    ['ArrowUp', "M'", 'front face, screen-up'],
    ['ArrowDown', 'M', 'front face, screen-down'],
  ])('base orientation: Ctrl+%s is still %s', (key, expected) => {
    // One fixture per arrow: each press really turns the cube, so a shared fixture
    // would be pressing on a different orientation by the second case.
    const fixture = createFixture(3);
    try {
      expect(ctrlArrow(fixture, key)).toBe(expected);
    } finally {
      fixture.dispose();
    }
  });
});
```

Two corollaries learned here:

- **A green, mutation-verified test only proves it pins _something_.** The
  48-test predecessor was mutation-verified and wrong. Before trusting a new
  test, ask whether its assertion would fail for pre-existing _accepted_ code:
  the screen-travel rule would have failed the shipped `Ctrl+Right` → `E`, which
  is how it should have been caught at authoring time.
- **When two of your own measurement harnesses disagree, the defect is in your
  convention, not in the code.** Twice during this investigation two
  independently written harnesses returned contradictory answers for the same
  case; the resolution was never "pick the more plausible one" but "find the
  invariant both must satisfy".

### Re-derive the oracle inside the test; never import it

The behavioural suite computes `Q` itself and compares against the engine's own
move definitions, so the implementation cannot vouch for itself and the notation
cannot drift from the derivation:

```ts
/** The layer turn equivalent to a view turn from `M` to `Mp`. Re-derived, not imported. */
function equivalentTurn(M: M3, Mp: M3): M3 {
  return multiply(FLIP, multiply(transpose(M), multiply(Mp, FLIP)));
}

// …then, per case:
const rotation = rotationOfNotation(notation!, cubeSize); // engine's own moveDefinitions
expectSameRotation(
  rotation!,
  equivalentTurn(before, after),
  `${label} / ${notation}`
);
```

Assert the **rotation matrix**, not the notation string, for the general case —
that is what caught the sign-only failures — and assert the notation string only
where the value is externally fixed. The same suite asserts the _layer_ as a
separate claim, because a correct rotation of the wrong slice still moves the
wrong stickers:

```ts
const definition = getCubeInvariants(cubeSize).moveDefinitions.get(notation!)!;
const coordinate =
  definition.axis === Axis.X
    ? sticker.x
    : definition.axis === Axis.Y
      ? sticker.y
      : sticker.z;
const layerIndex = Math.round(coordinate + (cubeSize - 1) / 2);
expect(
  definition.layerIndices.includes(layerIndex),
  `${label}: ${notation} turns layers [${definition.layerIndices.join(',')}]` +
    ` but the sticker is on layer ${layerIndex}`
).toBe(true);
```

Pin the **whole cluster**, not the quoted case. The user reported one arrow; all
four are asserted, so a fix that happens to satisfy only the quoted one cannot
pass. The primitive-level suite in `rotation-math.test.ts` does the same over
all 24 reachable orientations × 4 steps (96 cases): the turn is always a single
quarter turn about one of the three axes, it equals an independently re-derived
expected matrix, the axis is always the **positive** one (so the sign survives
as a sign), and a step plus its inverse give equal-and-opposite turns.

### Guard the two cases apart

The derived path is easy to leave switched on by accident, and would then
silently turn slices where a face was selected. Pin the boundary:

```ts
it('a selected face still turns in the face’s own frame', () => {
  // "clockwise" is read on that face, and the view orientation must not change the
  // answer. Pinned because the derived path is easy to leave switched on by accident.
  const fixture = createFixture(3);
  try {
    fixture.view.rotateViewRight();
    const toggle = fixture.view
      .getCommands()
      .find(c => c.id.endsWith('face-direct-mode'));
    toggle!.action();
    expect(ctrlArrow(fixture, 'ArrowRight')).toMatch(/^[FBRLUD]'?$/);
  } finally {
    fixture.dispose();
  }
});
```

### Fixture hygiene: dispose the model, not just the view

`CubeController` subscribes to the **global** `MOVE_REQUESTED` bus. A controller
left behind by an earlier test also applies a later test's move — and throws on
a notation its own size does not define (`3M'` on a 4×4). Serialise fixtures and
unsubscribe explicitly:

```ts
dispose: () => {
    Application.eventBus.off(EventName.MOVE_REQUESTED, listener);
    // `model.dispose()` is what unsubscribes the controller from the global bus.
    // Destroying the view is not enough — the controller outlives it.
    model.dispose();
    view.destroy();
    container.remove();
},
```

The same trap bit two scratch harnesses during this investigation: comparing two
candidate inferences back-to-back on one fixture silently measured the second
candidate on a **mutated** cube. Call `model.dispose()` before inferring.

### Read the `matrix3d` arguments as column-major

`viewForward = (args[8], args[9], args[10])` is wrong — that tuple mixes three
different vectors and produces plausible-looking nonsense. Correct reads:
`viewRight = (0,4,8)`, `viewUp = (1,5,9)`, `viewForward = (2,6,10)`. Pin the
convention with a test that reconstructs the DOM matrix from the exact string
the app writes and asserts the relative rotation is a pure, exact rotation.

### Don't measure position off a `[class*=selected]` element

`getBoundingClientRect()` on it reports "moved 0px" for every case, because the
`selected` class re-anchors to the screen **cell** — the marker stays put while
the cube turns. Measure model-space points projected through the basis, or read
the cube state.

## Related Issues

- [`directional-180-moves.md`](./directional-180-moves.md) — the other
  signed-angle doc in this repo. Related thematically: both are about a
  _direction/sign_ reaching the type system through an explicit signed angle.
  Different root cause (there, a 180° gesture's direction was discarded and
  `-180` was missing from the union; here, an on-screen direction was fed to a
  face-intrinsic inference). `LayerTurn` exists because `AxisAngle` folds the
  sign into a negated axis and so cannot name a move.
- [`move-notation-casing`](../conventions/move-notation-casing-2026-05-12.md) —
  authority for `M`/`E`/`S` being uppercase, which the `LayerTurn` → notation
  path must honour.
- `src/docs/move-notation.md` — slice semantics (which layer `M`/`E`/`S` turns,
  `2M`/`3S` numbering, 2×2 has no slices). The derived `layerIndex` must agree
  with §"Which layer the M/E/S buttons turn".
- `src/docs/coordinate-system.md` — cube axes and layer indices that the derived
  `axis` + `layerIndex` depend on. Note it documents no CSS model-flip, which is
  why the `A = diag(1, −1, −1)` conjugation is worth recording.
- `src/docs/user-interface-design.md` — **has since been corrected.** This doc
  originally recorded a stale claim there: "Manual View Rotation (Basic View)"
  attributed view rotation to `Ctrl+Arrow`. The file now states the opposite and
  links back here: view rotation is `Alt+Arrow`, while `Ctrl+Arrow` is the slice
  move this document describes. Kept as a record of the correction, not as an
  outstanding problem.
- `src/docs/commanding-and-eventing-system.md` — the `MOVE_REQUESTED` emission
  from `basic-view.ts`, and the command-router path that handles `Alt+Arrow`
  view rotation.
- Commit `450558f` on `feat/shared-rotation-animation`, PR #17.
