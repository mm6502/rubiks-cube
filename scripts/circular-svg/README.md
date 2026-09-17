# circular-svg generator

Generates the Circular view's per-size SVG assets.

```sh
npm run svg:circular -- 3 --out /tmp/view-3.svg   # generate to a path
npm run svg:circular -- 3 --check                 # validate only, write nothing
npm run svg:circular -- --list                    # configured sizes
```

Generation validates before writing. A parameter set that violates any check
reports the failure and leaves no file behind, so a failed run cannot leave a
partial asset in the tree.

## Where the pieces live

| Path                                               | Role                                        |
| -------------------------------------------------- | ------------------------------------------- |
| `scripts/circular-svg/generate.ts`                 | CLI: argument parsing and file writing only |
| `src/views/circular/svg-generator/generate.ts`     | Orchestration: parameters in, validated SVG |
| `src/views/circular/svg-generator/geometry.ts`     | Ring, sticker, ellipse and label geometry   |
| `src/views/circular/svg-generator/labels.ts`       | Notation label text and glyphs              |
| `src/views/circular/svg-generator/ghosts.ts`       | Ghost layer generation                      |
| `src/views/circular/svg-generator/emit.ts`         | SVG serialisation                           |
| `src/views/circular/svg-generator/validate.ts`     | Pre-write checks                            |
| `src/views/circular/svg-generator/parameters.json` | Per-size parameter sets                     |

The logic sits under `src/` rather than beside the CLI because `tsc --noEmit`
compiles `src/**` and `vitest` collects only `src/**`. A `.cjs` script outside
`src/` could not have been imported by tests without failing the type-check
gate, so the generator would have had no automated verification.

## Adding a size

Add an entry under `sizes` in `parameters.json`. No code change is needed — this
is the property the generator exists to provide.

```jsonc
"sizes": {
    "6": {
        "ringStep": 18,
        "viewBox": "..."
    }
}
```

Then run `npm run svg:circular -- 6 --check`. If the parameter set is invalid
the validation gate says which constraint failed and why. A new size also needs
its asset path added to whatever resolves the SVG at runtime.

## Parameters

Five scalars come from
[`docs/brainstorms/circular-view-svg-geometry-spec.md`](../../docs/brainstorms/circular-view-svg-geometry-spec.md);
the rest are layout values the spec declines to derive and are tuned by eye.

| Parameter                                | Meaning                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `triangleSide`                           | `d` — distance between any two axis centres                                                                                                                                                |
| `innerRadius`                            | `r_min` — radius of the innermost ring                                                                                                                                                     |
| `ringStep`                               | `Δr` — radius increment between rings                                                                                                                                                      |
| `stickerRadius`                          | `r_s` — visual sticker radius                                                                                                                                                              |
| `centreX`, `centreY`                     | Base midpoint the triangle is built from                                                                                                                                                   |
| `apexHeight`                             | Apex height above the baseline. The equilateral value is `triangleSide × √3/2`; the reference asset hand-rounds it (87 for a side of 100)                                                  |
| `viewBox`                                | SVG `viewBox` attribute                                                                                                                                                                    |
| `ellipseOffsetNear` / `ellipseOffsetFar` | Face-ellipse centre offset from the sticker centroid, as a fraction of the grid span. Two values because the near-polarity faces (U, R, F) use a larger offset than the far ones (D, L, B) |
| `ellipseRadiusX` / `ellipseRadiusY`      | Semi-axes as multiples of `stickerRadius`                                                                                                                                                  |
| `labelWidth`, `labelHeight`              | Ring-label box size                                                                                                                                                                        |
| `ghostRadiusOffset`                      | Ghost offset from its target, in sticker radii                                                                                                                                             |

## Changing size: what actually scales

Two properties were measured rather than assumed, and one of them contradicted
the initial prediction:

- **Minimum sticker clearance is independent of the ring count.** It tracks
  `ringStep` alone — 15.04 at N=3, 4, and 5 alike — so a larger cube needs no
  larger step. Only `r_max = r_inner + (N−1)·ringStep` grows, which means a new
  size typically needs just a wider `viewBox`.
- **Face-ellipse semi-axes must be derived from the grid, not fixed.** A
  hardcoded pair that fits 3×3 clips 4×4 and above. They are computed from the
  grid span measured in the ellipse's own rotated frame, and `ellipseMargin` /
  `ellipseAspect` are solved so 3×3 still reproduces the reference's 46×40.

The practical consequence: adding a size is usually a `viewBox` and nothing
else. Run `--check` first and let the validation gate tell you what needs
adjusting.

## What validation checks

Four groups, all of which must pass:

1. **Invariants** — the spec's algebraic bounds `(N-1)·Δr < d < 2·r_min` and
   `2·r_s < Δr`, plus the numerical checks the spec says have no closed form:
   minimum sticker clearance above `2·r_s`, and no sticker resolving to anything
   other than exactly two rings.
2. **Conformance** — the element contract the runtime resolves:
   `data-cube-size`, axis circles with `data-axis` / `data-layer-index` and
   `{AXIS}-layer-{INDEX}` ids, `sticker-{FACE}-{POS}` ids, `{FACE}-face-ellipse`
   ids, all six `face-label-{FACE}` ids (the interaction dead-zone needs L, B
   and D by exact id), the `.ghost-sticker-wrapper` class, and one label-mask
   hole per label.
3. **Ellipses** — present, non-degenerate, and fully inside the `viewBox`.
4. **Ghosts** — the expected count for the size, every ghost on a ring that
   exists, none beyond the outermost ring, and none overlapping its own target.

The invariants alone are not sufficient. They constrain rings and stickers only
— they say nothing about face ellipses, mask holes, the ghost layer, or the
element contract, so a clean invariant run would not be evidence the asset is
loadable. That distinction is why the gate has four groups rather than one.

## The ghost rule

Ghosts are semi-transparent hints mirroring the colour of a _different_ sticker
on the same cubie, placed just outside the target so the user can see what is
around the edge. The rule was recovered from the 72 ghosts in the committed 3×3
asset and reproduces all of them:

1. **Multiplicity** — one ghost per other sticker on the same cubie. A corner
   cubie carries three stickers so each gets two ghosts; an edge carries two so
   each gets one; a face centre carries one and gets none. Totals are 6 × (4×2 +
   (4N−8)×1): 48 at N=2, 72 at N=3, 96 at N=4, 120 at N=5.
2. **Axis** — the single ring axis shared by the target's and the other
   sticker's ring-axis sets.
3. **Ring tag** — the shared coordinate along that axis, encoded as a _radius
   rank_ (how many rings sit inside it) rather than a layer index. On Z the two
   agree; on X and Y the rank is the complement. This is what the reference's
   `data-ghost-layer` values encode.
4. **Position** — one sticker radius of arc along the tagged circle, in the
   direction pointing **away from the target's own face centroid**. The ghost
   protrudes outward from the face it belongs to.

Direction is the subtle part, and the first implementation got it wrong.
Deriving the side from the source sticker ("move toward the source") reproduces
most faces but mirrors six ghosts on D, L and B inward, because on those three
faces the source sits on the opposite side of the arc. Placing the ghost outward
from its own face centroid fixes all six and reproduces every reference ghost:
the worst deviation drops from 13.98 to 0.94, with no outliers at all.

Structural agreement with the reference is exact (target, source, axis, ring
tag), and positional agreement is now complete — all 72 ghosts land within one
unit of the hand-authored asset.

### Why N=5 is the falsification size

Ghosts derived from the 1-edge class number `6 × (4N − 8)` out of a total `24N`,
so their share of all ghosts is `1 − 2/N`. That share is **0% at N=2** (every
sticker is a corner, so the edge class does not exist), **33% at N=3**, and
exactly **50% at N=4** — a tie, not a majority. It first becomes a strict
majority at **N=5 (60%)**. N=5 is therefore the smallest size that actually
exercises the edge class in a way 3×3 cannot, which is why it is the validation
target: if the rule were wrong for that class, 2×2 and 4×4 could both pass.

## Size-aware loading

Every size resolves through one path: the loader serves `view-<n>.svg` when it
exists and otherwise builds that size in the browser from `parameters.json` on
first request, caching the result. Committing an asset is therefore a build-time
optimisation, not a requirement — a size is never "unsupported" merely because
nobody committed its file.

That is what lets the assets be optional. With all six committed the build
inlines them (measured 153.7 KB gzip); with none committed it inlines no SVG at
all (110.7 KB gzip) and every size is still served, at the cost of one build per
size on first view — `generate(7)` cold measures ~11 ms, under a frame.

Committing an asset is worth it when a size is on the default path and its ~7 KB
gzip is cheaper than the first-view build; drop it when bundle size matters
more. Either way the markup is the same: the loader's built output is
content-identical to the committed file, and `svg-loader.test.ts` asserts that
so the two paths cannot drift.

3×3 used to be special-cased behind a hand-written static import; it now
resolves like every other size, so no size can drift into being "the special
one".

The hand-authored 3×3 original lives in `fixtures/reference-3x3.svg`, one
directory below the assets. It is a fidelity reference, not a shipping asset,
and it sits there so that neither glob can reach it — which is what keeps the
generator's fidelity tests comparing against an independent reference instead of
against the generator's own output.

An N=5 asset is a validation target only. Generate it to a path outside `src/`
(for example `scripts/circular-svg/tmp/`) so it can never be globbed into the
app or committed as a shipped size.

## Verification

| Test                             | What it proves                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `svg-generator.test.ts`          | Geometry reproduces the reference: 54 sticker positions, 9 ring radii, 6 ellipse rotations, 9 labels   |
| `svg-generator.ghost.test.ts`    | The ghost rule reproduces all 72 reference ghosts structurally, with positional outliers accounted for |
| `svg-generator.validate.test.ts` | Each validation group rejects what it is meant to reject, and every configured size passes             |
| `generated-svg.test.ts`          | End-to-end generation of 3×3 matches the committed asset                                               |

The 3×3 comparison uses one exported tolerance constant, set tighter than the
runtime's own `isPointOnCircle` tolerance of 2 units. Otherwise the generator
and its test could agree on a displacement the view would misresolve.
