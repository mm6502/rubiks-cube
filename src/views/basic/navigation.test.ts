// BasicCube.Navigation unit tests
import { beforeEach, describe, expect, it } from 'vitest';

import { CubeController } from '@/cube-controller';
import { Face } from '@/cube/types';

import { NavigationDelta, Orientation, getAdjacentPos } from './navigation';

describe('BasicCubeNavigation', () => {
    let model: CubeController;
    const cubeSize = 3;

    beforeEach(() => {
        model = new CubeController();
    });

    describe('getAdjacentPos', () => {
        describe('within-face movement', () => {
            it('should move up within face from center', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 4, NavigationDelta.Up);

                // Assert
                expect(result).toEqual({ newFace: Face.F, newPos: 1 });
            });

            it('should move down within face from center', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 4, NavigationDelta.Down);

                // Assert
                expect(result).toEqual({ newFace: Face.F, newPos: 7 });
            });

            it('should move left within face from center', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 4, NavigationDelta.Left);

                // Assert
                expect(result).toEqual({ newFace: Face.F, newPos: 3 });
            });

            it('should move right within face from center', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 4, NavigationDelta.Right);

                // Assert
                expect(result).toEqual({ newFace: Face.F, newPos: 5 });
            });

            it('should move up from top row to adjacent face', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 0, NavigationDelta.Up);

                // Assert
                expect(result).toEqual({ newFace: Face.U, newPos: 6 });
            });

            it('should move down from bottom row to adjacent face', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 8, NavigationDelta.Down);

                // Assert
                expect(result).toEqual({ newFace: Face.D, newPos: 2 });
            });

            it('should move left from left column to adjacent face', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 0, NavigationDelta.Left);

                // Assert
                expect(result).toEqual({ newFace: Face.L, newPos: 2 });
            });

            it('should move right from right column to adjacent face', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 2, NavigationDelta.Right);

                // Assert
                expect(result).toEqual({ newFace: Face.R, newPos: 0 });
            });
        });

        describe('face transitions from Front face', () => {
            it('should transition from F top edge to U face', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 0, NavigationDelta.Up);

                // Assert
                expect(result).toEqual({ newFace: Face.U, newPos: 6 });
            });

            it('should transition from F bottom edge to D face', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 8, NavigationDelta.Down);

                // Assert
                expect(result).toEqual({ newFace: Face.D, newPos: 2 });
            });

            it('should transition from F left edge to L face', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 0, NavigationDelta.Left);

                // Assert
                expect(result).toEqual({ newFace: Face.L, newPos: 2 });
            });

            it('should transition from F right edge to R face', () => {
                // Act
                const result = getAdjacentPos(model, Face.F, 2, NavigationDelta.Right);

                // Assert
                expect(result).toEqual({ newFace: Face.R, newPos: 0 });
            });
        });

        describe('face transitions from Up face', () => {
            it('should transition from U top edge to B face', () => {
                // Act
                const result = getAdjacentPos(model, Face.U, 0, NavigationDelta.Up);

                // Assert
                expect(result).toEqual({ newFace: Face.B, newPos: 6 });
            });

            it('should transition from U bottom edge to F face', () => {
                // Act
                const result = getAdjacentPos(model, Face.U, 8, NavigationDelta.Down);

                // Assert
                expect(result).toEqual({ newFace: Face.F, newPos: 2 });
            });

            it('should transition from U left edge to L face', () => {
                // Act
                const result = getAdjacentPos(model, Face.U, 0, NavigationDelta.Left);

                // Assert
                expect(result).toEqual({ newFace: Face.L, newPos: 2 });
            });

            it('should transition from U right edge to R face', () => {
                // Act
                const result = getAdjacentPos(model, Face.U, 2, NavigationDelta.Right);

                // Assert
                expect(result).toEqual({ newFace: Face.R, newPos: 0 });
            });
        });

        describe('face transitions from Back face', () => {
            it('should transition from B top edge to U face', () => {
                // Act
                const result = getAdjacentPos(model, Face.B, 0, NavigationDelta.Up);

                // Assert
                expect(result).toEqual({ newFace: Face.U, newPos: 0 });
            });

            it('should transition from B bottom edge to D face', () => {
                // Act
                const result = getAdjacentPos(model, Face.B, 8, NavigationDelta.Down);

                // Assert
                expect(result).toEqual({ newFace: Face.D, newPos: 2 });
            });

            it('should transition from B left edge to R face (counter-clockwise)', () => {
                // Act
                const result = getAdjacentPos(model, Face.B, 0, NavigationDelta.Left);

                // Assert
                expect(result).toEqual({ newFace: Face.R, newPos: 2 });
            });

            it('should transition from B right edge to L face (clockwise)', () => {
                // Act
                const result = getAdjacentPos(model, Face.B, 2, NavigationDelta.Right);

                // Assert
                expect(result).toEqual({ newFace: Face.L, newPos: 0 });
            });
        });

        describe('face transitions from Down face', () => {
            it('should transition from D top edge to B face', () => {
                const result = getAdjacentPos(model, Face.D, 0, NavigationDelta.Up);
                expect(result).toEqual({ newFace: Face.B, newPos: 6 });
            });

            it('should transition from D bottom edge to B face', () => {
                const result = getAdjacentPos(model, Face.D, 8, NavigationDelta.Down);
                expect(result).toEqual({ newFace: Face.B, newPos: 2 });
            });

            it('should transition from D left edge to L face', () => {
                const result = getAdjacentPos(model, Face.D, 0, NavigationDelta.Left);
                expect(result).toEqual({ newFace: Face.L, newPos: 6 });
            });

            it('should transition from D right edge to R face', () => {
                // Act
                const result = getAdjacentPos(model, Face.D, 2, NavigationDelta.Right);

                // Assert
                expect(result).toEqual({ newFace: Face.R, newPos: 8 });
            });
        });

        describe('face transitions from Left face', () => {
            it('should transition from L top edge to U face', () => {
                // Act
                const result = getAdjacentPos(model, Face.L, 0, NavigationDelta.Up);

                // Assert
                expect(result).toEqual({ newFace: Face.U, newPos: 0 });
            });

            it('should transition from L bottom edge to D face', () => {
                // Act
                const result = getAdjacentPos(model, Face.L, 8, NavigationDelta.Down);

                // Assert
                expect(result).toEqual({ newFace: Face.D, newPos: 6 });
            });

            it('should transition from L left edge to B face', () => {
                // Act
                const result = getAdjacentPos(model, Face.L, 0, NavigationDelta.Left);

                // Assert
                expect(result).toEqual({ newFace: Face.B, newPos: 2 });
            });

            it('should transition from L right edge to F face', () => {
                // Act
                const result = getAdjacentPos(model, Face.L, 2, NavigationDelta.Right);

                // Assert
                expect(result).toEqual({ newFace: Face.F, newPos: 0 });
            });
        });

        describe('face transitions from Right face', () => {
            it('should transition from R top edge to U face', () => {
                // Act
                const result = getAdjacentPos(model, Face.R, 0, NavigationDelta.Up);

                // Assert
                expect(result).toEqual({ newFace: Face.U, newPos: 2 });
            });

            it('should transition from R bottom edge to D face', () => {
                // Act
                const result = getAdjacentPos(model, Face.R, 8, NavigationDelta.Down);

                // Assert
                expect(result).toEqual({ newFace: Face.D, newPos: 2 });
            });

            it('should transition from R left edge to F face', () => {
                // Act
                const result = getAdjacentPos(model, Face.R, 0, NavigationDelta.Left);

                // Assert
                expect(result).toEqual({ newFace: Face.F, newPos: 2 });
            });

            it('should transition from R right edge to B face', () => {
                // Act
                const result = getAdjacentPos(model, Face.R, 2, NavigationDelta.Right);

                // Assert
                expect(result).toEqual({ newFace: Face.B, newPos: 0 });
            });
        });

        describe('orientation parameter (should not affect navigation)', () => {
            it('should work the same with Front orientation', () => {
                // Act
                const frontResult = getAdjacentPos(
                    model,
                    Face.F,
                    4,
                    NavigationDelta.Up,
                    Orientation.Front
                );
                const defaultResult = getAdjacentPos(model, Face.F, 4, NavigationDelta.Up);

                // Assert
                expect(frontResult).toEqual(defaultResult);
            });

            it('should work the same with Back orientation', () => {
                // Act
                const backResult = getAdjacentPos(
                    model,
                    Face.F,
                    4,
                    NavigationDelta.Up,
                    Orientation.Back
                );
                const defaultResult = getAdjacentPos(model, Face.F, 4, NavigationDelta.Up);

                // Assert
                expect(backResult).toEqual(defaultResult);
            });
        });

        describe('edge cases', () => {
            it('should handle all corner positions', () => {
                // Arrange
                const corners = [0, 2, 6, 8];

                // Act & Assert
                for (const face of [Face.F, Face.B, Face.U, Face.D, Face.L, Face.R]) {
                    for (const pos of corners) {
                        for (const delta of [
                            NavigationDelta.Up,
                            NavigationDelta.Down,
                            NavigationDelta.Left,
                            NavigationDelta.Right,
                        ]) {
                            const result = getAdjacentPos(model, face, pos, delta);
                            expect(result).toBeDefined();
                            expect(result.newFace).toBeDefined();
                            expect(result.newPos).toBeGreaterThanOrEqual(0);
                            expect(result.newPos).toBeLessThan(cubeSize * cubeSize);
                        }
                    }
                }
            });

            it('should handle all edge positions', () => {
                // Arrange
                const edges = [1, 3, 5, 7];

                // Act & Assert
                for (const face of [Face.F, Face.B, Face.U, Face.D, Face.L, Face.R]) {
                    for (const pos of edges) {
                        for (const delta of [
                            NavigationDelta.Up,
                            NavigationDelta.Down,
                            NavigationDelta.Left,
                            NavigationDelta.Right,
                        ]) {
                            const result = getAdjacentPos(model, face, pos, delta);
                            expect(result).toBeDefined();
                            expect(result.newFace).toBeDefined();
                            expect(result.newPos).toBeGreaterThanOrEqual(0);
                            expect(result.newPos).toBeLessThan(cubeSize * cubeSize);
                        }
                    }
                }
            });
        });
    });
});
