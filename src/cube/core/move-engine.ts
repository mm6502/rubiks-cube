import { CubeInvariants, getCubeInvariants } from '@/cube/core/cube-invariants';
import { LayerManager } from '@/cube/core/layer-manager';
import { CubeState, Cubie, CubieType, ReadonlyCubie } from '@/cube/types';
import { MoveDefinition, MoveResult } from '@/cube/types/move';
import { createCubieFromCubie } from '@/cube/utils/cubie';
import { rotatePosition3D, toActual, toCentered } from '@/cube/utils/math';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

/**
 * Engine for computing move transformations on the 3D cube state
 *
 * **Design Pattern: Pure Computation + Separation of Concerns**
 *
 * MoveEngine computes move transformations as pure functions without mutating state.
 * StateManager applies these transformations to update its internal state.
 *
 * This eliminates bidirectional coupling:
 * - MoveEngine → StateManager (read-only dependency)
 * - StateManager independently applies results
 *
 * **Usage Pattern:**
 * ```typescript
 * const result = moveEngine.executeMove(move);  // Pure computation
 * stateManager.applyMoveResult(result);         // State mutation
 * const postState = stateManager.getCurrentState();
 * ```
 *
 * **Benefits:**
 * - Pure functions: testable, deterministic, no side effects
 * - Dry-run capability: compute moves without applying them
 * - Single source of mutation: only StateManager modifies state
 * - Simplified undo/redo: transformations are data, not effects
 */
export class MoveEngine {
    private invariants: CubeInvariants;
    private cubeSize: number;

    /**
     * Create a new MoveEngine (stateless throwaway wrapper)
     * @param originalState - The original solved state of the cube (cubeSize is derived from this)
     */
    constructor(originalState: CubeState) {
        this.cubeSize = originalState.cubeSize;
        this.invariants = getCubeInvariants(this.cubeSize);
    }

    /**
     * Compute the transformation for a single move (pure function, no state mutation)
     * The caller (typically StateManager via CubeController) applies the result.
     * @param move - The move to compute
     * @param currentState - The current state of the cube
     * @returns Detailed result of the move computation
     */
    executeMove(move: MoveDefinition, currentState: CubeState): MoveResult {
        const preState = currentState;
        const movingCubies = LayerManager.getCubiesForMove(move, preState);
        const movedCubies = this.cycleAndRotateCubies(movingCubies, move);
        const postState = CubeStateUtils.computeNewState(preState, movedCubies);

        return {
            movedCubies: { before: movingCubies, after: movedCubies },
            preState,
            postState,
        } as MoveResult;
    }

    /**
     * Cycle cubies around a face and rotate them (pure computation)
     * @param cubies - Cubies in the layer and adjacent edges
     * @param move - Move definition driving the rotation
     * @returns The cubies after rotation with updated positions and orientations
     */
    private cycleAndRotateCubies(cubies: ReadonlyCubie[], move: MoveDefinition): Cubie[] {
        const result: Cubie[] = [];
        const cornerOffset = 0;
        const edgeOffset = cornerOffset + this.invariants.cornerCount;
        const centerOffset = edgeOffset + this.invariants.edgeCount;

        const moveTable = this.invariants.moveTables.get(move.name);
        if (!moveTable) {
            throw new Error(`No move table found for move ${move.name}.`);
        }

        for (const cubie of cubies) {
            if (cubie.type === CubieType.VIRTUAL_CENTER) {
                result.push(this.rotateVirtualCenterCubie(cubie, move));
                continue;
            }

            let targetIndex = cubie.canonicalIndex;
            let newOrientation = cubie.orientation;

            switch (cubie.type) {
                case CubieType.CORNER: {
                    const localIndex = cubie.canonicalIndex - cornerOffset;
                    const destLocal = moveTable.cornerPerm[localIndex] ?? localIndex;
                    targetIndex = cornerOffset + destLocal;
                    const delta = moveTable.cornerOriDelta[localIndex] ?? 0;
                    newOrientation = (newOrientation + delta + 3) % 3;
                    break;
                }
                case CubieType.EDGE: {
                    const localIndex = cubie.canonicalIndex - edgeOffset;
                    const destLocal = moveTable.edgePerm[localIndex] ?? localIndex;
                    targetIndex = edgeOffset + destLocal;
                    const delta = moveTable.edgeOriDelta[localIndex] ?? 0;
                    newOrientation = newOrientation ^ delta;
                    break;
                }
                case CubieType.CENTER: {
                    const localIndex = cubie.canonicalIndex - centerOffset;
                    const destLocal = moveTable.centerPerm[localIndex] ?? localIndex;
                    targetIndex = centerOffset + destLocal;
                    break;
                }
            }

            const newPosition = this.invariants.canonicalPositions[targetIndex];
            if (!newPosition) {
                throw new Error(`No canonical position mapped for index ${targetIndex}`);
            }

            const newCubie: Cubie = {
                ...cubie,
                position: newPosition,
                orientation: newOrientation,
                canonicalIndex: targetIndex,
            };

            result.push(createCubieFromCubie(newCubie, this.cubeSize));
        }

        return result;
    }

    /**
     * Rotate a virtual center cubie around the cube center for whole-cube rotations
     * @param cubie - The virtual center cubie to rotate
     * @param move - The whole-cube rotation move definition
     * @returns The rotated virtual center cubie
     */
    private rotateVirtualCenterCubie(cubie: ReadonlyCubie, move: MoveDefinition): Cubie {
        if (!LayerManager.isWholeCubeRotation(move)) {
            return createCubieFromCubie(cubie as Cubie, this.cubeSize);
        }

        const centered = toCentered(cubie.position, this.cubeSize);
        const rotatedCentered = rotatePosition3D(centered, move.axis, move.angle);
        const rotatedPosition = toActual(rotatedCentered, this.cubeSize);

        const rotatedCubie: Cubie = {
            ...cubie,
            position: rotatedPosition,
        };

        return createCubieFromCubie(rotatedCubie, this.cubeSize);
    }
}

/**
 * Retrieve a canonical move definition by notation name.
 * @param name Move notation key (e.g., 'R', "R'", 'R2')
 * @returns Deep copy of the canonical move definition
 */
export function getMoveDefinition(invariants: CubeInvariants, name: string): MoveDefinition {
    const definition = invariants.moveDefinitions.get(name);
    if (!definition) {
        throw new Error(`Unsupported move notation: ${name}`);
    }

    const clone: MoveDefinition = {
        ...definition,
        layerIndices: [...definition.layerIndices],
    };

    return clone;
}
