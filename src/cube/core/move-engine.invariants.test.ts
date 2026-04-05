import { describe, expect, it } from 'vitest';

import { CubeInvariants, MoveTable, createCubeInvariants } from '@/cube/core/cube-invariants';
import { MoveEngine } from '@/cube/core/move-engine';
import { StateManager } from '@/cube/core/state-manager';
import { CubeState, CubieType, ReadonlyCubie } from '@/cube/types';

describe('MoveEngine cubology invariants', () => {
    const cubeSize = 3;
    const invariants = createCubeInvariants(cubeSize);
    const moveKeys = ['U', "U'", 'D', "D'", 'R', "R'", 'L', "L'", 'F', "F'", 'B', "B'"];

    const cornerOffset = 0;
    const edgeOffset = cornerOffset + invariants.cornerCount;
    const centerOffset = edgeOffset + invariants.edgeCount;

    const computeParity = (perm: number[]): number => {
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

    for (const key of moveKeys) {
        it(`aligns with invariants for move ${key}`, () => {
            const stateManager = new StateManager(cubeSize);
            const moveEngine = new MoveEngine(stateManager.getOriginalState());
            const originalState = stateManager.getCurrentState();
            const originalCubies = snapshotCubies(originalState);
            const originalIndexMap = buildOriginalIndexMap(originalState);

            const move = stateManager.getInvariants().moveDefinitions.get(key);
            const result = moveEngine.executeMove(move!, originalState);
            const postState = result.postState;
            const table = ensureMoveTable(invariants, key);

            verifyPermutationsAndOrientations(postState, originalCubies, table);
            verifyCubologyInvariants(postState, originalCubies, originalIndexMap, computeParity);
        });
    }

    function ensureMoveTable(data: CubeInvariants, key: string): MoveTable {
        const table = data.moveTables.get(key);
        if (!table) {
            throw new Error(`Move table not found for ${key}`);
        }
        return table;
    }

    function snapshotCubies(state: CubeState): Map<string, ReadonlyCubie> {
        const captured = new Map<string, ReadonlyCubie>();
        for (const cubie of state.cubiesById.values()) {
            captured.set(cubie.id, cubie);
        }
        return captured;
    }

    function buildOriginalIndexMap(state: CubeState): Map<string, number> {
        const map = new Map<string, number>();
        for (const cubie of state.cubiesById.values()) {
            map.set(cubie.id, cubie.canonicalIndex);
        }
        return map;
    }

    function verifyPermutationsAndOrientations(
        postState: CubeState,
        originals: Map<string, ReadonlyCubie>,
        table: MoveTable
    ): void {
        for (const cubie of postState.cubiesById.values()) {
            if (cubie.type === CubieType.VIRTUAL_CENTER) {
                continue;
            }

            const original = originals.get(cubie.id);
            if (!original) {
                throw new Error(`Missing original snapshot for cubie ${cubie.id}`);
            }

            switch (cubie.type) {
                case CubieType.CORNER: {
                    const localSource = original.canonicalIndex - cornerOffset;
                    const expectedLocalTarget = table.cornerPerm[localSource] ?? localSource;
                    const expectedCanonical = cornerOffset + expectedLocalTarget;
                    const delta = table.cornerOriDelta[localSource] ?? 0;
                    const expectedOrientation = (original.orientation + delta + 3) % 3;

                    expect(cubie.canonicalIndex).toBe(expectedCanonical);
                    expect(cubie.orientation).toBe(expectedOrientation);
                    break;
                }
                case CubieType.EDGE: {
                    const localSource = original.canonicalIndex - edgeOffset;
                    const expectedLocalTarget = table.edgePerm[localSource] ?? localSource;
                    const expectedCanonical = edgeOffset + expectedLocalTarget;
                    const delta = table.edgeOriDelta[localSource] ?? 0;
                    const expectedOrientation = original.orientation ^ delta;

                    expect(cubie.canonicalIndex).toBe(expectedCanonical);
                    expect(cubie.orientation).toBe(expectedOrientation);
                    break;
                }
                case CubieType.CENTER: {
                    const localSource = original.canonicalIndex - centerOffset;
                    const expectedLocalTarget = table.centerPerm[localSource] ?? localSource;
                    const expectedCanonical = centerOffset + expectedLocalTarget;

                    expect(cubie.canonicalIndex).toBe(expectedCanonical);
                    expect(cubie.orientation).toBe(original.orientation);
                    break;
                }
                default:
                    break;
            }
        }
    }

    function verifyCubologyInvariants(
        postState: CubeState,
        _originals: Map<string, ReadonlyCubie>,
        originalIndexMap: Map<string, number>,
        parity: (perm: number[]) => number
    ): void {
        let cornerTwistSum = 0;
        let edgeFlipParity = 0;
        const cornerPermutation = new Array<number>(invariants.cornerCount).fill(-1);
        const edgePermutation = new Array<number>(invariants.edgeCount).fill(-1);

        for (const cubie of postState.cubiesById.values()) {
            if (cubie.type === CubieType.CORNER) {
                cornerTwistSum = (cornerTwistSum + cubie.orientation) % 3;
                const origin = (originalIndexMap.get(cubie.id) ?? cornerOffset) - cornerOffset;
                const current = cubie.canonicalIndex - cornerOffset;
                cornerPermutation[origin] = current;
            } else if (cubie.type === CubieType.EDGE) {
                edgeFlipParity = (edgeFlipParity + (cubie.orientation & 1)) % 2;
                const origin = (originalIndexMap.get(cubie.id) ?? edgeOffset) - edgeOffset;
                const current = cubie.canonicalIndex - edgeOffset;
                edgePermutation[origin] = current;
            }
        }

        expect(cornerTwistSum).toBe(0);
        expect(edgeFlipParity).toBe(0);
        expect(cornerPermutation.every(index => index !== -1)).toBe(true);
        expect(edgePermutation.every(index => index !== -1)).toBe(true);

        const cornerParity = parity(cornerPermutation);
        const edgeParity = parity(edgePermutation);
        expect(cornerParity).toBe(edgeParity);
    }
});
