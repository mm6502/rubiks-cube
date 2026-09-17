/**
 * How far is each face label from its ellipse, and what would "almost touching"
 * require?
 *
 * Two things this measures rather than assumes:
 *
 *   1. Which semi-axis lies along the label's outward direction. faceEllipse
 *      sets rotation = angle(outward) + 90 degrees, so the ellipse's LOCAL X axis
 *      is perpendicular to outward and its LOCAL Y axis lies along it. Since
 *      rx corresponds to local X and ry to local Y, the outward reach is ry —
 *      not max(rx, ry). The emit code uses max(rx, ry), so it overshoots by
 *      (rx - ry) before any gap is added.
 *
 *   2. The label is a 20x20 rect centred on the anchor, not a point, so the gap
 *      between the rect and the ellipse also depends on how much of the rect
 *      lies along the outward direction. For a square of half-size h, that
 *      extent is h*|ux| + h*|uy| — the square's support function.
 *
 * Reported per size: the current gap, and the reach that would make it ~0.
 */
import { loadParameters, resolveParameters } from '@/views/circular/svg-generator/generate';
import type { ParametersFile } from '@/views/circular/svg-generator/generate';
import { ALL_FACES, faceEllipseGeometry } from '@/views/circular/svg-generator/geometry';
import type { CircularSvgParameters } from '@/views/circular/svg-generator/geometry';

const R_S = 7;
const LABEL_HALF = 10; // labelWidth/Height are 20, and the rect is centred

interface Ell {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    rotation: number;
}
interface Pt {
    x: number;
    y: number;
}

/** Configuration C's ellipse values, per size. */
const C: Record<number, { margin: number; oN: number; oF: number }> = {
    2: { margin: 2.4, oN: 0.05, oF: 0.05 },
    3: { margin: 1.739, oN: 0, oF: 0 },
    4: { margin: 1.474, oN: 0, oF: 0 },
    5: { margin: 1.929, oN: 0, oF: 0 },
    6: { margin: 2.215, oN: 0, oF: 0 },
    7: { margin: 2.879, oN: 0, oF: 0 },
};

/** Ring geometry per size, matching the renderer's proposal table. */
const RING: Record<number, { d: number; rMin: number; step: number; aspect: number }> = {
    2: { d: 100, rMin: 75, step: 20, aspect: 1.0 },
    3: { d: 100, rMin: 70, step: 15, aspect: 1.0177 },
    4: { d: 113.619, rMin: 79.533, step: 15, aspect: 1.05 },
    5: { d: 141.163, rMin: 98.814, step: 15, aspect: 1.0 },
    6: { d: 169.396, rMin: 118.577, step: 15, aspect: 1.0 },
    7: { d: 198.229, rMin: 138.76, step: 15, aspect: 0.95 },
};

function paramsFor(size: number): CircularSvgParameters {
    const b = RING[size];
    const c = C[size];
    // parameters.json only carries the sizes the app ships, so the file is
    // synthesised here the same way the renderer does it.
    const file: ParametersFile = {
        defaults: {
            triangleSide: b.d,
            innerRadius: b.rMin,
            ringStep: b.step,
            stickerRadius: R_S,
            centreX: 200,
            centreY: 219,
            apexHeight: b.d * 0.87,
            ellipseOffsetNear: c.oN,
            ellipseOffsetFar: c.oF,
            ellipseMargin: c.margin,
            ellipseAspect: b.aspect,
            labelWidth: 20,
            labelHeight: 16,
            faceLabelGap: 1,
            ghostRadiusOffset: 1,
        },
        sizes: { [String(size)]: { viewBox: '0 0 1 1' } },
    };
    return resolveParameters(size, file);
}

/** The ellipse's extent along a unit direction, from its support function. */
function support(e: Ell, ux: number, uy: number): number {
    const th = (e.rotation * Math.PI) / 180;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    return Math.hypot(e.rx * (ux * cos + uy * sin), e.ry * (ux * -sin + uy * cos));
}

/** The square's extent along a unit direction, from its support function. */
function squareSupport(ux: number, uy: number, half = LABEL_HALF): number {
    return half * Math.abs(ux) + half * Math.abs(uy);
}

/** Distance from a point to a rectangle; 0 when inside. */
function distanceToRect(p: Pt, centre: Pt, half: number): number {
    const dx = Math.max(Math.abs(p.x - centre.x) - half, 0);
    const dy = Math.max(Math.abs(p.y - centre.y) - half, 0);
    return Math.hypot(dx, dy);
}

/** Closest distance between an ellipse's boundary and a label rect (0 if they meet). */
function boundaryToRectGap(e: Ell, centre: Pt, half = LABEL_HALF, samples = 1440): number {
    let best = Infinity;
    for (let i = 0; i < samples; i++) {
        const t = (2 * Math.PI * i) / samples;
        const lx = e.rx * Math.cos(t);
        const ly = e.ry * Math.sin(t);
        const th = (e.rotation * Math.PI) / 180;
        const p = {
            x: e.cx + lx * Math.cos(th) - ly * Math.sin(th),
            y: e.cy + lx * Math.sin(th) + ly * Math.cos(th),
        };
        const d = distanceToRect(p, centre, half);
        if (d < best) best = d;
    }
    return best;
}

function triangleCentroid(p: CircularSvgParameters): Pt {
    const z = { x: p.centreX - p.triangleSide / 2, y: p.centreY };
    const x = { x: p.centreX + p.triangleSide / 2, y: p.centreY };
    const y = { x: p.centreX, y: p.centreY - p.apexHeight };
    return { x: (z.x + x.x + y.x) / 3, y: (z.y + x.y + y.y) / 3 };
}

console.log('Face-label gap from its own ellipse\n');
console.log('  N | face | rx x ry   | outward |  old gap |  new gap');

const summary: Record<number, number[]> = {};

for (const size of [2, 3, 4, 5, 6, 7]) {
    const p = paramsFor(size);
    const tri = triangleCentroid(p);
    summary[size] = [];

    for (const face of ALL_FACES) {
        const g = faceEllipseGeometry(face, size, p);
        const e: Ell = { cx: g.cx, cy: g.cy, rx: g.rx, ry: g.ry, rotation: g.rotation ?? 0 };

        const outward = { x: e.cx - tri.x, y: e.cy - tri.y };
        const len = Math.hypot(outward.x, outward.y) || 1;
        const u = { x: outward.x / len, y: outward.y / len };

        // What the old code did: max(rx, ry) + 2*stickerRadius (the bug).
        const oldReach = Math.max(e.rx, e.ry) + 2 * R_S;
        const oldAnchor = { x: e.cx + u.x * oldReach, y: e.cy + u.y * oldReach };
        const oldGap = boundaryToRectGap(e, oldAnchor);

        // What the fixed code does: ry + the label's own extent + a hairline gap.
        const newReach = e.ry + squareSupport(u.x, u.y) + paramsFor(size).faceLabelGap;
        const newAnchor = { x: e.cx + u.x * newReach, y: e.cy + u.y * newReach };
        const newGap = boundaryToRectGap(e, newAnchor);

        summary[size].push(newGap);

        console.log(
            `  ${size} | ${String(face).padEnd(4)} | ${e.rx.toFixed(1).padStart(4)} x ${e.ry.toFixed(1).padStart(4)} | ` +
                `(${u.x.toFixed(2)},${u.y.toFixed(2)}) | ${oldGap.toFixed(2).padStart(10)} | ${newGap.toFixed(2).padStart(12)}`
        );
    }
    const avg = summary[size].reduce((a, b) => a + b, 0) / summary[size].length;
    console.log(`       average gap after the fix: ${avg.toFixed(2)}\n`);
}

console.log('Reference asset (view.svg), for comparison:');
{
    const p = resolveParameters(3, loadParameters());
    // The reference's own hardcoded label anchors, read from the committed file.
    const REF: Record<string, Pt> = {
        U: { x: 200, y: 115 },
        D: { x: 200, y: 326 },
        L: { x: 85, y: 120 },
        B: { x: 315, y: 120 },
        F: { x: 133, y: 228 },
        R: { x: 267, y: 228 },
    };
    for (const face of ALL_FACES) {
        const g = faceEllipseGeometry(face, 3, p);
        const e: Ell = { cx: g.cx, cy: g.cy, rx: g.rx, ry: g.ry, rotation: g.rotation ?? 0 };
        const gap = boundaryToRectGap(e, REF[String(face)]);
        console.log(
            `  ${String(face).padEnd(2)} anchor (${REF[String(face)].x}, ${REF[String(face)].y})  ellipse ${e.rx.toFixed(1)}x${e.ry.toFixed(1)}  gap ${gap.toFixed(2)}`
        );
    }
}
