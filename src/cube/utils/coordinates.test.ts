import { describe, expect, it } from 'vitest';

import { CubieType } from '@/cube/types';
import {
    getAllPositions,
    getCubieId,
    getCubieType,
    isValidPosition,
} from '@/cube/utils/coordinates';

describe('Coordinates', () => {
    describe('createCubieId', () => {
        it('should create correct cubie ID for coordinates', () => {
            expect(getCubieId({ x: 0, y: 0, z: 0 })).toBe('pos_00_00_00');
            expect(getCubieId({ x: 2, y: 2, z: 2 })).toBe('pos_02_02_02');
            expect(getCubieId({ x: 0, y: 1, z: 2 })).toBe('pos_00_01_02');
        });

        it('should create correct cubie ID for mixed coordinates', () => {
            expect(getCubieId({ x: 2, y: 0, z: 1 })).toBe('pos_02_00_01');
        });

        it('should reject invalid coordinates', () => {
            expect(() => getCubieId({ x: -1, y: 0, z: 0 })).toThrow(
                'Position must use cube-space coordinates within 0..2.'
            );
        });
    });

    describe('getCubieType', () => {
        it('should identify corner cubies correctly', () => {
            expect(getCubieType({ x: 0, y: 0, z: 0 }, 3)).toBe(CubieType.CORNER);
            expect(getCubieType({ x: 0, y: 0, z: 2 }, 3)).toBe(CubieType.CORNER);
            expect(getCubieType({ x: 2, y: 2, z: 2 }, 3)).toBe(CubieType.CORNER);
            expect(getCubieType({ x: 2, y: 0, z: 2 }, 3)).toBe(CubieType.CORNER);
        });

        it('should identify edge cubies correctly', () => {
            expect(getCubieType({ x: 0, y: 1, z: 0 }, 3)).toBe(CubieType.EDGE);
            expect(getCubieType({ x: 2, y: 1, z: 2 }, 3)).toBe(CubieType.EDGE);
            expect(getCubieType({ x: 1, y: 0, z: 2 }, 3)).toBe(CubieType.EDGE);
            expect(getCubieType({ x: 1, y: 2, z: 0 }, 3)).toBe(CubieType.EDGE);
        });

        it('should identify center cubies correctly', () => {
            expect(getCubieType({ x: 0, y: 1, z: 1 }, 3)).toBe(CubieType.CENTER); // Left face center
            expect(getCubieType({ x: 2, y: 1, z: 1 }, 3)).toBe(CubieType.CENTER); // Right face center
            expect(getCubieType({ x: 1, y: 0, z: 1 }, 3)).toBe(CubieType.CENTER); // Down face center
            expect(getCubieType({ x: 1, y: 2, z: 1 }, 3)).toBe(CubieType.CENTER); // Up face center
            expect(getCubieType({ x: 1, y: 1, z: 0 }, 3)).toBe(CubieType.CENTER); // Back face center
            expect(getCubieType({ x: 1, y: 1, z: 2 }, 3)).toBe(CubieType.CENTER); // Front face center
        });
    });

    describe('isValidPosition', () => {
        it('should validate positions correctly', () => {
            expect(isValidPosition({ x: 0, y: 0, z: 0 }, 3)).toBe(true);
            expect(isValidPosition({ x: 2, y: 2, z: 2 }, 3)).toBe(true);
            expect(isValidPosition({ x: 1, y: 1, z: 0 }, 3)).toBe(true);
            expect(isValidPosition({ x: 3, y: 0, z: 0 }, 3)).toBe(false);
            expect(isValidPosition({ x: -1, y: 0, z: 0 }, 3)).toBe(false);
            expect(isValidPosition({ x: 0.5, y: 1, z: 1 }, 3)).toBe(false);
        });
    });

    describe('getAllPositions', () => {
        it('should return all positions for 3x3x3 cube', () => {
            const positions = getAllPositions(3);
            expect(positions).toHaveLength(26);
            expect(positions).toContainEqual({ x: 0, y: 0, z: 0 });
            expect(positions).toContainEqual({ x: 0, y: 0, z: 2 });
            expect(positions).toContainEqual({ x: 2, y: 2, z: 2 });
            expect(positions).not.toContainEqual({ x: 1, y: 1, z: 1 });
        });
    });
});
