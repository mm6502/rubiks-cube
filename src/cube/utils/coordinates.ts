import { CubeInvariants, getCubeInvariants } from '@/cube/core/cube-invariants';
import { CubieId, CubieType, Face, Position3D, PositionKey, StickerId } from '@/cube/types';
import { isExtreme, toCentered } from '@/cube/utils/math';

/**
 * Determine cubie type based on coordinates and cube size.
 * For 3x3x3: corners at (0 or 2 for every axis), edges have two extreme coordinates, centers one.
 * @param position Cubie position.
 * @param cubeSize Size of the cube (n).
 * @returns CubieType
 */
export function getCubieType(position: Position3D, cubeSize: number): CubieType {
    return getCubieTypeFromPosition(position, cubeSize);
}

/**
 * Check if coordinates are valid for a given cube size.
 * For 3x3x3: coordinates should be 0, 1, or 2.
 * @param position Position to validate.
 * @param cubeSize Size of the cube.
 * @returns True if coordinates are valid.
 */
export function isValidPosition(position: Position3D, cubeSize: number): boolean {
    const max = cubeSize - 1;

    const withinRange = (value: number) => Number.isInteger(value) && value >= 0 && value <= max;

    return withinRange(position.x) && withinRange(position.y) && withinRange(position.z);
}

/**
 * Get all valid positions for a given cube size.
 * For 3x3x3: all combinations of 0,1,2 for x,y,z on the surface.
 * @param cubeSize Size of the cube.
 * @returns Array of all valid Position3D objects.
 */
export function getAllPositions(cubeSize: number): Position3D[] {
    const invariants = getCubeInvariants(cubeSize);
    return invariants.allPositions;
}

/**
 * Get canonical index for a cubie based on its position.
 * For 3x3x3 cube: corners 0-7, edges 0-11, centers 0-5.
 * @param position Cubie position.
 * @param cubeSize Size of the cube.
 * @returns Canonical index for fast lookup.
 */
export function getCanonicalIndex(position: Position3D, cubeSize: number): number {
    const invariants = getCubeInvariants(cubeSize);
    return getCanonicalIndexFromInvariants(invariants, position);
}

/**
 * Determine the CubieType for a surface position.
 * Accepts a cube-space `Position3D` and returns `CubieType.CORNER` | `EDGE` | `CENTER`.
 *
 * @param position integer cube coordinates on the surface.
 * @param cubeSize size of the cube (default: 3).
 */
export function getCubieTypeFromPosition(position: Position3D, cubeSize = 3): CubieType {
    if (isValidPosition(position, cubeSize) !== true) {
        const max = cubeSize - 1;
        throw new Error(`Position must use cube-space coordinates within 0..${max}`);
    }

    const centered = toCentered(position, cubeSize);
    const maxCoord = (cubeSize - 1) / 2;
    const extremes = [centered.x, centered.y, centered.z].filter(value =>
        isExtreme(value, maxCoord)
    );

    if (extremes.length === 3) {
        return CubieType.CORNER;
    }
    if (extremes.length === 2) {
        return CubieType.EDGE;
    }
    if (extremes.length === 1) {
        return CubieType.CENTER;
    }

    return CubieType.CENTER;
}

/**
 * Generate a cubie ID from coordinates.
 * The id remains constant during moves, representing the original cubie.
 * The id SHOULD NOT be treated as if it has any meaning about current position;
 * it is simply a unique identifier for the cubie itself, to be used for lookups in maps.
 * The current id format may be changed in the future to a UUID or hash.
 * @param position Position3D object with x, y, z coordinates (0 to cubeSize-1).
 * @param cubeSize Size of the cube (default: 3).
 * @returns Cubie ID in format "pos_XX_YY_ZZ".
 */
// TODO: Move to Cubie.ts?
export function getCubieId(position: Position3D, cubeSize: number = 3): CubieId {
    return getPositionKey(position, cubeSize) as unknown as CubieId;
}

/**
 * Generate sticker ID from cubie ID and face.
 * @param cubieId The cubie ID.
 * @param face The face (U, D, F, B, L, R).
 * @returns Sticker ID in format "{cubie_id}_{face}_sticker".
 */
export function getStickerId(cubieId: CubieId, face: Face): StickerId {
    return `${cubieId}_${face}_sticker` as StickerId;
}

/**
 * Convert a Position3D into a stable string key used in maps.
 * @param position Position3D object with x, y, z coordinates (0 to cubeSize-1).
 * @param cubeSize Size of the cube (default: 3).
 * @returns Position key in format "pos_XX_YY_ZZ".
 */
export function getPositionKey(position: Position3D, cubeSize: number = 3): PositionKey {
    if (isValidPosition(position, cubeSize) !== true) {
        const max = cubeSize - 1;
        throw new Error(`Position must use cube-space coordinates within 0..${max}.`);
    }

    const pad = (num: number) => {
        return num.toString().padStart(2, '0');
    };

    return `pos_${pad(position.x)}_${pad(position.y)}_${pad(position.z)}` as PositionKey;
}

/**
 * Look up the canonical index for a surface position.
 * Throws when a position is out of range or is not part of the cube surface.
 *
 * @param invariants Precomputed invariants for the cube size.
 * @param position A cube-space integer position (0..cubeSize-1).
 * @returns canonical index corresponding to that position.
 */
export function getCanonicalIndexFromInvariants(
    invariants: CubeInvariants,
    position: Position3D
): number {
    const key = getPositionKey(position, invariants.cubeSize);
    const index = invariants.canonicalIndices.get(key);
    if (index === undefined) {
        throw new Error(`No canonical index found for position ${key}`);
    }

    return index;
}
