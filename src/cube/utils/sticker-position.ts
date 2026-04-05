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
