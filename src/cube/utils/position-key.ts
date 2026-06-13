import { Position3D, PositionKey } from '@/cube/types';

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
