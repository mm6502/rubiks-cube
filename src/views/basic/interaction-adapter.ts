import { Face } from '@/cube/types';
import { FACE_BASIS } from '@/cube/utils/face-utils';
import { dot3 } from '@/cube/utils/math';
import { DragDirection, ViewInteractionAdapter } from '@/interaction/types';
import { Point2D, Vector3 } from '@/types/geometry';

/**
 * Creates a BasicView interaction adapter that remaps screen-space drag directions
 * to face-intrinsic drag directions using the current view orientation vectors.
 *
 * The Basic view renders the cube in 3D CSS space: viewRight corresponds to
 * screen-right and viewUp corresponds to screen-up (Y axis is inverted vs.
 * screen coordinates, so DOWN drag → negative viewUp contribution).
 *
 * For the default orientation this is a no-op. For rotated views (Ctrl+Arrow)
 * the correct intrinsic direction is inferred via dot products.
 */
export function createBasicInteractionAdapter(
    getViewRight: () => Vector3,
    getViewUp: () => Vector3
): ViewInteractionAdapter {
    return {
        mapDragDirection(direction: DragDirection, face: Face): DragDirection {
            const vR = getViewRight();
            const vU = getViewUp();

            // Convert the screen drag direction into an approximate model-space vector.
            // Screen Y is inverted relative to model Y (CSS +Y = visual down = model -Y),
            // so UP drag (screen -Y) → +vU contribution in model space.
            let modelDrag: Vector3;
            switch (direction) {
                case DragDirection.RIGHT:
                    modelDrag = vR;
                    break;
                case DragDirection.LEFT:
                    modelDrag = { x: -vR.x, y: -vR.y, z: -vR.z };
                    break;
                case DragDirection.UP:
                    modelDrag = vU;
                    break;
                case DragDirection.DOWN:
                default:
                    modelDrag = { x: -vU.x, y: -vU.y, z: -vU.z };
                    break;
            }

            const basis = FACE_BASIS[face];
            const rightScore = dot3(modelDrag, basis.right);
            const upScore = dot3(modelDrag, basis.up);

            if (Math.abs(rightScore) >= Math.abs(upScore)) {
                return rightScore >= 0 ? DragDirection.RIGHT : DragDirection.LEFT;
            }
            return upScore >= 0 ? DragDirection.UP : DragDirection.DOWN;
        },
    };
}

/**
 * Computes the screen-space 2D basis vectors for a face given the current view orientation.
 * Returns `upDir` (screen direction that appears as "face up") and `rightDir` (screen direction
 * that appears as "face right"). Both are normalized.
 *
 * The Basic view uses CSS 3D: `viewRight` is the model-space direction that maps to screen-right,
 * `viewUp` is the model-space direction that maps to screen-up. CSS Y-axis is inverted relative
 * to model Y, so screen-Y component = −dot(v, viewUp).
 *
 * Returns undefined if either direction is degenerate (face nearly edge-on to the camera).
 */
export function buildFaceScreenBasis(
    face: Face,
    viewRight: Vector3,
    viewUp: Vector3
): { upDir: Point2D; rightDir: Point2D } | undefined {
    const basis = FACE_BASIS[face];

    // Project the face's intrinsic vectors onto screen axes.
    const upScreenX = dot3(basis.up, viewRight);
    const upScreenY = -dot3(basis.up, viewUp); // CSS Y is inverted
    const rightScreenX = dot3(basis.right, viewRight);
    const rightScreenY = -dot3(basis.right, viewUp);

    const upMag = Math.hypot(upScreenX, upScreenY);
    const rightMag = Math.hypot(rightScreenX, rightScreenY);

    if (upMag < 1e-6 || rightMag < 1e-6) return undefined;

    return {
        upDir: { x: upScreenX / upMag, y: upScreenY / upMag },
        rightDir: { x: rightScreenX / rightMag, y: rightScreenY / rightMag },
    };
}
