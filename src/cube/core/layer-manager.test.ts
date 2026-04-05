import { beforeEach, describe, expect, it } from 'vitest';

import { LayerManager } from '@/cube/core/layer-manager';
import { StateManager } from '@/cube/core/state-manager';
import { Axis, CubieType, Face } from '@/cube/types';
import type { MoveDefinition } from '@/cube/types/move';
import { createVirtualCenterCubieId } from '@/cube/utils/cubie';

describe('LayerManager', () => {
    let stateManager: StateManager;
    const cubeSize = 5;

    beforeEach(() => {
        stateManager = new StateManager(cubeSize);
    });

    describe('getSliceCubies', () => {
        it('should get cubies at specific x coordinate', () => {
            const x1Cubies = LayerManager.getSliceCubies(Axis.X, 1, stateManager.getCurrentState());
            expect(x1Cubies.length).toBe(16);

            for (const cubie of x1Cubies) {
                expect(cubie.position.x).toBe(1);
            }
        });

        it('should get cubies at specific y coordinate', () => {
            const y1Cubies = LayerManager.getSliceCubies(Axis.Y, 1, stateManager.getCurrentState());
            expect(y1Cubies.length).toBe(16);

            for (const cubie of y1Cubies) {
                expect(cubie.position.y).toBe(1);
            }
        });

        it('should get cubies at specific z coordinate', () => {
            const z1Cubies = LayerManager.getSliceCubies(Axis.Z, 1, stateManager.getCurrentState());
            expect(z1Cubies.length).toBe(16);

            for (const cubie of z1Cubies) {
                expect(cubie.position.z).toBe(1);
            }
        });
    });

    describe('getCubiesForMove', () => {
        it('should get cubies for face move', () => {
            const move: MoveDefinition = { name: 'F', axis: Axis.Z, layerIndices: [0], angle: -90 };
            const cubies = LayerManager.getCubiesForMove(move, stateManager.getCurrentState());
            // 25 physical (no virtual centers on face moves)
            expect(cubies.length).toBe(25);

            // All physical cubies should have z=0
            const physicalCubies = cubies.filter(p => p.type !== CubieType.VIRTUAL_CENTER);
            expect(physicalCubies.length).toBe(25);
            for (const cubie of physicalCubies) {
                expect(cubie.position.z).toBe(0);
            }

            // Should include virtual center F
            const virtualCubies = cubies.filter(p => p.type === CubieType.VIRTUAL_CENTER);
            expect(virtualCubies.length).toBe(0);
        });

        it('should get cubies for slice move', () => {
            const move: MoveDefinition = { name: 'M', axis: Axis.X, layerIndices: [1], angle: -90 };
            const cubies = LayerManager.getCubiesForMove(move, stateManager.getCurrentState());
            // middle slice contains sixteen physical cubies
            expect(cubies.length).toBe(16);

            // All physical cubies should have x=1
            const physicalCubies = cubies.filter(p => p.type !== CubieType.VIRTUAL_CENTER);
            expect(physicalCubies.length).toBe(16);
            for (const cubie of physicalCubies) {
                expect(cubie.position.x).toBe(1);
            }

            // Middle layers should not include virtual centers
            const virtualCubies = cubies.filter(p => p.type === CubieType.VIRTUAL_CENTER);
            expect(virtualCubies.length).toBe(0);
        });

        it('should get cubies for wide move', () => {
            const move: MoveDefinition = {
                name: 'Uw',
                axis: Axis.X,
                layerIndices: [0, 1],
                angle: -90,
            };
            const cubies = LayerManager.getCubiesForMove(move, stateManager.getCurrentState());
            // middle slice contains sixteen physical cubies
            expect(cubies.length).toBe(41);

            // All physical cubies should have x=0 or x=1
            const physicalCubies = cubies.filter(p => p.type !== CubieType.VIRTUAL_CENTER);
            expect(physicalCubies.length).toBe(41);
            for (const cubie of physicalCubies) {
                expect(cubie.position.x).toBeLessThan(2);
            }

            // Middle layers should not include virtual centers
            const virtualCubies = cubies.filter(p => p.type === CubieType.VIRTUAL_CENTER);
            expect(virtualCubies.length).toBe(0);
        });

        it('should include virtual cubies for whole axis rotations', () => {
            const allLayers = Array.from({ length: cubeSize }, (_, index) => index);

            const xMove: MoveDefinition = {
                name: 'x',
                axis: Axis.X,
                layerIndices: allLayers,
                angle: -90,
            };
            const xCubies = LayerManager.getCubiesForMove(xMove, stateManager.getCurrentState());
            const xVirtualCubies = xCubies.filter(p => p.type === CubieType.VIRTUAL_CENTER);
            expect(xVirtualCubies.length).toBe(6);
            expect(xVirtualCubies.some(p => p.id === createVirtualCenterCubieId(Face.L))).toBe(
                true
            );
            expect(xVirtualCubies.some(p => p.id === createVirtualCenterCubieId(Face.R))).toBe(
                true
            );

            const yMove: MoveDefinition = {
                name: 'y',
                axis: Axis.Y,
                layerIndices: allLayers,
                angle: 90,
            };
            const yCubies = LayerManager.getCubiesForMove(yMove, stateManager.getCurrentState());
            const yVirtualCubies = yCubies.filter(p => p.type === CubieType.VIRTUAL_CENTER);
            expect(yVirtualCubies.length).toBe(6);
            expect(yVirtualCubies.some(p => p.id === createVirtualCenterCubieId(Face.D))).toBe(
                true
            );
            expect(yVirtualCubies.some(p => p.id === createVirtualCenterCubieId(Face.U))).toBe(
                true
            );

            const zMove: MoveDefinition = {
                name: 'z',
                axis: Axis.Z,
                layerIndices: allLayers,
                angle: -90,
            };
            const zCubies = LayerManager.getCubiesForMove(zMove, stateManager.getCurrentState());
            const zVirtualCubies = zCubies.filter(p => p.type === CubieType.VIRTUAL_CENTER);
            expect(zVirtualCubies.length).toBe(6);
            expect(zVirtualCubies.some(p => p.id === createVirtualCenterCubieId(Face.F))).toBe(
                true
            );
            expect(zVirtualCubies.some(p => p.id === createVirtualCenterCubieId(Face.B))).toBe(
                true
            );
        });
    });
});
