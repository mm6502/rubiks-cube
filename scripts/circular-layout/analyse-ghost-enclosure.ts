/**
 * Enclose ghost circles AND minimise ellipse overlap: a two-objective search.
 *
 * Why this is its own problem. Ghost circles are emitted with r = stickerRadius
 * inside the TARGET's face group, and they sit one sticker radius further along
 * the arc than the sticker they belong to. So an ellipse that encloses only its
 * stickers is too small for its ghosts — they protrude, which is the reported
 * symptom. The previous solver never checked ghosts at all.
 *
 * The two objectives conflict. Enclosing ghosts needs a larger margin, and a
 * larger margin makes neighbouring ellipses intersect. Separating them needs the
 * offset, so this sweeps both trio offsets independently and, at each pair, takes
 * the smallest margin that encloses every circle.
 *
 * Hard constraint: minimum halo over stickers AND ghosts >= HALO_FLOOR.
 * Soft objective:   fewest overlapping ellipse pairs, then the largest worst gap.
 *
 * Usage:
 *   npx tsx scripts/circular-layout/analyse-ghost-enclosure.ts            # coarse
 *   npx tsx scripts/circular-layout/analyse-ghost-enclosure.ts --refine   # finer
 */
import { resolveParameters } from '@/views/circular/svg-generator/generate';
import type { ParametersFile } from '@/views/circular/svg-generator/generate';
import {
    ALL_FACES,
    faceEllipseGeometry,
    faceStickerPositions,
} from '@/views/circular/svg-generator/geometry';
import type { CircularSvgParameters } from '@/views/circular/svg-generator/geometry';
import { allGhosts } from '@/views/circular/svg-generator/ghosts';

const R_S = 7;
const HALO_FLOOR = 0.1; // a hairline: ghosts should sit just inside, not on, the edge
const GHOST_OFFSET = 1;

/** Ring geometry per size, matching the renderer's proposal table. */
const RING: Record<number, { d: number; rMin: number; step: number; aspect: number }> = {
    3: { d: 100, rMin: 70, step: 15, aspect: 1.0177 },
    4: { d: 113.619, rMin: 79.533, step: 15, aspect: 1.05 },
    5: { d: 141.163, rMin: 98.814, step: 15, aspect: 1.0 },
    6: { d: 169.396, rMin: 118.577, step: 15, aspect: 1.0 },
    7: { d: 198.229, rMin: 138.76, step: 15, aspect: 0.95 },
};

function paramsFor(
    size: number,
    margin: number,
    oN: number,
    oF: number,
    rMinOverride?: number
): CircularSvgParameters {
    const b = RING[size];
    const rMin = rMinOverride ?? b.rMin;
    const file: ParametersFile = {
        defaults: {
            triangleSide: b.d,
            innerRadius: rMin,
            ringStep: b.step,
            stickerRadius: R_S,
            centreX: 200,
            centreY: 219,
            apexHeight: b.d * 0.87,
            ellipseOffsetNear: oN,
            ellipseOffsetFar: oF,
            ellipseMargin: margin,
            ellipseAspect: b.aspect,
            labelWidth: 20,
            labelHeight: 16,
            faceLabelGap: 1,
            ghostRadiusOffset: GHOST_OFFSET,
        },
        sizes: { [String(size)]: { viewBox: '0 0 1 1' } },
    };
    return resolveParameters(size, file);
}

interface Ell {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    rotation: number;
}

/** The ellipse's extent along a unit direction, from its support function. */
function support(e: Ell, ux: number, uy: number): number {
    const th = (e.rotation * Math.PI) / 180;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    return Math.hypot(e.rx * (ux * cos + uy * sin), e.ry * (ux * -sin + uy * cos));
}

/** Exact signed gap between two filled ellipses; <= 0 means they intersect. */
function gap(a: Ell, b: Ell, samples = 2048): number {
    let best = -Infinity;
    for (let i = 0; i < samples; i++) {
        const t = (2 * Math.PI * i) / samples;
        const ux = Math.cos(t);
        const uy = Math.sin(t);
        const v = (b.cx - a.cx) * ux + (b.cy - a.cy) * uy - support(a, ux, uy) - support(b, ux, uy);
        if (v > best) best = v;
    }
    return best;
}

/**
 * Worst clearance between a circle's edge and an ellipse's boundary, over every
 * sticker AND ghost that should sit inside it. Negative means it pokes out.
 */
function enclosure(size: number, p: CircularSvgParameters): { halo: number; which: string } {
    const ghosts = allGhosts(size, p, { radiusOffset: GHOST_OFFSET });

    // Group ghosts by the face whose ellipse must contain them: a ghost is drawn
    // in its TARGET's group, so the target's ellipse is the one that must hold it.
    const byFace = new Map<string, { x: number; y: number; tag: string }[]>();
    for (const g of ghosts) {
        const list = byFace.get(String(g.face)) ?? [];
        list.push({ x: g.x, y: g.y, tag: `${g.face} ghost of ${g.target}` });
        byFace.set(String(g.face), list);
    }

    let worst = Infinity;
    let which = '';

    for (const face of ALL_FACES) {
        const g = faceEllipseGeometry(face, size, p);
        const e: Ell = { cx: g.cx, cy: g.cy, rx: g.rx, ry: g.ry, rotation: g.rotation ?? 0 };
        const th = (-e.rotation * Math.PI) / 180;

        const circles = [
            ...faceStickerPositions(face, size, p).map(q => ({
                x: q.x,
                y: q.y,
                tag: `${face} sticker`,
            })),
            ...(byFace.get(String(face)) ?? []),
        ];

        for (const c of circles) {
            const dx = c.x - e.cx;
            const dy = c.y - e.cy;
            const lx = dx * Math.cos(th) - dy * Math.sin(th);
            const ly = dx * Math.sin(th) + dy * Math.cos(th);
            const r = Math.hypot(lx, ly);
            if (r === 0) continue;
            const boundary = 1 / Math.sqrt((lx / r / e.rx) ** 2 + (ly / r / e.ry) ** 2);
            const halo = boundary - r - R_S;
            if (halo < worst) {
                worst = halo;
                which = c.tag;
            }
        }
    }
    return { halo: worst, which };
}

/** Worst ellipse-to-ellipse gap, and how many pairs intersect. */
function overlaps(
    size: number,
    p: CircularSvgParameters
): { worst: number; arg: string; pairs: number } {
    const cells = ALL_FACES.map(f => {
        const g = faceEllipseGeometry(f, size, p);
        return {
            face: String(f),
            e: { cx: g.cx, cy: g.cy, rx: g.rx, ry: g.ry, rotation: g.rotation ?? 0 },
        };
    });

    let worst = Infinity;
    let arg = '';
    let pairs = 0;
    for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
            const d = gap(cells[i].e, cells[j].e);
            if (d <= 0) pairs++;
            if (d < worst) {
                worst = d;
                arg = `${cells[i].face}-${cells[j].face}${d <= 0 ? ' (overlap)' : ''}`;
            }
        }
    }
    return { worst, arg, pairs };
}

/** Smallest margin that encloses every circle at this offset pair. */
function enclosingMargin(
    size: number,
    oN: number,
    oF: number,
    rMinOverride?: number
): number | null {
    for (let m = 0.2; m <= 6 + 1e-9; m += 0.05) {
        const margin = Math.round(m * 100) / 100;
        if (enclosure(size, paramsFor(size, margin, oN, oF, rMinOverride)).halo >= HALO_FLOOR) {
            return margin;
        }
    }
    return null;
}

interface Result {
    size: number;
    margin: number;
    oN: number;
    oF: number;
    rMin: number;
    pairs: number;
    worst: number;
    halo: number;
    binding: string;
}

const refine = process.argv.includes('--refine');
const OFFSET_LO = refine ? -0.05 : -0.1;
const OFFSET_HI = 0.35;
const OFFSET_STEP = refine ? 0.01 : 0.05;

console.log(
    `Enclosure-aware search (halo floor ${HALO_FLOOR}, ghost offset ${GHOST_OFFSET}, offsets ${OFFSET_LO}..${OFFSET_HI} step ${OFFSET_STEP})\n`
);

/**
 * Search one size. `rMin` values are tried in order, so the base geometry is
 * preferred and a larger inner radius is only reached for when the base cannot
 * enclose the ghosts without overlap.
 */
function searchSize(
    size: number,
    rMinValues: number[],
    offsetStep: number,
    offsetLo: number,
    offsetHi: number
): { options: Result[]; usedRMin: number } | null {
    const offsets: number[] = [];
    for (let v = offsetLo; v <= offsetHi + 1e-9; v += offsetStep) {
        offsets.push(Math.round(v * 100) / 100);
    }

    for (const rMin of rMinValues) {
        const options: Result[] = [];

        for (const oN of offsets) {
            for (const oF of offsets) {
                const margin = enclosingMargin(size, oN, oF, rMin);
                if (margin === null) continue;

                const p = paramsFor(size, margin, oN, oF, rMin);
                const ov = overlaps(size, p);
                const { halo, which } = enclosure(size, p);
                options.push({
                    size,
                    margin,
                    oN,
                    oF,
                    rMin,
                    pairs: ov.pairs,
                    worst: ov.worst,
                    halo,
                    binding: which,
                });
            }
        }

        if (options.some(o => o.pairs === 0)) return { options, usedRMin: rMin };
    }

    // Nothing was fully overlap-free; return the best attempt from the base
    // geometry so the caller can report how far short it falls.
    const options: Result[] = [];
    const rMin = rMinValues[0];
    for (const oN of offsets) {
        for (const oF of offsets) {
            const margin = enclosingMargin(size, oN, oF, rMin);
            if (margin === null) continue;
            const p = paramsFor(size, margin, oN, oF, rMin);
            const ov = overlaps(size, p);
            const { halo, which } = enclosure(size, p);
            options.push({
                size,
                margin,
                oN,
                oF,
                rMin,
                pairs: ov.pairs,
                worst: ov.worst,
                halo,
                binding: which,
            });
        }
    }
    return options.length ? { options, usedRMin: rMin } : null;
}

const results: Result[] = [];

for (const size of [3, 4, 5, 6, 7]) {
    // Base r_min first; larger values only if the base cannot do it. This is the
    // knob that opens inter-cluster room, and it costs sticker clearance, so it
    // is a last resort rather than the default.
    const baseRMin = RING[size].rMin;
    const candidates = [
        baseRMin,
        Math.round(baseRMin * 1.1 * 10) / 10,
        Math.round(baseRMin * 1.2 * 10) / 10,
        Math.round(baseRMin * 1.3 * 10) / 10,
        Math.round(baseRMin * 1.45 * 10) / 10,
    ];

    const found = searchSize(size, candidates, OFFSET_STEP, OFFSET_LO, OFFSET_HI);
    if (!found) {
        console.log(`N=${size}: no configuration encloses the ghosts`);
        continue;
    }

    const { options, usedRMin } = found;
    options.sort((a, b) => (a.pairs !== b.pairs ? a.pairs - b.pairs : b.worst - a.worst));
    const best = options[0];
    results.push(best);

    const free = options.filter(o => o.pairs === 0).length;
    console.log(
        `N=${size}:  r_min ${usedRMin}${usedRMin !== baseRMin ? ' (raised from ' + baseRMin + ')' : ''}  —  ${free} of ${options.length} offset pairs are overlap-free`
    );
    for (const o of options.slice(0, 4)) {
        console.log(
            `    oN=${o.oN.toFixed(2).padStart(5)} oF=${o.oF.toFixed(2).padStart(5)} margin=${o.margin.toFixed(2)} | pairs ${o.pairs} | worst ${o.worst.toFixed(2).padStart(7)} | halo ${o.halo.toFixed(2)} | ${o.binding}`
        );
    }
    console.log('');
}

console.log('=== Best per size ===\n');
for (const r of results) {
    console.log(
        `  N=${r.size}:  r_min ${r.rMin},  margin ${r.margin},  oN ${r.oN},  oF ${r.oF}   ->  ${r.pairs} overlapping pair(s), worst gap ${r.worst.toFixed(2)}, halo ${r.halo.toFixed(2)}`
    );
}

const stuck = results.filter(r => r.pairs > 0);
if (stuck.length) {
    console.log('\n  Enclosing the ghosts cannot avoid overlap at:');
    for (const r of stuck) {
        console.log(
            `    N=${r.size}:  least achievable overlap is ${Math.abs(r.worst).toFixed(2)} units deep`
        );
    }
}
