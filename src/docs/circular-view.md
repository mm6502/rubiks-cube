# Circular View - Implementation Documentation

## Overview

The Circular View displays the Rubik's Cube state using a conceptual SVG
representation based on three sets of concentric circles representing the X, Y,
and Z axes. Each sticker is positioned at the intersection of two axis circles,
creating a unique coordinate-based visualization.

## SVG Structure

### Axis Circles

The SVG contains three sets of concentric circles, one for each spatial axis:

- **X-axis circles**: `x-layer-0`, `x-layer-1`, `x-layer-2`
- **Y-axis circles**: `y-layer-0`, `y-layer-1`, `y-layer-2`
- **Z-axis circles**: `z-layer-0`, `z-layer-1`, `z-layer-2`

Each circle's layer number directly corresponds to a cube coordinate:

- Layer 0 = coordinate 0
- Layer 1 = coordinate 1
- Layer 2 = coordinate 2

### Sticker Elements

Each sticker is represented by a `<circle>` element with:

- `class="sticker"` for identification
- `id="sticker-{FACE}-{POSITION}"` format
- `cx` and `cy` attributes defining its center position

The face labels in the SVG IDs directly correspond to the cube model face names
(see Face Mapping section below).

## Coordinate System Mapping

### Circle Intersection Logic

Each sticker lies at the intersection of exactly **two axis circles**. The
intersection determines the sticker's cube position:

1. **Parse axis circles**: Extract center coordinates (cx, cy) and radius (r)
   for each layer circle
2. **Check intersections**: For each sticker, determine which two axis circles
   it lies on by testing if the sticker's position is within tolerance of the
   circle's radius
3. **Derive coordinates**: The two intersecting circles give two coordinates;
   the third coordinate is determined by the face

### Coordinate Patterns

Based on which axis is **not** represented (null) in the intersection:

- **x is null** (sticker on y and z circles) → Face is **L** (x=0) or **R**
  (x=2)
- **y is null** (sticker on x and z circles) → Face is **D** (y=0) or **U**
  (y=2)
- **z is null** (sticker on x and y circles) → Face is **F** (z=0) or **B**
  (z=2)

### Example Mappings

**Corner cubie at position (0,0,0)**:

- F face sticker: intersects x-layer-0 and y-layer-0 circles (z=0 constant)
- L face sticker: intersects y-layer-0 and z-layer-0 circles (x=0 constant)
- D face sticker: intersects x-layer-0 and z-layer-0 circles (y=0 constant)

**Corner cubie at position (2,2,2)**:

- R face sticker: intersects y-layer-2 and z-layer-2 circles (x=2 constant)
- B face sticker: intersects x-layer-2 and y-layer-2 circles (z=2 constant)
- U face sticker: intersects x-layer-2 and z-layer-2 circles (y=2 constant)

## Face Mapping

### SVG Label to Cube Model Face Conversion

The SVG uses face labels that directly match the standard cube model naming:

| SVG Label | Cube Model Face | Coordinate | Axis Pattern         |
| --------- | --------------- | ---------- | -------------------- |
| `L`       | **L** (Left)    | x=0        | y,z defined (x null) |
| `R`       | **R** (Right)   | x=2        | y,z defined (x null) |
| `D`       | **D** (Down)    | y=0        | x,z defined (y null) |
| `U`       | **U** (Up)      | y=2        | x,z defined (y null) |
| `F`       | **F** (Front)   | z=0        | x,y defined (z null) |
| `B`       | **B** (Back)    | z=2        | x,y defined (z null) |

This mapping is implemented in the `svgToCubeMapping()` function.

## Runtime Initialization

### Build Process

The sticker lookup map is built at runtime by parsing the SVG:

1. **`parseAxisCircles()`**: Extract all axis circle elements and their geometry
2. **`computeAxisCoords()`**: For each sticker, determine which axis circles it
   intersects
3. **`svgToCubeMapping()`**: Convert SVG face label + axis coords → cube
   position + cube face
4. **`buildStickerLookupMap()`**: Create a map structure:
   `position → face → SVG element ID`

### Lookup Map Structure

```typescript
Map<{PositionKey, Map<Face, svgElementId>>;
```

Where:

- `PositionKey` = `pos_x_y_z` string (e.g., `pos_0_0_0`, `pos_2_1_1`)
- `Face` = Cube model face enum (U, D, F, B, L, R)
- `svgElementId` = SVG element ID (e.g., `sticker-R-0`)

This allows O(1) lookup: given a cube cubie at position (x,y,z) with a sticker
on face F, quickly find which SVG element to update.

## Rendering Updates

### Initial Rendering

`renderState()` iterates through all cubies in the cube state:

1. Get cubie position (x, y, z)
2. For each sticker on the cubie:
   - Look up SVG element ID using position + face
   - Determine sticker color from cube state
   - Update SVG element's `fill` attribute

### Selective Updates (Move-based)

`updateSelective()` optimizes updates after a move:

1. Extract moved cubies from the move event
2. Only update SVG elements for stickers on moved cubies
3. Same lookup process but limited to affected cubies

## Future Enhancements

### Animation System

The circular view is designed to support animations in the future:

- **Face stickers** (those at constant coordinate): Rotate in place around the
  face center
- **Adjacent layer stickers**: Rotate along the appropriate axis circle path
  during moves

The axis circle geometry is already available for computing rotation arcs.

### Configuration

Potential configurable options:

- Animation duration and easing
- Circle stroke styles and colors
- Sticker size and appearance
- Tolerance for intersection detection

## Touch and Mouse Interaction

All pointer input (mouse and touch) for move gestures is handled by
`CircularTouchHandler`. Pan/zoom is kept in `ZoomPanController` (triggered by
middle-mouse, Ctrl+drag, or two-finger drag). Left-button/single-touch drags on
interactive elements are forwarded to the touch handler.

### Hit Testing

`getInteractionStart()` classifies the event target:

| Priority | Element pattern                   | Kind           |
| -------- | --------------------------------- | -------------- |
| 1        | Halo element                      | `HALO`         |
| 2        | `.sticker` with `data-sticker-id` | `STICKER`      |
| 3        | `{face}-face-ellipse`             | `FACE_ELLIPSE` |
| 4        | Axis circle by `id`               | `AXIS_CIRCLE`  |
| 5        | Everything else                   | `BACKGROUND`   |

### Sticker Drag → Move

When a drag starts on a sticker the handler pre-computes all four possible moves
at pointer-down time using the **face-local basis** at that point:

1. **Basis derivation**: `buildCrossingBasisAtPoint()` finds the two axis
   circles nearest to the sticker's SVG position and computes their local
   tangents — one tangent becomes `upDir`, the other `rightDir`. Falls back to
   static `FACE_TOP_DIRECTION_HINTS` when the sticker is too far from any
   crossing.
2. **Move pre-computation**: `inferMoveFromDrag()` is called once for each of
   the four cardinal directions (up / down / left / right) using the live
   sticker face, row, and column resolved from the current `CubeState`. All four
   resulting WCA notation strings are cached in `pendingStickerCross`.
3. **Zone inference**: On gesture commit, the raw SVG delta vector is dotted
   against `upDir` and `rightDir`. The dominant component selects `upMove` /
   `downMove` / `rightMove` / `leftMove` respectively.

Sticker face / row / col are resolved from the live `CubeState` (not from SVG
attributes) so they reflect the current scrambled state. The lookup uses
`CubeStateUtils.getStickerById` keyed on the `data-sticker-id` attribute.

### Visual Cross Hint

On pointer-down on a sticker, a semi-transparent dashed cross is drawn centred
on the touch point. The arms are the **zone boundaries** (bisectors between
adjacent drag directions), so the centre of each sector aligns with a
circle-tangent drag direction. Arm length is `34 SVG units` in floating mode and
`64 SVG units` in tab mode (large enough to avoid finger obstruction on touch).

The cross is hidden immediately on pointer-up or cancel.

### Face Selection (Halo)

Tapping a sticker or face ellipse toggles face selection. When a face is
selected:

- An SVG ellipse halo ring is shown around it.
- A transparent overlay ellipse absorbs pointer-events so that dragging anywhere
  on the selected face triggers halo rotation, not a sticker move.
- Dragging the halo uses angular displacement (atan2) to decide CW/CCW face
  rotation.

### Axis Circle Multi-Select and Drag

- **Tap**: toggles selection of an axis circle (CSS class
  `circular-axis-selected`). Tapping a circle from a different axis clears the
  previous selection.
- **Swipe-through**: drag ≈ 0 angular displacement from start circle to a
  different circle — selects both.
- **Drag on selected circle**: rotates all co-selected circles with the same
  CW/CCW flag. If all three layers of one axis are selected an equivalent
  whole-cube notation (`x`/`x'`) is emitted instead of three individual moves.
- **Tap elsewhere** (background/sticker/face ellipse): clears all axis circle
  selections.

### Background Drag → Whole-Cube Rotation

The SVG plane is divided into three sectors, one per axis, by Voronoi proximity
to the three axis circle centres:

| Sector centre (approx SVG coords) | Whole-cube move |
| --------------------------------- | --------------- |
| Y `(200, 132)` — top              | `y` / `y'`      |
| X `(250, 219)` — lower-right      | `x` / `x'`      |
| Z `(150, 219)` — lower-left       | `z` / `z'`      |

CW/CCW is resolved from the 2D cross product of the vector from the nearest axis
centre to the drag start point and the normalised drag vector.

### Face-Direct Mode

When `setFaceDirectMode(true)` is active, dragging on any sticker or face
ellipse immediately rotates that face without requiring prior face selection.
The face is temporarily activated for the duration of the gesture and the
previous selection is restored afterward.

### Interaction Adapter

`createCircularInteractionAdapter()` returns a `ViewInteractionAdapter` that
encapsulates all circular-view-specific inference (axis notation, whole-cube
notation, face direction mapping). The handler calls the adapter for non-sticker
paths so the inference logic can be tested and overridden independently.

## Related Files

- `src/views/circular/index.ts` - View entry point and registration
- `src/views/circular/circular-view.ts` - Main view class
- `src/views/circular/circular-touch-handler.ts` - All pointer/touch interaction
- `src/views/circular/zoom-pan.ts` - Pan and zoom (delegates move gestures to
  touch handler)
- `src/views/circular/initialization.ts` - SVG parsing and sticker lookup map
  construction
- `src/views/circular/rendering.ts` - State rendering and selective updates
- `src/views/circular/svg-tools.ts` - Coordinate mapping and intersection logic
- `src/views/circular/animations.ts` - Move animation support
- `src/views/circular/highlights.ts` - Sticker highlight management
- `src/views/circular/keyboard-cube-walking.ts` - Keyboard navigation
- `src/views/circular/view.svg` - SVG asset with axis circles and stickers
- `src/interaction/move-inference.ts` - Face/row/col → WCA notation inference
- `src/interaction/drag-state-machine.ts` - Generic gesture recogniser
- `src/cube/types/` - Cube state and cubie type definitions
