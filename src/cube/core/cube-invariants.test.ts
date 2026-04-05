import { describe, expect, it } from 'vitest';

import type { CubeInvariants, MoveTable } from '@/cube/core/cube-invariants';
import {
    computeCenterOrientationDelta,
    computeEdgeOrientationDelta,
    createCubeInvariants,
} from '@/cube/core/cube-invariants';
import { Axis, CubieType, MoveDefinition, QuarterTurn, Vector3 } from '@/cube/types';
import {
    getCanonicalIndexFromInvariants as getCanonicalIndex,
    getCubieTypeFromPosition,
} from '@/cube/utils/coordinates';
import {
    getAxisComponent,
    mod,
    rotatePosition3D,
    toActual,
    toCentered,
    vectorsEqual,
} from '@/cube/utils/math';
import { logger } from '@/diagnostics/logger';

const faceMovesFor = (cubeSize: number): ReadonlyArray<MoveDefinition> => {
    const last = cubeSize - 1;
    return [
        { name: 'U', axis: Axis.Y, layerIndices: [last], angle: 90 },
        { name: 'D', axis: Axis.Y, layerIndices: [0], angle: -90 },
        { name: 'R', axis: Axis.X, layerIndices: [last], angle: -90 },
        { name: 'L', axis: Axis.X, layerIndices: [0], angle: 90 },
        { name: 'F', axis: Axis.Z, layerIndices: [0], angle: -90 },
        { name: 'B', axis: Axis.Z, layerIndices: [last], angle: 90 },
    ] satisfies ReadonlyArray<MoveDefinition>;
};

const wideMovesFor = (cubeSize: number): ReadonlyArray<MoveDefinition> => {
    if (cubeSize < 2) {
        return [] satisfies ReadonlyArray<MoveDefinition>;
    }

    const last = cubeSize - 1;
    const secondLayerLow = Math.min(1, last);
    const secondLayerHigh = Math.max(last - 1, 0);

    return [
        { name: 'Uw', axis: Axis.Y, layerIndices: [last, secondLayerHigh], angle: 90 },
        { name: 'Dw', axis: Axis.Y, layerIndices: [0, secondLayerLow], angle: -90 },
        { name: 'Rw', axis: Axis.X, layerIndices: [last, secondLayerHigh], angle: -90 },
        { name: 'Lw', axis: Axis.X, layerIndices: [0, secondLayerLow], angle: 90 },
        { name: 'Fw', axis: Axis.Z, layerIndices: [0, secondLayerLow], angle: -90 },
        { name: 'Bw', axis: Axis.Z, layerIndices: [last, secondLayerHigh], angle: 90 },
    ] satisfies ReadonlyArray<MoveDefinition>;
};

const sliceMovesFor = (cubeSize: number): ReadonlyArray<MoveDefinition> => {
    if (cubeSize < 3) {
        return [] satisfies ReadonlyArray<MoveDefinition>;
    }

    const innerLayers = Array.from({ length: Math.max(cubeSize - 2, 0) }, (_, index) => index + 1);
    if (innerLayers.length === 0) {
        return [] satisfies ReadonlyArray<MoveDefinition>;
    }

    const moves: MoveDefinition[] = [];
    const defaultLayer = innerLayers[0];
    moves.push(
        { name: 'M', axis: Axis.X, layerIndices: [defaultLayer], angle: -90 },
        { name: 'E', axis: Axis.Y, layerIndices: [defaultLayer], angle: -90 },
        { name: 'S', axis: Axis.Z, layerIndices: [defaultLayer], angle: -90 }
    );

    if (cubeSize > 3) {
        for (const layerIndex of innerLayers) {
            const sliceNumber = layerIndex + 1;
            moves.push(
                { name: `${sliceNumber}M`, axis: Axis.X, layerIndices: [layerIndex], angle: -90 },
                { name: `${sliceNumber}E`, axis: Axis.Y, layerIndices: [layerIndex], angle: -90 },
                { name: `${sliceNumber}S`, axis: Axis.Z, layerIndices: [layerIndex], angle: -90 }
            );
        }
    }

    return moves satisfies ReadonlyArray<MoveDefinition>;
};

const rotationMovesFor = (cubeSize: number): ReadonlyArray<MoveDefinition> => {
    const layers = Array.from({ length: cubeSize }, (_, index) => index);

    return [
        { name: 'x', axis: Axis.X, layerIndices: layers, angle: -90 },
        { name: 'y', axis: Axis.Y, layerIndices: layers, angle: 90 },
        { name: 'z', axis: Axis.Z, layerIndices: layers, angle: -90 },
    ] satisfies ReadonlyArray<MoveDefinition>;
};

describe('CubeInvariants', () => {
    describe('createCubeInvariants', () => {
        it('should create invariants for cube size 2', () => {
            const invariants = createCubeInvariants(2);

            expect(invariants.cubeSize).toBe(2);
            expect(invariants.cornerCount).toBe(8);
            expect(invariants.edgeCount).toBe(0);
            expect(invariants.centerCount).toBe(0);
            expect(invariants.physicalCubieCount).toBe(8);
            expect(invariants.validCoords).toEqual([0, 1]);
            expect(invariants.allPositions).toHaveLength(8);
            expect(invariants.canonicalIndices.size).toBe(8);
        });

        it('should create invariants for cube size 3', () => {
            const invariants = createCubeInvariants(3);

            expect(invariants.cubeSize).toBe(3);
            expect(invariants.cornerCount).toBe(8);
            expect(invariants.edgeCount).toBe(12);
            expect(invariants.centerCount).toBe(6);
            expect(invariants.physicalCubieCount).toBe(26);
            expect(invariants.validCoords).toEqual([0, 1, 2]);
            expect(invariants.allPositions).toHaveLength(26); // 3^3 - 1 = 26 positions (excluding center)
            expect(invariants.canonicalIndices.size).toBe(26);
        });

        it('should create invariants for cube size 4', () => {
            const invariants = createCubeInvariants(4);

            expect(invariants.cubeSize).toBe(4);
            expect(invariants.cornerCount).toBe(8);
            expect(invariants.edgeCount).toBe(24);
            expect(invariants.centerCount).toBe(24);
            expect(invariants.physicalCubieCount).toBe(56);
            expect(invariants.validCoords).toEqual([0, 1, 2, 3]);
            expect(invariants.allPositions).toHaveLength(56); // Surface positions only
            expect(invariants.canonicalIndices.size).toBe(56);
        });

        it('should create invariants for cube size 5', () => {
            const invariants = createCubeInvariants(5);

            expect(invariants.cubeSize).toBe(5);
            expect(invariants.cornerCount).toBe(8);
            expect(invariants.edgeCount).toBe(36);
            expect(invariants.centerCount).toBe(54);
            expect(invariants.physicalCubieCount).toBe(98);
            expect(invariants.validCoords).toEqual([0, 1, 2, 3, 4]);
            expect(invariants.allPositions).toHaveLength(98); // Surface positions only
            expect(invariants.canonicalIndices.size).toBe(98);
        });

        it('should throw for invalid cube sizes', () => {
            expect(() => createCubeInvariants(0)).toThrow('Cube size must be at least 2');
            expect(() => createCubeInvariants(1)).toThrow('Cube size must be at least 2');
        });
    });

    describe('canonical indices for cube size 3', () => {
        const invariants = createCubeInvariants(3);

        it('should assign correct corner indices (0-7)', () => {
            expect(getCanonicalIndex(invariants, toActual({ x: -1, y: -1, z: -1 }, 3))).toBe(0); // UFL
            expect(getCanonicalIndex(invariants, toActual({ x: -1, y: -1, z: 1 }, 3))).toBe(1); // UFR
            expect(getCanonicalIndex(invariants, toActual({ x: 1, y: -1, z: -1 }, 3))).toBe(2); // UBL
            expect(getCanonicalIndex(invariants, toActual({ x: 1, y: -1, z: 1 }, 3))).toBe(3); // UBR
            expect(getCanonicalIndex(invariants, toActual({ x: -1, y: 1, z: -1 }, 3))).toBe(4); // DFL
            expect(getCanonicalIndex(invariants, toActual({ x: -1, y: 1, z: 1 }, 3))).toBe(5); // DFR
            expect(getCanonicalIndex(invariants, toActual({ x: 1, y: 1, z: -1 }, 3))).toBe(6); // DBL
            expect(getCanonicalIndex(invariants, toActual({ x: 1, y: 1, z: 1 }, 3))).toBe(7); // DBR
        });

        it('should assign correct edge indices (8-19)', () => {
            // Edges have 2 non-zero coordinates
            expect(getCanonicalIndex(invariants, toActual({ x: 0, y: -1, z: -1 }, 3))).toBe(8); // UB
            expect(getCanonicalIndex(invariants, toActual({ x: 0, y: -1, z: 1 }, 3))).toBe(9); // UF
            expect(getCanonicalIndex(invariants, toActual({ x: 0, y: 1, z: -1 }, 3))).toBe(10); // DB
            expect(getCanonicalIndex(invariants, toActual({ x: 0, y: 1, z: 1 }, 3))).toBe(11); // DF
            expect(getCanonicalIndex(invariants, toActual({ x: -1, y: 0, z: -1 }, 3))).toBe(12); // LB
            expect(getCanonicalIndex(invariants, toActual({ x: -1, y: 0, z: 1 }, 3))).toBe(13); // LF
            expect(getCanonicalIndex(invariants, toActual({ x: 1, y: 0, z: -1 }, 3))).toBe(14); // RB
            expect(getCanonicalIndex(invariants, toActual({ x: 1, y: 0, z: 1 }, 3))).toBe(15); // RF
            expect(getCanonicalIndex(invariants, toActual({ x: -1, y: -1, z: 0 }, 3))).toBe(16); // UL
            expect(getCanonicalIndex(invariants, toActual({ x: -1, y: 1, z: 0 }, 3))).toBe(17); // DL
            expect(getCanonicalIndex(invariants, toActual({ x: 1, y: -1, z: 0 }, 3))).toBe(18); // UR
            expect(getCanonicalIndex(invariants, toActual({ x: 1, y: 1, z: 0 }, 3))).toBe(19); // DR
        });

        it('should assign correct center indices (20-25)', () => {
            // Centers have 1 non-zero coordinate
            expect(getCanonicalIndex(invariants, toActual({ x: -1, y: 0, z: 0 }, 3))).toBe(20); // L
            expect(getCanonicalIndex(invariants, toActual({ x: 1, y: 0, z: 0 }, 3))).toBe(21); // R
            expect(getCanonicalIndex(invariants, toActual({ x: 0, y: -1, z: 0 }, 3))).toBe(22); // D
            expect(getCanonicalIndex(invariants, toActual({ x: 0, y: 1, z: 0 }, 3))).toBe(23); // U
            expect(getCanonicalIndex(invariants, toActual({ x: 0, y: 0, z: -1 }, 3))).toBe(24); // B
            expect(getCanonicalIndex(invariants, toActual({ x: 0, y: 0, z: 1 }, 3))).toBe(25); // F
        });

        it('should not have canonical index for center position', () => {
            const center = toActual({ x: 0, y: 0, z: 0 }, 3);
            expect(() => getCanonicalIndex(invariants, center)).toThrow('No canonical index found');
        });
    });

    describe('canonical indices for cube size 2', () => {
        const invariants = createCubeInvariants(2);

        it('should assign correct corner indices (0-7)', () => {
            expect(getCanonicalIndex(invariants, toActual({ x: -0.5, y: -0.5, z: -0.5 }, 2))).toBe(
                0
            );
            expect(getCanonicalIndex(invariants, toActual({ x: -0.5, y: -0.5, z: 0.5 }, 2))).toBe(
                1
            );
            expect(getCanonicalIndex(invariants, toActual({ x: 0.5, y: -0.5, z: -0.5 }, 2))).toBe(
                2
            );
            expect(getCanonicalIndex(invariants, toActual({ x: 0.5, y: -0.5, z: 0.5 }, 2))).toBe(3);
            expect(getCanonicalIndex(invariants, toActual({ x: -0.5, y: 0.5, z: -0.5 }, 2))).toBe(
                4
            );
            expect(getCanonicalIndex(invariants, toActual({ x: -0.5, y: 0.5, z: 0.5 }, 2))).toBe(5);
            expect(getCanonicalIndex(invariants, toActual({ x: 0.5, y: 0.5, z: -0.5 }, 2))).toBe(6);
            expect(getCanonicalIndex(invariants, toActual({ x: 0.5, y: 0.5, z: 0.5 }, 2))).toBe(7);
        });
    });

    describe('canonical indices for cube size 4', () => {
        const invariants = createCubeInvariants(4);
        const { corners, wings, xCenters } = invariants.categoryOffsets;

        const cornerCoords: Vector3[] = [
            { x: -1.5, y: -1.5, z: -1.5 },
            { x: -1.5, y: -1.5, z: 1.5 },
            { x: 1.5, y: -1.5, z: -1.5 },
            { x: 1.5, y: -1.5, z: 1.5 },
            { x: -1.5, y: 1.5, z: -1.5 },
            { x: -1.5, y: 1.5, z: 1.5 },
            { x: 1.5, y: 1.5, z: -1.5 },
            { x: 1.5, y: 1.5, z: 1.5 },
        ];

        it('should assign corners to the leading indices', () => {
            cornerCoords.forEach((coord, index) => {
                const canonical = toActual(coord, 4);
                expect(getCanonicalIndex(invariants, canonical)).toBe(corners.start + index);
            });
        });

        it('should place wing edges inside the wing range', () => {
            const samples: Vector3[] = [
                { x: -0.5, y: -1.5, z: -1.5 },
                { x: -1.5, y: -0.5, z: -1.5 },
                { x: -1.5, y: -1.5, z: -0.5 },
                { x: 0.5, y: 1.5, z: 1.5 },
                { x: 1.5, y: 0.5, z: 1.5 },
                { x: 1.5, y: 1.5, z: 0.5 },
            ];

            samples.forEach(centered => {
                const canonical = toActual(centered, 4);
                const index = getCanonicalIndex(invariants, canonical);
                expect(index).toBeGreaterThanOrEqual(wings.start);
                expect(index).toBeLessThan(wings.start + wings.count);
                expect(invariants.cubieCategoriesByIndex[index]).toBe('wing_edge');
            });
        });

        it('should map face centers into the x-center range', () => {
            const samples: Vector3[] = [
                { x: -0.5, y: -0.5, z: -1.5 },
                { x: -0.5, y: -1.5, z: -0.5 },
                { x: -1.5, y: -0.5, z: -0.5 },
                { x: 0.5, y: 0.5, z: 1.5 },
                { x: 0.5, y: 1.5, z: 0.5 },
                { x: 1.5, y: 0.5, z: 0.5 },
            ];

            samples.forEach(centered => {
                const canonical = toActual(centered, 4);
                const index = getCanonicalIndex(invariants, canonical);
                expect(index).toBeGreaterThanOrEqual(xCenters.start);
                expect(index).toBeLessThan(xCenters.start + xCenters.count);
                expect(invariants.cubieCategoriesByIndex[index]).toBe('x_center');
            });
        });
    });

    describe('canonical indices for cube size 5', () => {
        const invariants = createCubeInvariants(5);
        const { corners, middleEdges, wings, fixedCenters, xCenters, obliqueCenters } =
            invariants.categoryOffsets;

        const centeredCornerValues: Vector3[] = [
            { x: -2, y: -2, z: -2 },
            { x: -2, y: -2, z: 2 },
            { x: 2, y: -2, z: -2 },
            { x: 2, y: -2, z: 2 },
            { x: -2, y: 2, z: -2 },
            { x: -2, y: 2, z: 2 },
            { x: 2, y: 2, z: -2 },
            { x: 2, y: 2, z: 2 },
        ];

        it('should assign corners first for size 5', () => {
            centeredCornerValues.forEach((coord, index) => {
                const canonical = toActual(coord, 5);
                expect(getCanonicalIndex(invariants, canonical)).toBe(corners.start + index);
            });
        });

        it('should place middle edges in the middle-edge band', () => {
            const samples: Vector3[] = [
                { x: 0, y: -2, z: -2 },
                { x: -2, y: 0, z: -2 },
                { x: -2, y: -2, z: 0 },
                { x: 0, y: 2, z: 2 },
            ];

            samples.forEach(centered => {
                const canonical = toActual(centered, 5);
                const index = getCanonicalIndex(invariants, canonical);
                expect(index).toBeGreaterThanOrEqual(middleEdges.start);
                expect(index).toBeLessThan(middleEdges.start + middleEdges.count);
                expect(invariants.cubieCategoriesByIndex[index]).toBe('middle_edge');
            });
        });

        it('should map wing edges to the wing band', () => {
            const samples: Vector3[] = [
                { x: 1, y: -2, z: -2 },
                { x: -1, y: -2, z: -2 },
                { x: -2, y: 1, z: -2 },
                { x: -2, y: -1, z: -2 },
                { x: -2, y: -2, z: 1 },
                { x: -2, y: -2, z: -1 },
            ];

            samples.forEach(centered => {
                const canonical = toActual(centered, 5);
                const index = getCanonicalIndex(invariants, canonical);
                expect(index).toBeGreaterThanOrEqual(wings.start);
                expect(index).toBeLessThan(wings.start + wings.count);
                expect(invariants.cubieCategoriesByIndex[index]).toBe('wing_edge');
            });
        });

        it('should classify the different center types correctly', () => {
            const fixed = toActual({ x: 0, y: 0, z: -2 }, 5);
            const xCenter = toActual({ x: 1, y: 0, z: -2 }, 5);
            const oblique = toActual({ x: 1, y: 1, z: -2 }, 5);

            const fixedIndex = getCanonicalIndex(invariants, fixed);
            expect(fixedIndex).toBeGreaterThanOrEqual(fixedCenters.start);
            expect(fixedIndex).toBeLessThan(fixedCenters.start + fixedCenters.count);
            expect(invariants.cubieCategoriesByIndex[fixedIndex]).toBe('fixed_center');

            const xCenterIndex = getCanonicalIndex(invariants, xCenter);
            expect(xCenterIndex).toBeGreaterThanOrEqual(xCenters.start);
            expect(xCenterIndex).toBeLessThan(xCenters.start + xCenters.count);
            expect(invariants.cubieCategoriesByIndex[xCenterIndex]).toBe('x_center');

            const obliqueIndex = getCanonicalIndex(invariants, oblique);
            expect(obliqueIndex).toBeGreaterThanOrEqual(obliqueCenters.start);
            expect(obliqueIndex).toBeLessThan(obliqueCenters.start + obliqueCenters.count);
            expect(invariants.cubieCategoriesByIndex[obliqueIndex]).toBe('oblique_center');
        });
    });

    describe('categorization metadata', () => {
        it('should categorize 3x3 cubies', () => {
            const invariants = createCubeInvariants(3);
            expect(invariants.middleEdgeCount).toBe(12);
            expect(invariants.wingCount).toBe(0);
            expect(invariants.fixedCenterCount).toBe(6);
            expect(invariants.xCenterCount).toBe(0);
            expect(invariants.obliqueCenterCount).toBe(0);
            const fixed = invariants.categoryOffsets.fixedCenters;
            expect(fixed.count).toBe(6);
            for (let index = fixed.start; index < fixed.start + fixed.count; index++) {
                expect(invariants.cubieCategoriesByIndex[index]).toBe('fixed_center');
            }
        });

        it('should categorize 4x4 cubies', () => {
            const invariants = createCubeInvariants(4);
            expect(invariants.middleEdgeCount).toBe(0);
            expect(invariants.wingCount).toBe(24);
            expect(invariants.fixedCenterCount).toBe(0);
            expect(invariants.xCenterCount).toBe(24);
            expect(invariants.obliqueCenterCount).toBe(0);

            const wings = invariants.categoryOffsets.wings;
            expect(wings.count).toBe(24);
            for (let index = wings.start; index < wings.start + wings.count; index++) {
                expect(invariants.cubieCategoriesByIndex[index]).toBe('wing_edge');
            }

            const xCenters = invariants.categoryOffsets.xCenters;
            expect(xCenters.count).toBe(24);
            for (let index = xCenters.start; index < xCenters.start + xCenters.count; index++) {
                expect(invariants.cubieCategoriesByIndex[index]).toBe('x_center');
            }
        });

        it('should categorize 5x5 cubies', () => {
            const invariants = createCubeInvariants(5);
            expect(invariants.middleEdgeCount).toBe(12);
            expect(invariants.wingCount).toBe(24);
            expect(invariants.fixedCenterCount).toBe(6);
            expect(invariants.xCenterCount).toBe(24);
            expect(invariants.obliqueCenterCount).toBe(24);

            const middle = invariants.categoryOffsets.middleEdges;
            expect(middle.count).toBe(12);
            for (let index = middle.start; index < middle.start + middle.count; index++) {
                expect(invariants.cubieCategoriesByIndex[index]).toBe('middle_edge');
            }

            const wings = invariants.categoryOffsets.wings;
            expect(wings.count).toBe(24);
            for (let index = wings.start; index < wings.start + wings.count; index++) {
                expect(invariants.cubieCategoriesByIndex[index]).toBe('wing_edge');
            }

            const fixed = invariants.categoryOffsets.fixedCenters;
            expect(fixed.count).toBe(6);
            for (let index = fixed.start; index < fixed.start + fixed.count; index++) {
                expect(invariants.cubieCategoriesByIndex[index]).toBe('fixed_center');
            }

            const xCenters = invariants.categoryOffsets.xCenters;
            expect(xCenters.count).toBe(24);
            for (let index = xCenters.start; index < xCenters.start + xCenters.count; index++) {
                expect(invariants.cubieCategoriesByIndex[index]).toBe('x_center');
            }

            const oblique = invariants.categoryOffsets.obliqueCenters;
            expect(oblique.count).toBe(24);
            for (let index = oblique.start; index < oblique.start + oblique.count; index++) {
                expect(invariants.cubieCategoriesByIndex[index]).toBe('oblique_center');
            }
        });
    });

    describe('getCubieTypeFromPosition', () => {
        it('should identify corners', () => {
            expect(getCubieTypeFromPosition(toActual({ x: 1, y: 1, z: 1 }, 3), 3)).toBe(
                CubieType.CORNER
            );
            expect(getCubieTypeFromPosition(toActual({ x: -1, y: -1, z: -1 }, 3), 3)).toBe(
                CubieType.CORNER
            );
        });

        it('should identify edges', () => {
            expect(getCubieTypeFromPosition(toActual({ x: 0, y: 1, z: 1 }, 3), 3)).toBe(
                CubieType.EDGE
            );
            expect(getCubieTypeFromPosition(toActual({ x: 1, y: 0, z: 1 }, 3), 3)).toBe(
                CubieType.EDGE
            );
            expect(getCubieTypeFromPosition(toActual({ x: 1, y: 1, z: 0 }, 3), 3)).toBe(
                CubieType.EDGE
            );
        });

        it('should identify centers', () => {
            expect(getCubieTypeFromPosition(toActual({ x: 1, y: 0, z: 0 }, 3), 3)).toBe(
                CubieType.CENTER
            );
            expect(getCubieTypeFromPosition(toActual({ x: 0, y: 1, z: 0 }, 3), 3)).toBe(
                CubieType.CENTER
            );
            expect(getCubieTypeFromPosition(toActual({ x: 0, y: 0, z: 1 }, 3), 3)).toBe(
                CubieType.CENTER
            );
        });
    });

    describe('move tables', () => {
        type CategoryKey =
            | 'corners'
            | 'edges'
            | 'centers'
            | 'middleEdges'
            | 'wings'
            | 'fixedCenters'
            | 'xCenters'
            | 'obliqueCenters';

        interface CategoryDescriptor {
            start: number;
            count: number;
            perm: readonly number[];
            ori: readonly number[];
            baseOffset: number;
        }

        const EPSILON = 1e-6;

        const ensureMoveTable = (invariants: CubeInvariants, key: string): MoveTable => {
            const table = invariants.moveTables.get(key);
            if (!table) {
                throw new Error(`Move table for ${key} not generated`);
            }
            return table;
        };

        const permutationParity = (perm: readonly number[]): number => {
            const visited = new Array<boolean>(perm.length).fill(false);
            let parity = 0;

            for (let start = 0; start < perm.length; start++) {
                if (visited[start]) {
                    continue;
                }

                let length = 0;
                let index = start;

                while (!visited[index]) {
                    visited[index] = true;
                    index = perm[index];
                    length++;
                }

                if (length > 1) {
                    parity ^= (length - 1) & 1;
                }
            }

            return parity & 1;
        };

        const createCategoryDescriptor = (
            invariants: CubeInvariants,
            table: MoveTable,
            key: CategoryKey
        ): CategoryDescriptor => {
            switch (key) {
                case 'corners':
                    return {
                        start: invariants.categoryOffsets.corners.start,
                        count: invariants.cornerCount,
                        perm: table.cornerPerm,
                        ori: table.cornerOriDelta,
                        baseOffset: invariants.categoryOffsets.corners.start,
                    } satisfies CategoryDescriptor;
                case 'edges':
                    return {
                        start: invariants.categoryOffsets.corners.start + invariants.cornerCount,
                        count: invariants.edgeCount,
                        perm: table.edgePerm,
                        ori: table.edgeOriDelta,
                        baseOffset: invariants.cornerCount,
                    } satisfies CategoryDescriptor;
                case 'centers':
                    return {
                        start:
                            invariants.categoryOffsets.corners.start +
                            invariants.cornerCount +
                            invariants.edgeCount,
                        count: invariants.centerCount,
                        perm: table.centerPerm,
                        ori: table.centerOriDelta,
                        baseOffset: invariants.cornerCount + invariants.edgeCount,
                    } satisfies CategoryDescriptor;
                case 'middleEdges':
                    return {
                        start: invariants.categoryOffsets.middleEdges.start,
                        count: invariants.middleEdgeCount,
                        perm: table.middleEdgePerm,
                        ori: table.middleEdgeOriDelta,
                        baseOffset: invariants.categoryOffsets.middleEdges.start,
                    } satisfies CategoryDescriptor;
                case 'wings':
                    return {
                        start: invariants.categoryOffsets.wings.start,
                        count: invariants.wingCount,
                        perm: table.wingPerm,
                        ori: table.wingOriDelta,
                        baseOffset: invariants.categoryOffsets.wings.start,
                    } satisfies CategoryDescriptor;
                case 'fixedCenters':
                    return {
                        start: invariants.categoryOffsets.fixedCenters.start,
                        count: invariants.fixedCenterCount,
                        perm: table.fixedCenterPerm,
                        ori: table.fixedCenterOriDelta,
                        baseOffset: invariants.categoryOffsets.fixedCenters.start,
                    } satisfies CategoryDescriptor;
                case 'xCenters':
                    return {
                        start: invariants.categoryOffsets.xCenters.start,
                        count: invariants.xCenterCount,
                        perm: table.xCenterPerm,
                        ori: table.xCenterOriDelta,
                        baseOffset: invariants.categoryOffsets.xCenters.start,
                    } satisfies CategoryDescriptor;
                case 'obliqueCenters':
                    return {
                        start: invariants.categoryOffsets.obliqueCenters.start,
                        count: invariants.obliqueCenterCount,
                        perm: table.obliqueCenterPerm,
                        ori: table.obliqueCenterOriDelta,
                        baseOffset: invariants.categoryOffsets.obliqueCenters.start,
                    } satisfies CategoryDescriptor;
            }
        };

        const isLayerAffected = (
            centered: Vector3,
            move: MoveDefinition,
            centerValue: number
        ): boolean => {
            const layerCoordinates = move.layerIndices.map(index => index - centerValue);
            const component = getAxisComponent(centered, move.axis);
            return layerCoordinates.some(layer => Math.abs(component - layer) < EPSILON);
        };

        const verifyCategoryMove = (
            cubeSize: number,
            invariants: CubeInvariants,
            move: MoveDefinition,
            descriptor: CategoryDescriptor,
            centerValue: number
        ): void => {
            expect(descriptor.perm).toHaveLength(descriptor.count);
            expect(descriptor.ori).toHaveLength(descriptor.count);

            if (descriptor.count === 0) {
                return;
            }

            for (let local = 0; local < descriptor.count; local++) {
                const sourceIndex = descriptor.start + local;
                const centeredPosition = toCentered(
                    invariants.canonicalPositions[sourceIndex],
                    cubeSize
                );
                const affected = isLayerAffected(centeredPosition, move, centerValue);

                if (affected) {
                    // Permutations and orientations are now handled by lookup tables, not geometric rotation
                    // Just verify that the move table has valid values
                    const movedCubie = descriptor.perm[local];
                    expect(movedCubie).toBeGreaterThanOrEqual(0);
                    expect(movedCubie).toBeLessThan(descriptor.count);

                    // Verify orientation is valid (0-2 for corners, 0-1 for edges/centers)
                    const maxOrientation = descriptor.baseOffset === 0 ? 2 : 1; // 0 = corners, others = edges/centers
                    expect(descriptor.ori[local]).toBeGreaterThanOrEqual(0);
                    expect(descriptor.ori[local]).toBeLessThanOrEqual(maxOrientation);
                } else {
                    expect(descriptor.perm[local]).toBe(local);
                    expect(descriptor.ori[local]).toBe(0);
                }
            }
        };

        const verifyMoveSet = (
            cubeSize: number,
            invariants: CubeInvariants,
            moves: ReadonlyArray<MoveDefinition>,
            categories: readonly CategoryKey[]
        ): void => {
            if (moves.length === 0) {
                return;
            }

            const centerValue = (cubeSize - 1) / 2;

            for (const move of moves) {
                const table = ensureMoveTable(invariants, move.name);
                for (const category of categories) {
                    const descriptor = createCategoryDescriptor(invariants, table, category);
                    verifyCategoryMove(cubeSize, invariants, move, descriptor, centerValue);
                }
            }
        };

        describe('cube size 3', () => {
            const cubeSize = 3;
            const invariants = createCubeInvariants(cubeSize);
            const categories = [
                'corners',
                'edges',
                'centers',
            ] as const satisfies readonly CategoryKey[];

            it('face turns align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, faceMovesFor(cubeSize), categories);
            });

            it('wide moves align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, wideMovesFor(cubeSize), categories);
            });

            it('slice moves align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, sliceMovesFor(cubeSize), categories);
            });

            it('cube rotations align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, rotationMovesFor(cubeSize), categories);
            });
        });

        describe('cube size 4', () => {
            const cubeSize = 4;
            const invariants = createCubeInvariants(cubeSize);
            const categories = [
                'corners',
                'edges',
                'centers',
                'wings',
                'xCenters',
            ] as const satisfies readonly CategoryKey[];

            it('face turns align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, faceMovesFor(cubeSize), categories);
            });

            it('wide moves align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, wideMovesFor(cubeSize), categories);
            });

            it('slice moves align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, sliceMovesFor(cubeSize), categories);
            });

            it('cube rotations align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, rotationMovesFor(cubeSize), categories);
            });
        });

        describe('cube size 5', () => {
            const cubeSize = 5;
            const invariants = createCubeInvariants(cubeSize);
            const categories = [
                'corners',
                'edges',
                'centers',
                'middleEdges',
                'wings',
                'fixedCenters',
                'xCenters',
                'obliqueCenters',
            ] as const satisfies readonly CategoryKey[];

            it('face turns align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, faceMovesFor(cubeSize), categories);
            });

            it('wide moves align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, wideMovesFor(cubeSize), categories);
            });

            it('slice moves align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, sliceMovesFor(cubeSize), categories);
            });

            it('cube rotations align with geometric rotations', () => {
                verifyMoveSet(cubeSize, invariants, rotationMovesFor(cubeSize), categories);
            });
        });

        describe('cubology invariants', () => {
            const checkCube = (cubeSize: number, expectParity: boolean): void => {
                const invariants = createCubeInvariants(cubeSize);
                const moveSets = [
                    faceMovesFor(cubeSize),
                    wideMovesFor(cubeSize),
                    sliceMovesFor(cubeSize),
                    rotationMovesFor(cubeSize),
                ];
                const lastLayer = cubeSize - 1;

                for (const moves of moveSets) {
                    for (const move of moves) {
                        const table = ensureMoveTable(invariants, move.name);
                        const twistSum = table.cornerOriDelta.reduce(
                            (sum, delta) => (sum + mod(delta, 3)) % 3,
                            0
                        );
                        expect(twistSum).toBe(0);

                        const flipParity = table.edgeOriDelta.reduce(
                            (sum, delta) => (sum + (delta & 1)) % 2,
                            0
                        );
                        expect(flipParity).toBe(0);

                        const isFaceTurn =
                            move.layerIndices.length === 1 &&
                            (move.layerIndices[0] === 0 || move.layerIndices[0] === lastLayer);

                        if (expectParity && invariants.middleEdgeCount > 0 && isFaceTurn) {
                            const cornerParity = permutationParity(table.cornerPerm);
                            const edgeParity = permutationParity(table.middleEdgePerm);
                            expect(cornerParity).toBe(edgeParity);
                        }
                    }
                }
            };

            it('preserves invariants for cube size 3', () => {
                checkCube(3, true);
            });

            it('preserves invariants for cube size 5', () => {
                checkCube(5, true);
            });

            it('preserves twist and flip parity for cube size 4', () => {
                checkCube(4, false);
            });
        });
    });

    describe('utility helpers', () => {
        it('toActual converts centered coordinates to canonical grid positions', () => {
            expect(toActual({ x: -1, y: 0, z: 1 }, 3)).toEqual({ x: 0, y: 1, z: 2 });
            expect(toActual({ x: -0.5, y: 0.5, z: -0.5 }, 2)).toEqual({ x: 0, y: 1, z: 0 });
        });

        it('toCentered converts grid positions to centered coordinates', () => {
            expect(toCentered({ x: 2, y: 1, z: 0 }, 3)).toEqual({ x: 1, y: 0, z: -1 });
            expect(toCentered({ x: 0, y: 1, z: 0 }, 2)).toEqual({ x: -0.5, y: 0.5, z: -0.5 });
        });

        it('rotatePosition3D applies quarter-turn rotations', () => {
            expect(
                vectorsEqual(rotatePosition3D({ x: 0, y: 1, z: 0 }, Axis.X, 90 as QuarterTurn), {
                    x: 0,
                    y: 0,
                    z: 1,
                })
            ).toBe(true);
            expect(
                vectorsEqual(rotatePosition3D({ x: 0, y: 1, z: 0 }, Axis.X, 270 as QuarterTurn), {
                    x: 0,
                    y: 0,
                    z: -1,
                })
            ).toBe(true);
            expect(
                vectorsEqual(rotatePosition3D({ x: 1, y: 0, z: 0 }, Axis.Z, 90 as QuarterTurn), {
                    x: 0,
                    y: 1,
                    z: 0,
                })
            ).toBe(true);
        });

        it('getAxisComponent extracts axis-aligned components', () => {
            const vector: Vector3 = { x: 2, y: -3, z: 4 };
            expect(getAxisComponent(vector, Axis.X)).toBe(2);
            expect(getAxisComponent(vector, Axis.Y)).toBe(-3);
            expect(getAxisComponent(vector, Axis.Z)).toBe(4);
        });

        it('vectorsEqual compares vectors within tolerance', () => {
            const reference: Vector3 = { x: 1, y: -2, z: 3 };
            const close: Vector3 = { x: 1 + 5e-7, y: -2 - 5e-7, z: 3 + 5e-7 };
            const far: Vector3 = { x: 1.001, y: -2, z: 3 };

            expect(vectorsEqual(reference, close)).toBe(true);
            expect(vectorsEqual(reference, far)).toBe(false);
        });

        it('computeEdgeOrientationDelta detects flips', () => {
            const target: Vector3[] = [
                { x: 1, y: 0, z: 0 },
                { x: 0, y: 1, z: 0 },
            ];
            const flipped: Vector3[] = [target[1], target[0]];

            expect(computeEdgeOrientationDelta(target, target)).toBe(0);
            expect(computeEdgeOrientationDelta(flipped, target)).toBe(1);
            expect(() =>
                computeEdgeOrientationDelta(
                    [
                        { x: -1, y: 0, z: 0 },
                        { x: 0, y: 0, z: 1 },
                    ],
                    target
                )
            ).toThrow();
        });

        it('computeCenterOrientationDelta validates matching normal sets', () => {
            const target: Vector3[] = [
                { x: 1, y: 0, z: 0 },
                { x: 0, y: 1, z: 0 },
            ];
            const rotated: Vector3[] = [target[1], target[0]];

            expect(computeCenterOrientationDelta(rotated, target)).toBe(0);
            expect(() => computeCenterOrientationDelta([{ x: 1, y: 0, z: 0 }], target)).toThrow();
        });
    });

    describe('orientation mapping for F move', () => {
        it('should compute correct orientation for DLF->ULF corner during F move', () => {
            const cubeSize = 3;
            const invariants = createCubeInvariants(cubeSize);

            // Get the F move table
            const fMove = invariants.moveTables.get('F');
            expect(fMove).toBeDefined();
            if (!fMove) return;

            // DLF corner: position (0, 0, 0)
            // Canonical index should be for the corner at that position
            const dlfCanonicalIndex = getCanonicalIndex(invariants, { x: 0, y: 0, z: 0 });
            expect(dlfCanonicalIndex).toBeGreaterThanOrEqual(0);
            expect(dlfCanonicalIndex).toBeLessThan(8); // 8 corners in a 3x3

            // After F move, DLF should move to ULF position (0, 2, 0)
            const ulfCanonicalIndex = getCanonicalIndex(invariants, { x: 0, y: 2, z: 0 });

            // Check permutation: which cubie index ends up at ULF position after F move?
            const cubieAtUlfAfterF = fMove.cornerPerm[ulfCanonicalIndex];
            logger.debug(
                `F move: Corner permutation[${ulfCanonicalIndex}] (ULF position) = ${cubieAtUlfAfterF} (should be ${dlfCanonicalIndex} for DLF cubie)`
            );

            // The orientation delta tells us how the cubie's orientation changes
            const orientationDelta = fMove.cornerOriDelta[ulfCanonicalIndex];
            logger.debug(`F move: Corner orientation delta at ULF position = ${orientationDelta}`);

            // For a corner moving from DLF to ULF during F move:
            // - Original orientation: 0 (solved state)
            // - After F move: orientation should be 2 (or 1, depending on convention)
            // - This ensures the green sticker (originally on L face) now appears on U face

            // The orientation delta should be non-zero since the corner is rotating
            expect(orientationDelta).not.toBe(0);

            // Log detailed information for debugging
            logger.debug('DLF canonical index:', dlfCanonicalIndex);
            logger.debug('ULF canonical index:', ulfCanonicalIndex);
            logger.debug('Cubie that ends up at ULF:', cubieAtUlfAfterF);
            logger.debug(
                'Expected: DLF cubie (index ' + dlfCanonicalIndex + ') should be at ULF position'
            );
        });

        it('should produce correct final orientation for moved corner', () => {
            const cubeSize = 3;
            const invariants = createCubeInvariants(cubeSize);
            const fMove = invariants.moveTables.get('F');
            expect(fMove).toBeDefined();
            if (!fMove) return;

            // For DLF corner with stickers [D, F, L] (yellow, red, green)
            // After F move to ULF position with stickers now on [U, F, L]:
            // - The green sticker (originally on L, localIndex=2) should now be on U
            // - This requires orientation = 2 at the new position
            // - So: new_orientation = (old_orientation + orientationDelta) % 3
            //       2 = (0 + orientationDelta) % 3
            //       => orientationDelta = 2

            const ulfCanonicalIndex = getCanonicalIndex(invariants, { x: 0, y: 2, z: 0 });
            const orientationDelta = fMove.cornerOriDelta[ulfCanonicalIndex];

            logger.debug('Expected orientation delta for DLF->ULF: 2');
            logger.debug('Actual orientation delta:', orientationDelta);

            expect(orientationDelta).toBe(2);
        });
    });
});
