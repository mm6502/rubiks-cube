import { describe, expect, it } from 'vitest';

import { Axis, Face, QuarterTurn } from '@/cube/types';
import {
    calculateStickerPositionOnFace,
    facePositionTo3D,
    getFaceRotationAxis,
} from '@/cube/utils/sticker-position';

describe('facePositionTo3D', () => {
    it('should convert face positions to 3D positions for Front face', () => {
        // Arrange
        const cubeSize = 3;

        // Act & Assert
        expect(facePositionTo3D(0, Face.F, cubeSize)).toEqual({ x: 0, y: 2, z: 0 });
        expect(facePositionTo3D(1, Face.F, cubeSize)).toEqual({ x: 1, y: 2, z: 0 });
        expect(facePositionTo3D(2, Face.F, cubeSize)).toEqual({ x: 2, y: 2, z: 0 });
        expect(facePositionTo3D(3, Face.F, cubeSize)).toEqual({ x: 0, y: 1, z: 0 });
        expect(facePositionTo3D(4, Face.F, cubeSize)).toEqual({ x: 1, y: 1, z: 0 });
        expect(facePositionTo3D(5, Face.F, cubeSize)).toEqual({ x: 2, y: 1, z: 0 });
        expect(facePositionTo3D(6, Face.F, cubeSize)).toEqual({ x: 0, y: 0, z: 0 });
        expect(facePositionTo3D(7, Face.F, cubeSize)).toEqual({ x: 1, y: 0, z: 0 });
        expect(facePositionTo3D(8, Face.F, cubeSize)).toEqual({ x: 2, y: 0, z: 0 });
    });

    it('should convert face positions to 3D positions for Back face', () => {
        // Arrange
        const cubeSize = 3;

        // Act & Assert
        expect(facePositionTo3D(0, Face.B, cubeSize)).toEqual({ x: 2, y: 2, z: 2 });
        expect(facePositionTo3D(1, Face.B, cubeSize)).toEqual({ x: 1, y: 2, z: 2 });
        expect(facePositionTo3D(2, Face.B, cubeSize)).toEqual({ x: 0, y: 2, z: 2 });
        expect(facePositionTo3D(3, Face.B, cubeSize)).toEqual({ x: 2, y: 1, z: 2 });
        expect(facePositionTo3D(4, Face.B, cubeSize)).toEqual({ x: 1, y: 1, z: 2 });
        expect(facePositionTo3D(5, Face.B, cubeSize)).toEqual({ x: 0, y: 1, z: 2 });
        expect(facePositionTo3D(6, Face.B, cubeSize)).toEqual({ x: 2, y: 0, z: 2 });
        expect(facePositionTo3D(7, Face.B, cubeSize)).toEqual({ x: 1, y: 0, z: 2 });
        expect(facePositionTo3D(8, Face.B, cubeSize)).toEqual({ x: 0, y: 0, z: 2 });
    });

    it('should convert face positions to 3D positions for Up face', () => {
        // Arrange
        const cubeSize = 3;

        // Act & Assert
        expect(facePositionTo3D(0, Face.U, cubeSize)).toEqual({ x: 0, y: 2, z: 2 });
        expect(facePositionTo3D(1, Face.U, cubeSize)).toEqual({ x: 1, y: 2, z: 2 });
        expect(facePositionTo3D(2, Face.U, cubeSize)).toEqual({ x: 2, y: 2, z: 2 });
        expect(facePositionTo3D(3, Face.U, cubeSize)).toEqual({ x: 0, y: 2, z: 1 });
        expect(facePositionTo3D(4, Face.U, cubeSize)).toEqual({ x: 1, y: 2, z: 1 });
        expect(facePositionTo3D(5, Face.U, cubeSize)).toEqual({ x: 2, y: 2, z: 1 });
        expect(facePositionTo3D(6, Face.U, cubeSize)).toEqual({ x: 0, y: 2, z: 0 });
        expect(facePositionTo3D(7, Face.U, cubeSize)).toEqual({ x: 1, y: 2, z: 0 });
        expect(facePositionTo3D(8, Face.U, cubeSize)).toEqual({ x: 2, y: 2, z: 0 });
    });

    it('should convert face positions to 3D positions for Down face', () => {
        // Arrange
        const cubeSize = 3;

        // Act & Assert
        expect(facePositionTo3D(0, Face.D, cubeSize)).toEqual({ x: 0, y: 0, z: 0 });
        expect(facePositionTo3D(1, Face.D, cubeSize)).toEqual({ x: 1, y: 0, z: 0 });
        expect(facePositionTo3D(2, Face.D, cubeSize)).toEqual({ x: 2, y: 0, z: 0 });
        expect(facePositionTo3D(3, Face.D, cubeSize)).toEqual({ x: 0, y: 0, z: 1 });
        expect(facePositionTo3D(4, Face.D, cubeSize)).toEqual({ x: 1, y: 0, z: 1 });
        expect(facePositionTo3D(5, Face.D, cubeSize)).toEqual({ x: 2, y: 0, z: 1 });
        expect(facePositionTo3D(6, Face.D, cubeSize)).toEqual({ x: 0, y: 0, z: 2 });
        expect(facePositionTo3D(7, Face.D, cubeSize)).toEqual({ x: 1, y: 0, z: 2 });
        expect(facePositionTo3D(8, Face.D, cubeSize)).toEqual({ x: 2, y: 0, z: 2 });
    });

    it('should convert face positions to 3D positions for Left face', () => {
        // Arrange
        const cubeSize = 3;

        // Act & Assert
        expect(facePositionTo3D(0, Face.L, cubeSize)).toEqual({ x: 0, y: 2, z: 2 });
        expect(facePositionTo3D(1, Face.L, cubeSize)).toEqual({ x: 0, y: 2, z: 1 });
        expect(facePositionTo3D(2, Face.L, cubeSize)).toEqual({ x: 0, y: 2, z: 0 });
        expect(facePositionTo3D(3, Face.L, cubeSize)).toEqual({ x: 0, y: 1, z: 2 });
        expect(facePositionTo3D(4, Face.L, cubeSize)).toEqual({ x: 0, y: 1, z: 1 });
        expect(facePositionTo3D(5, Face.L, cubeSize)).toEqual({ x: 0, y: 1, z: 0 });
        expect(facePositionTo3D(6, Face.L, cubeSize)).toEqual({ x: 0, y: 0, z: 2 });
        expect(facePositionTo3D(7, Face.L, cubeSize)).toEqual({ x: 0, y: 0, z: 1 });
        expect(facePositionTo3D(8, Face.L, cubeSize)).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('should convert face positions to 3D positions for Right face', () => {
        // Arrange
        const cubeSize = 3;

        // Act & Assert
        expect(facePositionTo3D(0, Face.R, cubeSize)).toEqual({ x: 2, y: 2, z: 0 });
        expect(facePositionTo3D(1, Face.R, cubeSize)).toEqual({ x: 2, y: 2, z: 1 });
        expect(facePositionTo3D(2, Face.R, cubeSize)).toEqual({ x: 2, y: 2, z: 2 });
        expect(facePositionTo3D(3, Face.R, cubeSize)).toEqual({ x: 2, y: 1, z: 0 });
        expect(facePositionTo3D(4, Face.R, cubeSize)).toEqual({ x: 2, y: 1, z: 1 });
        expect(facePositionTo3D(5, Face.R, cubeSize)).toEqual({ x: 2, y: 1, z: 2 });
        expect(facePositionTo3D(6, Face.R, cubeSize)).toEqual({ x: 2, y: 0, z: 0 });
        expect(facePositionTo3D(7, Face.R, cubeSize)).toEqual({ x: 2, y: 0, z: 1 });
        expect(facePositionTo3D(8, Face.R, cubeSize)).toEqual({ x: 2, y: 0, z: 2 });
    });

    it('should work with different cube sizes', () => {
        // Act & Assert
        expect(facePositionTo3D(0, Face.F, 4)).toEqual({ x: 0, y: 3, z: 0 });
        expect(facePositionTo3D(15, Face.F, 4)).toEqual({ x: 3, y: 0, z: 0 });
    });

    it('should throw error for unknown face', () => {
        // Act & Assert
        expect(() => facePositionTo3D(0, 'unknown' as any, 3)).toThrow('Unknown face: unknown');
    });
});

describe('calculateStickerPositionOnFace', () => {
    it('should calculate positions for Front face', () => {
        // Arrange
        const cubeSize = 3;

        // Act & Assert
        expect(calculateStickerPositionOnFace({ x: 0, y: 2, z: 0 }, Face.F, cubeSize)).toBe(0);
        expect(calculateStickerPositionOnFace({ x: 1, y: 2, z: 0 }, Face.F, cubeSize)).toBe(1);
        expect(calculateStickerPositionOnFace({ x: 2, y: 2, z: 0 }, Face.F, cubeSize)).toBe(2);
        expect(calculateStickerPositionOnFace({ x: 0, y: 1, z: 0 }, Face.F, cubeSize)).toBe(3);
        expect(calculateStickerPositionOnFace({ x: 1, y: 1, z: 0 }, Face.F, cubeSize)).toBe(4);
        expect(calculateStickerPositionOnFace({ x: 2, y: 1, z: 0 }, Face.F, cubeSize)).toBe(5);
        expect(calculateStickerPositionOnFace({ x: 0, y: 0, z: 0 }, Face.F, cubeSize)).toBe(6);
        expect(calculateStickerPositionOnFace({ x: 1, y: 0, z: 0 }, Face.F, cubeSize)).toBe(7);
        expect(calculateStickerPositionOnFace({ x: 2, y: 0, z: 0 }, Face.F, cubeSize)).toBe(8);
    });

    it('should calculate positions for Back face', () => {
        // Arrange
        const cubeSize = 3;

        // Act & Assert
        expect(calculateStickerPositionOnFace({ x: 2, y: 2, z: 2 }, Face.B, cubeSize)).toBe(0);
        expect(calculateStickerPositionOnFace({ x: 1, y: 2, z: 2 }, Face.B, cubeSize)).toBe(1);
        expect(calculateStickerPositionOnFace({ x: 0, y: 2, z: 2 }, Face.B, cubeSize)).toBe(2);
        expect(calculateStickerPositionOnFace({ x: 2, y: 1, z: 2 }, Face.B, cubeSize)).toBe(3);
        expect(calculateStickerPositionOnFace({ x: 1, y: 1, z: 2 }, Face.B, cubeSize)).toBe(4);
        expect(calculateStickerPositionOnFace({ x: 0, y: 1, z: 2 }, Face.B, cubeSize)).toBe(5);
        expect(calculateStickerPositionOnFace({ x: 2, y: 0, z: 2 }, Face.B, cubeSize)).toBe(6);
        expect(calculateStickerPositionOnFace({ x: 1, y: 0, z: 2 }, Face.B, cubeSize)).toBe(7);
        expect(calculateStickerPositionOnFace({ x: 0, y: 0, z: 2 }, Face.B, cubeSize)).toBe(8);
    });

    it('should calculate positions for Up face', () => {
        const cubeSize = 3;
        expect(calculateStickerPositionOnFace({ x: 0, y: 2, z: 2 }, Face.U, cubeSize)).toBe(0);
        expect(calculateStickerPositionOnFace({ x: 1, y: 2, z: 2 }, Face.U, cubeSize)).toBe(1);
        expect(calculateStickerPositionOnFace({ x: 2, y: 2, z: 2 }, Face.U, cubeSize)).toBe(2);
        expect(calculateStickerPositionOnFace({ x: 0, y: 2, z: 1 }, Face.U, cubeSize)).toBe(3);
        expect(calculateStickerPositionOnFace({ x: 1, y: 2, z: 1 }, Face.U, cubeSize)).toBe(4);
        expect(calculateStickerPositionOnFace({ x: 2, y: 2, z: 1 }, Face.U, cubeSize)).toBe(5);
        expect(calculateStickerPositionOnFace({ x: 0, y: 2, z: 0 }, Face.U, cubeSize)).toBe(6);
        expect(calculateStickerPositionOnFace({ x: 1, y: 2, z: 0 }, Face.U, cubeSize)).toBe(7);
        expect(calculateStickerPositionOnFace({ x: 2, y: 2, z: 0 }, Face.U, cubeSize)).toBe(8);
    });

    it('should calculate positions for Down face', () => {
        const cubeSize = 3;
        expect(calculateStickerPositionOnFace({ x: 0, y: 0, z: 0 }, Face.D, cubeSize)).toBe(0);
        expect(calculateStickerPositionOnFace({ x: 1, y: 0, z: 0 }, Face.D, cubeSize)).toBe(1);
        expect(calculateStickerPositionOnFace({ x: 2, y: 0, z: 0 }, Face.D, cubeSize)).toBe(2);
        expect(calculateStickerPositionOnFace({ x: 0, y: 0, z: 1 }, Face.D, cubeSize)).toBe(3);
        expect(calculateStickerPositionOnFace({ x: 1, y: 0, z: 1 }, Face.D, cubeSize)).toBe(4);
        expect(calculateStickerPositionOnFace({ x: 2, y: 0, z: 1 }, Face.D, cubeSize)).toBe(5);
        expect(calculateStickerPositionOnFace({ x: 0, y: 0, z: 2 }, Face.D, cubeSize)).toBe(6);
        expect(calculateStickerPositionOnFace({ x: 1, y: 0, z: 2 }, Face.D, cubeSize)).toBe(7);
        expect(calculateStickerPositionOnFace({ x: 2, y: 0, z: 2 }, Face.D, cubeSize)).toBe(8);
    });

    it('should calculate positions for Left face', () => {
        const cubeSize = 3;
        expect(calculateStickerPositionOnFace({ x: 0, y: 2, z: 2 }, Face.L, cubeSize)).toBe(0);
        expect(calculateStickerPositionOnFace({ x: 0, y: 2, z: 1 }, Face.L, cubeSize)).toBe(1);
        expect(calculateStickerPositionOnFace({ x: 0, y: 2, z: 0 }, Face.L, cubeSize)).toBe(2);
        expect(calculateStickerPositionOnFace({ x: 0, y: 1, z: 2 }, Face.L, cubeSize)).toBe(3);
        expect(calculateStickerPositionOnFace({ x: 0, y: 1, z: 1 }, Face.L, cubeSize)).toBe(4);
        expect(calculateStickerPositionOnFace({ x: 0, y: 1, z: 0 }, Face.L, cubeSize)).toBe(5);
        expect(calculateStickerPositionOnFace({ x: 0, y: 0, z: 2 }, Face.L, cubeSize)).toBe(6);
        expect(calculateStickerPositionOnFace({ x: 0, y: 0, z: 1 }, Face.L, cubeSize)).toBe(7);
        expect(calculateStickerPositionOnFace({ x: 0, y: 0, z: 0 }, Face.L, cubeSize)).toBe(8);
    });

    it('should calculate positions for Right face', () => {
        const cubeSize = 3;
        expect(calculateStickerPositionOnFace({ x: 2, y: 2, z: 0 }, Face.R, cubeSize)).toBe(0);
        expect(calculateStickerPositionOnFace({ x: 2, y: 2, z: 1 }, Face.R, cubeSize)).toBe(1);
        expect(calculateStickerPositionOnFace({ x: 2, y: 2, z: 2 }, Face.R, cubeSize)).toBe(2);
        expect(calculateStickerPositionOnFace({ x: 2, y: 1, z: 0 }, Face.R, cubeSize)).toBe(3);
        expect(calculateStickerPositionOnFace({ x: 2, y: 1, z: 1 }, Face.R, cubeSize)).toBe(4);
        expect(calculateStickerPositionOnFace({ x: 2, y: 1, z: 2 }, Face.R, cubeSize)).toBe(5);
        expect(calculateStickerPositionOnFace({ x: 2, y: 0, z: 0 }, Face.R, cubeSize)).toBe(6);
        expect(calculateStickerPositionOnFace({ x: 2, y: 0, z: 1 }, Face.R, cubeSize)).toBe(7);
        expect(calculateStickerPositionOnFace({ x: 2, y: 0, z: 2 }, Face.R, cubeSize)).toBe(8);
    });

    it('should work with different cube sizes', () => {
        expect(calculateStickerPositionOnFace({ x: 0, y: 3, z: 0 }, Face.F, 4)).toBe(0);
        expect(calculateStickerPositionOnFace({ x: 3, y: 0, z: 0 }, Face.F, 4)).toBe(15);
    });
});

describe('getFaceRotationAxis', () => {
    it('should return correct axis and angle for Up face', () => {
        expect(getFaceRotationAxis(Face.U, QuarterTurn.QUARTER)).toEqual({
            axis: Axis.Y,
            effectiveAngle: QuarterTurn.QUARTER,
        });
        expect(getFaceRotationAxis(Face.U, QuarterTurn.HALF)).toEqual({
            axis: Axis.Y,
            effectiveAngle: QuarterTurn.HALF,
        });
        expect(getFaceRotationAxis(Face.U, QuarterTurn.THREE_QUARTER)).toEqual({
            axis: Axis.Y,
            effectiveAngle: QuarterTurn.THREE_QUARTER,
        });
    });

    it('should return correct axis and angle for Down face', () => {
        expect(getFaceRotationAxis(Face.D, QuarterTurn.QUARTER)).toEqual({
            axis: Axis.Y,
            effectiveAngle: QuarterTurn.QUARTER_NEG,
        });
        expect(getFaceRotationAxis(Face.D, QuarterTurn.HALF)).toEqual({
            axis: Axis.Y,
            effectiveAngle: QuarterTurn.HALF_NEG,
        });
        expect(getFaceRotationAxis(Face.D, QuarterTurn.THREE_QUARTER)).toEqual({
            axis: Axis.Y,
            effectiveAngle: -270,
        });
    });

    it('should return correct axis and angle for Front face', () => {
        expect(getFaceRotationAxis(Face.F, QuarterTurn.QUARTER)).toEqual({
            axis: Axis.Z,
            effectiveAngle: QuarterTurn.QUARTER_NEG,
        });
        expect(getFaceRotationAxis(Face.F, QuarterTurn.HALF)).toEqual({
            axis: Axis.Z,
            effectiveAngle: QuarterTurn.HALF_NEG,
        });
        expect(getFaceRotationAxis(Face.F, QuarterTurn.THREE_QUARTER)).toEqual({
            axis: Axis.Z,
            effectiveAngle: -270,
        });
    });

    it('should return correct axis and angle for Back face', () => {
        expect(getFaceRotationAxis(Face.B, QuarterTurn.QUARTER)).toEqual({
            axis: Axis.Z,
            effectiveAngle: QuarterTurn.QUARTER,
        });
        expect(getFaceRotationAxis(Face.B, QuarterTurn.HALF)).toEqual({
            axis: Axis.Z,
            effectiveAngle: QuarterTurn.HALF,
        });
        expect(getFaceRotationAxis(Face.B, QuarterTurn.THREE_QUARTER)).toEqual({
            axis: Axis.Z,
            effectiveAngle: QuarterTurn.THREE_QUARTER,
        });
    });

    it('should return correct axis and angle for Left face', () => {
        expect(getFaceRotationAxis(Face.L, QuarterTurn.QUARTER)).toEqual({
            axis: Axis.X,
            effectiveAngle: QuarterTurn.QUARTER_NEG,
        });
        expect(getFaceRotationAxis(Face.L, QuarterTurn.HALF)).toEqual({
            axis: Axis.X,
            effectiveAngle: QuarterTurn.HALF_NEG,
        });
        expect(getFaceRotationAxis(Face.L, QuarterTurn.THREE_QUARTER)).toEqual({
            axis: Axis.X,
            effectiveAngle: -270,
        });
    });

    it('should return correct axis and angle for Right face', () => {
        expect(getFaceRotationAxis(Face.R, QuarterTurn.QUARTER)).toEqual({
            axis: Axis.X,
            effectiveAngle: QuarterTurn.QUARTER,
        });
        expect(getFaceRotationAxis(Face.R, QuarterTurn.HALF)).toEqual({
            axis: Axis.X,
            effectiveAngle: QuarterTurn.HALF,
        });
        expect(getFaceRotationAxis(Face.R, QuarterTurn.THREE_QUARTER)).toEqual({
            axis: Axis.X,
            effectiveAngle: QuarterTurn.THREE_QUARTER,
        });
    });

    it('handles -180° input correctly for all faces', () => {
        // Non-inverted faces (R, U, B): -180 passes through
        expect(getFaceRotationAxis(Face.R, QuarterTurn.HALF_NEG)).toEqual({
            axis: Axis.X,
            effectiveAngle: QuarterTurn.HALF_NEG,
        });
        expect(getFaceRotationAxis(Face.U, QuarterTurn.HALF_NEG)).toEqual({
            axis: Axis.Y,
            effectiveAngle: QuarterTurn.HALF_NEG,
        });
        expect(getFaceRotationAxis(Face.B, QuarterTurn.HALF_NEG)).toEqual({
            axis: Axis.Z,
            effectiveAngle: QuarterTurn.HALF_NEG,
        });

        // Inverted faces (L, F, D): -180 gets negated to +180
        expect(getFaceRotationAxis(Face.L, QuarterTurn.HALF_NEG)).toEqual({
            axis: Axis.X,
            effectiveAngle: QuarterTurn.HALF,
        });
        expect(getFaceRotationAxis(Face.F, QuarterTurn.HALF_NEG)).toEqual({
            axis: Axis.Z,
            effectiveAngle: QuarterTurn.HALF,
        });
        expect(getFaceRotationAxis(Face.D, QuarterTurn.HALF_NEG)).toEqual({
            axis: Axis.Y,
            effectiveAngle: QuarterTurn.HALF,
        });
    });

    it('should throw error for unknown face', () => {
        expect(() => getFaceRotationAxis('unknown' as any, QuarterTurn.QUARTER)).toThrow(
            'Unknown face: unknown'
        );
    });
});
