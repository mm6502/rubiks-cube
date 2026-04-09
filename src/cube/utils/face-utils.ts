import { CubieType, DiscreteOrientation, Face, Position3D, Vector3 } from '@/cube/types';

import { approximatelyEqual } from './math';

/**
 * Per-face orthonormal basis in model space.
 * - `normal` — outward normal (same as getFaceNormal)
 * - `up`     — "visual up" direction when looking straight at the face
 * - `right`  — "visual right" direction when looking straight at the face
 */
export type FaceBasis = { normal: Vector3; up: Vector3; right: Vector3 };

/**
 * Lookup table of orthonormal basis vectors for each cube face.
 *
 * Provides a single source of truth for face orientation used by move
 * inference (drag → layer move) and view interaction adapters (screen drag →
 * face-intrinsic drag direction).
 *
 * All vectors are expressed in **model space** (cube coordinate system).
 * The `normal` component is identical to the value returned by `getFaceNormal`.
 */
export const FACE_BASIS: Record<Face, FaceBasis> = {
    [Face.F]: {
        normal: { x: 0, y: 0, z: -1 },
        up: { x: 0, y: 1, z: 0 },
        right: { x: 1, y: 0, z: 0 },
    },
    [Face.B]: {
        normal: { x: 0, y: 0, z: 1 },
        up: { x: 0, y: 1, z: 0 },
        right: { x: -1, y: 0, z: 0 },
    },
    [Face.U]: {
        normal: { x: 0, y: 1, z: 0 },
        up: { x: 0, y: 0, z: 1 },
        right: { x: 1, y: 0, z: 0 },
    },
    [Face.D]: {
        normal: { x: 0, y: -1, z: 0 },
        up: { x: 0, y: 0, z: -1 },
        right: { x: 1, y: 0, z: 0 },
    },
    [Face.L]: {
        normal: { x: -1, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        right: { x: 0, y: 0, z: -1 },
    },
    [Face.R]: {
        normal: { x: 1, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        right: { x: 0, y: 0, z: 1 },
    },
};

/**
 * Get corner faces in standard cubing order:
 * - U or D face first (reference)
 * - Remaining two faces in clockwise order around the corner
 *
 * Standard convention for clockwise (looking at corner from outside cube):
 * - U corners: F → R → B → L (clockwise from above)
 * - D corners: F → L → B → R (clockwise from below, which is counter-clockwise from above)
 */
export function getCornerFacesInStandardOrder(position: Position3D, cubeSize: number): Face[] {
    const max = cubeSize - 1;

    // Determine which faces this corner has
    const hasU = position.y === max;
    const hasD = position.y === 0;
    const hasF = position.z === 0;
    const hasB = position.z === max;
    const hasL = position.x === 0;
    const hasR = position.x === max;

    // Clockwise convention: U/D reference + clockwise around corner
    if (hasU && hasF && hasL) return [Face.U, Face.L, Face.F]; // UFL: U + L->F clockwise
    if (hasU && hasF && hasR) return [Face.U, Face.F, Face.R]; // UFR: U + F->R clockwise
    if (hasU && hasB && hasL) return [Face.U, Face.B, Face.L]; // UBL: U + B->L clockwise
    if (hasU && hasB && hasR) return [Face.U, Face.R, Face.B]; // UBR: U + R->B clockwise
    if (hasD && hasF && hasL) return [Face.D, Face.F, Face.L]; // DFL: D + F->L clockwise
    if (hasD && hasF && hasR) return [Face.D, Face.R, Face.F]; // DFR: D + R->F clockwise
    if (hasD && hasB && hasL) return [Face.D, Face.L, Face.B]; // DBL: D + L->B clockwise
    if (hasD && hasB && hasR) return [Face.D, Face.B, Face.R]; // DRB: D + B->R clockwise

    return [];
}

/**
 * Get the global faces available at a position
 * @param position Cubie position
 * @returns Array of faces available at this position
 */
export function getAvailableFaces(position: Position3D, cubeSize: number): Face[] {
    const maxIndex = cubeSize - 1;

    // Count faces to determine cubie type
    let faceCount = 0;
    if (approximatelyEqual(position.x, 0) || approximatelyEqual(position.x, maxIndex)) faceCount++;
    if (approximatelyEqual(position.y, 0) || approximatelyEqual(position.y, maxIndex)) faceCount++;
    if (approximatelyEqual(position.z, 0) || approximatelyEqual(position.z, maxIndex)) faceCount++;

    // For corners, use standard cubing order
    if (faceCount === 3) {
        return getCornerFacesInStandardOrder(position, cubeSize);
    }

    // For edges and centers, use simple collection
    const faces: Face[] = [];
    if (approximatelyEqual(position.x, 0)) faces.push(Face.L);
    if (approximatelyEqual(position.x, maxIndex)) faces.push(Face.R);
    if (approximatelyEqual(position.y, 0)) faces.push(Face.D);
    if (approximatelyEqual(position.y, maxIndex)) faces.push(Face.U);
    if (approximatelyEqual(position.z, 0)) faces.push(Face.F);
    if (approximatelyEqual(position.z, maxIndex)) faces.push(Face.B);

    return faces;
}

/**
 * Compute the current face of a sticker based on cubie position and orientation
 * @param position Cubie position
 * @param orientation Cubie discrete orientation
 * @param localIndex Local index of the sticker on the cubie
 * @param cubieType Type of the cubie
 * @returns The face this sticker currently appears on
 */
export function computeStickerFace(
    position: Position3D,
    orientation: DiscreteOrientation,
    localIndex: number,
    cubieType: CubieType,
    cubeSize: number
): Face {
    const availableFaces = getAvailableFaces(position, cubeSize);

    if (availableFaces.length === 0) {
        throw new Error(
            `Unable to determine available faces for position (${position.x},${position.y},${position.z})`
        );
    }

    if (cubieType === CubieType.CORNER) {
        // For corners: face = globalFaces[(localIndex + orientation) % 3]
        return availableFaces[(localIndex + orientation) % 3];
    } else if (cubieType === CubieType.EDGE) {
        // For edges: face = globalFaces[localIndex XOR orientation]
        return availableFaces[localIndex ^ orientation];
    } else {
        // Centers (including virtual centers) always have orientation 0 and one face
        if (availableFaces.length !== 1) {
            throw new Error(
                `Expected exactly one available face for position (${position.x},${position.y},${position.z}) but found ${availableFaces.length}`
            );
        }
        return availableFaces[0];
    }
}

/**
 * Return the outward normal vector for a cube face (U/D/L/R/F/B).
 */
export function getFaceNormal(face: Face): Vector3 {
    switch (face) {
        case Face.U:
            return { x: 0, y: 1, z: 0 };
        case Face.D:
            return { x: 0, y: -1, z: 0 };
        case Face.F:
            return { x: 0, y: 0, z: -1 };
        case Face.B:
            return { x: 0, y: 0, z: 1 };
        case Face.L:
            return { x: -1, y: 0, z: 0 };
        case Face.R:
            return { x: 1, y: 0, z: 0 };
        default:
            throw new Error(`Unknown face: ${face}`);
    }
}
