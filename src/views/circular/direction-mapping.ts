/**
 * Direction-mapping utilities for the Circular view's isometric projection.
 *
 * Exports the per-face screen-space basis and a function to remap raw
 * DragDirection values to face-intrinsic directions, so keyboard arrows
 * and drag gestures align with the visual orientation of each face.
 */
import { Face } from '@/cube/types';
import { dot2, negate2, normalize2 } from '@/cube/utils/math';
import { DragDirection, Point2D } from '@/interaction/types';

export type FaceScreenBasis = {
    upDir: Point2D;
    rightDir: Point2D;
};

/**
 * Per-face "top when looking directly at that face" vectors in screen-space.
 *
 * Each vector points in the screen direction that corresponds to the face's
 * intrinsic "up" (the FACE_BASIS `up` vector projected into the circular
 * view's isometric layout).
 *
 * ## Usage by interaction mode
 *
 * **Drag / touch (remapped):** `FACE_TOP_DIRECTION_HINTS` are fed to
 * `mapDirectionToFaceBasis` which converts a screen-space drag direction into
 * the face-intrinsic direction the user intended.
 *
 * **Keyboard moves & cube-walk navigation (identity — no remapping):**
 * Arrow keys map directly to face-intrinsic directions (ArrowUp → Up, etc.)
 * with **no** per-face remapping.
 * The *visual* effect of pressing ArrowUp therefore varies per face — it
 * follows the screen direction given by the hint vector for that face
 * (e.g. on Face L, ArrowUp visually moves the cursor to the right because
 * the face's intrinsic "up" points rightward in the circular layout).
 *
 * **Face labels:** The tilt angle applied to face-letter labels can be
 * derived from these hints via {@link tiltAngleFromHint}.
 */
export const FACE_TOP_DIRECTION_HINTS: Record<Face, Point2D> = {
    [Face.U]: { x: 0.75, y: -0.66 },
    [Face.D]: { x: -0.75, y: -0.66 },
    [Face.L]: { x: 0.97, y: -0.24 },
    [Face.R]: { x: -0.24, y: -0.97 },
    [Face.F]: { x: 0.24, y: -0.97 },
    [Face.B]: { x: -0.97, y: -0.24 },
};

function directionToVector(direction: DragDirection): Point2D {
    switch (direction) {
        case DragDirection.UP:
            return { x: 0, y: -1 };
        case DragDirection.DOWN:
            return { x: 0, y: 1 };
        case DragDirection.LEFT:
            return { x: -1, y: 0 };
        case DragDirection.RIGHT:
        default:
            return { x: 1, y: 0 };
    }
}

/**
 * Remap a raw DragDirection to the face-intrinsic direction using a 2D screen-space basis.
 */
export function mapDirectionToFaceBasis(
    direction: DragDirection,
    basis: FaceScreenBasis
): DragDirection {
    const drag = directionToVector(direction);
    const candidates: Array<{ direction: DragDirection; score: number }> = [
        { direction: DragDirection.RIGHT, score: dot2(drag, basis.rightDir) },
        { direction: DragDirection.LEFT, score: dot2(drag, negate2(basis.rightDir)) },
        { direction: DragDirection.DOWN, score: dot2(drag, negate2(basis.upDir)) },
        { direction: DragDirection.UP, score: dot2(drag, basis.upDir) },
    ];

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].direction;
}

/**
 * Build a FaceScreenBasis for a single face from the direction hint.
 * Falls back to the identity basis when the hint is degenerate.
 */
export function buildFaceScreenBasisFromHint(face: Face): FaceScreenBasis {
    const upDir = normalize2(FACE_TOP_DIRECTION_HINTS[face]);
    if (!upDir) {
        return { upDir: { x: 0, y: -1 }, rightDir: { x: 1, y: 0 } };
    }

    const rightDir = normalize2({ x: -upDir.y, y: upDir.x });
    if (!rightDir) {
        return { upDir, rightDir: { x: 1, y: 0 } };
    }

    return { upDir, rightDir };
}

/**
 * Build a static Record mapping each Face to its screen-space basis vectors.
 */
export function buildFaceScreenBasisByFace(): Record<Face, FaceScreenBasis> {
    const result = {} as Record<Face, FaceScreenBasis>;
    for (const face of [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R]) {
        const upDir = normalize2(FACE_TOP_DIRECTION_HINTS[face]);
        if (!upDir) continue;
        const rightDir = normalize2({ x: -upDir.y, y: upDir.x });
        if (!rightDir) continue;
        result[face] = { upDir, rightDir };
    }
    return result;
}

/**
 * Creates a remapDirection callback for the circular view's **drag / touch**
 * interaction, suitable for passing to inferKeyboardMove's `remapDirection`
 * parameter.
 *
 * **Not needed for keyboard input.** Keyboard moves and cube-walk navigation
 * use identity mapping — arrow directions pass through to face-intrinsic
 * directions without remapping.  See {@link FACE_TOP_DIRECTION_HINTS} for
 * the full rationale.
 */
export function createCircularDirectionRemapper(): (
    direction: DragDirection,
    face: Face
) => DragDirection {
    const basisByFace = buildFaceScreenBasisByFace();
    return (direction: DragDirection, face: Face): DragDirection => {
        const basis = basisByFace[face];
        if (!basis) return direction;
        return mapDirectionToFaceBasis(direction, basis);
    };
}

/**
 * Compute the clockwise tilt angle (degrees) from a face-top hint vector.
 *
 * Returns the angle between screen-up ({0,−1}) and the hint, measured
 * clockwise.  Useful for rotating face labels so the letter's visual "top"
 * aligns with the face's intrinsic "up" on screen.
 *
 * @example
 * tiltAngleFromHint(FACE_TOP_DIRECTION_HINTS[Face.F]) // ≈ 13.9
 * tiltAngleFromHint(FACE_TOP_DIRECTION_HINTS[Face.L]) // ≈ 76.1
 */
export function tiltAngleFromHint(hint: Point2D): number {
    return Math.atan2(hint.x, -hint.y) * (180 / Math.PI);
}
