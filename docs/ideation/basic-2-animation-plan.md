# Basic 2 — Animatable Basic View (Per-Cubie DOM)

**Date:** 2026-05-29 **Branch:** `feat/basic-2-animation` **Status:** Tech spec
(gated on steps 0 and 0b) **Scope:** Enable move animations in Basic view via
per-cubie DOM architecture

---

## Decision History

The original spec (whole-face rotation) was rejected after doc review. Three
reviewer personas (coherence, feasibility, adversarial) agreed on two blocking
findings:

- **Whole-face div ≠ physical layer.** An `F` move does not rotate the front
  face div — it rotates a layer of 9 cubies. 8 of the 17 moving stickers live on
  adjacent face divs. Whole-face animation cannot include them without DOM
  reparenting — and that applies to every legal move.
- **Interrupt produces a 3-frame artifact.** `cancel()` → snap → color flash →
  restart. Per-cubie eliminates this: colors never change divs, only cubie
  positions do.

**Conclusion:** per-cubie DOM is the correct long-term architecture. Whole-face
would have been throwaway work.

---

## Problem

Basic view currently uses `updateSelective()` for instant sticker color swaps.
No animation of sticker movement during moves. Circular view already has a full
animation system (`animations.ts`) — Basic 2 needs an equivalent for CSS 3D.

**Motivation:** Basic view is the primary entry-point view for users who prefer
a flat/face-based look. Animated layer rotations are a core part of the physical
puzzle experience. Users who opt into Basic 2 currently see instant color
teleports rather than the rotation that conveys what move happened — making it
harder to follow along with a solve or verify a move was applied correctly.
(Basic and Basic 2 will coexist as selectable alternatives; a UI view-switching
affordance is in scope. See Q7.) Circular view animates along arcs, which is
architecturally incompatible with CSS 3D cubie positioning; Basic 2 requires its
own per-cubie animation layer to provide rotation animations in this view.

## Current Architecture

### Basic view (static)

- CSS 3D cube: `transform-style: preserve-3d`, 6 face divs positioned via
  `translateZ` + `rotateX/Y`
- Each face: CSS grid with N×N sticker divs
- Move handling: `updateSelective()` → instant color/ID swap per sticker
- No DOM element movement — style changes only

### Circular view (for reference)

- SVG-based: `SVGCircleElement` stickers on a 2D plane
- `animateMove()` → Web Animations API per sticker along arc paths
- Each sticker follows an interpolated path from the face center

## Design Decisions

### 0. Why `basic-2/` is a new directory (not an in-place upgrade of `basic/`)

Basic 2 has a fundamentally different DOM model: per-cubie 3D elements vs. the
existing six face-div grid. The two DOM structures are incompatible — `basic/`
uses `updateSelective()` (color swaps on sticker divs), while `basic-2/` uses
`updateCubiePositions()` (translate3d updates on cubie elements). Implementing
Basic 2 inside `basic/` would require a parallel code path for the entire render
and animation layer with no shared code, plus a feature flag to switch between
them. A separate `basic-2/` directory avoids that complexity, keeps the static
view intact and fully functional while Basic 2 is developed, and aligns with the
coexistence decision (Q7): both views remain independently shippable.

### 1. Per-cubie DOM architecture

Every surface cubie (`Cubie`) gets its own `div.cubie` element in 3D space. The
cubie carries its sticker color faces as child divs — colors never change. A
move physically relocates the cubie to its new position.

**Advantages over whole-face:**

| Problem (whole-face)                     | Solution (per-cubie)                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| 8 adjacent stickers teleport             | Adjacent stickers are on layer cubies → they animate |
| Cancel → snap → color flash → restart    | Cancel → snap → position update (no color change)    |
| Animates the wrong unit (face div)       | Animates the correct unit (layer = N² cubies)        |
| Whole-face code is throwaway for Phase 2 | Per-cubie is the final architecture                  |

### 2. New DOM structure

```plaintext
.cube  (transform-style: preserve-3d; transform: <viewer rotation>)
  .cubie[data-cubie-id="id_00_00_02"]  (transform: translate3d(cx, cy, cz); transform-style: preserve-3d)
    .cubie-face[data-cubie-face="F"][data-sticker-id="..."]  (transform: translateZ(half))
    .cubie-face[data-cubie-face="U"][data-sticker-id="..."]  (transform: rotateX(90deg) translateZ(half))
    [... visible sides of this cubie only]
  .cubie[data-cubie-id="id_00_01_02"]
    ...
  [... all surface cubies for the given cube size]
  .cube-blocker.front   (unchanged)
  .cube-blocker.back
  [...]
```

Each `div.cubie` contains sticker faces only for its visible sides (on the cube
surface). The center cubie of a 3×3 is not a surface cubie — it is omitted.

**CSS for `.cubie`:**

```css
.cubie {
  position: absolute;
  transform-style: preserve-3d;
  /* width/height = cubieSize, set by initializeCubies() */
}
```

**CSS for `.cubie-face`:**

```css
.cubie-face {
  position: absolute;
  width: 100%;
  height: 100%;
  /* background-color = sticker.color (set by JS) */
  /* border-radius, gap — same as current .sticker */
}
```

### 3. Cubie 3D positioning

For a cube of visual size `size` px — e.g. `300`:

```typescript
cubieSize = size / cubeSize; // e.g. 100 px for 3×3
cubieHalf = cubieSize / 2; // e.g.  50 px
cx = (pos.x - (cubeSize - 1) / 2) * cubieSize;
cy = -(pos.y - (cubeSize - 1) / 2) * cubieSize; // CSS Y axis is inverted
cz = (pos.z - (cubeSize - 1) / 2) * cubieSize;
```

Example for 3×3 (cubeSize=3, size=300):

| pos.x/y/z | offset (px) |
| --------- | ----------- |
| 0         | −100        |
| 1         | 0           |
| 2         | +100        |

Cubie at `(0, 0, 2)` (front-left-bottom): `translate3d(-100px, 100px, 100px)`.

### 4. Sticker face placement inside a cubie

Each sticker face div uses the same transforms as the existing face divs on the
cube, but with `cubieHalf` instead of `halfSize`. These transforms are identical
to those set by `rendering.initializeFaces()` (verified from `rendering.ts`
lines 369–374):

| `sticker.currentFace` | CSS transform on `.cubie-face`               |
| --------------------- | -------------------------------------------- |
| `F`                   | `translateZ(${cubieHalf}px)`                 |
| `B`                   | `rotateY(180deg) translateZ(${cubieHalf}px)` |
| `R`                   | `rotateY(90deg) translateZ(${cubieHalf}px)`  |
| `L`                   | `rotateY(-90deg) translateZ(${cubieHalf}px)` |
| `U`                   | `rotateX(90deg) translateZ(${cubieHalf}px)`  |
| `D`                   | `rotateX(-90deg) translateZ(${cubieHalf}px)` |

### 5. Move animation: layer-pivot element

Animating each cubie individually with `rotate3d` would cause each cubie to
rotate around its own center instead of the cube's axis. A **pivot element**
solves this:

**Steps for a single move (e.g. `F`):**

1. Call `getLayerCubieElements(move, cubeElement)` to identify the layer's
   cubies by parsing `data-cubie-id` DOM attributes against `move.axis` +
   `move.layerIndices` — no dependency on `movedCubies`
2. Create `div.layer-pivot`
   (`position: absolute; transform-style: preserve-3d; width: 0; height: 0` — no
   visual footprint)
3. Move the layer's `div.cubie` elements into `.layer-pivot` — their
   `translate3d` stays unchanged (relative to cube center)
4. `layerPivot.animate([{transform: 'none'}, {transform: 'rotate3d(ax,ay,az,angle)'}], options)`
5. `await animation.finished`
6. Move cubies back into `.cube`
7. Update each cubie's `translate3d` from `movedCubies.after[i].position`
8. Update each sticker face div's transform from `movedCubies.after[i].stickers`
9. `animation.cancel()` → removes the `fill: 'forwards'` effect; call **after**
   steps 7–8 so inline `translate3d` values are in place before the fill is
   cleared; pivot element reference cleared
10. Remove `div.layer-pivot` from DOM

**Why a pivot?** The pivot div sits at `(0,0,0)` = cube center. A
`rotate3d(0,0,1,90deg)` on the pivot rotates all child cubies around the cube's
Z-axis — exactly the same as a physical layer rotation.

**`MoveDefinition.axis` → CSS `rotate3d` mapping:**

| `Axis`   | `rotate3d` vector |
| -------- | ----------------- |
| `Axis.X` | `(1, 0, 0)`       |
| `Axis.Y` | `(0, 1, 0)`       |
| `Axis.Z` | `(0, 0, 1)`       |

Angle: `move.angle` (QuarterTurn: `±90`, `±180`, `±270`).

**Sign convention:** CSS `rotate3d` follows the right-hand rule — positive
angles are counter-clockwise when viewed from the positive axis direction.
`move.angle` encodes the raw WCA quarter-turn value (`+90` for CW face moves).
The CSS angle is **not always equal to `move.angle`** — it must be adjusted per
face, following the same logic as `getFaceRotationAxis` in
`src/cube/utils/sticker-position.ts`:

| Move family                     | Axis      | CSS angle from `move.angle` |
| ------------------------------- | --------- | --------------------------- |
| **R, U, B** (and nRw, nUw, nBw) | X / Y / Z | `+move.angle`               |
| **L, F, D** (and nLw, nFw, nDw) | X / Z / Y | `-move.angle`               |
| **M** (follows L)               | X         | `-move.angle`               |
| **E** (follows D)               | Y         | `-move.angle`               |
| **S** (follows F)               | Z         | `-move.angle`               |

**Canonical test cases (F = CW 90°):**

- F: `rotate3d(0,0,1,-90deg)` — front-face stickers rotate CW from viewer ✓
- R: `rotate3d(1,0,0,+90deg)` — right-face stickers rotate CW from the right ✓
- U: `rotate3d(0,1,0,+90deg)` — top-face stickers rotate CW from above ✓
- M: `rotate3d(1,0,0,-90deg)` — middle layer follows L direction ✓

`animateLayer` should call `getFaceRotationAxis(primaryFace, move.angle)` to get
`effectiveAngle` and use that as the CSS `rotate3d` angle. For slice moves, pass
the equivalent face (M→L, E→D, S→F). This reuses the existing utility and keeps
sign logic in one place.

### 6. Interrupt and concurrency

**Input model:** The UI remains interactive during animation — the cube's event
bus dispatches `MoveExecutedEvent`s as moves are applied, regardless of whether
a previous animation is still running. There is no move queue: each event is
handled immediately by `handleMoveExecuted`. When a new event arrives
mid-flight, `finalizeAnimation()` synchronously cancels and cleans up the
in-flight animation (see sequence below), then the new animation starts. This is
the canonical cancel-and-restart model — no buffering, no input blocking.

If a new move arrives while an animation is running, `finalizeAnimation()` runs
the following Phase 1 sequence:

1. Move cubies from `div.layer-pivot` back into `.cube`
2. Remove `div.layer-pivot` from DOM
3. Update each cubie's `translate3d` from `event.moveDetails.movedCubies.after`
4. Update sticker face transforms from `event.moveDetails.movedCubies.after`
   (includes updating `data-basic-face` attribute on each `.cubie-face` — same
   as the normal completion path in D.D. #8)
5. `animation.cancel()` — removes the `fill: 'forwards'` effect; call **after**
   steps 3–4 so inline `translate3d` values are in place before the fill is
   cleared (same rationale as D.D. #5 step 9)
6. Call `ghostStickers.updateColors()` — ghost sticker colors updated on both
   interrupt and natural completion paths (same as non-animated behavior)
7. Start the new move's animation

**Visual result of an interrupt (Phase 1):**

- Cubies snap from their pre-A position to post-A position (one visible jump)
- No color flash — sticker colors update correctly
- The new animation starts from the correct post-A position

**Phase 2 (deferred):** Capture the pivot's partial rotation via
`getComputedStyle` at interrupt time, apply as an inline transform to each cubie
before cancelling — cubies remain at their mid-orbit position and jump directly
to post-A (eliminates the snap). Tracked in Open Question #5.

### 7. What stays unchanged

- `.cube-blocker` divs — remain, non-animated background
- `rendering.updateRotation()` — viewer drag rotation operates on the `.cube`
  element, not on cubies
- `navigation.ts`, `selection.ts` — unchanged
- `ghost-stickers` — updated after animation finalization as before; **selector
  update required** — see Open Q2 (`.sticker` → `.cubie-face[data-sticker-id]`);
  ghost sticker elements are overlay divs outside the per-cubie DOM and do
  **not** orbit with the pivot — `updateColors()` is called after
  `updateCubiePositions` on both natural completion and interrupt paths (same
  timing as non-animated behavior); no hide/show during animation is needed
- `touch-handler` — reads `data-sticker-id` from elements; the attribute will be
  on `.cubie-face` divs instead of `.sticker` divs, reading logic unchanged

### 8. Face mode adaptation

`face-mode` detects the current face from the `data-basic-face` attribute. In
the per-cubie DOM, set this attribute on `.cubie-face` divs as well:

```html
<div class="cubie-face" data-cubie-face="F" data-basic-face="F" ...></div>
```

The `data-basic-face` value is updated together with the cubie-face transform
after each move.

**Face mode during animation:** Face mode reads `data-basic-face` attributes to
determine which stickers are on the current face. During a pivot animation, the
rotating cubies' `data-basic-face` attributes still reflect their pre-move state
— face mode should display the pre-move face projection while the animation
runs. `data-basic-face` is updated by `updateCubiePositions` at the end of the
move (natural completion or interrupt), at which point face mode re-renders. No
explicit suppression of face-mode queries is required; the attributes simply
remain stale during animation and are corrected on completion.

---

## Tech Spec

### New file: `src/views/basic-2/cubie-rendering.ts`

Contains logic for initializing and updating cubie DOM elements. Separated from
`basic-2-view.ts` and `animations.ts` so that DOM construction/mutation
responsibilities are isolated from animation orchestration — makes each module
independently testable and keeps `basic-2-view.ts` as a thin coordinator.

#### `buildCubieElement(cubie, cubieSize, styles, onStickerSelected)`

```typescript
export function buildCubieElement(
  cubie: ReadonlyCubie,
  cubieSize: number,
  styles: Record<string, string>,
  onStickerSelected: (id: StickerId) => void
): HTMLElement;
```

- Creates `div.cubie`, sets `data-cubie-id`,
  `style.transform = translate3d(cx, cy, cz)`
- For each `sticker` in `cubie.stickers.values()`:
  - Creates `div.cubie-face`, sets `data-sticker-id`, `data-cubie-face`,
    `data-basic-face`, background color from `sticker.color`
  - `style.transform` = face placement from table in D.D. #4
  - Adds click listener → `onStickerSelected(sticker.id)`

#### `initializeCubies(state, size)`

```typescript
export function initializeCubies(
  state: BasicViewInternalData,
  size: number
): void;
```

- Calculates `cubieSize = size / cubeSize`
- For each surface cubie in `state.model.state.cubiesById` (surface cubies = all
  cubies with at least one coordinate at 0 or `cubeSize-1`; count =
  `n³ - (n-2)³` for an n×n cube — e.g. 26 for 3×3, 56 for 4×4):
  - Creates cubie element via `buildCubieElement()`
  - Appends to `state.cubeElement`
- Stores `cubieSize` in state (new field)
- Works for any cube size — no hardcoded 26 assumption

#### `updateCubiePositions(cubeElement, movedCubies)`

```typescript
export function updateCubiePositions(
  cubeElement: HTMLElement,
  movedCubies: { after: ReadonlyCubie[] }
): void;
```

- For each `cubie` in `movedCubies.after`:
  - Finds `div.cubie[data-cubie-id="${cubie.id}"]`
  - Updates `style.transform = translate3d(cx, cy, cz)` from `cubie.position`
  - For each `sticker` in `cubie.stickers.values()`:
    - Finds `div.cubie-face[data-sticker-id="${sticker.id}"]`
    - Updates `style.transform`, `data-cubie-face`, `data-basic-face` from
      `sticker.currentFace`

### New file: `src/views/basic-2/animations.ts`

#### Types

```typescript
export type BasicAnimationConfig = {
  duration: number; // ms, default 300
  easing: string; // default 'ease-out'
};

export const DEFAULT_BASIC_ANIMATION_CONFIG: BasicAnimationConfig = {
  duration: 300,
  easing: 'ease-out',
};
```

#### `getLayerCubieElements(move, cubeElement)`

```typescript
export function getLayerCubieElements(
  move: MoveDefinition,
  cubeElement: HTMLElement
): HTMLElement[];
```

- From `move.axis` + `move.layerIndices` determines which layer indices are in
  scope for this move (`layerIndices: number[]` — confirmed in
  `src/cube/types/move.ts`; contains one index for face moves, two for wide
  moves)
- Reads `data-cubie-id` attributes on `.cubie` children of `cubeElement`; parses
  coordinates from the `pos_XX_YY_ZZ` format by splitting on `'_'` (indices 1=x,
  2=y, 3=z as integers) to match against the axis + layerIndices. **Note:**
  `getCubieId` returns `getPositionKey()` cast to `CubieId`, so the actual
  runtime format is `"pos_XX_YY_ZZ"` (not `"id_XX_YY_ZZ"` as the `CubieId` type
  comment states — that comment is stale). If the format changes, this function
  returns `[]` silently; add a format-validation guard or switch to a dedicated
  `parseCubieIdCoords(id)` utility when one is available.
- Returns the matching `HTMLElement[]` — no dependency on `movedCubies`

#### `animateLayer(cubieElements, axis, angle, cubeElement, config)`

```typescript
export function animateLayer(
  cubieElements: HTMLElement[],
  axis: Axis,
  angle: number,
  cubeElement: HTMLElement,
  config: BasicAnimationConfig
): { animation: Animation; pivot: HTMLElement };
```

Implementation:

```typescript
const pivot = document.createElement('div');
pivot.style.cssText =
  'position:absolute;left:0;top:0;transform-style:preserve-3d;width:0;height:0;';
cubeElement.appendChild(pivot);

cubieElements.forEach(el => pivot.appendChild(el));

const axisVec: Record<Axis, string> = {
  [Axis.X]: '1,0,0',
  [Axis.Y]: '0,1,0',
  [Axis.Z]: '0,0,1',
};
const animation = pivot.animate(
  [
    { transform: 'none' },
    { transform: `rotate3d(${axisVec[axis]},${angle}deg)` },
  ],
  { duration: config.duration, easing: config.easing, fill: 'forwards' }
);

return { animation, pivot };
```

#### `finalizeLayer(pivot, cubieElements, cubeElement)`

```typescript
export function finalizeLayer(
  pivot: HTMLElement,
  cubieElements: HTMLElement[],
  cubeElement: HTMLElement
): void;
```

- `cubieElements.forEach(el => cubeElement.appendChild(el))` — move back
- `pivot.remove()`

#### `animateMove(event, cubeElement, config?)` → `AnimateMoveResult | null`

```typescript
export type AnimateMoveResult = {
  animation: Animation;
  pivot: HTMLElement;
  cubieElements: HTMLElement[];
};

export function animateMove(
  event: MoveExecutedEvent,
  cubeElement: HTMLElement,
  config?: BasicAnimationConfig
): AnimateMoveResult | null;
```

**`prefers-reduced-motion`:** Check
`window.matchMedia('(prefers-reduced-motion: reduce)').matches` before starting
any animation. If true, return `null` — `handleMoveExecuted` already routes
`null` results to the instant `updateCubiePositions` fallback.

Steps:

1. `move = event.moveDetails.definition` — if missing, return `null`
2. `cubieElements = getLayerCubieElements(move, cubeElement)` — if `[]`, return
   `null` (should not occur for valid moves; guards against truly unknown moves)
3. `{ animation, pivot } = animateLayer(cubieElements, move.axis, move.angle, cubeElement, config ?? DEFAULT)`
4. Return `{ animation, pivot, cubieElements }`

**All standard moves animate** — F, B, R, L, U, D, M, E, S, and wide moves (Rw,
Lw, etc.) all use `move.axis + move.layerIndices` and go through the same pivot
path. No special-case null return for middle slices.

---

### New file: `src/views/basic-2/initialization.ts`

Based on `src/views/basic/initialization.ts` with these differences:

- `buildCubeElement()` creates the `.cube` div WITHOUT face divs, only blocker
  divs
- After creating the state object: calls
  `cubie-rendering.initializeCubies(state, size)`

### New file: `src/views/basic-2/rendering.ts`

Based on `src/views/basic/rendering.ts` with these differences:

- `initializeFaces()` — renamed to `initializeBlockers()`, retains only blocker
  transform setup, no face div logic
- No `updateSelective()` — uses `updateCubiePositions` instead
- `update()` — calls `initializeCubies` or `updateCubiePositions` for a full
  repaint instead of repainting stickers

### New file: `src/views/basic-2/basic-2-view.ts`

Based on `src/views/basic/basic-view.ts` with these differences:

#### New private field

```typescript
private activeAnimation: {
  animation: Animation;
  pivot: HTMLElement;
  cubieElements: HTMLElement[];
  event: MoveExecutedEvent;
} | null = null;
```

#### New private method `finalizeAnimation()`

**Contract:** No-op when `this.activeAnimation` is null. When active: (1)
reparents cubies from the pivot back into `.cube` and removes the pivot element;
(2) applies `movedCubies.after` positions and sticker-face transforms for the
interrupted move; (3) calls `animation.cancel()` **after** DOM updates to clear
the `fill: 'forwards'` effect; (4) calls `ghostStickers?.updateColors()` and
`restoreSelection()`; (5) sets `this.activeAnimation = null`. This is the
canonical interrupt handler — §6's sequence maps directly to these steps.

```typescript
private finalizeAnimation(): void {
  if (!this.activeAnimation) return;
  const { animation, pivot, cubieElements, event } = this.activeAnimation;
  this.activeAnimation = null;

  finalizeLayer(pivot, cubieElements, this.state.cubeElement!);
  updateCubiePositions(this.state.cubeElement!, event.moveDetails!.movedCubies!);
  animation.cancel(); // remove fill effect after DOM is updated
  this.ghostStickers?.updateColors();
  this.restoreSelection();
}
```

#### `handleMoveExecuted`

```typescript
handleMoveExecuted(event: MoveExecutedEvent): void {
  if (!this.state.model) return;

  this.finalizeAnimation(); // interrupt running animation

  if (!event.moveDetails?.movedCubies) {
    this.update(this.state.model);
    return;
  }

  const result = animateMove(event, this.state.cubeElement!);

  if (!result) {
    // prefers-reduced-motion, unknown definition, or no matching layer cubies — instant fallback.
    // finalizeAnimation() above already cleared any stale pivot/transform state; safe to apply directly.
    updateCubiePositions(this.state.cubeElement!, event.moveDetails.movedCubies);
    return;
  }

  this.activeAnimation = { ...result, event };

  result.animation.finished
    .then(() => {
      if (this.activeAnimation?.event === event) {
        const { pivot, cubieElements } = this.activeAnimation;
        this.activeAnimation = null;
        finalizeLayer(pivot, cubieElements, this.state.cubeElement!);
        updateCubiePositions(this.state.cubeElement!, event.moveDetails!.movedCubies!);
        result.animation.cancel(); // remove fill effect after DOM is updated
        this.ghostStickers?.updateColors();
        this.restoreSelection();
      }
    })
    .catch(() => {
      // Cancelled via finalizeAnimation() — do nothing
    });
}
```

#### `destroy()`

```typescript
destroy(): void {
  this.finalizeAnimation();
  // ... existing cleanup
}
```

---

## File Structure

```plaintext
src/views/basic-2/          # NEW directory — existing src/views/basic/ is untouched
├── cubie-rendering.ts       # NEW: buildCubieElement, initializeCubies, updateCubiePositions
├── cubie-rendering.test.ts  # NEW: unit tests for cubie DOM logic
├── animations.ts            # NEW: animateMove, animateLayer, getLayerCubieElements, finalizeLayer
├── animations.test.ts       # NEW: unit tests
├── initialization.ts        # NEW: based on basic/initialization.ts, no face divs
├── rendering.ts             # NEW: based on basic/rendering.ts, no updateSelective
├── basic-2-view.ts          # NEW: based on basic/basic-view.ts, adds animation
└── (navigation, selection, touch-handler — imported from `src/views/basic/`;
    ghost-stickers — imported with selector update per Open Q2)
```

---

## Test Plan

### `cubie-rendering.test.ts`

| Test                                            | Verifies                                       |
| ----------------------------------------------- | ---------------------------------------------- |
| `buildCubieElement` — corner cubie              | creates 3 `.cubie-face` divs                   |
| `buildCubieElement` — edge cubie                | creates 2 `.cubie-face` divs                   |
| `buildCubieElement` — center cubie              | creates 1 `.cubie-face` div                    |
| `buildCubieElement` — face transform F          | `translateZ(50px)` for cubieHalf=50            |
| `buildCubieElement` — face transform U          | `rotateX(90deg) translateZ(50px)`              |
| `buildCubieElement` — data-sticker-id set       | attribute on `.cubie-face`                     |
| `buildCubieElement` — data-basic-face set       | attribute on `.cubie-face`                     |
| `initializeCubies` — 3×3                        | creates 26 `.cubie` divs (`n³-(n-2)³` formula) |
| `updateCubiePositions` — after F move           | updates translate3d of 9 cubies                |
| `updateCubiePositions` — sticker face transform | updates data-cubie-face and sticker transforms |

### `animations.test.ts`

| Test                                             | Verifies                              |
| ------------------------------------------------ | ------------------------------------- |
| `getLayerCubieElements` — F move (z=2)           | returns 9 cubie elements              |
| `getLayerCubieElements` — R move (x=2)           | returns 9 cubie elements              |
| `getLayerCubieElements` — M move (middle x=1)    | returns 9 middle-layer cubie elements |
| `animateLayer` — creates pivot element           | pivot div is in cubeElement           |
| `animateLayer` — cubies are in pivot during anim | cubieEl.parentElement === pivot       |
| `animateLayer` — pivot has rotate3d keyframe     | keyframes verified                    |
| `finalizeLayer` — cubies are back in cubeElement | cubieEl.parentElement === cubeElement |
| `finalizeLayer` — pivot removed from DOM         | cubeElement does not contain pivot    |
| `animateMove` — returns result for F move        | result !== null                       |
| `animateMove` — returns result for M move        | result !== null                       |
| `animateMove` — returns null without definition  | graceful fallback                     |

---

## Risks and Open Questions

### Resolved

- ✅ **Approach:** Per-cubie DOM with layer-pivot animation
- ✅ **Adjacent stickers:** Automatically animated — they are on the layer
  cubies
- ✅ **Interrupt:** cancel → position update (no color flash)
- ✅ **Face mode:** `data-basic-face` on `.cubie-face` divs
- ✅ **Blockers:** Remain unchanged
- ✅ **`movedCubies.after`:** `ReadonlyCubie[]` (= `Cubie`; defined in
  `src/cube/types/cubie.ts`). Each entry has `id: CubieId`,
  `position: Position3D` (x/y/z grid coordinates), and
  `stickers: IMap<StickerId, Sticker>` where each `Sticker` carries
  `currentFace`. All data needed by `updateCubiePositions` is present.
- ✅ **Middle slice moves (M, E, S):** Animate via the same layer-pivot path as
  face moves — `move.layerIndices = [1]` on a 3×3 selects the 9 middle-layer
  cubies; no special case needed.
- ✅ **`cubie.id` parsing:** Runtime format is `"pos_XX_YY_ZZ"` (from
  `getCubieId` → `getPositionKey`; zero-padded, 2-digit per coord). The
  `CubieId` type's own doc comment says `"id_XX_YY_ZZ"` — that comment is stale
  and should be updated separately. `getLayerCubieElements` splits on `'_'` and
  parses the axis coordinate (index 1=x, 2=y, 3=z) and compares against
  `move.layerIndices`. Move-geometry approach selected; ID string splitting is
  the implementation mechanism.

### Open

0. **Static rendering prototype (step 0):** Before building the animation
   pipeline, validate the per-cubie DOM render with a throwaway static build: 26
   cubies at correct positions, no z-fighting, correct sticker face orientations
   from all six viewing angles. The cubie coordinate formulas in D.D. #3 and #4
   are derived from the existing face-based `rendering.ts` but have not been
   tested in a per-cubie 3D context. Gate animation work on this. 0b. **DOM
   reparenting validation:** Validate that reparenting `.cubie` elements into
   `div.layer-pivot` while an animation is running does not disrupt the
   `preserve-3d` stacking context or cause a rendering artifact. Minimal test:
   animate a pivot, reparent a child div mid-animation, verify smooth tracking.
   If reparenting is problematic, the fallback is: call `element.animate()` on
   each `.cubie` element individually with a `rotate3d` keyframe that rotates
   around the cube's center (not the cubie's own center) by baking the pivot
   offset into a compound `translate → rotate → un-translate` transform. All N²
   animations share identical keyframes and timing;
   `Promise.all(animations.map(a    => a.finished))` awaits completion.
   `finalizeAnimation()` calls `cancel()` on each animation. No `layer-pivot`
   element is created. `animateLayer`'s return type would change to
   `{ animations: Animation[]; cubieElements: HTMLElement[] }` to carry all
   handles. This path is the fallback only — prefer pivot if Q0b validates
   successfully.
1. **Ghost stickers (open design question):** The selector update from
   `.sticker` to `.cubie-face[data-sticker-id]` is straightforward —
   `data-sticker-id` is already set in `buildCubieElement`. However,
   `ghostStickers` currently targets the static Basic view's DOM. With
   coexistence, Basic 2 needs its own instance wired to the Basic 2 cubie DOM,
   not the shared instance that targets `basic/`. Unresolved: does
   `ghostStickers` get instantiated per-view (each view owns an instance scoped
   to its root element), or does it become selector-agnostic and receive a root
   element at query time? This wiring question must be resolved before
   ghost-sticker support can ship for Basic 2.
2. **Firefox >180° known issue:** Existing bug with CSS 3D. Pivot element may be
   more robust — monitor.
3. **Smooth interrupt (Phase 2):** On interrupt, cubies snap to pre-move
   position before jumping to post-A position. Phase 2: capture current pivot
   rotation via `getComputedStyle`, apply to cubies — eliminates the position
   snap.
4. **`updateSelective` not present:** Basic 2 is a new view — `updateSelective`
   is not carried over. All move updates go through `updateCubiePositions`.
5. **Cutover decision — DECIDED: coexistence.** `basic/` and `basic-2/` will
   coexist permanently as selectable alternatives. A UI view-switching
   affordance (e.g., a toggle or menu entry in the view selector) is **in
   scope** for this feature. `basic/` is not deprecated. The motivation audience
   is users who actively switch to Basic 2.
