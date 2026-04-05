import { parseStringMove } from '@/cube/core/move-parser';
import { Axis, Face } from '@/cube/types';

import {
    axisLayerToMoveBase,
    axisLayerToNotation,
    inferMoveFromDrag,
    inferMoveFromFaceRotation,
    inferWholeCubeMove,
} from './move-inference';
import { DragDirection } from './types';

describe('move-inference', () => {
    describe('inferMoveFromFaceRotation', () => {
        it('returns clockwise face moves as non-prime notation', () => {
            // Act
            const clockwiseF = inferMoveFromFaceRotation(Face.F, true);
            const clockwiseR = inferMoveFromFaceRotation(Face.R, true);

            // Assert
            expect(clockwiseF).toBe('F');
            expect(clockwiseR).toBe('R');
        });

        it('returns counter-clockwise face moves as prime notation', () => {
            // Act
            const counterClockwiseF = inferMoveFromFaceRotation(Face.F, false);
            const counterClockwiseU = inferMoveFromFaceRotation(Face.U, false);

            // Assert
            expect(counterClockwiseF).toBe("F'");
            expect(counterClockwiseU).toBe("U'");
        });
    });

    describe('inferMoveFromDrag', () => {
        it('infers outer-layer moves for front-face drags on 3x3', () => {
            // Arrange
            const rightDrag = inferMoveFromDrag({
                face: Face.F,
                row: 0,
                col: 1,
                direction: DragDirection.RIGHT,
                cubeSize: 3,
            });

            // Act
            const upDrag = inferMoveFromDrag({
                face: Face.F,
                row: 1,
                col: 0,
                direction: DragDirection.UP,
                cubeSize: 3,
            });

            // Assert
            expect(rightDrag).toBe("U'");
            expect(upDrag).toBe("L'");
        });

        it('infers middle-slice moves on 3x3', () => {
            // Arrange
            const rowMiddle = inferMoveFromDrag({
                face: Face.F,
                row: 1,
                col: 1,
                direction: DragDirection.RIGHT,
                cubeSize: 3,
            });

            // Act
            const colMiddle = inferMoveFromDrag({
                face: Face.F,
                row: 1,
                col: 1,
                direction: DragDirection.UP,
                cubeSize: 3,
            });

            // Assert
            expect(rowMiddle).toBe('E');
            expect(colMiddle).toBe("M'");
        });

        it('uses numeric slice notation for cubes larger than 3x3', () => {
            // Act
            const moveNotation = inferMoveFromDrag({
                face: Face.F,
                row: 1,
                col: 2,
                direction: DragDirection.RIGHT,
                cubeSize: 5,
            });

            // Assert
            expect(moveNotation).toBe('4E');
        });

        it('returns notation accepted by the parser', () => {
            // Arrange
            const cases = [
                { face: Face.F, row: 0, col: 0, direction: DragDirection.RIGHT, cubeSize: 3 },
                { face: Face.B, row: 2, col: 1, direction: DragDirection.LEFT, cubeSize: 3 },
                { face: Face.U, row: 0, col: 2, direction: DragDirection.DOWN, cubeSize: 4 },
                { face: Face.R, row: 1, col: 1, direction: DragDirection.UP, cubeSize: 5 },
            ] as const;

            // Act / Assert
            for (const input of cases) {
                const moveNotation = inferMoveFromDrag(input);
                expect(() => parseStringMove(moveNotation, input.cubeSize)).not.toThrow();
            }
        });

        it('infers 180 degree moves for far drags', () => {
            // Act
            const farDrag = inferMoveFromDrag({
                face: Face.F,
                row: 0,
                col: 1,
                direction: DragDirection.RIGHT,
                cubeSize: 3,
                distancePx: 100,
            });

            // Assert
            expect(farDrag).toBe('U2');
        });

        it('throws on invalid input ranges', () => {
            // Act / Assert
            expect(() =>
                inferMoveFromDrag({
                    face: Face.F,
                    row: -1,
                    col: 0,
                    direction: DragDirection.RIGHT,
                    cubeSize: 3,
                })
            ).toThrow('Invalid row index');

            expect(() =>
                inferMoveFromDrag({
                    face: Face.F,
                    row: 0,
                    col: 3,
                    direction: DragDirection.RIGHT,
                    cubeSize: 3,
                })
            ).toThrow('Invalid column index');
        });
    });

    describe('shared notation helpers', () => {
        it('maps axis and layer index to move base notation', () => {
            expect(axisLayerToMoveBase(Axis.X, 0, 3)).toBe('L');
            expect(axisLayerToMoveBase(Axis.X, 2, 3)).toBe('R');
            expect(axisLayerToMoveBase(Axis.Y, 1, 3)).toBe('E');
            expect(axisLayerToMoveBase(Axis.Z, 1, 5)).toBe('2S');
        });

        it('builds prime/non-prime notation from explicit direction', () => {
            expect(axisLayerToNotation(Axis.Z, 0, true, 3)).toBe('F');
            expect(axisLayerToNotation(Axis.Z, 0, false, 3)).toBe("F'");
        });
    });

    describe('whole-cube notation policies', () => {
        it('uses default policy when no adapter hook is provided', () => {
            expect(inferWholeCubeMove(30, 0)).toBe('y');
            expect(inferWholeCubeMove(-30, 0)).toBe("y'");
            expect(inferWholeCubeMove(0, 30)).toBe("x'");
        });

        it('supports adapter-driven policy hooks', () => {
            const customPolicy = vi.fn((_deltaX: number, _deltaY: number) => 'custom');

            expect(inferWholeCubeMove(12, -7, customPolicy)).toBe('custom');
            expect(customPolicy).toHaveBeenCalledWith(12, -7);
        });
    });
});
