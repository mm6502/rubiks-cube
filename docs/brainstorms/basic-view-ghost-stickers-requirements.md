# Basic View Ghost Stickers

**Date:** 2026-05-01 **Status:** Ready for planning **Scope:** Standard

## Summary

Add ghost hint stickers to the Basic (3D) view — semi-transparent sticker strips
along outer silhouette edges that reveal colors of hidden faces. Follows the
established Flat view ghost strip pattern adapted for 3D perspective.

## Requirements

### Which edges get ghosts

- Only **outer silhouette edges** — edges that form the cube's visible outline
  where a visible face meets a hidden face
- Interior creases between two visible faces do NOT get ghost strips
- At any standard orientation there are typically 5-7 such edges (3 hidden faces
  × ~2 silhouette edges each, minus shared corners)

### Visual treatment

- External strips placed just outside the visible face boundary, toward the
  hidden face (Flat-view style)
- Strip = 3 stickers (one per row/column along the shared edge)
- Sticker colors copied from the adjacent hidden face's edge row/column
- Opacity ~0.4-0.6, thin depth (~6px), with border matching Flat ghost sticker
  styling
- Strips are children of the visible face element, positioned via absolute CSS
  (`top: -6px`, `left: 100%`, etc. depending on edge direction)
- Small `translateZ` offset (1-2px toward viewer) to avoid z-fighting at face
  junctions

### Toggle command

- Command ID: `basic-view.ghost-hints` (shared by both basic-front and
  basic-back variants)
- Same icon, label, tooltip pattern as `flat.ghost-hints`
- Icon: 👻, Label: "Ghost Hints"
- Key binding: `Ctrl+4` (matching Flat view convention)
- Toggle state shared between both Basic view variants (front + back)
- Separate from Flat and Circular ghost toggles

### Default state and persistence

- **Off** by default on first load
- Persisted in `BasicViewState` (survives view recreation, like
  `isTilted`/`isPitched`)
- State emits `VIEW_STATE_CHANGED` on toggle

### Live update during rotation

- Ghost strips update in real-time during manual cube rotation (drag)
- As the cube rotates and different faces become visible/hidden, strips
  appear/disappear on the new silhouette edges
- Per-edge fade transitions when strips appear or disappear due to rotation
  changes

### Animation

- **Toggle ON:** fade in all current silhouette-edge strips
- **Toggle OFF:** fade out all strips
- **Rotation change:** individual strips fade in/out as their edge
  becomes/leaves the silhouette set
- Transition duration: ~300-400ms (matching existing ghost animations)

### Color updates

- Ghost sticker colors update when cube state changes (moves executed)
- Follow same pattern as `GhostStrips.updateColors()` in Flat view — read source
  sticker background color and apply to ghost element

## Non-goals

- Idea 4 (floating ghost planes at cube edges) — deferred as potential future
  enhancement
- Ghost interaction (clicking/hovering ghosts) — ghosts are
  `pointer-events: none`
- Ghost stickers for face-mode navigation — out of scope

## Edge cases

- When cube is perfectly face-on (one face directly facing viewer): only that
  face is "fully visible," the 4 adjacent faces are at 90° (edge-on). Decision:
  treat edge-on faces as hidden — their stickers are not readable, so ghost
  strips on the silhouette help.
- Pitched/tilted angles: `getVisibleFacesWithPositions()` already accounts for
  these states, so ghost edge computation inherits correct visible/hidden
  classification.

## Dependencies

- `getVisibleFacesWithPositions()` in `src/views/basic/rendering.ts` — provides
  visible/hidden face data
- Cube adjacency mapping (which faces share which edges and sticker position
  mapping) — same logic as Flat view's `GHOST_EDGES` but generalized for any
  orientation

## Future enhancement (Idea 4)

Floating 3D ghost planes positioned at the actual geometric edge between faces.
Would replace external strips with elements that sit in 3D space at the 90°
crease. More geometrically correct but requires precomputing 12 edge transforms.
Could be a v2 upgrade if the strip approach feels too "flat" in perspective.
