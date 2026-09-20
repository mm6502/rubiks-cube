/**
 * For N>2: grow the face ellipses until the INNER trio touches, and give the
 * outer trio the same position relative to its own face.
 *
 * Terrain:
 *   * By 120-degree symmetry the six faces form two trios. U, R, F sit inside the
 *     triangle of axis centres — the "inner" trio. D, L, B sit outside it.
 *   * The symmetry is only APPROXIMATE, because the apex height is hand-rounded
 *     to 0.87·d rather than √3/2. Measured spread within an orbit reaches 0.63
 *     units, so every figure below is the MINIMUM gap over the pairs in a class.
 *     Solving against an average would let some pairs overlap silently.
 *   * "Same position relative to its own face" is read as the same offset
 *     parameter for both trios, oF = oN. The offset also pushes ellipses outward,
 *     so with oF = oN the two trios move together and one offset is chosen.
 *
 * With oF = oN there are two free numbers (margin, offset) and one target
 * (closest inner pair gap = 0), so the margin is solved by bisection for each
 * offset and the offset is then picked to maximise the tightest remaining gap.
 *
 * Usage:
 *   npx tsx scripts/circular-layout/analyse-tangency.ts
 *   npx tsx scripts/circular-layout/analyse-tangency.ts --json
 */
import type { Face } from '@/cube/types';
import {
    ALL_FACES,
    faceEllipseGeometry,
    faceStickerPositions,
} from '@/views/circular/svg-generator/geometry';
import type { CircularSvgParameters } from '@/views/circular/svg-generator/geometry';

const R_S = 7;
const INNER = ['U', 'R', 'F'];

// ---------------------------------------------------------------------------
// Exact geometry
// ---------------------------------------------------------------------------

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
    const c = Math.cos(th);
    const s = Math.sin(th);
    return Math.hypot(e.rx * (ux * c + uy * s), e.ry * (ux * -s + uy * c));
}

/**
 * Exact signed gap between two filled ellipses; <= 0 means they intersect.
 *
 * The support function is the right tool because it is defined for SOLID
 * ellipses, so one ellipse wholly inside another reports non-positive like any
 * other intersection. Sampling the two boundaries and taking the closest pair of
 * points fails on containment, and it also under-reports a crossing because no
 * sample lands exactly on it.
 */
function gap(a: Ell, b: Ell, samples = 4096): number {
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

/** Guards against a sign slip, which would invalidate every figure silently. */
function selfTest(): boolean {
    let ok = true;
    const check = (name: string, actual: number, expected: number, tol = 1e-3) => {
        if (Math.abs(actual - expected) > tol) {
            console.log(`  FAIL ${name}: expected ~${expected}, got ${actual.toFixed(6)}`);
            ok = false;
        }
    };

    const disk = (cx: number, r = 1): Ell => ({ cx, cy: 0, rx: r, ry: r, rotation: 0 });
    check('disjoint unit disks 4 apart', gap(disk(0), disk(4)), 2);
    if (gap(disk(0), disk(1.5)) > 0) {
        console.log('  FAIL overlapping disks reported positive');
        ok = false;
    }
    if (gap(disk(0, 10), disk(0, 1)) > 0) {
        console.log('  FAIL containment reported positive');
        ok = false;
    }
    const rotated: Ell = { cx: 0, cy: 0, rx: 5, ry: 1, rotation: 90 };
    check(
        'rotated extent on Y',
        gap(rotated, { cx: 0, cy: 8, rx: 0.001, ry: 0.001, rotation: 0 }),
        3,
        0.01
    );
    check(
        'rotated extent on X',
        gap(rotated, { cx: 8, cy: 0, rx: 0.001, ry: 0.001, rotation: 0 }),
        7,
        0.01
    );

    console.log(`self-test: ${ok ? 'PASS' : 'FAIL'}`);
    return ok;
}

// ---------------------------------------------------------------------------
// Configuration B, the starting point
// ---------------------------------------------------------------------------

interface Base {
    d: number;
    rMin: number;
    step: number;
    aspect: number;
    margin: number;
    oN: number;
    oF: number;
}

const B: Record<number, Base> = {
    3: { d: 100, rMin: 70, step: 15, aspect: 1.0177, margin: 1.4, oN: 0.05, oF: 0.05 },
    4: { d: 113.619, rMin: 79.533, step: 15, aspect: 1.05, margin: 2.0, oN: 0.2, oF: 0.2 },
    5: { d: 141.163, rMin: 98.814, step: 15, aspect: 1.0, margin: 1.6, oN: 0.05, oF: 0 },
    6: { d: 169.396, rMin: 118.577, step: 15, aspect: 1.0, margin: 1.8, oN: 0.05, oF: 0.05 },
    7: { d: 198.229, rMin: 138.76, step: 15, aspect: 0.95, margin: 2.2, oN: 0.05, oF: 0.05 },
};

function build(
    _size: number,
    b: Base,
    margin: number,
    oN: number,
    oF: number
): CircularSvgParameters {
    return {
        triangleSide: b.d,
        innerRadius: b.rMin,
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
        // Not read by faceEllipseGeometry or faceStickerPositions, so it cannot
        // affect this script's measurements — present only because the type
        // requires it. 1 matches parameters.json.
        faceLabelGap: 1,
    };
}

function ellipsesFor(size: number, p: CircularSvgParameters) {
    return ALL_FACES.map(f => {
        const g = faceEllipseGeometry(f, size, p);
        return {
            face: String(f),
            inner: INNER.includes(String(f)),
            e: { cx: g.cx, cy: g.cy, rx: g.rx, ry: g.ry, rotation: g.rotation ?? 0 },
        };
    });
}

interface Report {
    innerInner: number;
    outerOuter: number;
    innerOuter: number;
    overall: number;
    overallArg: string;
}

/** Minimum gap per class, plus the tightest pair overall. */
function classify(size: number, p: CircularSvgParameters): Report {
    const cells = ellipsesFor(size, p);
    let innerInner = Infinity;
    let outerOuter = Infinity;
    let innerOuter = Infinity;
    let overall = Infinity;
    let overallArg = '';

    for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
            const g = gap(cells[i].e, cells[j].e);
            const a = cells[i];
            const b = cells[j];
            if (a.inner && b.inner) innerInner = Math.min(innerInner, g);
            else if (!a.inner && !b.inner) outerOuter = Math.min(outerOuter, g);
            else innerOuter = Math.min(innerOuter, g);
            if (g < overall) {
                overall = g;
                overallArg = `${a.face}-${b.face}`;
            }
        }
    }
    return { innerInner, outerOuter, innerOuter, overall, overallArg };
}

/**
 * Worst clearance between a sticker's edge and its own ellipse boundary.
 *
 * Found by sampling the ellipse boundary and taking the closest approach to each
 * sticker's edge. That avoids the ray assumption a centre-to-boundary formula
 * would need, which is only exact where the ray is normal to the boundary and so
 * overestimates clearance on a flattened ellipse.
 */
function worstHalo(size: number, p: CircularSvgParameters): number {
    let worst = Infinity;
    for (const { face, e } of ellipsesFor(size, p)) {
        const th = (e.rotation * Math.PI) / 180;
        const cos = Math.cos(th);
        const sin = Math.sin(th);
        const boundary: { x: number; y: number }[] = [];
        for (let i = 0; i < 720; i++) {
            const t = (2 * Math.PI * i) / 720;
            const lx = e.rx * Math.cos(t);
            const ly = e.ry * Math.sin(t);
            boundary.push({ x: e.cx + lx * cos - ly * sin, y: e.cy + lx * sin + ly * cos });
        }
        for (const s of faceStickerPositions(face as Face, size, p)) {
            let nearest = Infinity;
            for (const q of boundary) {
                const d = Math.hypot(q.x - s.x, q.y - s.y);
                if (d < nearest) nearest = d;
            }
            worst = Math.min(worst, nearest - R_S);
        }
    }
    return worst;
}

// ---------------------------------------------------------------------------
// Baseline, then the solve
// ---------------------------------------------------------------------------

if (!selfTest()) process.exit(1);

console.log('\n=== Configuration B, as it stands ===\n');
console.log('  N | inner-inner | outer-outer | inner-outer | binding');
for (const size of [3, 4, 5, 6, 7]) {
    const b = B[size];
    const r = classify(size, build(size, b, b.margin, b.oN, b.oF));
    console.log(
        `  ${size} | ${r.innerInner.toFixed(2).padStart(11)} | ${r.outerOuter.toFixed(2).padStart(11)} | ` +
            `${r.innerOuter.toFixed(2).padStart(11)} | ${r.overallArg} (${r.overall.toFixed(2)})`
    );
}

console.log('\n=== Solved: margin grown until the inner trio touches, with oF = oN ===\n');
console.log(
    '  N | offset | margin | inner-inner | outer-outer | inner-outer | halo | rx x ry | chosen'
);

interface Choice {
    size: number;
    offset: number;
    margin: number;
    report: Report;
    halo: number;
    rx: number;
    ry: number;
}

const choices: Choice[] = [];

for (const size of [3, 4, 5, 6, 7]) {
    const b = B[size];
    const candidates: Choice[] = [];

    for (let oi = 0; oi <= 40; oi++) {
        const offset = Math.round(oi) / 100;
        const gapAt = (m: number) => classify(size, build(size, b, m, offset, offset)).innerInner;

        // Bracket the sign change, then halve. A wide bracket keeps this
        // independent of B's own margin.
        let lo = 0;
        let hi = 12;
        if (gapAt(hi) > 0) continue; // cannot be closed even by a huge ellipse
        if (gapAt(lo) < 0) continue; // already overlapping at zero margin

        for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2;
            if (gapAt(mid) > 0) lo = mid;
            else hi = mid;
        }

        const margin = Math.round(lo * 1000) / 1000;
        const p = build(size, b, margin, offset, offset);
        const probe = faceEllipseGeometry('U', size, p);
        candidates.push({
            size,
            offset,
            margin,
            report: classify(size, p),
            halo: worstHalo(size, p),
            rx: probe.rx,
            ry: probe.ry,
        });
    }

    if (!candidates.length) {
        console.log(`  ${size} | no offset in range can close the inner trio`);
        continue;
    }

    // Keep only candidates that touch the inner trio without overlapping
    // elsewhere and without clipping a sticker, then take the widest gap left.
    const valid = candidates.filter(
        c => c.report.overall >= -0.05 && c.halo > 0 && c.report.innerOuter > 0
    );

    if (!valid.length) {
        const best = candidates.reduce((a, c) => (c.report.overall > a.report.overall ? c : a));
        console.log(`  ${size} | no offset closes the inner trio without a side effect`);
        console.log(
            `        best attempt: offset=${best.offset} margin=${best.margin} ` +
                `inner-inner=${best.report.innerInner.toFixed(2)} inner-outer=${best.report.innerOuter.toFixed(2)} halo=${best.halo.toFixed(2)}`
        );
        continue;
    }

    valid.sort((a, c) => c.report.innerOuter - a.report.innerOuter);
    const pick = valid[0];
    choices.push(pick);

    for (const c of valid.slice(0, 3)) {
        const r = c.report;
        console.log(
            `  ${size} | ${c.offset.toFixed(2).padStart(6)} | ${c.margin.toFixed(3).padStart(6)} | ` +
                `${r.innerInner.toFixed(3).padStart(11)} | ${r.outerOuter.toFixed(2).padStart(11)} | ` +
                `${r.innerOuter.toFixed(2).padStart(11)} | ${c.halo.toFixed(2).padStart(4)} | ` +
                `${c.rx.toFixed(1)} x ${c.ry.toFixed(1)} | ${c === pick ? 'PICK' : ''}`
        );
    }
}

console.log('\n=== Result ===\n');
for (const c of choices) {
    console.log(
        `  N=${c.size}:  margin ${c.margin},  oN = oF = ${c.offset}` +
            `   (inner-inner ${c.report.innerInner.toFixed(3)}, inner-outer ${c.report.innerOuter.toFixed(2)}, halo ${c.halo.toFixed(2)})`
    );
}

if (process.argv.includes('--json')) {
    console.log('\nJSON patch for the renderer:\n');
    for (const c of choices) {
        console.log(`    ${c.size}: { margin: ${c.margin}, oN: ${c.offset}, oF: ${c.offset}, },`);
    }
}
