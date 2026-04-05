import { describe, expect, it } from 'vitest';

import type { CubeInvariants, MoveTable } from '@/cube/core/cube-invariants';
import { createCubeInvariants } from '@/cube/core/cube-invariants';
import { Axis, CubieType, Position3D } from '@/cube/types';
import { mod } from '@/cube/utils/math';

type FaceMoveName = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
const otherFaceMoves: FaceMoveName[] = ['U', 'D', 'L', 'R', 'B'];

describe('cube invariants move coverage', () => {
    const invariants = createCubeInvariants(3);

    describe('canonical F layer behavior', () => {
        it('mirrors the front-sticker F move check in src/cube/utils/state-conversion.test.ts#L55', () => {
            verifyFaceLayerInvariant(invariants, 'F');
        });

        it("mirrors the front-sticker F' move check in src/cube/utils/state-conversion.test.ts#L110", () => {
            verifyFaceLayerInvariant(invariants, "F'");
        });
    });

    describe('other face turns keep their slice', () => {
        for (const move of otherFaceMoves) {
            it(`${move} keeps its face slice`, () => {
                verifyFaceLayerInvariant(invariants, move);
            });
        }
    });

    describe('cubie state after a move sequence', () => {
        it('preserves twist and flip parity after F, R, U', () => {
            const sequence = ['F', 'R', 'U'];
            const state = applyMoveSequence(invariants, sequence);

            const cornerTwistSum = state.cornerOrientations.reduce(
                (sum, value) => (sum + mod(value, 3)) % 3,
                0
            );
            expect(cornerTwistSum).toBe(0);

            const edgeFlipParity = state.edgeOrientations.reduce(
                (sum, value) => (sum + (value & 1)) % 2,
                0
            );
            expect(edgeFlipParity).toBe(0);

            expect(state.centerOrientations.every(value => value === 0)).toBe(true);
        });
    });
});

/**
 * Asserts that the canonical cubies touching the move's layer stay within that
 * layer (and that untouched cubies remain fixed) while recording valid
 * orientations for affected cubies.
 */
function verifyFaceLayerInvariant(invariants: CubeInvariants, moveName: string): void {
    const table = invariants.moveTables.get(moveName);
    expect(table).toBeDefined();
    if (!table) {
        return;
    }
    const definition = invariants.moveDefinitions.get(moveName);
    expect(definition).toBeDefined();
    if (!definition) {
        return;
    }

    const axis = definition.axis;
    const centerLayer = definition.layerIndices[0];
    const accessor = axisAccessor(axis);
    const infos = categoryInfos(invariants, table);

    for (const info of infos) {
        for (let localIndex = 0; localIndex < info.perm.length; localIndex++) {
            const globalIndex = info.start + localIndex;
            const position = invariants.canonicalPositions[globalIndex];
            const onLayer = accessor(position) === centerLayer;
            const targetLocal = info.perm[localIndex];
            const targetGlobal = info.start + targetLocal;
            const targetPosition = invariants.canonicalPositions[targetGlobal];

            if (onLayer) {
                expect(accessor(targetPosition)).toBe(centerLayer);
                expect(info.ori[localIndex]).toBeGreaterThanOrEqual(0);
                expect(info.ori[localIndex]).toBeLessThan(orientationBound(info.type));
                if (info.type === CubieType.CENTER) {
                    expect(info.ori[localIndex]).toBe(0);
                }
            } else {
                expect(targetLocal).toBe(localIndex);
                expect(info.ori[localIndex]).toBe(0);
            }
        }
    }
}

/**
 * Returns the segment descriptions used to inspect the slices of the canonical
 * move table.
 */
function categoryInfos(invariants: CubeInvariants, table: MoveTable) {
    const offsets = invariants.categoryOffsets;
    return [
        {
            type: CubieType.CORNER,
            start: offsets.corners.start,
            perm: table.cornerPerm,
            ori: table.cornerOriDelta,
        },
        {
            type: CubieType.EDGE,
            start: offsets.middleEdges.start,
            perm: table.edgePerm,
            ori: table.edgeOriDelta,
        },
        {
            type: CubieType.CENTER,
            start: offsets.fixedCenters.start,
            perm: table.centerPerm,
            ori: table.centerOriDelta,
        },
    ];
}

/**
 * Builds a projection that returns the coordinate aligned with an axis to know
 * which layer a cubie belongs to.
 */
function axisAccessor(axis: Axis): (position: Position3D) => number {
    switch (axis) {
        case Axis.X:
            return position => position.x;
        case Axis.Y:
            return position => position.y;
        case Axis.Z:
            return position => position.z;
        default:
            throw new Error('unsupported axis');
    }
}

/**
 * Determines how many orientation states are valid for a given cubie category.
 */
function orientationBound(type: CubieType): number {
    if (type === CubieType.CORNER) {
        return 3;
    }
    return 2;
}

/**
 * Minimal cubie state representation tracked via permutations and orientations.
 */
type CubieState = {
    cornerPositions: number[];
    cornerOrientations: number[];
    edgePositions: number[];
    edgeOrientations: number[];
    centerPositions: number[];
    centerOrientations: number[];
};

/**
 * Runs a sequence of canonical moves against a cubie-level identity state.
 */
function applyMoveSequence(invariants: CubeInvariants, moves: readonly string[]): CubieState {
    let state = identityState(invariants);
    for (const moveName of moves) {
        const table = invariants.moveTables.get(moveName);
        expect(table).toBeDefined();
        if (!table) {
            continue;
        }
        state = applyMoveTable(invariants, state, table);
    }
    return state;
}

/**
 * Applies a single move table to the cubie state, updating positions and
 * orientations based on the stored permutations.
 */
function applyMoveTable(
    invariants: CubeInvariants,
    state: CubieState,
    table: MoveTable
): CubieState {
    const next: CubieState = {
        cornerPositions: new Array(invariants.cornerCount).fill(-1),
        cornerOrientations: new Array(invariants.cornerCount).fill(0),
        edgePositions: new Array(invariants.edgeCount).fill(-1),
        edgeOrientations: new Array(invariants.edgeCount).fill(0),
        centerPositions: new Array(invariants.centerCount).fill(-1),
        centerOrientations: new Array(invariants.centerCount).fill(0),
    };

    for (let source = 0; source < invariants.cornerCount; source++) {
        const target = table.cornerPerm[source];
        next.cornerPositions[target] = state.cornerPositions[source];
        next.cornerOrientations[target] = mod(
            state.cornerOrientations[source] + table.cornerOriDelta[source],
            3
        );
    }

    for (let source = 0; source < invariants.edgeCount; source++) {
        const target = table.edgePerm[source];
        next.edgePositions[target] = state.edgePositions[source];
        next.edgeOrientations[target] = mod(
            state.edgeOrientations[source] + table.edgeOriDelta[source],
            2
        );
    }

    for (let source = 0; source < invariants.centerCount; source++) {
        const target = table.centerPerm[source];
        next.centerPositions[target] = state.centerPositions[source];
        next.centerOrientations[target] = mod(
            state.centerOrientations[source] + table.centerOriDelta[source],
            2
        );
    }

    return next;
}

/**
 * Generates the solved cubie ordering/orientation state used as a baseline.
 */
function identityState(invariants: CubeInvariants): CubieState {
    return {
        cornerPositions: identityArray(invariants.cornerCount),
        cornerOrientations: new Array(invariants.cornerCount).fill(0),
        edgePositions: identityArray(invariants.edgeCount),
        edgeOrientations: new Array(invariants.edgeCount).fill(0),
        centerPositions: identityArray(invariants.centerCount),
        centerOrientations: new Array(invariants.centerCount).fill(0),
    };
}

/**
 * Builds a simple identity permutation so cubies can be initialized once.
 */
function identityArray(length: number): number[] {
    return Array.from({ length }, (_, index) => index);
}
