# Base View Ghost Stickers — Ideation

**Date:** 2026-05-01 **Focus:** Ghost hint stickers for the Base (3D) view,
visible only on hidden faces whose edges are visible **Status:** Open

## Context

The Flat view already has ghost strips — small semi-transparent sticker rows
placed outside face edges to hint at cube-adjacent faces not visually adjacent
in the T-layout. The Circular view has a similar ghost system on its axis rings.

The Base view is a 3D CSS cube (`perspective` + `preserve-3d`). At any
orientation, 3 faces are visible and 3 are hidden. The hidden faces share edges
with visible faces — these shared edges are geometrically visible as the cube's
silhouette lines. The user wants to show ghost stickers along those shared edges
to hint at the hidden face colors.

Key structural facts:

- Each face is 300×300px, positioned in 3D via CSS transforms
- `cube-blocker` elements with `backface-visibility: hidden` prevent seeing
  through
- `getVisibleFacesWithPositions()` already computes which 3 faces are
  visible/hidden
- Rotation changes which faces are visible (orientation vectors: viewRight,
  viewUp, viewForward)
- The view supports tilted (+35° Y) and pitched (+25° X) aesthetic angles

## Surviving Ideas

### 1. Edge-Hugging 3D Ghost Strips (Flat-View Pattern in 3D)

Place thin ghost strip elements as children of each face's DOM node, positioned
just beyond the face boundary in 3D space. For each shared edge between a
visible face and a hidden face, render a 1-sticker-deep row of 3 ghost stickers
on the hidden face side.

**How it works:**

- For each visible face, check which of its 4 adjacent faces is hidden
- For each such hidden face, create a ghost strip (3 stickers) on the visible
  face's edge pointing toward the hidden face
- Stickers get colors from the hidden face's edge row/column
- Use `opacity: 0.4-0.6` and slightly smaller sizing
- Hide/show with toggle command + fade animation

**Why it matters:** Direct parallel with the Flat view pattern. Users already
understand the visual language. Implementation is straightforward — position
strips using absolute positioning relative to the face div, similar to how Flat
does it.

**Trade-off:** In 3D perspective, strips on different edges will appear at
different scales/angles, which could look cluttered. The "outside the face
boundary" positioning works in 2D but in 3D the strips might overlap with
adjacent visible faces.

---

### 2. Ghost Stickers on the Hidden Faces Themselves (Partial Reveal)

Instead of strips outside visible faces, render the ghost stickers _on the
actual hidden face elements_ and make those faces partially visible through
reduced opacity on the blockers (or removing blockers entirely for hidden faces
with visible edges).

**How it works:**

- Keep visible faces fully opaque
- For hidden faces adjacent to a visible face (i.e., their shared edge is a
  silhouette edge), reduce the blocker opacity or remove the blocker
- Show only the edge-adjacent row of stickers on the hidden face (1 row of 3,
  closest to the visible face)
- Those stickers rendered at low opacity (0.3-0.5) peeking around the cube edge

**Why it matters:** This is the most spatially accurate representation — the
ghost stickers are _where the actual stickers would be_ if you could see through
the cube. Creates a genuine sense of x-ray vision.

**Trade-off:** CSS `backface-visibility` is all-or-nothing per element. Would
need to separate edge stickers from the rest of the face, or use clip-path on
the hidden face to reveal only the edge row. More complex DOM structure.

---

### 3. Projected Edge Highlights on Visible Faces

Render thin colored bars along the edges of visible faces that border hidden
faces. Each bar's color corresponds to the hidden face's sticker in that
position — essentially a 1D projection.

**How it works:**

- For each visible face, identify edges shared with hidden faces
- Along that edge, place 3 thin colored rectangles (matching the 3 stickers of
  the hidden face's adjacent row)
- Render as pseudo-elements or thin absolutely-positioned divs within the face
- Height/width ~6px, matching the Flat view ghost sticker dimensions

**Why it matters:** Minimal visual footprint. No 3D positioning complexity.
Works within the existing face DOM without new 3D elements. Very similar to how
the Flat view does it — strips sit _on_ the visible face's edge rather than
outside.

**Trade-off:** Loses the "separate layer" feel. The ghosts visually compete with
the real stickers in the same face. Might need a clear gap or different styling
(dotted border? different opacity gradient?) to distinguish from the face's own
stickers.

---

### 4. Floating Ghost Plane Between Faces (3D Sandwich)

Create a new thin plane element positioned in 3D space between two adjacent
faces — at the exact location of their shared edge. This plane shows a strip of
3 ghost stickers from the hidden face.

**How it works:**

- For each visible-hidden face pair sharing an edge, compute the 3D position of
  the shared edge
- Create a narrow (6-10px wide, 300px long) div positioned in 3D at that edge
- Fill with 3 colored cells matching the hidden face's edge stickers
- The plane faces the viewer (billboarding) or is angled to be visible from the
  current orientation

**Why it matters:** The most elegant 3D solution — ghosts live at the physical
location of the cube edge, creating a natural visual cue. They appear to "wrap
around" the edge.

**Trade-off:** Complex 3D transform math. Needs to update position when the cube
rotates. May have z-fighting with face edges. Requires computing proper
transform for each of the 12 possible cube edges based on current orientation.

---

### 5. Selective Backface Reveal with Clip-Path

Make hidden faces fully transparent except for a clip-path that reveals only the
edge row (3 stickers deep). The hidden face's stickers show through at reduced
opacity.

**How it works:**

- Each face already has `backface-visibility: hidden` on its blocker
- For hidden faces with visible shared edges: conditionally show the face div
  but apply a CSS `clip-path: inset(...)` that reveals only the edge-adjacent
  row
- The revealed row appears at 0.4 opacity
- Update clip-path direction based on which edge is shared with a visible face

**Why it matters:** Uses the existing face structure — no new DOM elements
needed beyond toggling classes. The stickers are already rendered; we just need
to make them partially visible. Updates automatically with cube state because
they _are_ the real face elements.

**Trade-off:** A face can share edges with up to 3 visible faces simultaneously,
requiring complex clip-path geometry (multiple insets merged). The perspective
distortion makes back-facing content small/inverted which may look odd.

---

### 6. Fretting-Style Edge Indicators (Colored Dots or Pips)

Instead of full sticker representations, place small colored dots/pips at each
edge intersection point. Each pip corresponds to one sticker on the hidden
face's edge.

**How it works:**

- Place 3 small circular indicators (4-6px) along each silhouette edge
- Color matches the hidden face sticker at that position
- Position using absolute coords on the cube-container (2D overlay), projecting
  3D edge positions to screen space
- Update positions on rotation

**Why it matters:** Extremely lightweight. No 3D DOM complexity. The "fretting"
concept already exists in this codebase. Minimal visual clutter while still
conveying color information.

**Trade-off:** Requires projecting 3D points to 2D screen coordinates (or using
the CSS perspective math). Pips may be too small to read colors clearly. Less
discoverable than strip-style ghosts.

---

## Rejected Ideas

| Idea                                                     | Rejection Reason                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Full semi-transparent hidden faces                       | Too much visual noise — showing all 9 stickers of each hidden face overwhelms the 3D view |
| Tooltip-on-hover per edge                                | Not always-visible; defeats the "ghost hint" purpose of being persistently scannable      |
| Unfolding animation that temporarily reveals hidden face | Breaks the 3D metaphor; essentially switches to Flat view temporarily                     |
| Color-coded edge outlines (single color per face)        | Loses per-sticker information — user can't see individual sticker colors                  |

## Dimensions Covered

- **Visual treatment**: strips, partial face reveal, edge bars, floating planes,
  dots
- **Positioning strategy**: on visible face, on hidden face, between faces, 2D
  overlay
- **DOM complexity**: from zero new elements (clip-path) to new 3D planes
- **Update strategy**: static per orientation vs. dynamic projection

## Recommendation

Ideas 1 and 3 are the lowest-complexity options that closely follow the
established Flat view pattern. Idea 2/5 (partial face reveal) is the most
elegant conceptually but has CSS challenges. Idea 4 is the most "correct"
geometrically but has the highest implementation complexity.

**Suggested next step:** Brainstorm one of these approaches to define exact
requirements.
