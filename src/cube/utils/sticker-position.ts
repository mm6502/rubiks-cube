import { Axis, Face, Position3D, QuarterTurn } from '@/cube/types';

/**
 * Utility functions for calculating sticker positions and faces
 */

/**
 * Convert a face position (0 to n²-1) back to a 3D position on the given face.
 * This is the inverse of calculateStickerPositionOnFace.
 * @param facePosition The position on the face (0 to n²-1)
 * @param face The face this position is on
 * @param cubeSize The size of the cube
 * @returns The 3D position corresponding to this face position
 */
export function facePositionTo3D(facePosition: number, face: Face, cubeSize: number): Position3D {
    const maxIndex = cubeSize - 1;
    const row = Math.floor(facePosition / cubeSize);
    const col = facePosition % cubeSize;

    switch (face) {
        case Face.F: // z = 0
            return { x: col, y: maxIndex - row, z: 0 };
        case Face.B: // z = maxIndex
            return { x: maxIndex - col, y: maxIndex - row, z: maxIndex };
        case Face.U: // y = maxIndex
            return { x: col, y: maxIndex, z: maxIndex - row };
        case Face.D: // y = 0
            return { x: col, y: 0, z: row };
        case Face.L: // x = 0
            return { x: 0, y: maxIndex - row, z: maxIndex - col };
        case Face.R: // x = maxIndex
            return { x: maxIndex, y: maxIndex - row, z: col };
        default:
            throw new Error(`Unknown face: ${face}`);
    }
}

/**
 * Calculate where a sticker appears on the 2D faces based on cubie position and
 * orientation.
 * @param position The cubie position
 * @param currentFace The face the sticker currently represents
 * @param cubeSize The size of the cube
 * @returns The position (0-8) where the sticker appears on the current face
 */
export function calculateStickerPositionOnFace(
    position: Position3D,
    currentFace: Face,
    cubeSize: number
): number {
    const pos = position;
    const maxIndex = cubeSize - 1;

    // Calculate position on the current face based on cubie position
    let stickerPosition = 0;

    switch (currentFace) {
        case Face.F: // z = 0
            stickerPosition = (maxIndex - pos.y) * cubeSize + pos.x;
            break;
        case Face.B: // z = maxIndex
            stickerPosition = (maxIndex - pos.y) * cubeSize + (maxIndex - pos.x);
            break;
        case Face.U: // y = maxIndex
            // z increases from bottom to top when looking at U face
            // z=0 (front) should be at bottom, z=maxIndex (back) should be at top
            stickerPosition = (maxIndex - pos.z) * cubeSize + pos.x;
            break;
        case Face.D: // y = 0
            stickerPosition = pos.z * cubeSize + pos.x;
            break;
        case Face.L: // x = 0
            // z increases from right to left when looking at L face
            // z=0 (front) should be on right, z=maxIndex (back) should be on left
            stickerPosition = (maxIndex - pos.y) * cubeSize + (maxIndex - pos.z);
            break;
        case Face.R: // x = maxIndex
            stickerPosition = (maxIndex - pos.y) * cubeSize + pos.z;
            break;
    }

    return stickerPosition;
}

/**
 * The face position of a face's center cell, for any cube size.
 *
 * This is the single source of truth for "where does the default selection
 * land". Every view previously computed it separately — two hardcoded the 3×3-only
 * position `4`, and one derived it inline — which meant the default silently
 * resolved to nothing at 2×2 and to an off-center (sometimes corner) sticker at
 * 4×4 and above. See `centerFacePosition` callers for the four sites.
 *
 * **Odd sizes** have exactly one true center cell, so the choice is forced.
 * **Even sizes** have a 2×2 block of central cells and no single center, so the
 * rule picks the one at the lowest row and column (`floor((n-1)/2)`). That choice
 * is arbitrary in the sense that any of the four would be defensible, but it is
 * deliberate here because it is a single reproducible rule rather than a
 * per-axis judgement, and because it is the form the Circular view already used.
 *
 * One consequence worth knowing: because the rule indexes row and column
 * identically, the resulting layer numbers are *asymmetric between axes* on even
 * sizes — at 4×4 the X slice takes the lower interior layer while the Y slice
 * takes the upper. That is inherited, not designed.
 *
 * Note this is a *sticker index*, not a geometric coordinate. The cube's
 * geometric midpoint `(cubeSize - 1) / 2` goes fractional on even sizes and is
 * not usable as a face position — see `src/cube/core/cubie-manager.ts`.
 *
 * @param cubeSize The size of the cube (edge length)
 * @returns The face position (0 to n²-1) of the center cell on any face
 */
export function centerFacePosition(cubeSize: number): number {
    const centerIndex = Math.floor((cubeSize - 1) / 2);
    return centerIndex * cubeSize + centerIndex;
}

/**
 * Get the rotation axis and effective angle for a face rotation.
 * Some faces need inverted rotation directions.
 * @param face The face being rotated
 * @param angle The requested rotation angle
 * @returns The axis and effective angle to use for rotation
 */
export function getFaceRotationAxis(
    face: Face,
    angle: QuarterTurn
): { axis: Axis; effectiveAngle: QuarterTurn } {
    // L, F, and D faces are viewed from opposite perspectives, so invert rotation
    const facesWithInvertedRotation: Face[] = [Face.L, Face.F, Face.D];
    const effectiveAngle = facesWithInvertedRotation.includes(face)
        ? (-angle as QuarterTurn)
        : angle;

    // Determine axis based on face
    let axis: Axis;
    switch (face) {
        case Face.U:
        case Face.D:
            axis = Axis.Y;
            break;
        case Face.F:
        case Face.B:
            axis = Axis.Z;
            break;
        case Face.L:
        case Face.R:
            axis = Axis.X;
            break;
        default:
            throw new Error(`Unknown face: ${face}`);
    }

    return { axis, effectiveAngle };
}
