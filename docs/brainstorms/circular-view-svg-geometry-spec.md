---
date: 2026-05-08
topic: circular-view-svg-geometry-spec
status: draft
---

# Circular View — SVG Geometry Spec

## Purpose

This document captures the geometric invariants and constraints that a valid
Circular view SVG must satisfy for any cube size N. It is not a generator
implementation — it describes **what must hold** so that:

1. A future generator script can be validated against these rules.
2. A developer building the generator has a precise model to implement.
3. The constraints are explicit rather than implicitly encoded in the size-3
   SVG.

Ghost stickers are excluded — their placement requires design judgment ("which
side of the gap") beyond pure geometric derivation.

---

## Structural Overview

The Circular view represents a Rubik's cube as three sets of N concentric
circles ("rings"), one set per axis (X, Y, Z). The three sets are arranged so
their centers form an equilateral triangle. A sticker at cube position
`(x, y, z)` on face F is represented by an SVG circle placed at the geometric
intersection of exactly two rings — one from each of the two axes that are
**not** F's axis.

**Face–axis ownership:**

| Face | "Missing" axis (face axis) | Two ring axes that determine position |
| ---- | -------------------------- | ------------------------------------- |
| L, R | X                          | Y, Z                                  |
| D, U | Y                          | X, Z                                  |
| F, B | Z                          | X, Y                                  |

A sticker on face R at cube position `(cubeSize-1, y, z)` lies on Y-ring y and
Z-ring z, and does **not** lie on any X-ring.

---

## Free Parameters

A valid size-N SVG is fully determined by choosing five scalar parameters:

| Parameter         | Symbol  | Description                                                    |
| ----------------- | ------- | -------------------------------------------------------------- |
| Triangle side     | `d`     | Distance between any two axis centers                          |
| Inner ring radius | `r_min` | Radius of the innermost ring (layer 0)                         |
| Ring step         | `Δr`    | Radius increment between consecutive rings                     |
| Sticker radius    | `r_s`   | Visual radius of sticker `<circle>` elements                   |
| ViewBox           | —       | Overall canvas dimensions (not constrained by the rules below) |

From these, the outer ring radius follows:

$$r_{max} = r_{min} + (N-1) \cdot \Delta r$$

---

## Geometric Invariants

### I1 — Equilateral triangle

The three axis centers $C_X$, $C_Y$, $C_Z$ form an equilateral triangle with
side $d$. The canonical orientation used in `view.svg`:

- Z and X are on a horizontal baseline, $d$ apart:
  $C_Z = (\text{cx} - d/2,\ \text{cy})$, $C_X = (\text{cx} + d/2,\ \text{cy})$
- Y is at the apex: $C_Y = (\text{cx},\ \text{cy} - d \cdot \frac{\sqrt{3}}{2})$

The 3-fold rotational symmetry ensures all six faces are geometrically
equivalent (rotated 120° or reflected).

### I2 — All ring pairs intersect

Every ring from axis A must intersect every ring from axis B (for all axis pairs
A≠B). This is required because every $(a, b)$ layer combination corresponds to
exactly one sticker on the corresponding face pair.

For two circles of radii $r_k$ and $r_j$ with centers at distance $d$, they
intersect iff:

$$|r_k - r_j| < d < r_k + r_j$$

The two critical edge cases (tightest constraints) are:

- **Both inner rings:** $0 < d < 2 \cdot r_{min}$ → simplifies to
  $d < 2 \cdot r_{min}$
- **Inner ring vs outer ring:** $(N-1)\cdot\Delta r < d$ →
  $d > (N-1)\cdot\Delta r$

Combined necessary condition:

$$\boxed{(N-1)\cdot\Delta r < d < 2 \cdot r_{min}}$$

This is the primary sizing constraint — it bounds `d` from both sides and links
all three parameters.

### I3 — No accidental third-axis intersections

A sticker at the intersection of A-ring $k$ and B-ring $j$ must **not** lie on
any ring of axis C. If it did, `computeAxisCoords` would return three non-null
axis values and `svgToCubeMapping` would emit `Invalid axis coordinates`.

This is automatically satisfied by the equilateral triangle geometry when
parameters are chosen symmetrically — by symmetry, the intersection points of
A-rings and B-rings lie at distances from $C_C$ that do not equal any
$r_{min} + i \cdot \Delta r$.

In practice: verify by computing all $N^2 \times 3$ intersection points and
checking their distances from the third center against all ring radii with a
tolerance margin equal to the `isPointOnCircle` tolerance used in
`svg-tools.ts`.

### I4 — Sticker clearance

Adjacent stickers on the same face must not visually overlap. The minimum
distance between any two sticker centers on the same face must exceed
$2 \cdot r_s$.

Adjacent sticker pairs are those that differ by one layer index on one axis:
$(k, j)$ vs $(k+1, j)$ and $(k, j)$ vs $(k, j+1)$. The closest pairs are those
where both ring indices differ (diagonal neighbors): $(k, j)$ vs $(k+1, j+1)$.

The minimum clearance condition:

$$\min_{k,j} \text{dist}(P_{k,j},\ P_{k\pm1,j}) > 2 \cdot r_s$$

where $P_{k,j}$ is the intersection point of A-ring $k$ and B-ring $j$ that
falls on the correct side (inside the face region, see §Face Regions).

There is no closed-form minimum — it must be verified numerically for the chosen
$(d, r_{min}, \Delta r)$.

### I5 — Sticker–ring gap

Stickers should not visually overlap with the rings of their "face axis" — the
axis whose rings they do not lie on. A sticker on face R (X-axis is missing)
sits between X-rings. The gap between consecutive X-rings at the sticker's
radial distance is $\Delta r$. The sticker must fit within a ring gap:

$$2 \cdot r_s < \Delta r$$

This is the primary lower bound on $\Delta r$, and the primary upper bound comes
from I2.

---

## Intersection Point Selection

For a given face (say, face R: Y-axis missing), stickers sit at intersections of
Z-ring $z$ and X-ring $x$. Each circle pair has two intersection points. The
correct point is the one that falls **inside the face region** — i.e., on the
side closer to the apex of the triangle formed by $C_X$ and $C_Z$ with $C_Y$ as
the third vertex.

Formally: the correct intersection point $P$ of $C_Z$-ring $z$ and $C_X$-ring
$x$ is the one where:

$$\text{dist}(P,\ C_Y) > r_{max}$$

(It lies outside all Y-rings, consistent with I3 and with the face being "away
from" the Y axis center.)

This selection rule is already implemented in `computeAxisCoords` via
`isPointOnCircle` — a sticker is associated with a ring if its center lies on
that ring within tolerance. The SVG author places the sticker `<circle>` at the
correct intersection point; the TS code identifies which rings it lies on.

---

## Ring–Layer Mapping

The layer-index-to-radius direction is **not uniform** across axes. From
`view.svg`:

| Axis | layer-0 radius        | layer-(N-1) radius    | Direction                 |
| ---- | --------------------- | --------------------- | ------------------------- |
| Z    | $r_{min}$ (innermost) | $r_{max}$ (outermost) | index grows with radius   |
| X    | $r_{max}$ (outermost) | $r_{min}$ (innermost) | index shrinks with radius |
| Y    | $r_{max}$ (outermost) | $r_{min}$ (innermost) | index shrinks with radius |

Z is the odd axis out. Translated to cube face coordinates:

- **Z**: layer-0 = innermost = $z=0$ (face F); layer-N-1 = outermost = $z=N-1$
  (face B)
- **X**: layer-0 = outermost = $x=0$ (face L); layer-N-1 = innermost = $x=N-1$
  (face R)
- **Y**: layer-0 = outermost = $y=0$ (face D); layer-N-1 = innermost = $y=N-1$
  (face U)

In compact form, the radius for a given layer index $i$ is:

$$r(i) = \begin{cases} r_{min} + i \cdot \Delta r & \text{for Z} \\ r_{max} - i \cdot \Delta r & \text{for X and Y} \end{cases}$$

This asymmetry is a design choice encoded in `view.svg` and must be preserved by
any generator.

**Ring ID convention:** `{AXIS}-layer-{INDEX}` (e.g., `X-layer-0`).

---

## Face Regions and Ellipses

Each face's stickers form an $N \times N$ grid of points at the intersections of
two ring sets. The face ellipse is a visual approximation of this region.

**Derivation approach:**

1. Compute all $N^2$ sticker positions for the face.
2. Find the centroid $G$ of these $N^2$ points.
3. Fit an axis-aligned ellipse in a rotated frame where the two "grid axes"
   (direction from corner sticker to its neighbor along each ring axis) define
   the coordinate axes. The semi-axes of the ellipse should extend slightly
   beyond the outermost sticker positions (a margin of ~$r_s$ is sufficient).

The ellipse orientation angle is determined by the direction from $P_{0,0}$ to
$P_{N-1,0}$ (one grid edge), which is the same for all faces by 3-fold symmetry
(60° rotations apart). For the canonical triangle orientation in `view.svg`:

| Face | Tilt angle     |
| ---- | -------------- |
| U, D | 0° (no rotate) |
| L, B | −60°           |
| F, R | +60°           |

The SVG `transform="rotate(±60 cx cy)"` on the ellipse element handles this.

---

## Label Mask Positions

Label masks cut holes in the global mask layer so axis labels (e.g. "F↻") are
visible on top of the rings. Each mask rect is positioned at the point where a
given ring exits the triangle area toward the periphery.

**Derivation:** For axis Z's ring $k$ (radius $r_{min} + k \cdot \Delta r$,
center $C_Z$), the label is placed near the tangent point of that ring closest
to the SVG edge — i.e., the point on the ring in the direction **away from** the
other two axis centers. For the canonical triangle:

- Z labels: lower-left direction (toward $C_Z$ away from $C_X$, $C_Y$)
- X labels: lower-right direction
- Y labels: upward direction

The exact tangent point:

$$P_{label}^{(k)} = C_{axis} + r_k \cdot \hat{n}_{away}$$

where $\hat{n}_{away}$ is the unit vector pointing away from the triangle's
centroid.

---

## Runtime-Generated Touch Detection Elements

The following SVG elements are **not** in `view.svg` — they are created
programmatically in `touch-handler.ts` and injected into the live SVG at
runtime. A generator for a new-size SVG does not need to produce them; they are
created by `CircularTouchHandler` regardless of SVG content.

### Face ellipse touch zones

Two `<ellipse>` elements are injected once per handler lifetime, both positioned
dynamically to match the currently-selected face's `{FACE}-face-ellipse`
geometry (same `cx`, `cy`, `rx`, `ry`, `transform`):

| Element         | CSS class               | Default                                      | Purpose                                                                                                          |
| --------------- | ----------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `haloEl`        | `circular-halo`         | `visibility: hidden`, `pointer-events: none` | Visual selection ring drawn around the selected face                                                             |
| `faceOverlayEl` | `circular-face-overlay` | `pointer-events: none`                       | Transparent ellipse that turns `pointer-events: all` when a face is selected; captures taps within the halo area |

Both are updated by `showHaloForFace(state, face)` and cleared by
`hideHalo(state)`. They copy their geometry from the corresponding static
`{FACE}-face-ellipse` element in the SVG — so their shape and position depend
entirely on those static elements being present and correctly placed.

### Axis circle touch zones

**Direct element hit:** the static `circle[data-axis]` elements in the SVG are
pointer-targetable. `getInteractionStart` in `touch-handler-interaction.ts`
resolves a touch to a specific axis/layer by matching the element's `id` against
`/^([xyz])-layer-(\d+)$/i`.

**Proximity detection (biased radial boundaries):** when a touch lands between
rings rather than on the stroke, `getAxisHit` uses `computeBiasedBoundaries` to
assign a radial interval $[r_{low},\ r_{high}]$ to each ring. The boundaries are
biased inward toward middle-slice rings so that the outermost and innermost
rings have narrower detection bands, reducing accidental triggers on their
outer/inner edges.

For each axis, one `<path>` (donut shape) and one `<clipPath>` are injected:

| Element                       | CSS class                 | Purpose                                                                                                                      |
| ----------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `bandEl` (SVGPathElement)     | `circular-detection-band` | Annular band (donut path) between `r_low` and `r_high` for the detected ring; visible only during active touch or debug mode |
| `clipEl` (SVGClipPathElement) | —                         | Clips the band to the region outside the LBD dead-zone triangle so the band is never shown over the L/B/D label area         |

One `{bandEl, clipEl}` pair is created per axis (X, Y, Z); each clip path ID is
`detection-band-clip-{AXIS}-{uid}` where `uid` is a random suffix per handler
instance.

### LBD dead zone

No additional element is created. The dead zone is a triangle derived at runtime
from the existing `#face-label-L`, `#face-label-B`, `#face-label-D` elements in
the SVG via `getLbdTrianglePoints`. Touches inside this triangle are suppressed
from axis-circle proximity detection. These three label groups must therefore be
present in any generated SVG.

---

## Constraint Summary

| Constraint                       | Expression                                   | What it ensures                       |
| -------------------------------- | -------------------------------------------- | ------------------------------------- |
| I2a — inner rings intersect      | $d < 2 \cdot r_{min}$                        | Innermost sticker row exists          |
| I2b — outer rings intersect      | $d > (N-1)\cdot\Delta r$                     | Outermost sticker row exists          |
| I5 — sticker fits in gap         | $2 \cdot r_s < \Delta r$                     | Sticker doesn't overlap ring neighbor |
| I4 — sticker clearance           | $\min \text{dist} > 2 \cdot r_s$ (numerical) | Stickers on same face don't overlap   |
| I3 — no accidental intersections | (numerical verification)                     | No ambiguous sticker-axis membership  |

Together: $(N-1)\cdot\Delta r < d < 2\cdot r_{min}$ and $2\cdot r_s < \Delta r$
are the two algebraic constraints. I3 and I4 require numerical spot-checks for
the chosen parameters.

---

## Size-3 Reference Values

For verification — parameters extracted from `src/views/circular/view.svg`:

| Parameter     | Value                                                                |
| ------------- | -------------------------------------------------------------------- |
| `d`           | 100                                                                  |
| `r_min`       | 70                                                                   |
| `Δr`          | 15                                                                   |
| `r_s`         | ~7 (sticker `r` from ghost elements; main stickers sized by CSS `r`) |
| Triangle apex | Y=(200,132), base Z=(150,219), X=(250,219)                           |

**Constraint check for N=3:**

- I2a: $d=100 < 2 \cdot 70=140$ ✅
- I2b: $d=100 > (3-1)\cdot 15=30$ ✅
- I5: $2\cdot 7=14 < \Delta r=15$ ✅ (barely — tight for size 3)
