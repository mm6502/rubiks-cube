import { Map as IMap } from 'immutable';

import { CubeInvariants, getCubeInvariants } from '@/cube/core/cube-invariants';
import { CubieManager } from '@/cube/core/cubie-manager';
import { MoveEngine, getMoveDefinition } from '@/cube/core/move-engine';
import { Color, CubeState, Cubie, CubieId, CubieType, Face, PositionKey } from '@/cube/types';
import type { MoveDefinition } from '@/cube/types/move';
import { MoveResult } from '@/cube/types/move';
import { getPositionKey } from '@/cube/utils/coordinates';
import { createCubieFromCubie } from '@/cube/utils/cubie';
import { computeStickerFace } from '@/cube/utils/face-utils';
import { logger } from '@/diagnostics/logger';

/**
 * Manages cube state with original state preservation and current state tracking
 * All cubies and stickers are created upfront, only layers are constructed ad hoc
 *
 * **Single Source of State Mutation:**
 *
 * StateManager is the ONLY component that mutates cube state. MoveEngine computes
 * transformations as pure functions, and StateManager applies them via `applyMoveResult()`.
 *
 * This design ensures:
 * - Clear ownership of state mutations
 * - Predictable state changes
 * - Easy debugging and testing
 * - Thread-safe potential (all mutations go through one component)
 *
 * **Read-only access:** Other components access state via IReadOnlyCubeModel interface.
 */
export class StateManager {
    private cubeSize: number;
    private invariants: CubeInvariants;
    private moveEngine: MoveEngine;
    private originalState: CubeState;
    private currentState: CubeState;

    // We derive cubie IDs from positions using createCubieId("XX_YY_ZZ")

    constructor(cubeSize: number) {
        this.cubeSize = cubeSize;
        this.invariants = getCubeInvariants(this.cubeSize);

        // Always create all cubies and stickers upfront
        this.originalState = this.createOriginalState();
        this.currentState = this.copyState(this.originalState);

        // Create MoveEngine with shared invariants for move computations
        this.moveEngine = new MoveEngine(this.originalState);
    }

    /**
     * Create the original state (pre-create all cubies and stickers)
     * @returns Original CubeState3D
     */
    private createOriginalState(): CubeState {
        const cubies = new CubieManager(this.cubeSize).createAllCubies();
        let cubiesByPosition = IMap<PositionKey, Cubie>();

        // Build position map - only include physical cubies (not virtual center cubies)
        for (const cubie of cubies.values()) {
            if (cubie.type !== CubieType.VIRTUAL_CENTER) {
                const key = getPositionKey(cubie.position, this.cubeSize);
                cubiesByPosition = cubiesByPosition.set(key, cubie);
            }
        }

        return {
            // Convert Map to IMap
            cubiesById: IMap(cubies),
            cubiesByPosition: cubiesByPosition,
            timestamp: Date.now(),
            cubeSize: this.cubeSize,
        };
    }

    /**
     * Deep copy a CubeState3D
     * @param state State to copy
     * @returns Copied state
     */
    private copyState(state: CubeState): CubeState {
        const cubies = new Map<CubieId, Cubie>();
        // Deep copy cubies using centralized helper
        for (const [cubieId, cubie] of state.cubiesById) {
            cubies.set(cubieId, createCubieFromCubie(cubie, this.cubeSize));
        }

        let cubiesByPosition = IMap<PositionKey, Cubie>();
        // Build position map from copied cubies - only include physical cubies
        for (const cubie of cubies.values()) {
            if (cubie.type !== CubieType.VIRTUAL_CENTER) {
                const key = getPositionKey(cubie.position, this.cubeSize);
                cubiesByPosition = cubiesByPosition.set(key, cubie);
            }
        }

        return {
            // Convert Map to IMap
            cubiesById: IMap(cubies),
            cubiesByPosition: cubiesByPosition,
            timestamp: Date.now(),
            cubeSize: state.cubeSize,
        };
    }

    /**
     * Get the original solved state
     * @returns Original state
     */
    getOriginalState(): CubeState {
        // State is now immutable (IMap collections + readonly properties)
        // No need to copy on each call
        return this.originalState;
    }

    /**
     * Get the current state
     * @returns Current state
     */
    getCurrentState(): CubeState {
        // State is now immutable (IMap collections + readonly properties)
        // No need to copy on each call
        return this.currentState;
    }

    /**
     * Reset to original state
     */
    resetToOriginal(): void {
        this.currentState = this.copyState(this.originalState);
    }

    /**
     * Import a cube state (for loading saved states or scanning real cubes)
     * @param state The state to import
     * @throws Error if state is invalid or incompatible
     */
    importState(state: CubeState): void {
        // Validate cube size matches
        if (state.cubeSize !== this.cubeSize) {
            throw new Error(
                `Cannot import state: cube size mismatch (expected ${this.cubeSize}, got ${state.cubeSize})`
            );
        }

        // Validate state has required structure
        if (!state.cubiesById || !state.cubiesByPosition) {
            throw new Error('Invalid state: missing required properties');
        }

        // Deep copy the imported state to ensure immutability
        this.currentState = this.copyState(state);
        logger.info('State imported successfully');
    }

    /**
     * Export the current cube state for saving or sharing
     * @returns A copy of the current state
     */
    exportState(): CubeState {
        return this.copyState(this.currentState);
    }

    /**
     * Apply a move result computed by MoveEngine
     * This is the proper way to mutate state based on MoveEngine's pure computation.
     * @param result MoveResult from MoveEngine.executeMove()
     */
    applyMoveResult(result: MoveResult): void {
        // Apply the new state only after validation
        this.currentState = result.postState;
    }

    applyMove(move: MoveDefinition): MoveResult {
        const currentState = this.currentState;
        const result = this.moveEngine.executeMove(move, currentState);
        this.applyMoveResult(result);
        return result;
    }

    /**
     * Execute multiple moves on the cube
     * @param moves - The moves to execute
     */
    executeMoves(moves: MoveDefinition[]): void {
        for (const move of moves) {
            this.applyMove(move);
        }
    }

    getMoveDefinition(name: string): MoveDefinition {
        return getMoveDefinition(this.invariants, name);
    }

    getInvariants(): CubeInvariants {
        return this.invariants;
    }

    /**
     * Check if current state can be considered solved.
     * A cube is solved when every visible face has a uniform color.
     * @returns True if solved
     */
    isSolved(): boolean {
        // First check colors: all stickers on each face must have the same color
        for (const face of [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R]) {
            let faceColor: Color | null = null;

            for (const cubie of this.currentState.cubiesById.values()) {
                for (const sticker of cubie.stickers.values()) {
                    const stickerFace = computeStickerFace(
                        cubie.position,
                        cubie.orientation,
                        sticker.localIndex,
                        cubie.type,
                        this.currentState.cubeSize
                    );
                    if (stickerFace !== face) {
                        continue;
                    }

                    if (faceColor === null) {
                        faceColor = sticker.color;
                        continue;
                    }

                    if (sticker.color !== faceColor) {
                        return false;
                    }
                }
            }

            if (faceColor === null) {
                return false;
            }
        }

        // Then check positions: all cubies must be in their original positions and orientations
        for (const [cubieId, cubie] of this.currentState.cubiesById) {
            const originalCubie = this.originalState.cubiesById.get(cubieId);
            if (!originalCubie) {
                return false;
            }

            // Check position
            if (
                cubie.position.x !== originalCubie.position.x ||
                cubie.position.y !== originalCubie.position.y ||
                cubie.position.z !== originalCubie.position.z
            ) {
                return false;
            }

            // Check orientation
            if (cubie.orientation !== originalCubie.orientation) {
                return false;
            }
        }

        return true;
    }
}
