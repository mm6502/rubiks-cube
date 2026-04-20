import { Axis, Face } from '@/cube/types';
import { distance2, dot2, negate2, normalize2 } from '@/cube/utils/math';
import {
    axisLayerToNotation,
    inferMoveFromFaceRotation,
    inferWholeCubeMove,
} from '@/interaction/move-inference';
import {
    DragDirection,
    InteractionContext,
    Point2D,
    ViewInteractionAdapter,
} from '@/interaction/types';

import { buildFaceScreenBasisByFace, mapDirectionToFaceBasis } from './direction-mapping';
import type { AxisCircle } from './svg-tools';

// ── SVG line helper ─────────────────────────────────────────────────────────

/** Position an SVG `<line>` symmetrically about `center` along `axisDir`, extending `arm` pixels in each direction. */
export function setLineFromBasis(
    line: SVGLineElement,
    center: Point2D,
    axisDir: Point2D,
    arm: number
): void {
    line.setAttribute('x1', `${center.x - axisDir.x * arm}`);
    line.setAttribute('y1', `${center.y - axisDir.y * arm}`);
    line.setAttribute('x2', `${center.x + axisDir.x * arm}`);
    line.setAttribute('y2', `${center.y + axisDir.y * arm}`);
}

// ── Axis center / nearest-axis utilities ────────────────────────────────────

/** Build a lookup from each axis to its center point (taken from the first circle of that axis). */
export function collectAxisCentersByAxis(
    axisCircles: AxisCircle[]
): Partial<Record<Axis, Point2D>> {
    const centers: Partial<Record<Axis, Point2D>> = {};
    for (const circle of axisCircles) {
        if (!centers[circle.axis]) {
            centers[circle.axis] = { x: circle.cx, y: circle.cy };
        }
    }
    return centers;
}

/** Return the axis whose center is closest (squared Euclidean) to `point`, or `undefined` if `centers` is empty. */
export function getNearestAxisByPoint(
    point: Point2D,
    centers: Partial<Record<Axis, Point2D>>
): Axis | undefined {
    let nearest: Axis | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
        const center = centers[axis];
        if (!center) {
            continue;
        }

        const dx = point.x - center.x;
        const dy = point.y - center.y;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
            nearest = axis;
            nearestDistance = distance;
        }
    }

    return nearest;
}

// ── Interaction context helpers ─────────────────────────────────────────────

/** Extract the start view-point stored in `context.metadata` by the touch handler, if present. */
export function getStartViewPointFromContext(context: InteractionContext): Point2D | undefined {
    const x = context.metadata?.['startViewPointX'];
    const y = context.metadata?.['startViewPointY'];
    if (typeof x !== 'number' || typeof y !== 'number') {
        return undefined;
    }

    return { x, y };
}

// ── Axis / layer notation ───────────────────────────────────────────────────

/** Convert an axis + direction to whole-cube notation (e.g. `Axis.X, true` → `"x"`, `Axis.Y, false` → `"y'"`). */
export function axisToWholeCubeNotation(axis: Axis, isClockwise: boolean): string {
    const base = axis.toLowerCase();
    return isClockwise ? base : `${base}'`;
}

/** Produce the canonical string key for an axis circle (e.g. `"X-1"`). */
export function getAxisCircleKey(axis: Axis, layer: number): string {
    return `${axis}-${layer}`;
}

/** Parse a key produced by `getAxisCircleKey` back into axis + layer, or `undefined` if the format is invalid. */
export function parseAxisCircleKey(key: string): { axis: Axis; layer: number } | undefined {
    const match = key.match(/^([XYZ])-(\d+)$/);
    if (!match) {
        return undefined;
    }

    const axis = match[1] as Axis;
    const layer = Number(match[2]);
    if (!Number.isInteger(layer)) {
        return undefined;
    }

    return { axis, layer };
}

/**
 * Returns true when the given axis/layer's WCA "clockwise" convention points in the opposite
 * direction to the axis's canonical positive direction.
 *
 * Canonical directions (matching WCA whole-cube rotations):
 *   x = R face (last layer)  — all other X layers (L, M, …) are reversed
 *   y = U face (last layer)  — all other Y layers (D, E, …) are reversed
 *   z = F face (layer 0)     — inner slices (S, …) follow F and are NOT reversed;
 *                               only B (last layer) is reversed
 */
export function isAxisLayerReversedFromCanonical(
    axis: Axis,
    layerIndex: number,
    cubeSize: number
): boolean {
    if (axis === Axis.Z) {
        return layerIndex === cubeSize - 1;
    }
    return layerIndex < cubeSize - 1;
}

/** Compare two axis-layer pairs for sorting: first by axis (X < Y < Z), then by ascending layer index. */
export function compareAxisLayer(
    a: { axis: Axis; layer: number },
    b: { axis: Axis; layer: number }
): number {
    const axisRank = { [Axis.X]: 0, [Axis.Y]: 1, [Axis.Z]: 2 };
    const byAxis = axisRank[a.axis] - axisRank[b.axis];
    if (byAxis !== 0) {
        return byAxis;
    }
    return a.layer - b.layer;
}

// ── Circle geometry ─────────────────────────────────────────────────────────

/** Absolute distance from `point` to the circumference of `circle` (0 = exactly on the ring). */
export function circleProximity(point: Point2D, circle: AxisCircle): number {
    const distance = distance2(point, { x: circle.cx, y: circle.cy });
    return Math.abs(distance - circle.r);
}

/**
 * Returns true when point `p` lies inside (or on the edge of) the triangle
 * defined by vertices a, b, c using the sign-of-cross-product method.
 */
export function isPointInTriangle(p: Point2D, a: Point2D, b: Point2D, c: Point2D): boolean {
    const sign = (p1: Point2D, p2: Point2D, p3: Point2D) =>
        (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    const d1 = sign(p, a, b);
    const d2 = sign(p, b, c);
    const d3 = sign(p, c, a);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
}

/**
 * Compute radial boundaries for an axis group of circles sorted by ascending radius.
 *
 * Each inter-circle gap is split equally (midpoint). The innermost and outermost
 * circles extend by half the nearest gap so every band has the same width.
 *
 * Returns N+1 boundary values for N circles: [innerEdge, b01, b12, ..., outerEdge].
 */
export function computeBiasedBoundaries(group: AxisCircle[]): number[] {
    if (group.length <= 1) {
        return [group[0]?.r ?? 0, group[0]?.r ?? 0];
    }

    // Inter-circle boundaries: midpoint of each gap.
    const interBoundaries: number[] = [];
    for (let i = 0; i < group.length - 1; i += 1) {
        interBoundaries.push((group[i].r + group[i + 1].r) / 2);
    }

    // Extend inner/outer edges by half the nearest gap so all bands are equal width.
    const firstHalfGap = interBoundaries[0] - group[0].r;
    const lastHalfGap = group[group.length - 1].r - interBoundaries[interBoundaries.length - 1];
    const innerEdge = group[0].r - firstHalfGap;
    const outerEdge = group[group.length - 1].r + lastHalfGap;

    return [Math.max(0, innerEdge), ...interBoundaries, outerEdge];
}

/**
 * Compute the unit tangent to `circle` at the projection of `point`, oriented
 * so that it points roughly in the same direction as `hint`.
 */
export function orientedTangentAtPoint(
    point: Point2D,
    circle: AxisCircle,
    hint: Point2D
): Point2D | undefined {
    const radial = normalize2({ x: point.x - circle.cx, y: point.y - circle.cy });
    if (!radial) {
        return undefined;
    }

    const tangent = { x: -radial.y, y: radial.x };
    const aligned = dot2(tangent, hint) >= 0 ? tangent : negate2(tangent);
    return normalize2(aligned);
}

// ── Default interaction adapter ─────────────────────────────────────────────

/**
 * Build the default `ViewInteractionAdapter` for the circular view.
 *
 * Maps drag directions through the face-screen basis, infers axis-circle and
 * whole-cube notations using the nearest-axis heuristic, and delegates face
 * rotation to the standard inference function.
 */
export function createCircularInteractionAdapter(
    axisCircles: AxisCircle[]
): ViewInteractionAdapter {
    const axisCentersByAxis = collectAxisCentersByAxis(axisCircles);
    const faceBasisByFace = buildFaceScreenBasisByFace();

    return {
        mapDragDirection(
            direction: DragDirection,
            face: Face,
            _context: InteractionContext
        ): DragDirection {
            const basis = faceBasisByFace[face];
            if (!basis) {
                return direction;
            }

            return mapDirectionToFaceBasis(direction, basis);
        },
        inferAxisCircleNotation(
            axis: Axis,
            layer: number,
            isClockwise: boolean,
            context: InteractionContext
        ): string {
            return axisLayerToNotation(axis, layer, isClockwise, context.cubeSize);
        },
        inferWholeCubeNotation(
            deltaX: number,
            deltaY: number,
            context: InteractionContext
        ): string {
            const startViewPoint = getStartViewPointFromContext(context);
            if (!startViewPoint) {
                return inferWholeCubeMove(deltaX, deltaY) ?? 'y';
            }

            const nearestAxis = getNearestAxisByPoint(startViewPoint, axisCentersByAxis);
            if (!nearestAxis) {
                return inferWholeCubeMove(deltaX, deltaY) ?? 'y';
            }

            const center = axisCentersByAxis[nearestAxis];
            if (!center) {
                return inferWholeCubeMove(deltaX, deltaY) ?? 'y';
            }

            const dragVector = normalize2({ x: deltaX, y: deltaY });
            const centerToStart = normalize2({
                x: startViewPoint.x - center.x,
                y: startViewPoint.y - center.y,
            });

            if (!dragVector || !centerToStart) {
                return inferWholeCubeMove(deltaX, deltaY) ?? 'y';
            }

            const cross = centerToStart.x * dragVector.y - centerToStart.y * dragVector.x;
            const isClockwise = cross > 0;
            return axisToWholeCubeNotation(nearestAxis, isClockwise);
        },
        inferFaceRotationNotation(face: Face, isClockwise: boolean): string {
            return inferMoveFromFaceRotation(face, isClockwise);
        },
    };
}
