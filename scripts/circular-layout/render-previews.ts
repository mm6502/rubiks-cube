/**
 * Renders the Circular view layout proposals for every cube size.
 *
 * This is the durable replacement for the throwaway scripts used while the
 * layout was being derived. It emits through the real generator, so the output
 * carries the production element contract — rings, mask, notation labels, face
 * labels and ghosts — and the canvas is derived by the generator rather than
 * patched here. An earlier version sized the canvas itself and patched the mask;
 * both were removed once the generator took responsibility for fitting the
 * viewBox, because two implementations drifted and one of them cropped the outer
 * ring at every size above 3.
 *
 * Usage:
 *   npx tsx scripts/circular-layout/render-previews.ts
 *
 * Output lands in scripts/circular-layout/out/ (gitignored): one SVG and one PNG
 * per size, plus an index.html that draws every size at a single common scale so
 * the progression can be compared directly.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { Resvg } from '@resvg/resvg-js';

import { generate } from '@/views/circular/svg-generator/generate';
import type { ParametersFile } from '@/views/circular/svg-generator/generate';
import {
    ALL_FACES,
    FACE_RING_AXES,
    ringLayerFor,
    stickerPosition,
} from '@/views/circular/svg-generator/geometry';
import type { CircularSvgParameters } from '@/views/circular/svg-generator/geometry';
import { markupBounds } from '@/views/circular/svg-generator/measure';
import { validateInvariants } from '@/views/circular/svg-generator/validate';

// ---------------------------------------------------------------------------
// The current layout proposals — configuration D.
//
// Ownership note: D supersedes C by growing the face ellipses far enough to
// enclose the GHOST circles as well as the stickers. Ghosts are drawn with
// r = stickerRadius inside their target's group and sit one sticker radius
// further along the arc, so an ellipse sized for stickers alone leaves them
// protruding. C's solver only ever checked stickers, which is why they did.
//   D  : ellipses sized to enclose stickers AND ghosts (this change)
//   C  : ellipses grown to inner-trio tangency, ghosts not considered
//   B  : pre-tangency layouts
//   A  : the first per-size tuning, N=4+ left at densest-feasible
//
// **`PROPOSALS` is an experiment surface, not a mirror of the shipped values.**
// It is duplicated against `src/views/circular/svg-generator/parameters.json`
// on purpose, and the two are deliberately not wired together:
//
//   * `parameters.json` is what the app renders. It is append-only in practice
//     and every change to it ships.
//   * `PROPOSALS` is where a *candidate* layout is tried out before anything
//     ships — the shape it holds (`d`/`rMin`/`step`/`margin`/`oN`/`oF`/`aspect`)
//     is the same one `analyse-*` solves in, so a solved configuration can be
//     pasted straight in and looked at.
//
// Do not "fix" the duplication by pointing this at `loadParameters()`. That
// would delete the ability to preview a layout that is not yet shipped, which is
// the only reason this block exists. (The same reasoning is why `analyse-tangency`'s
// configuration `B` is kept rather than folded in: it is the baseline those
// analyses compare against.)
//
// The values currently agree with `parameters.json` for every size; that is a
// snapshot of what was promoted, not an invariant anyone maintains. `note` is
// the one field that exists only here — it renders into the preview index, so it
// describes the proposal rather than the shipped layout.
//
// Sticker radius is 7 everywhere: stickers are never resized between sizes.
// Ring step is 15 everywhere except N=2, which takes a larger step so its two
// rings spread far enough to stop reading as sparse — the one documented
// exception to consistent local grain. N=4 raises r_min from 79.5 to 87.5,
// because no offset pair can both enclose its ghosts and keep the ellipses apart
// at the base scale; r_min is the lever that opens inter-cluster room.
//
// N=3's ring geometry is pinned to the committed reference asset, and its
// stickers are untouched by this change.
//
// Per size, the three ring scalars and the four ellipse values:
//   triangleSide d, innerRadius r_min, ringStep Δr,
//   ellipseMargin, ellipseOffsetNear, ellipseOffsetFar, ellipseAspect
// ---------------------------------------------------------------------------

/** Labels the configuration this block currently holds, for the emitted index. */
const CONFIG_ID = 'D';

interface Proposal {
    d: number;
    rMin: number;
    step: number;
    margin: number;
    oN: number;
    oF: number;
    aspect: number;
    note: string;
}

const R_STICKER = 7;
const APEX_RATIO = 0.87; // the reference's hand-rounded apex, relative to d

/**
 * How much ellipse interpenetration counts as contact rather than overlap.
 *
 * The inner trio is solved to tangency, so its closest pairs land on zero. The
 * bisection leaves a residual far below this, and a real overlap is orders of
 * magnitude larger, so the tolerance separates the two cleanly.
 */
const CONTACT_TOLERANCE = 0.05;

const PROPOSALS: Record<number, Proposal> = {
    2: {
        d: 100,
        rMin: 75,
        step: 20,
        margin: 2.4,
        oN: 0.05,
        oF: 0.05,
        aspect: 1,
        note: 'Unbalanced by nature at N=2; a larger step widens the two rings into a readable cluster. Ellipses grown by half a sticker diameter beyond B.',
    },
    3: {
        d: 100,
        rMin: 70,
        step: 15,
        margin: 2.05,
        oN: 0.12,
        oF: -0.05,
        aspect: 1.0177,
        note: 'Ring geometry is pinned to the committed reference asset; ellipses sized to enclose stickers and ghosts.',
    },
    4: {
        d: 113.619,
        rMin: 87.5,
        step: 15,
        margin: 2.2,
        oN: 0,
        oF: 0.1,
        aspect: 1.05,
        note: 'r_min raised from 79.5: no offset pair both encloses the ghosts and keeps the ellipses apart at the base scale.',
    },
    5: {
        d: 141.163,
        rMin: 98.814,
        step: 15,
        margin: 2.3,
        oN: 0.1,
        oF: 0.1,
        aspect: 1,
        note: 'Ellipses sized to enclose stickers and ghosts.',
    },
    6: {
        d: 169.396,
        rMin: 118.577,
        step: 15,
        margin: 2.35,
        oN: 0.07,
        oF: 0.07,
        aspect: 1,
        note: 'Served like every other size. Carries its own ring geometry for the same reason as N=5.',
    },
    7: {
        d: 198.229,
        rMin: 138.76,
        step: 15,
        margin: 2.35,
        oN: 0.02,
        oF: 0.02,
        aspect: 0.95,
        note: 'Served like every other size. Carries its own ring geometry for the same reason as N=5.',
    },
};

const SIZES = Object.keys(PROPOSALS)
    .map(Number)
    .sort((a, b) => a - b);

const OUT_DIR = 'scripts/circular-layout/out';

// ---------------------------------------------------------------------------
// Exact geometry predicates
// ---------------------------------------------------------------------------

interface Ellipse {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    rotation: number;
}
interface Vec {
    x: number;
    y: number;
}

/** The ellipse's extent along a unit direction, from its support function. */
function supportRadius(e: Ellipse, u: Vec): number {
    const th = (e.rotation * Math.PI) / 180;
    const e1 = { x: Math.cos(th), y: Math.sin(th) };
    const e2 = { x: -Math.sin(th), y: Math.cos(th) };
    return Math.hypot(e.rx * (u.x * e1.x + u.y * e1.y), e.ry * (u.x * e2.x + u.y * e2.y));
}

/**
 * Exact signed gap between two filled ellipses, or <= 0 when they intersect.
 *
 * Uses the support function rather than sampling the boundaries: when two
 * boundaries cross, no sample lands exactly on the crossing, so a sampling
 * approach reports a small POSITIVE gap for a genuine overlap. That mistake is
 * what originally hid this whole class of defect.
 */
function ellipseGap(a: Ellipse, b: Ellipse, samples = 2048): number {
    let best = -Infinity;
    for (let i = 0; i < samples; i++) {
        const phi = (2 * Math.PI * i) / samples;
        const u = { x: Math.cos(phi), y: Math.sin(phi) };
        const v =
            (b.cx - a.cx) * u.x + (b.cy - a.cy) * u.y - supportRadius(a, u) - supportRadius(b, u);
        if (v > best) best = v;
    }
    return best;
}

/** A point in the ellipse's own rotated frame. */
function toLocal(e: Ellipse, x: number, y: number): Vec {
    const th = (-e.rotation * Math.PI) / 180;
    const dx = x - e.cx;
    const dy = y - e.cy;
    return { x: dx * Math.cos(th) - dy * Math.sin(th), y: dx * Math.sin(th) + dy * Math.cos(th) };
}

/** Centre-to-boundary distance along the ray through (lx, ly). */
function boundaryDistance(rx: number, ry: number, lx: number, ly: number): number {
    const r = Math.hypot(lx, ly);
    if (r === 0) return 0;
    return 1 / Math.sqrt((lx / r / rx) ** 2 + (ly / r / ry) ** 2);
}

// ---------------------------------------------------------------------------
// Reading metrics back out of an emitted asset
// ---------------------------------------------------------------------------

interface Emitted {
    ellipses: { face: string; e: Ellipse }[];
    stickers: { face: string; x: number; y: number; r: number }[];
    ghosts: { face: string; target: string; x: number; y: number; r: number }[];
}

function parseEmitted(svg: string): Emitted {
    const ellipses: Emitted['ellipses'] = [];
    for (const m of svg.matchAll(/<ellipse\b[^>]*\/>/g)) {
        const tag = m[0];
        const face = /data-face="([A-Z])"/.exec(tag)?.[1];
        if (!face) continue;
        ellipses.push({
            face,
            e: {
                cx: Number(/cx="([-\d.]+)"/.exec(tag)?.[1]),
                cy: Number(/cy="([-\d.]+)"/.exec(tag)?.[1]),
                rx: Number(/rx="([-\d.]+)"/.exec(tag)?.[1]),
                ry: Number(/ry="([-\d.]+)"/.exec(tag)?.[1]),
                rotation: Number(/rotate\(([-\d.]+)/.exec(tag)?.[1] ?? 0),
            },
        });
    }

    const ghosts: Emitted['ghosts'] = [];
    for (const m of svg.matchAll(/<circle\b[^>]*class="ghost-sticker"[^>]*\/>/g)) {
        const tag = m[0];
        // A ghost is drawn inside its TARGET's face group, so data-ghost-face is
        // the face whose ellipse must contain it.
        ghosts.push({
            face: /data-ghost-face="([A-Z])"/.exec(tag)?.[1] ?? '',
            target: /data-ghost-target="([^"]*)"/.exec(tag)?.[1] ?? '',
            x: Number(/cx="([-\d.]+)"/.exec(tag)?.[1]),
            y: Number(/cy="([-\d.]+)"/.exec(tag)?.[1]),
            r: Number(/r="([-\d.]+)"/.exec(tag)?.[1]),
        });
    }

    const stickers: Emitted['stickers'] = [];
    for (const m of svg.matchAll(/<circle\b[^>]*class="sticker"[^>]*\/>/g)) {
        const tag = m[0];
        stickers.push({
            face: /data-face="([A-Z])"/.exec(tag)?.[1] ?? '',
            x: Number(/cx="([-\d.]+)"/.exec(tag)?.[1]),
            y: Number(/cy="([-\d.]+)"/.exec(tag)?.[1]),
            r: Number(/r="([-\d.]+)"/.exec(tag)?.[1]),
        });
    }
    return { ellipses, stickers, ghosts };
}

interface Metrics {
    ellipseGap: number;
    halo: number;
    /** Worst halo over the ghost circles alone, reported separately. */
    ghostHalo: number;
    intrusions: number;
    clusterGap: number;
    uneven: number;
    extent: number;
}

/**
 * Measures the asset that was actually emitted, not recomputed geometry, so a
 * mismatch between the two shows up as a failure rather than being averaged away.
 *
 * `uneven` is the far trio's distance from the triangle centroid over the near
 * trio's. It falls naturally with N and sits near 2.2-2.5x across the set; N=2
 * was the outlier and is the reason its ring step differs.
 */
function measure(_size: number, p: CircularSvgParameters, emitted: Emitted): Metrics {
    let ellipseGapMin = Infinity;
    for (let i = 0; i < emitted.ellipses.length; i++) {
        for (let j = i + 1; j < emitted.ellipses.length; j++) {
            ellipseGapMin = Math.min(
                ellipseGapMin,
                ellipseGap(emitted.ellipses[i].e, emitted.ellipses[j].e, 4096)
            );
        }
    }

    // Enclosure covers BOTH layers. Ghosts are drawn with r = stickerRadius
    // inside their target's group and sit one sticker radius further along the
    // arc, so they reach past the stickers and are what actually sizes the
    // ellipse. Checking only stickers is the mistake that let ghosts protrude.
    let halo = Infinity;
    let ghostHalo = Infinity;
    let intrusions = 0;
    for (const { face, e } of emitted.ellipses) {
        const check = (s: { x: number; y: number; r: number }) => {
            const { x: lx, y: ly } = toLocal(e, s.x, s.y);
            const r = Math.hypot(lx, ly);
            return {
                halo: boundaryDistance(e.rx, e.ry, lx, ly) - r - s.r,
                inside: r - s.r < boundaryDistance(e.rx, e.ry, lx, ly),
            };
        };

        for (const s of emitted.stickers) {
            const { halo: h, inside } = check(s);
            if (s.face === face) {
                halo = Math.min(halo, h);
            } else if (inside) {
                // The sticker's nearest point reaches inside this foreign ellipse.
                intrusions++;
            }
        }
        for (const g of emitted.ghosts) {
            const { halo: h } = check(g);
            if (g.face === face) {
                halo = Math.min(halo, h);
                ghostHalo = Math.min(ghostHalo, h);
            }
        }
    }

    let clusterGap = Infinity;
    for (let i = 0; i < emitted.stickers.length; i++) {
        for (let j = i + 1; j < emitted.stickers.length; j++) {
            if (emitted.stickers[i].face === emitted.stickers[j].face) continue;
            const d =
                Math.hypot(
                    emitted.stickers[i].x - emitted.stickers[j].x,
                    emitted.stickers[i].y - emitted.stickers[j].y
                ) -
                emitted.stickers[i].r -
                emitted.stickers[j].r;
            if (d < clusterGap) clusterGap = d;
        }
    }

    // Balance and spread are read from the sticker positions directly, so no
    // geometry module is needed for them.
    const centroidOf = (face: string) => {
        const pts = emitted.stickers.filter(s => s.face === face);
        return {
            x: pts.reduce((a, s) => a + s.x, 0) / pts.length,
            y: pts.reduce((a, s) => a + s.y, 0) / pts.length,
        };
    };
    const tri = {
        x: (200 - p.triangleSide / 2 + (200 + p.triangleSide / 2) + 200) / 3,
        y: (219 - p.apexHeight + 219 + 219) / 3,
    };
    const avgDist = (faces: string[]) =>
        faces.reduce((sum, f) => {
            const c = centroidOf(f);
            return sum + Math.hypot(c.x - tri.x, c.y - tri.y);
        }, 0) / faces.length;

    const near = avgDist(['U', 'R', 'F']);
    const far = avgDist(['D', 'L', 'B']);

    let extent = 0;
    for (const f of ALL_FACES) {
        const pts = emitted.stickers.filter(s => s.face === f);
        extent = Math.max(
            extent,
            Math.max(...pts.map(s => s.x)) - Math.min(...pts.map(s => s.x)),
            Math.max(...pts.map(s => s.y)) - Math.min(...pts.map(s => s.y))
        );
    }

    return {
        ellipseGap: ellipseGapMin,
        halo,
        ghostHalo,
        intrusions,
        clusterGap,
        uneven: far / near,
        extent,
    };
}

/**
 * Longest diagonal over the shortest side, across a face's sticker cells.
 *
 * Derived from the geometry module's own layer indexing rather than from
 * nearest-neighbour search over sticker positions. A search-based version was
 * tried and is wrong: depending on how skewed a cell is, the two nearest
 * neighbours of a corner may be adjacent (so the segment between them spans the
 * cell diagonally) or may include an opposite corner (so it spans the other
 * diagonal), and the two cases are not comparable. Indexing removes the
 * ambiguity.
 *
 * A cell's four corners are the intersections of consecutive rings from the
 * face's two ring axes, so cell (i, j) uses layers (i, j), (i+1, j), (i, j+1)
 * and (i+1, j+1).
 */
function cellShape(size: number, p: CircularSvgParameters): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;

    for (const face of ALL_FACES) {
        const [axisA, axisB] = FACE_RING_AXES[face];

        const corner = (layerA: number, layerB: number) => {
            for (let pos = 0; pos < size * size; pos++) {
                if (
                    ringLayerFor(face, pos, axisA, size) === layerA &&
                    ringLayerFor(face, pos, axisB, size) === layerB
                ) {
                    return stickerPosition(face, pos, size, p);
                }
            }
            return null;
        };

        for (let i = 0; i + 1 < size; i++) {
            for (let j = 0; j + 1 < size; j++) {
                const c00 = corner(i, j);
                const c10 = corner(i + 1, j);
                const c01 = corner(i, j + 1);
                const c11 = corner(i + 1, j + 1);
                if (!c00 || !c10 || !c01 || !c11) continue;

                const sideA = Math.hypot(c10.x - c00.x, c10.y - c00.y);
                const sideB = Math.hypot(c01.x - c00.x, c01.y - c00.y);
                const shortSide = Math.min(sideA, sideB);

                const diagonal = Math.max(
                    Math.hypot(c11.x - c00.x, c11.y - c00.y),
                    Math.hypot(c01.x - c10.x, c01.y - c10.y)
                );

                const ratio = diagonal / shortSide;
                if (ratio < min) min = ratio;
                if (ratio > max) max = ratio;
            }
        }
    }

    return { min, max };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

interface Rendered {
    size: number;
    svg: string;
    viewBox: string;
    metrics: Metrics;
    cell: { min: number; max: number };
    issues: number;
    proposal: Proposal;
}

mkdirSync(OUT_DIR, { recursive: true });

const rendered: Rendered[] = [];
console.log(`Rendering Circular view layout proposals — configuration ${CONFIG_ID}\n`);

for (const size of SIZES) {
    const prop = PROPOSALS[size];

    const params: CircularSvgParameters = {
        triangleSide: prop.d,
        innerRadius: prop.rMin,
        ringStep: prop.step,
        stickerRadius: R_STICKER,
        centreX: 200,
        centreY: 219,
        apexHeight: prop.d * APEX_RATIO,
        ellipseOffsetNear: prop.oN,
        ellipseOffsetFar: prop.oF,
        ellipseMargin: prop.margin,
        ellipseAspect: prop.aspect,
        labelWidth: 20,
        labelHeight: 16,
        faceLabelGap: 1,
    };

    // Fail loudly rather than emitting a layout that violates the invariants.
    if (prop.d >= 2 * prop.rMin) throw new Error(`N=${size}: I2a violated (d < 2*r_min)`);
    if ((size - 1) * prop.step >= prop.d) throw new Error(`N=${size}: I2b violated`);
    if (2 * R_STICKER >= prop.step) throw new Error(`N=${size}: I5 violated`);
    const invariantIssues = validateInvariants(size, params);
    if (invariantIssues.length) {
        throw new Error(`N=${size}: ${invariantIssues.map(i => i.message).join('; ')}`);
    }

    // Canvas: let the generator derive it. It emits against an oversized probe,
    // measures the result and re-emits fitted, so every layer the emitter draws is
    // included without this script maintaining a list of element kinds. That list
    // was wrong here twice: once omitting the labels, once omitting the axis
    // circles, which cropped the outer ring's arc at every size above 3.
    const file: ParametersFile = {
        defaults: {
            triangleSide: prop.d,
            innerRadius: prop.rMin,
            ringStep: prop.step,
            stickerRadius: R_STICKER,
            centreX: 200,
            centreY: 219,
            apexHeight: prop.d * APEX_RATIO,
            ellipseOffsetNear: prop.oN,
            ellipseOffsetFar: prop.oF,
            ellipseMargin: prop.margin,
            ellipseAspect: prop.aspect,
            labelWidth: 20,
            labelHeight: 16,
            faceLabelGap: 1,
            ghostRadiusOffset: 1,
        },
        // No per-size overrides: the canvas is derived by emission, and this
        // block reads it back from the markup below.
        sizes: { [String(size)]: {} },
    };
    const { svg, issues } = generate(size, file);
    // The canvas the emitter actually wrote, which is the only value worth
    // reporting or checking against.
    const viewBox = /viewBox="([^"]*)"/.exec(svg)![1];
    const [vx, vy, vw, vh] = viewBox.split(/\s+/).map(Number);

    // The mask tracks the viewBox in the emitter now, so no patching is needed:
    // the emitted asset is already unclipped.
    const emitted = parseEmitted(svg);
    const metrics = measure(size, params, emitted);
    const cell = cellShape(size, params);

    // Canvas containment. The generator already guarantees this via validateCanvas
    // (the CLI refuses to write an asset that would be cropped), but the preview is
    // rendered separately, so it reports the same property rather than assuming it.
    // Measured from the markup with the shared helper, so the preview and the
    // generator cannot drift into measuring different things.
    const canvas = { x0: vx, y0: vy, x1: vx + vw, y1: vy + vh };
    const b = markupBounds(svg);
    const tol = 0.5;
    const overflow = Math.max(
        canvas.x0 - b.x0,
        canvas.y0 - b.y0,
        b.x1 - canvas.x1,
        b.y1 - canvas.y1
    );
    const outside = overflow > tol ? [`content by ${overflow.toFixed(1)}`] : [];

    writeFileSync(`${OUT_DIR}/view-${size}.svg`, svg);

    writeFileSync(
        `${OUT_DIR}/view-${size}.png`,
        new Resvg(
            svg
                .replace(/(\sstyle=")/, ' style="color:#555;')
                .replace(/<style>/, '<style>\n    :root { color: #555; }')
                .replace(
                    /(<desc[^>]*>[\s\S]*?<\/desc>)/,
                    '$1\n  <rect x="-100000" y="-100000" width="200000" height="200000" fill="#ffffff" />'
                ),
            { fitTo: { mode: 'original' } }
        )
            .render()
            .asPng()
    );

    rendered.push({
        size,
        svg,
        viewBox,
        metrics,
        cell,
        issues: issues.length,
        proposal: prop,
    });

    // Tangency is the intended result for the inner trio at N>2, so the ellipse
    // criterion is "does not interpenetrate" rather than "strictly separated".
    // A real overlap fails; contact within the tolerance passes.
    //
    // The halo must be positive for BOTH layers: stickers and ghosts alike. The
    // ghost term is the one that was missing when ghosts were visibly protruding.
    //
    // Nothing may fall outside the canvas, since the mask clips anything beyond it.
    const ok =
        metrics.ellipseGap >= -CONTACT_TOLERANCE &&
        metrics.halo > 0 &&
        metrics.ghostHalo > 0 &&
        metrics.intrusions === 0 &&
        outside.length === 0 &&
        issues.length === 0;
    console.log(
        `N=${size}  d=${prop.d.toFixed(1)} r_min=${prop.rMin.toFixed(1)} Δr=${prop.step}  |  ` +
            `uneven ${metrics.uneven.toFixed(2)}x  extent ${metrics.extent.toFixed(0)}  ` +
            `|  gap ${metrics.ellipseGap.toFixed(1)}  halo ${metrics.halo.toFixed(2)} (ghost ${metrics.ghostHalo.toFixed(2)})  ` +
            `cluster ${metrics.clusterGap.toFixed(1)}  |  cell ${cell.min.toFixed(2)}-${cell.max.toFixed(2)}  ` +
            `|  canvas ${outside.length === 0 ? 'all inside' : outside.length + ' OUTSIDE'}  ${ok ? 'OK' : 'FAIL'}`
    );
    if (outside.length) console.log(`      outside: ${outside.slice(0, 6).join(', ')}`);
}

// ---------------------------------------------------------------------------
// Index page, all sizes at one common scale
// ---------------------------------------------------------------------------

let ux0 = Infinity;
let uy0 = Infinity;
let ux1 = -Infinity;
let uy1 = -Infinity;
for (const r of rendered) {
    const [x, y, w, h] = r.viewBox.split(' ').map(Number);
    ux0 = Math.min(ux0, x);
    uy0 = Math.min(uy0, y);
    ux1 = Math.max(ux1, x + w);
    uy1 = Math.max(uy1, y + h);
}
const margin = 24;
const commonViewBox = `${Math.round(ux0 - margin)} ${Math.round(uy0 - margin)} ${Math.round(
    ux1 - ux0 + 2 * margin
)} ${Math.round(uy1 - uy0 + 2 * margin)}`;

const cards = rendered
    .map(r => {
        const m = r.metrics;
        const flags = [
            m.ellipseGap >= -CONTACT_TOLERANCE ? '' : 'ellipse overlap',
            m.halo > 0 ? '' : 'sticker clipped',
            m.ghostHalo > 0 ? '' : 'ghost outside its ellipse',
            m.intrusions === 0 ? '' : `${m.intrusions} intrusions`,
            r.issues === 0 ? '' : `${r.issues} validation issues`,
        ]
            .filter(Boolean)
            .join(', ');
        return `  <figure>
    <figcaption>
      <strong>N=${r.size}</strong> &mdash; d=${r.proposal.d.toFixed(1)}, r<sub>min</sub>=${r.proposal.rMin.toFixed(1)}, &Delta;r=${r.proposal.step}, grain ${(R_STICKER / r.proposal.step).toFixed(3)}
      <br>unevenness ${m.uneven.toFixed(2)}&times; &middot; cluster extent ${m.extent.toFixed(0)} &middot; ellipse gap ${m.ellipseGap.toFixed(1)} &middot; halo ${m.halo.toFixed(2)} (ghost ${m.ghostHalo.toFixed(2)})
      <br><span class="note">${r.proposal.note}</span>
      ${flags ? `<br><span class="bad">${flags}</span>` : ''}
    </figcaption>
    <div class="frame">${r.svg
        .replace(/<\?xml[^>]*\?>/, '')
        .replace(/viewBox="[^"]*"/, `viewBox="${commonViewBox}"`)}</div>
  </figure>`;
    })
    .join('\n');

writeFileSync(
    `${OUT_DIR}/index.html`,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Circular view &mdash; per-size layout proposals</title>
<style>
  body { margin: 0; padding: 24px; background: #fbfbfd; font: 14px/1.5 system-ui, sans-serif; color: #222; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
  p.intro { max-width: 74ch; color: #555; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; }
  figure { margin: 0; background: #fff; border: 1px solid #e3e3e8; border-radius: 10px; overflow: hidden; }
  figcaption { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 12px; color: #444; }
  .note { color: #777; }
  .bad { color: #b71234; font-weight: 600; }
  .frame { padding: 8px; }
  .frame svg { width: 100%; height: auto; display: block; }
</style>
</head>
<body>
<h1>Circular view &mdash; per-size layout proposals (configuration ${CONFIG_ID})</h1>
<p class="intro">Sticker radius is 7 at every size, so stickers never change size between
sizes. Ring step is 15 except at N=2, which takes 20 to spread its two rings into a
readable cluster. N=3&rsquo;s ring geometry is pinned to the committed reference asset.
Every size is drawn at one common scale, so the growth in extent and the change in
density are directly comparable.</p>
<div class="grid">
${cards}
</div>
</body>
</html>
`
);

console.log(`\nwrote ${rendered.length} sizes to ${OUT_DIR}/ (SVG + PNG + index.html)`);
