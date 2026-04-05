/**
 * Tests for Math Utilities Module
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Axis, QuarterTurn } from '@/cube/types';
import { LogLevel, logger } from '@/diagnostics/logger';

import {
    approximatelyEqual,
    compareValues,
    distance2,
    distance3,
    findClosestEquivalentAngle,
    getAxisComponent,
    isExtreme,
    mod,
    normalizeComponent,
    rotatePosition3D,
    roundToNearest,
    toActual,
    toCentered,
    vectorsEqual,
} from './math';

beforeAll(() => {
    // Suppress logs during tests.
    logger.setLogLevel(LogLevel.NONE);
});

afterAll(() => {
    // Restore log level after tests.
    logger.setLogLevel(LogLevel.WARN);
});

describe('Math Utilities', () => {
    describe('approximatelyEqual', () => {
        it('should return true for exactly equal values', () => {
            expect(approximatelyEqual(1.0, 1.0)).toBe(true);
        });

        it('should return true for values within epsilon', () => {
            expect(approximatelyEqual(1.0, 1.0000001)).toBe(true);
            expect(approximatelyEqual(1.0, 0.9999999)).toBe(true);
        });

        it('should return false for values outside epsilon', () => {
            expect(approximatelyEqual(1.0, 1.1)).toBe(false);
            expect(approximatelyEqual(1.0, 0.9)).toBe(false);
        });

        it('should handle custom epsilon', () => {
            expect(approximatelyEqual(1.0, 1.5, 0.6)).toBe(true);
            expect(approximatelyEqual(1.0, 1.5, 0.4)).toBe(false);
        });

        it('should handle negative values', () => {
            expect(approximatelyEqual(-1.0, -1.0000001)).toBe(true);
            expect(approximatelyEqual(-1.0, -1.1)).toBe(false);
        });
    });

    describe('isExtreme', () => {
        it('should return true for values at extreme coordinates', () => {
            expect(isExtreme(2.0, 2.0)).toBe(true);
            expect(isExtreme(-2.0, 2.0)).toBe(true);
            expect(isExtreme(2.0000001, 2.0)).toBe(true);
        });

        it('should return false for non-extreme values', () => {
            expect(isExtreme(1.0, 2.0)).toBe(false);
            expect(isExtreme(0.0, 2.0)).toBe(false);
        });

        it('should handle custom epsilon', () => {
            expect(isExtreme(2.5, 2.0, 0.6)).toBe(true);
            expect(isExtreme(2.5, 2.0, 0.4)).toBe(false);
        });
    });

    describe('normalizeComponent', () => {
        it('should return zero for very small values', () => {
            expect(normalizeComponent(0.0000001)).toBe(0);
            expect(normalizeComponent(-0.0000001)).toBe(0);
        });

        it('should return original value for larger values', () => {
            expect(normalizeComponent(1.0)).toBe(1.0);
            expect(normalizeComponent(-1.0)).toBe(-1.0);
            expect(normalizeComponent(0.1)).toBe(0.1);
        });

        it('should return exact zero for zero input', () => {
            expect(normalizeComponent(0)).toBe(0);
        });
    });

    describe('roundToNearest', () => {
        it('should round values near integers', () => {
            expect(roundToNearest(1.0000001)).toBe(1);
            expect(roundToNearest(1.9999999)).toBe(2);
            expect(roundToNearest(2.0000001)).toBe(2);
        });

        it('should return original value for non-integer values', () => {
            expect(roundToNearest(1.5)).toBe(1.5);
            expect(roundToNearest(1.3)).toBe(1.3);
        });

        it('should handle custom epsilon', () => {
            expect(roundToNearest(1.4, 0.5)).toBe(1);
            expect(roundToNearest(1.4, 0.3)).toBe(1.4);
        });

        it('should handle negative values', () => {
            expect(roundToNearest(-1.0000001)).toBe(-1);
            expect(roundToNearest(-1.5)).toBe(-1.5);
        });
    });

    describe('rotatePosition3D', () => {
        const testVector = { x: 1, y: 2, z: 3 };

        it('should rotate around X axis by 90 degrees', () => {
            const result = rotatePosition3D(testVector, Axis.X, 90 as QuarterTurn);
            expect(result).toEqual({ x: 1, y: -3, z: 2 });
        });

        it('should rotate around X axis by 180 degrees', () => {
            const result = rotatePosition3D(testVector, Axis.X, 180 as QuarterTurn);
            expect(result).toEqual({ x: 1, y: -2, z: -3 });
        });

        it('should rotate around X axis by 270 degrees', () => {
            const result = rotatePosition3D(testVector, Axis.X, 270 as QuarterTurn);
            expect(result).toEqual({ x: 1, y: 3, z: -2 });
        });

        it('should rotate around Y axis by 90 degrees', () => {
            const result = rotatePosition3D(testVector, Axis.Y, 90 as QuarterTurn);
            expect(result).toEqual({ x: 3, y: 2, z: -1 });
        });

        it('should rotate around Y axis by 180 degrees', () => {
            const result = rotatePosition3D(testVector, Axis.Y, 180 as QuarterTurn);
            expect(result).toEqual({ x: -1, y: 2, z: -3 });
        });

        it('should rotate around Y axis by 270 degrees', () => {
            const result = rotatePosition3D(testVector, Axis.Y, 270 as QuarterTurn);
            expect(result).toEqual({ x: -3, y: 2, z: 1 });
        });

        it('should rotate around Z axis by 90 degrees', () => {
            const result = rotatePosition3D(testVector, Axis.Z, 90 as QuarterTurn);
            expect(result).toEqual({ x: -2, y: 1, z: 3 });
        });

        it('should rotate around Z axis by 180 degrees', () => {
            const result = rotatePosition3D(testVector, Axis.Z, 180 as QuarterTurn);
            expect(result).toEqual({ x: -1, y: -2, z: 3 });
        });

        it('should rotate around Z axis by 270 degrees', () => {
            const result = rotatePosition3D(testVector, Axis.Z, 270 as QuarterTurn);
            expect(result).toEqual({ x: 2, y: -1, z: 3 });
        });

        it('should handle angle normalization', () => {
            const result = rotatePosition3D(testVector, Axis.X, 450 as QuarterTurn); // 450 % 360 = 90
            expect(result).toEqual({ x: 1, y: -3, z: 2 });
        });

        it('should return original vector for 0 degree rotation', () => {
            const result = rotatePosition3D(testVector, Axis.X, 0 as QuarterTurn);
            expect(result).toEqual(testVector);
        });

        it('should throw error for unsupported axis', () => {
            expect(() => rotatePosition3D(testVector, 'invalid' as any, 90 as QuarterTurn)).toThrow(
                'Unsupported axis'
            );
        });
    });

    describe('getAxisComponent', () => {
        const testVector = { x: 1, y: 2, z: 3 };

        it('should return X component', () => {
            expect(getAxisComponent(testVector, Axis.X)).toBe(1);
        });

        it('should return Y component', () => {
            expect(getAxisComponent(testVector, Axis.Y)).toBe(2);
        });

        it('should return Z component', () => {
            expect(getAxisComponent(testVector, Axis.Z)).toBe(3);
        });

        it('should throw error for unsupported axis', () => {
            expect(() => getAxisComponent(testVector, 'invalid' as any)).toThrow(
                'Unsupported axis'
            );
        });
    });

    describe('toCentered', () => {
        it('should convert position to centered coordinates for size 3', () => {
            const position = { x: 0, y: 1, z: 2 };
            const result = toCentered(position, 3);
            expect(result).toEqual({ x: -1, y: 0, z: 1 });
        });

        it('should convert position to centered coordinates for size 4', () => {
            const position = { x: 1, y: 2, z: 3 };
            const result = toCentered(position, 4);
            expect(result).toEqual({ x: -0.5, y: 0.5, z: 1.5 });
        });

        it('should handle center position', () => {
            const position = { x: 1, y: 1, z: 1 };
            const result = toCentered(position, 3);
            expect(result).toEqual({ x: 0, y: 0, z: 0 });
        });
    });

    describe('toActual', () => {
        it('should convert centered coordinates back to position for size 3', () => {
            const centered = { x: -1, y: 0, z: 1 };
            const result = toActual(centered, 3);
            expect(result).toEqual({ x: 0, y: 1, z: 2 });
        });

        it('should convert centered coordinates back to position for size 4', () => {
            const centered = { x: -0.5, y: 0.5, z: 1.5 };
            const result = toActual(centered, 4);
            expect(result).toEqual({ x: 1, y: 2, z: 3 });
        });

        it('should handle floating point precision issues', () => {
            const centered = { x: -1.0000001, y: 0.9999999, z: 1.0000001 };
            const result = toActual(centered, 3);
            // Check that x is effectively 0 (either +0 or -0)
            expect(Math.abs(result.x)).toBe(0);
            expect(result.y).toBe(2);
            expect(result.z).toBe(2);
        });
    });

    describe('vectorsEqual', () => {
        it('should return true for identical vectors', () => {
            const a = { x: 1, y: 2, z: 3 };
            const b = { x: 1, y: 2, z: 3 };
            expect(vectorsEqual(a, b)).toBe(true);
        });

        it('should return true for approximately equal vectors', () => {
            const a = { x: 1.0, y: 2.0, z: 3.0 };
            const b = { x: 1.0000001, y: 2.0000001, z: 3.0000001 };
            expect(vectorsEqual(a, b)).toBe(true);
        });

        it('should return false for different vectors', () => {
            const a = { x: 1, y: 2, z: 3 };
            const b = { x: 1, y: 2, z: 4 };
            expect(vectorsEqual(a, b)).toBe(false);
        });
    });

    describe('mod', () => {
        it('should return positive remainder for positive numbers', () => {
            expect(mod(7, 3)).toBe(1);
            expect(mod(6, 3)).toBe(0);
        });

        it('should return positive remainder for negative numbers', () => {
            expect(mod(-7, 3)).toBe(2);
            expect(mod(-6, 3)).toBe(0);
            expect(mod(-1, 3)).toBe(2);
        });

        it('should handle zero', () => {
            expect(mod(0, 3)).toBe(0);
        });
    });

    describe('compareValues', () => {
        it('should return -1 when a < b', () => {
            expect(compareValues(1, 2)).toBe(-1);
        });

        it('should return 1 when a > b', () => {
            expect(compareValues(2, 1)).toBe(1);
        });

        it('should return 0 when a === b', () => {
            expect(compareValues(1, 1)).toBe(0);
            expect(compareValues(0, 0)).toBe(0);
            expect(compareValues(-1, -1)).toBe(0);
        });
    });

    describe('distance3', () => {
        it('should calculate distance between identical points', () => {
            const a = { x: 1, y: 2, z: 3 };
            const b = { x: 1, y: 2, z: 3 };
            expect(distance3(a, b)).toBe(0);
        });

        it('should calculate distance between different points', () => {
            const a = { x: 0, y: 0, z: 0 };
            const b = { x: 3, y: 4, z: 0 };
            expect(distance3(a, b)).toBe(5); // 3-4-5 triangle
        });

        it('should calculate distance in 3D space', () => {
            const a = { x: 1, y: 1, z: 1 };
            const b = { x: 4, y: 5, z: 2 };
            const expected = Math.sqrt(3 * 3 + 4 * 4 + 1 * 1); // sqrt(9 + 16 + 1) = sqrt(26)
            expect(distance3(a, b)).toBe(expected);
        });
    });

    describe('distance2', () => {
        it('should calculate distance between identical points', () => {
            const a = { x: 1, y: 2 };
            const b = { x: 1, y: 2 };
            expect(distance2(a, b)).toBe(0);
        });

        it('should calculate distance between different points', () => {
            const a = { x: 0, y: 0 };
            const b = { x: 3, y: 4 };
            expect(distance2(a, b)).toBe(5); // 3-4-5 triangle
        });

        it('should calculate distance in 2D space', () => {
            const a = { x: 1, y: 1 };
            const b = { x: 4, y: 5 };
            const expected = Math.sqrt(3 * 3 + 4 * 4); // sqrt(9 + 16) = sqrt(25) = 5
            expect(distance2(a, b)).toBe(expected);
        });
    });

    describe('findClosestEquivalentAngle', () => {
        it('should return target when already closest', () => {
            expect(findClosestEquivalentAngle(0, 10)).toBe(10);
            expect(findClosestEquivalentAngle(180, 190)).toBe(190);
        });

        it('should find equivalent angle across 360 degree boundary', () => {
            expect(findClosestEquivalentAngle(350, 10)).toBe(370); // 10 + 360
            expect(findClosestEquivalentAngle(10, 350)).toBe(-10); // 350 - 360
        });

        it('should prefer normalized values when distances are equal', () => {
            expect(findClosestEquivalentAngle(180, 180)).toBe(180);
            expect(findClosestEquivalentAngle(180, 540)).toBe(180); // 540 - 360 = 180
        });

        it('should handle large angle values', () => {
            expect(findClosestEquivalentAngle(720, 10)).toBe(730); // 10 + 720
            expect(findClosestEquivalentAngle(10, 720)).toBe(0); // 720 - 2*360 = 0, which is closest to 10
        });

        it('should handle negative angles', () => {
            expect(findClosestEquivalentAngle(-10, 350)).toBe(-10); // 350 - 360 = -10, which is closest to -10
            expect(findClosestEquivalentAngle(350, -10)).toBe(350); // 350 is equivalent to -10 + 360, and 350 is closer to 350 than -10 is
        });

        it('should work with any rotation values', () => {
            expect(findClosestEquivalentAngle(1080, 45)).toBe(1125); // 45 + 1080
            expect(findClosestEquivalentAngle(45, 1080)).toBe(0); // 1080 - 3*360 = 0, which is closest to 45
        });

        it('should handle tiebreaker cases in angle equivalence', () => {
            // When distances are equal, prefer the more normalized value (smaller absolute value)
            expect(findClosestEquivalentAngle(90, 270)).toBe(-90); // Both 270 and -90 are 180 degrees from 90, but -90 has smaller absolute value
        });
    });
});
