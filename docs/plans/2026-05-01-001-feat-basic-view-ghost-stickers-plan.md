---
title: 'feat: Add ghost hint stickers to Basic (3D) view'
type: feat
status: active
date: 2026-05-01
origin: docs/brainstorms/basic-view-ghost-stickers-requirements.md
---

# feat: Add ghost hint stickers to Basic (3D) view

## Overview

Add semi-transparent ghost sticker strips along outer silhouette edges of the
Basic 3D cube view, revealing colors of hidden faces. Strips are placed just
outside visible face boundaries (Flat-view style). Toggle is shared between both
basic-front and basic-back variants. Strips update live during rotation with
per-edge fade transitions.

## Problem Frame

The 3D cube shows only 3 faces at a time. Users cannot see the colors on the 3
hidden faces without rotating. Ghost stickers provide at-a-glance color hints
for hidden faces, matching the established pattern in Flat and Circular views.
(see origin: `docs/brainstorms/basic-view-ghost-stickers-requirements.md`)

## Requirements Trace

- R1. Ghost strips appear only on outer silhouette edges (visible→hidden face
  boundary)
- R2. External strips: 3 stickers, positioned outside visible face edge, ~6px
  deep, opacity 0.4-0.6
- R3. Shared toggle command `basic-view.ghost-hints` for both variants (👻,
  Ctrl+4)
- R4. Off by default, persisted in `BasicViewState`
- R5. Live update during manual rotation — strips appear/disappear per-edge with
  fade transitions
- R6. Colors update on cube state change (moves executed)
- R7. Ghosts are `pointer-events: none`, `aria-hidden: true`

## Scope Boundaries

- No floating 3D planes at cube edges (Idea 4 — future enhancement)
- No ghost interaction (click, hover)
- No face-mode navigation through ghosts
- Interior creases between two visible faces do NOT get strips

## Context & Research

### Relevant Code and Patterns

- `src/views/flat/ghost-strips.ts` — direct pattern to follow (GhostStrips
  class, `GHOST_EDGES` data, `create()`, `updateColors()`, `toggle()`,
  `setVisible()`)
- `src/views/flat/ghost-strips.module.css` — styling pattern (strip positioning,
  sticker opacity, transitions)
- `src/views/basic/rendering.ts` — `getVisibleFacesWithPositions()` provides
  visible/hidden face classification
- `src/views/basic/commands.ts` — `getBasicViewCommands()` for adding the toggle
  command
- `src/views/basic/basic-view.ts` — `BasicViewState` interface and
  `getState()`/`setState()` for persistence

### Key Structural Facts

- Each face is a 300×300px div with CSS 3D transforms (`front`, `back`, `right`,
  `left`, `top`, `bottom`)
- Face elements are children of `.cube` which has `transform-style: preserve-3d`
- `cube-blocker` elements prevent seeing through hidden faces
- The cube has 12 edges; at standard orientation, ~5-7 are silhouette edges
- Cube adjacency: each face has 4 neighbors. Two faces share an edge when they
  are physically adjacent on the cube (F↔U, F↔R, F↔D, F↔L, etc.)

## Key Technical Decisions

- **Strips as children of visible face divs:** Strips are positioned via
  absolute CSS relative to the face that owns them. They inherit the face's 3D
  transform, so no manual 3D math needed. A small `translateZ(1px)` pushes them
  toward the viewer to avoid z-fighting.
- **Edge detection via position slot analysis:** Rather than hardcoding
  adjacency for every orientation, derive silhouette edges by checking which of
  a visible face's 4 cube-adjacent neighbors are in the hidden set.
  `getVisibleFacesWithPositions()` already provides both sets.
- **Separate module (like Flat view):** Ghost logic lives in its own
  `ghost-stickers.ts` + `ghost-stickers.module.css` files, keeping the main view
  clean.
- **Shared state via module-level flag:** Both basic-front and basic-back read
  the same ghost visibility state (similar to how `linked-rotations.ts` shares
  state). One command toggles it for both.
- **Sticker source mapping derived dynamically:** Unlike Flat view's static
  `GHOST_EDGES` table, the 3D view must compute which stickers to show based on
  current orientation. The module maintains a cube-edge adjacency map (static,
  12 entries) and filters it per-orientation.

## Open Questions

### Resolved During Planning

- **How to determine "outer silhouette" vs "interior crease"?** An edge is a
  silhouette edge when exactly one of its two adjacent faces is visible and the
  other is hidden. Interior creases have both faces visible. The classification
  from `getVisibleFacesWithPositions()` gives us exactly this.
- **How to handle the sticker position mapping for arbitrary orientations?**
  Define a static `CUBE_EDGE_MAP` with all 12 edges: for each edge, store the
  two faces and which row/column of stickers sits along that shared boundary. At
  runtime, filter to edges where one face is visible and the other hidden, then
  render the hidden face's sticker row.
- **Where does the strip element attach?** To the visible face's DOM element
  (the `.face` div, not the blocker). Positioned with `position: absolute` at
  the appropriate edge.

### Deferred to Implementation

- Exact `translateZ` offset value (1px vs 2px) — tune visually
- Whether strips at extreme perspective angles need additional opacity reduction
- Exact sticker border radius and gap values — derive from Flat ghost styling

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should treat
> it as context, not code to reproduce._

```
CUBE_EDGE_MAP (static, 12 entries):
  Each entry: { faceA, faceB, edgeOnA: top|bottom|left|right, edgeOnB: top|bottom|left|right,
                stickerPositionsA: [3 indices], stickerPositionsB: [3 indices] }

Per render cycle (after rotation):
  1. Get { visibleFaces, hiddenFaces } from getVisibleFacesWithPositions()
  2. visibleSet = Set(visibleFaces.map(f => f.face))
  3. hiddenSet = Set(hiddenFaces.map(f => f.face))
  4. For each edge in CUBE_EDGE_MAP:
       if edge.faceA in visibleSet AND edge.faceB in hiddenSet:
         → show ghost strip on faceA's edge.edgeOnA with colors from faceB's stickerPositionsB
       elif edge.faceB in visibleSet AND edge.faceA in hiddenSet:
         → show ghost strip on faceB's edge.edgeOnB with colors from faceA's stickerPositionsA
       else:
         → hide this edge's ghost strip
  5. Fade in newly-visible strips, fade out newly-hidden strips
```

## Implementation Units

- [ ] **Unit 1: Ghost stickers module — data model and DOM creation**

**Goal:** Create the `GhostStickers` class with the static cube-edge adjacency
map, DOM creation, and color sync logic.

**Requirements:** R1, R2, R6, R7

**Dependencies:** None

**Files:**

- Create: `src/views/basic/ghost-stickers.ts`
- Create: `src/views/basic/ghost-stickers.module.css`
- Test: `src/views/basic/ghost-stickers.test.ts`

**Approach:**

- Define `CUBE_EDGE_MAP` — 12 entries covering all face pairs that share a
  physical cube edge. Each entry stores which edge (top/bottom/left/right) it
  corresponds to on each face, plus the 3 sticker indices along that edge for
  each face.
- `GhostStickers` class with public API matching Flat view's pattern:
  `create()`, `updateColors()`, `updateVisibleEdges(visibleFaces, hiddenFaces)`,
  `toggle()`, `isVisible()`, `getShowGhosts()`, `setShowGhosts(boolean)`,
  `setVisible(visible, animate?)`
- `create()` builds 12 ghost strip elements (one per edge), each with 3 sticker
  children. All start hidden. Attaches each strip to the appropriate face
  element.
- `updateVisibleEdges()` takes the visible/hidden face sets and shows/hides
  strips accordingly with per-edge fade.
- `updateColors()` reads sticker background colors from the DOM and copies to
  ghost elements.
- Strip elements get `data-edge`, `data-source-face`, `data-source-pos`
  attributes (matching Flat pattern).

**Patterns to follow:**

- `src/views/flat/ghost-strips.ts` — class structure, DOM creation, color sync
- `src/views/flat/ghost-strips.module.css` — CSS positioning and opacity

**Test scenarios:**

- Happy path: `CUBE_EDGE_MAP` contains exactly 12 entries covering all face
  adjacencies
- Happy path: `create()` generates 12 strip elements, each with 3 sticker
  children
- Happy path: `updateVisibleEdges()` with default orientation shows strips only
  on silhouette edges (visible face → hidden face boundary)
- Happy path: `updateColors()` copies correct source sticker colors to ghost
  elements
- Edge case: `updateVisibleEdges()` with all faces in visible set → no strips
  shown
- Edge case: `updateColors()` when ghosts are hidden → no-op (skip color reads)
- Integration: `toggle()` flips visibility state and triggers setVisible with
  animation

**Verification:**

- All 12 cube edges are represented in the map
- Ghost strips render only on edges between visible and hidden faces
- Color sync pulls from correct source stickers

---

- [ ] **Unit 2: CSS styling for ghost strips in 3D**

**Goal:** Style the ghost strips for 3D context — positioning, opacity,
transitions, `translateZ` offset.

**Requirements:** R2, R5, R7

**Dependencies:** Unit 1

**Files:**

- Modify: `src/views/basic/ghost-stickers.module.css`

**Approach:**

- Position strips using `position: absolute` with `top: 100%` / `bottom: 100%` /
  `left: 100%` / `right: 100%` for each edge direction
- Add `transform: translateZ(1px)` to push strips toward viewer
- Sticker cells: `opacity: 0.5`, `height: 6px` (horizontal edges) or
  `width: 6px` (vertical edges)
- Fade transition: `opacity 0.3s ease` on individual stickers, `display` toggle
  on strips
- `pointer-events: none` on strip container
- Border and border-radius matching Flat ghost sticker style

**Patterns to follow:**

- `src/views/flat/ghost-strips.module.css` — dimension, opacity, transition
  timing

**Test expectation:** none — pure CSS styling, verified visually

**Verification:**

- Strips are visible at cube edges in the browser
- No z-fighting with adjacent faces
- Strips fade smoothly on toggle and rotation change

---

- [ ] **Unit 3: Integration with BasicView — lifecycle and commands**

**Goal:** Wire `GhostStickers` into `BasicView` lifecycle (create, update,
rotation, state persistence) and add the toggle command.

**Requirements:** R3, R4, R5, R6

**Dependencies:** Unit 1, Unit 2

**Files:**

- Modify: `src/views/basic/basic-view.ts`
- Modify: `src/views/basic/commands.ts`
- Modify: `src/views/basic/rendering.ts`
- Test: `src/views/basic/basic-view.core.test.ts`
- Test: `src/views/basic/basic-view.commands.test.ts`

**Approach:**

- Add `showGhosts: boolean` to `BasicViewState` interface (default `false`)
- In `create()`: instantiate `GhostStickers`, call `create()`, then
  `updateVisibleEdges()`
- In `update()` / `updateSelective()`: call `ghostStickers.updateColors()`
- After every rotation change (in the `onViewRotated` callback and the rotation
  commands): call
  `ghostStickers.updateVisibleEdges(getVisibleFacesWithPositions(state))`
- In `getState()` / `setState()`: persist/restore `showGhosts`
- Add `basic-view.ghost-hints` command in `commands.ts` — toggles ghost state,
  emits `VIEW_STATE_CHANGED`
- Shared toggle: use a module-level variable (like `linked-rotations.ts`) so
  both variants read the same state. One command ID for both.

**Patterns to follow:**

- `src/views/flat/flat-view.ts` — ghostStrips integration (create in `create()`,
  updateColors in `update()`)
- `src/views/basic/linked-rotations.ts` — shared state between variants
- `src/views/flat/commands.ts` lines 168-183 — ghost hints command shape

**Test scenarios:**

- Happy path: `basic-view.ghost-hints` command exists in getCommands() output
- Happy path: command toggle flips ghost visibility and emits VIEW_STATE_CHANGED
- Happy path: ghost state persists via getState()/setState() roundtrip
- Happy path: ghosts update on rotation (visible edges change after
  rotateViewLeft)
- Happy path: ghosts update colors after move executed
- Edge case: default state is off (ghosts not visible on first create)
- Integration: both basic-front and basic-back share toggle state — toggling on
  one affects both

**Verification:**

- Ghost command appears in header toolbar
- Toggling shows/hides ghost strips
- Rotating the cube live-updates which edges have strips
- State survives view recreation

---

- [ ] **Unit 4: Per-edge fade transitions on rotation**

**Goal:** Implement smooth per-edge fade in/out when strips appear or disappear
due to orientation change.

**Requirements:** R5

**Dependencies:** Unit 3

**Files:**

- Modify: `src/views/basic/ghost-stickers.ts`
- Test: `src/views/basic/ghost-stickers.test.ts`

**Approach:**

- Track previously-visible edge set. On `updateVisibleEdges()`, diff against new
  set.
- Newly-visible strips: set `display: ''`, then animate opacity from 0 to target
  (0.5)
- Newly-hidden strips: animate opacity to 0, then set `display: none` after
  transition
- Use CSS transitions (matching Flat view's `transitionend` + timeout fallback
  pattern)
- During rapid rotation, cancel in-flight transitions and snap to final state

**Patterns to follow:**

- `src/views/flat/ghost-strips.ts` `setVisible()` — the show/hide with
  transitionend + timeout fallback

**Test scenarios:**

- Happy path: newly-visible strips fade in (opacity transitions from 0 to 0.5)
- Happy path: newly-hidden strips fade out then hide
- Edge case: rapid rotation (multiple updates within transition duration) — no
  stuck strips
- Edge case: strips that remain visible across rotation keep their current state
  (no flicker)

**Verification:**

- Strips fade smoothly per-edge during rotation
- No visual glitches during rapid rotation
- Already-visible strips are not re-animated

## System-Wide Impact

- **Interaction graph:** Ghost toggle emits `VIEW_STATE_CHANGED` → picked up by
  state persistence. Rotation callbacks already exist — ghosts hook into the
  same `onViewRotated` callback. No new events needed.
- **Error propagation:** Ghost failures are non-critical — if a face element is
  missing, skip that edge (matching Flat view's `if (!faceEl) continue`
  pattern).
- **State lifecycle risks:** Shared state between variants means toggling in one
  view while the other is not yet created is safe (module-level flag, lazy DOM
  creation on `create()`).
- **API surface parity:** Both basic-front and basic-back get ghosts via the
  shared module. No other views affected.
- **Integration coverage:** Rotation → ghost edge update → color sync chain
  should be tested end-to-end.
- **Unchanged invariants:** Sticker selection, keyboard navigation, face labels,
  touch handling, and linked rotations are unaffected. Ghost elements are
  `pointer-events: none` and `aria-hidden`.

## Risks & Dependencies

| Risk                                                                    | Mitigation                                                                                         |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Z-fighting at face edges in certain perspective angles                  | `translateZ(1px)` offset; tune visually if needed                                                  |
| Strips too foreshortened at steep angles to be readable                 | Accept — this is inherent to 3D perspective; Idea 4 (floating planes) would fix this in the future |
| Performance during rapid rotation (12 strips × 3 stickers × transition) | Use CSS transitions (GPU-accelerated); limit to opacity only                                       |
| Sticker position mapping complexity for all orientations                | Static CUBE_EDGE_MAP handles all 12 edges regardless of orientation; no dynamic computation needed |

## Sources & References

- **Origin document:**
  [docs/brainstorms/basic-view-ghost-stickers-requirements.md](docs/brainstorms/basic-view-ghost-stickers-requirements.md)
- Related code: `src/views/flat/ghost-strips.ts`, `src/views/basic/rendering.ts`
- Related ideation: `docs/ideation/base-view-ghost-stickers-2026-05-01.md`
