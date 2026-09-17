/**
 * Renders the Circular view layout proposals for every cube size.
 *
 * This is the durable replacement for the throwaway scripts used while the
 * layout was being derived. It emits through the real generator, so the output
 * carries the production element contract — rings, mask, notation labels, face
 * labels and ghosts — rather than a hand-rolled approximation. Only the label
 * mask rectangle is patched, because it is still hardcoded to 400x340 and would
 * clip any canvas larger than that.
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
import { validateInvariants } from '@/views/circular/svg-generator/validate';

// ---------------------------------------------------------------------------
// The current layout proposals — configuration C.
//
// Ownership note: C grew the face ellipses so the INNER trio (U, R, F) touches,
// and gave the outer trio (D, L, B) the same offset parameter so both trios sit
// the same way relative to their own faces. Only N>2 changed; N=2 and N=3 are
// still configuration B.
//   C  : ellipses grown to inner-trio tangency (this change)
//   B  : superseded for N>2; the layouts before the ellipses were grown
//   A  : superseded; the first per-size tuning, N=4+ left at densest-feasible
//
// Sticker radius is 7 everywhere: stickers are never resized between sizes.
// Ring step is 15 everywhere except N=2, which takes a larger step so its two
// rings spread far enough to stop reading as sparse — the one documented
// exception to consistent local grain.
//
// N=3's ring geometry is pinned to the committed reference asset. N=4 and above
// are a progression seeded by the feasibility law and land in the same balance
// band that N=2 and N=3 occupy, so no size reads as a special case.
//
// Why the offsets are all zero: with oN = oF the two trios move together, so the
// offset only slides ellipses along their arms. Sliding outward cannot separate
// the inner trio, because its ellipses are pushed in the same direction as the
// neighbours they would need to move away from. Zero is therefore optimal for the
// inner trio, and it also leaves the largest gap to the outer trio. That is a
// measured result, not an assumption — the solve sweeps the offset and zero wins
// at every size.
//
// Per size, the three ring scalars and the four ellipse values:
//   triangleSide d, innerRadius r_min, ringStep Δr,
//   ellipseMargin, ellipseOffsetNear, ellipseOffsetFar, ellipseAspect
// ---------------------------------------------------------------------------

/** Identifies the frozen configuration below; referenced by the brainstorm doc. */
const CONFIG_ID = 'C';

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
        margin: 1.739,
        oN: 0,
        oF: 0,
        aspect: 1.0177,
        note: 'Ring geometry is pinned to the committed reference asset; the ellipses are grown until the inner trio touches.',
    },
    4: {
        d: 113.619,
        rMin: 79.533,
        step: 15,
        margin: 1.474,
        oN: 0,
        oF: 0,
        aspect: 1.05,
        note: 'Ellipses grown until the inner trio touches; channels to the outer trio stay wide.',
    },
    5: {
        d: 141.163,
        rMin: 98.814,
        step: 15,
        margin: 1.929,
        oN: 0,
        oF: 0,
        aspect: 1,
        note: 'Ellipses grown until the inner trio touches.',
    },
    6: {
        d: 169.396,
        rMin: 118.577,
        step: 15,
        margin: 2.215,
        oN: 0,
        oF: 0,
        aspect: 1,
        note: 'Beyond the sizes the app ships; the gap to the outer trio narrows here.',
    },
    7: {
        d: 198.229,
        rMin: 138.76,
        step: 15,
        margin: 2.879,
        oN: 0,
        oF: 0,
        aspect: 0.95,
        note: 'Beyond the sizes the app ships; included to show the progression still holds.',
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
    return { ellipses, stickers };
}

interface Metrics {
    ellipseGap: number;
    halo: number;
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
function measure(size: number, p: CircularSvgParameters, emitted: Emitted): Metrics {
    let ellipseGapMin = Infinity;
    for (let i = 0; i < emitted.ellipses.length; i++) {
        for (let j = i + 1; j < emitted.ellipses.length; j++) {
            ellipseGapMin = Math.min(
                ellipseGapMin,
                ellipseGap(emitted.ellipses[i].e, emitted.ellipses[j].e, 4096)
            );
        }
    }

    let halo = Infinity;
    let intrusions = 0;
    for (const { face, e } of emitted.ellipses) {
        for (const s of emitted.stickers) {
            const { x: lx, y: ly } = toLocal(e, s.x, s.y);
            const r = Math.hypot(lx, ly);
            const boundary = boundaryDistance(e.rx, e.ry, lx, ly);
            if (s.face === face) {
                halo = Math.min(halo, boundary - r - s.r);
            } else if (r - s.r < boundary) {
                // The sticker's nearest point reaches inside this foreign ellipse.
                intrusions++;
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
        viewBox: '0 0 1 1',
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

    // Canvas: cover stickers and ellipses, with a small margin.
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const add = (x: number, y: number) => {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
    };
    // A first pass over the module's own geometry sizes the canvas.
    const probeFile: ParametersFile = {
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
        sizes: { [String(size)]: { viewBox: '-10000 -10000 20000 20000' } },
    };
    const probe = generate(size, probeFile);
    const probed = parseEmitted(probe.svg);
    for (const s of probed.stickers) {
        add(s.x - s.r, s.y - s.r);
        add(s.x + s.r, s.y + s.r);
    }
    for (const { e } of probed.ellipses) {
        const reach = Math.max(e.rx, e.ry);
        add(e.cx - reach, e.cy - reach);
        add(e.cx + reach, e.cy + reach);
    }
    const pad = 6;
    const viewBox = `${Math.floor(x0 - pad)} ${Math.floor(y0 - pad)} ${Math.ceil(x1 - x0 + 2 * pad)} ${Math.ceil(y1 - y0 + 2 * pad)}`;

    const file: ParametersFile = {
        ...probeFile,
        sizes: { [String(size)]: { viewBox } },
    };
    const { svg, issues } = generate(size, file);

    // The label mask is still a fixed rectangle, so widen it to the canvas.
    // Without this the larger sizes lose ring geometry silently.
    const [vx, vy, vw, vh] = viewBox.split(' ').map(Number);
    const patched = svg.replace(
        /<rect x="0" y="0" width="400" height="340" fill="white" \/>/,
        `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="white" />`
    );

    const emitted = parseEmitted(patched);
    const metrics = measure(size, params, emitted);
    const cell = cellShape(size, params);

    writeFileSync(`${OUT_DIR}/view-${size}.svg`, patched);

    writeFileSync(
        `${OUT_DIR}/view-${size}.png`,
        new Resvg(
            patched
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
        svg: patched,
        viewBox,
        metrics,
        cell,
        issues: issues.length,
        proposal: prop,
    });

    // Tangency is the intended result for the inner trio at N>2, so the ellipse
    // criterion is "does not interpenetrate" rather than "strictly separated".
    // A real overlap fails; contact within the tolerance passes.
    const ok =
        metrics.ellipseGap >= -CONTACT_TOLERANCE &&
        metrics.halo > 0 &&
        metrics.intrusions === 0 &&
        issues.length === 0;
    console.log(
        `N=${size}  d=${prop.d.toFixed(1)} r_min=${prop.rMin.toFixed(1)} Δr=${prop.step}  |  ` +
            `uneven ${metrics.uneven.toFixed(2)}x  extent ${metrics.extent.toFixed(0)}  ` +
            `|  gap ${metrics.ellipseGap.toFixed(1)}  halo ${metrics.halo.toFixed(2)}  ` +
            `cluster ${metrics.clusterGap.toFixed(1)}  |  cell ${cell.min.toFixed(2)}-${cell.max.toFixed(2)}  ${ok ? 'OK' : 'FAIL'}`
    );
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
            m.intrusions === 0 ? '' : `${m.intrusions} intrusions`,
            r.issues === 0 ? '' : `${r.issues} validation issues`,
        ]
            .filter(Boolean)
            .join(', ');
        return `  <figure>
    <figcaption>
      <strong>N=${r.size}</strong> &mdash; d=${r.proposal.d.toFixed(1)}, r<sub>min</sub>=${r.proposal.rMin.toFixed(1)}, &Delta;r=${r.proposal.step}, grain ${(R_STICKER / r.proposal.step).toFixed(3)}
      <br>unevenness ${m.uneven.toFixed(2)}&times; &middot; cluster extent ${m.extent.toFixed(0)} &middot; ellipse gap ${m.ellipseGap.toFixed(1)} &middot; halo ${m.halo.toFixed(2)}
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
