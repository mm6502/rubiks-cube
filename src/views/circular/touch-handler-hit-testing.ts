import { Face } from '@/cube/types';
import type { CubeState, StickerId } from '@/cube/types';
import { dot2, normalize2 } from '@/cube/utils/math';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { Point2D } from '@/interaction/types';

import { FACE_TOP_DIRECTION_HINTS, type FaceScreenBasis } from './direction-mapping';
import { type AxisCircle, getCenterOfElement } from './svg-tools';
import { circleProximity, orientedTangentAtPoint } from './touch-handler-geometry';
import { CROSSING_PROXIMITY_MAX_SVG } from './touch-handler-types';
import type { StickerHit } from './touch-handler-types';

// ── Sticker resolution ──────────────────────────────────────────────────────

/**
 * Resolve a sticker DOM id to its face, row, and column in the cube model.
 *
 * Returns `undefined` when the id is missing, the cube state is unavailable,
 * or the sticker's face position is out of range.
 */
export function resolveStickerHit(
    stickerId: string | undefined,
    getCubeState: (() => CubeState) | undefined,
    getCubeSize: () => number
): StickerHit | undefined {
    if (!stickerId || !getCubeState) {
        return undefined;
    }

    const cubeState = getCubeState();
    /* c8 ignore next */
    if (!cubeState) {
        return undefined;
    }

    const modelSticker = CubeStateUtils.getStickerById(cubeState, stickerId as StickerId);
    /* c8 ignore next */
    if (!modelSticker) {
        return undefined;
    }

    const cubeSize = getCubeSize();
    const facePosition = modelSticker.facePosition;
    /* c8 ignore next */
    if (!Number.isFinite(facePosition)) {
        return undefined;
    }

    const row = Math.floor(facePosition / cubeSize);
    const col = facePosition % cubeSize;
    if (row < 0 || row >= cubeSize || col < 0 || col >= cubeSize) {
        return undefined;
    }

    const face = modelSticker.currentFace as Face | undefined;
    /* c8 ignore next */
    if (!face) {
        return undefined;
    }

    return {
        face,
        row,
        col,
        stickerId,
    };
}

// ── Face ellipse hit ────────────────────────────────────────────────────────

/** If `element` (or an ancestor) is a face ellipse inside `svgRoot`, return the corresponding `Face`; otherwise `undefined`. */
export function getFaceEllipseHit(
    svgRoot: SVGSVGElement,
    element: Element | null
): Face | undefined {
    const ellipse = element?.closest('ellipse[id$="-face-ellipse"]') as SVGEllipseElement | null;
    if (!ellipse || !svgRoot.contains(ellipse)) {
        return undefined;
    }

    const match = ellipse.id.match(/^([UDFBLR])-face-ellipse$/);
    if (!match) {
        return undefined;
    }

    const face = match[1] as Face;
    return Object.values(Face).includes(face) ? face : undefined;
}

// ── Crossing basis (two-circle tangent computation) ─────────────────────────

/**
 * Compute an orthonormal screen-space basis (upDir, rightDir) at `point` on `face`
 * by finding the two closest axis circles from different axes and using their
 * tangent directions, oriented according to `FACE_TOP_DIRECTION_HINTS`.
 *
 * Returns `undefined` when no two qualifying circles are close enough.
 */
export function buildCrossingBasisAtPoint(
    axisCircles: AxisCircle[],
    face: Face,
    point: Point2D
): FaceScreenBasis | undefined {
    const upHint = normalize2(FACE_TOP_DIRECTION_HINTS[face]);
    /* c8 ignore next 3 */
    if (!upHint) {
        return undefined;
    }

    // Sort all circles by proximity to the touch point, then pick the closest pair
    // that belongs to TWO DIFFERENT axes. Concentric rings of the same axis share
    // the same center, so their tangents at any point are identical — using them
    // would collapse upDir ≈ rightDir and give a degenerate (line) basis.
    const sorted = axisCircles
        .map(circle => ({ circle, proximity: circleProximity(point, circle) }))
        .sort((a, b) => a.proximity - b.proximity);

    const first = sorted[0];
    const second = sorted.find(entry => entry.circle.axis !== first?.circle.axis);

    if (!first || !second || second.proximity > CROSSING_PROXIMITY_MAX_SVG) {
        return undefined;
    }

    const circles = [first, second];

    const upCandidateA = orientedTangentAtPoint(point, circles[0].circle, upHint);
    const upCandidateB = orientedTangentAtPoint(point, circles[1].circle, upHint);
    /* c8 ignore next 3 */
    if (!upCandidateA || !upCandidateB) {
        return undefined;
    }

    const useFirstForUp =
        Math.abs(dot2(upCandidateA, upHint)) >= Math.abs(dot2(upCandidateB, upHint));
    const rightCircle = useFirstForUp ? circles[1].circle : circles[0].circle;
    const upDir = useFirstForUp ? upCandidateA : upCandidateB;

    const rightHint = { x: -upHint.y, y: upHint.x };
    const rightDir = orientedTangentAtPoint(point, rightCircle, rightHint) ?? {
        x: -upDir.y,
        y: upDir.x,
    };

    const normalizedRight = normalize2(rightDir);
    /* c8 ignore next 3 */
    if (!normalizedRight) {
        return undefined;
    }

    return {
        upDir,
        rightDir: normalizedRight,
    };
}

// ── LBD dead zone (interior triangle between L, B, D labels) ───────────────

/**
 * Compute the three vertices of the dead-zone triangle formed by the L, B, and D
 * face label elements. Returns `undefined` when the labels are not present in the SVG.
 */
export function getLbdTrianglePoints(
    svgRoot: SVGSVGElement
): { topLeft: Point2D; topRight: Point2D; bottom: Point2D } | undefined {
    const getLabelGeometry = (id: string) => {
        const group = svgRoot.querySelector(`#${id}`) as SVGGElement | null;
        /* c8 ignore next */ if (!group) return undefined;
        const rect = group.querySelector('rect') as SVGElement | null;
        /* c8 ignore next */ if (!rect) return undefined;
        // getCenterOfElement reads cx/cy; on <rect> those are absent → returns {0,0},
        // which is the correct local-space centre for a rect centred at the origin.
        const localCenter = getCenterOfElement(rect);
        const t = group.getAttribute('transform') ?? '';
        const m = t.match(/translate\(\s*([\d.+-]+)[\s,]+([\d.+-]+)\s*\)/);
        /* c8 ignore next */ if (!m) return undefined;
        const center = { x: Number(m[1]) + localCenter.x, y: Number(m[2]) + localCenter.y };
        const hw = parseFloat(rect.getAttribute('width') ?? '20') / 2;
        const hh = parseFloat(rect.getAttribute('height') ?? '20') / 2;
        return { center, hw, hh };
    };

    const l = getLabelGeometry('face-label-L');
    const b = getLabelGeometry('face-label-B');
    const d = getLabelGeometry('face-label-D');
    if (!l || !b || !d) return undefined;

    return {
        topLeft: { x: l.center.x - l.hw, y: l.center.y - l.hh },
        topRight: { x: b.center.x + b.hw, y: b.center.y - b.hh },
        bottom: { x: d.center.x, y: d.center.y + d.hh },
    };
}

/** Returns `true` when `svgPoint` falls inside the LBD dead-zone triangle, suppressing axis-circle proximity detection there. */
export function isInLbdDeadZone(svgRoot: SVGSVGElement, svgPoint: Point2D): boolean {
    const pts = getLbdTrianglePoints(svgRoot);
    if (!pts) return false;
    return isPointInTriangleLocal(svgPoint, pts.topLeft, pts.topRight, pts.bottom);
}

// ── Nearest sticker on face ─────────────────────────────────────────────────

/** Find the sticker on `face` whose SVG center is closest to `startSvg`, or `undefined` if none match. */
export function findNearestStickerOnFace(
    svgRoot: SVGSVGElement,
    face: Face,
    startSvg: Point2D,
    getCubeState: (() => CubeState) | undefined,
    getCubeSize: () => number
): StickerHit | undefined {
    const stickerElements = svgRoot.querySelectorAll<SVGCircleElement>('circle[data-sticker-id]');
    let bestSticker: StickerHit | undefined;
    let bestDistSq = Infinity;

    for (const el of stickerElements) {
        const stickerId = el.getAttribute('data-sticker-id') ?? undefined;
        const resolved = resolveStickerHit(stickerId, getCubeState, getCubeSize);
        if (!resolved || resolved.face !== face) {
            continue;
        }
        const cx = Number(el.getAttribute('cx') ?? 0);
        const cy = Number(el.getAttribute('cy') ?? 0);
        const dx = cx - startSvg.x;
        const dy = cy - startSvg.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestSticker = resolved;
        }
    }
    return bestSticker;
}

// ── Local helper (not exported) ─────────────────────────────────────────────

/**
 * Returns `true` when `p` is inside the triangle defined by `a`, `b`, and `c`.
 * Uses barycentric coordinates to determine the point's position relative to the triangle.
 */
function isPointInTriangleLocal(p: Point2D, a: Point2D, b: Point2D, c: Point2D): boolean {
    const sign = (p1: Point2D, p2: Point2D, p3: Point2D) =>
        (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    const d1 = sign(p, a, b);
    const d2 = sign(p, b, c);
    const d3 = sign(p, c, a);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
}
