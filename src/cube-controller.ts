// fallow-ignore-file unused-class-member
import { getCubeInvariants } from '@/cube/core/cube-invariants';
import { MoveHistory } from '@/cube/core/move-history';
import { getInverseMoveString, parseStringMove } from '@/cube/core/move-parser';
import { StateManager } from '@/cube/core/state-manager';
import { CubeModel, CubeState, MoveDefinition, MoveResult, ReadOnlyCubeModel } from '@/cube/types';
import { getEventBus } from '@/event-bus-accessor';
import { Command, EventName, MoveRequestedEvent } from '@/types';

import { getCommands as getCommandsInternal } from './cube-controller.commands';
import { logger } from './diagnostics/logger';

/**
 * Whether a move is eligible for the scramble pool of a given cube size.
 *
 * Eligibility is judged by the move's geometry, not its name, so new notation
 * that describes an existing turn needs no change here. A move qualifies when
 * it turns exactly one layer:
 * - face moves (R, U', F2) turn the single outer layer;
 * - numbered slice moves (2M, 3E') turn a single inner layer.
 * Wide moves and whole-cube rotations turn two or more layers at once, so the
 * single-layer test alone keeps them out. Inner slices only add scrambling
 * reach from size 4 up — on a 3×3 the middle slice merely mirrors an opposite
 * face pair plus a cube reorientation and adds no entropy — so below size 4
 * only the outer faces qualify.
 */
function isEligibleScrambleMove(move: MoveDefinition, cubeSize: number): boolean {
    if (move.layerIndices.length !== 1) return false;
    if (cubeSize < 4) {
        const layer = move.layerIndices[0];
        return layer === 0 || layer === cubeSize - 1;
    }
    return true;
}

/**
 * Whether a slice name carries a layer-number prefix ("2M", "3E") rather than
 * the bare slice name ("M"). Only selects which alias to emit when a single
 * turn is registered twice (M ≡ 2M); it never decides scramble eligibility.
 */
function isNumberedSliceName(name: string): boolean {
    return /^\d+[MES]/.test(name);
}

/**
 * Build the scramble pool for a cube size: one representative per eligible
 * single-layer turn (see isEligibleScrambleMove).
 *
 * A physical turn can be registered under two spellings — an inner layer is
 * both the bare slice (M) and the numbered slice (2M), with identical
 * geometry. Bare M/E/S is the excluded exception agreed at design time: on a
 * 3×3 it adds no scrambling reach, and on 4+ it merely duplicates the numbered
 * spelling of the same turn (and is ambiguous on even cubes). So we group
 * eligible moves by their physical identity (axis, layer, angle) and keep the
 * numbered spelling where one exists — the shortest bare alias never reaches
 * the emitted scramble. Face turns are singletons and pass through unchanged.
 */
function buildScramblePool(cubeSize: number): MoveDefinition[] {
    // Representative per physical turn. When a turn has both a bare (M) and a
    // numbered (2M) alias, the numbered one wins and the bare M/E/S exception
    // is dropped; this is order-independent because only a numbered spelling
    // can replace the stored representative.
    const representative = new Map<string, MoveDefinition>();

    for (const move of getCubeInvariants(cubeSize).moveDefinitions.values()) {
        if (!isEligibleScrambleMove(move, cubeSize)) continue;

        const identity = `${move.axis}:${move.layerIndices[0]}:${move.angle}`;
        const current = representative.get(identity);
        if (current === undefined || isNumberedSliceName(move.name)) {
            representative.set(identity, move);
        }
    }

    return Array.from(representative.values());
}

/**
 * Cube Controller - Implements ICubeModel using the new 3D state system.
 */
export class CubeController implements CubeModel, ReadOnlyCubeModel {
    private stateManager: StateManager;
    private moveHistory: MoveHistory;
    private readonly cubeSize: number;
    private readonly boundMoveRequested: (event: MoveRequestedEvent) => void;
    private readonly boundUndoRequested: (event: any) => void;
    private readonly boundRedoRequested: (event: any) => void;
    private disposed: boolean = false;

    /**
     * Create a new CubeController.
     * @param cubeSize The size of the cube (default is 3 for 3x3x3).
     */
    constructor(cubeSize: number = 3) {
        this.cubeSize = cubeSize;
        this.stateManager = new StateManager(cubeSize);
        this.moveHistory = new MoveHistory();

        // Store bound handlers so they can be removed on dispose().
        this.boundMoveRequested = this.handleMoveRequested.bind(this);
        this.boundUndoRequested = this.handleUndoRequested.bind(this);
        this.boundRedoRequested = this.handleRedoRequested.bind(this);

        // Listen to moveRequested events
        getEventBus().on(EventName.MOVE_REQUESTED, this.boundMoveRequested);
        getEventBus().on(EventName.UNDO_REQUESTED, this.boundUndoRequested);
        getEventBus().on(EventName.REDO_REQUESTED, this.boundRedoRequested);
    }

    /**
     * Release the controller's event-bus listeners so the instance can be
     * safely discarded (e.g. when replacing a controller on a size switch).
     * After disposal the instance must not be reused.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        getEventBus().off(EventName.MOVE_REQUESTED, this.boundMoveRequested);
        getEventBus().off(EventName.UNDO_REQUESTED, this.boundUndoRequested);
        getEventBus().off(EventName.REDO_REQUESTED, this.boundRedoRequested);
    }

    /**
     * Get the size of this cube (e.g. 3 for 3x3x3).
     */
    getCubeSize(): number {
        return this.cubeSize;
    }

    /**
     * Apply a move to the cube.
     * @param move The move notation (e.g., "R", "U'", "F2").
     * @param skipUndoLogic If true, the move is not added to the undo history.
     * @param hiddenMove If true, the move application is silent (no console log).
     * @param emitEvent If true, emits a MoveExecutedEvent after applying the move.
     * @returns The MoveResult of the last applied move, or null if no moves were applied.
     */
    applyMove(
        move: string,
        skipUndoLogic: boolean = false,
        hiddenMove: boolean = false,
        emitEvent: boolean = false
    ): MoveResult | null {
        // Parse and execute moves.
        let lastResult: MoveResult | null = null;
        let lastDefinition: MoveDefinition | undefined;

        for (const moveObj of parseStringMove(move, this.cubeSize)) {
            // Display move applied, unless skipUndoLogic is true.
            // This is used for scrambling.
            if (!hiddenMove) logger.info(`Applying move: ${move}`);
            const result = this.stateManager.applyMove(moveObj);
            lastResult = result;
            lastDefinition = moveObj;
        }

        // Add to move history unless skipping undo logic.
        // • Auto-undo: if the move is the inverse of the last executed move, decrement
        //   the history pointer instead of appending (preserves redo stack).
        // • Auto-redo: if the move matches the next entry in the redo stack, advance
        //   the pointer instead of truncating the redo stack and appending.
        if (!skipUndoLogic) {
            const lastMove = this.moveHistory.getLastMove();
            const nextRedoMove = this.moveHistory.getRedoStack()[0];
            if (lastMove !== undefined && getInverseMoveString(lastMove) === move) {
                this.moveHistory.undo();
            } else if (nextRedoMove !== undefined && nextRedoMove === move) {
                this.moveHistory.redo();
            } else {
                this.moveHistory.addMove(move);
            }
        }

        // Emit event if requested.
        if (emitEvent && lastResult && lastDefinition) {
            getEventBus().emit(EventName.MOVE_EXECUTED, {
                moveDetails: {
                    notation: move,
                    definition: lastDefinition,
                    movedCubies: lastResult.movedCubies,
                },
                preState: lastResult.preState,
                postState: lastResult.postState,
            });
        }

        return lastResult;
    }

    /**
     * Scramble the cube with a series of random moves.
     *
     * Moves are drawn from the cube's move table and restricted to face moves
     * plus numbered slice moves, so inner layers and centers are scrambled on
     * cubes of size 4+ (not just the outer faces). No two consecutive moves
     * share a rotation axis, which prevents adjacent moves from partially
     * cancelling and keeps the scramble spread across all three axes.
     *
     * @param moveCount The number of random moves to apply. Defaults to a
     * size-scaled count (`max(11, 20 × (n − 2))`), so larger cubes get a
     * longer scramble.
     * @param randomSource Optional uniform `[0, 1)` generator; defaults to
     * `Math.random`. Injected so tests can reproduce sequences.
     * @returns An array of the move notations applied during scrambling.
     */
    scramble(
        moveCount: number = Math.max(11, 20 * (this.cubeSize - 2)),
        randomSource: () => number = Math.random
    ): string[] {
        // Scramble starts from a clean history so its moves cannot be undone
        // as if they were regular user turns.
        this.moveHistory.clear();

        // Build the pool of candidate moves for scrambling.
        const pool = buildScramblePool(this.cubeSize);

        const moves: string[] = [];
        let previousAxis: MoveDefinition['axis'] | null = null;

        for (let i = 0; i < moveCount; i++) {
            // Exclude the previous axis so consecutive moves cannot partially
            // cancel each other (e.g. R then R') and scrambling spreads evenly
            // across all three axes.
            const candidates = pool.filter(move => move.axis !== previousAxis);
            const move = candidates[Math.floor(randomSource() * candidates.length)];
            moves.push(move.name);
            // Apply silently and outside undo history — a scramble must not be
            // tracked as a sequence of user turns.
            this.applyMove(move.name, true, true);
            previousAxis = move.axis;
        }

        return moves;
    }

    /**
     * Reset the cube to its original solved state.
     */
    reset(): void {
        this.stateManager.resetToOriginal();
        this.moveHistory.clear();
    }

    /**
     * Import a cube state (for loading saved states or scanning real cubes).
     * @param state The state to import.
     * @param moveHistory Optional move history to restore.
     * @throws Error if state is invalid or incompatible.
     */
    importState(state: CubeState, moveHistory?: MoveHistory): void {
        this.stateManager.importState(state);
        // Replace move history with imported history.
        if (moveHistory) {
            this.moveHistory = moveHistory;
        } else {
            this.moveHistory.clear();
        }
    }

    /**
     * Export the current cube state for saving or sharing.
     * @returns Object with the current state and move history.
     */
    exportState(): { state: CubeState; moveHistory: MoveHistory } {
        return {
            state: this.stateManager.exportState(),
            moveHistory: this.moveHistory.copy(),
        };
    }

    /**
     * Undo the last move applied to the cube.
     * @returns True if a move was undone, false if no moves to undo.
     */
    undo(): boolean {
        // Get the last move from history.
        const lastMove = this.moveHistory.undo();
        if (!lastMove) return false;

        // Get the inverse move notation.
        const inverseMove = getInverseMoveString(lastMove);

        // Get pre-state before undo.
        const preState = this.getCurrentState();

        // Apply inverse move without adding to history.
        const result = this.applyMove(inverseMove, true);

        // Get post-state after undo.
        const postState = this.getCurrentState();

        // Parse the inverse move to get its definition (needed for animation).
        const [inverseDefinition] = parseStringMove(inverseMove, this.cubeSize);

        // Emit event for undo operation.
        getEventBus().emit(EventName.MOVE_EXECUTED, {
            moveDetails: {
                notation: inverseMove,
                definition: inverseDefinition,
                movedCubies: result?.movedCubies,
            },
            preState,
            postState,
        });

        return true;
    }

    /**
     * Redo the last undone move.
     * @returns True if a move was redone, false if no moves to redo.
     */
    redo(): boolean {
        // Get the move to redo from history.
        const move = this.moveHistory.redo();
        if (!move) return false;

        // Get pre-state before redo.
        const preState = this.getCurrentState();

        // Apply move without adding to history again.
        const result = this.applyMove(move, true);

        // Get post-state after redo.
        const postState = this.getCurrentState();

        // Parse the move to get its definition (needed for animation).
        const [redoDefinition] = parseStringMove(move, this.cubeSize);

        // Emit event for redo operation.
        getEventBus().emit(EventName.MOVE_EXECUTED, {
            moveDetails: {
                notation: move,
                definition: redoDefinition,
                movedCubies: result?.movedCubies,
            },
            preState,
            postState,
        });

        return true;
    }

    /**
     * Check if the cube is currently solved.
     * @returns True if the cube is in solved state, false otherwise.
     */
    isSolved(): boolean {
        return this.stateManager.isSolved();
    }

    /**
     * Get the list of available commands for the cube controller.
     * @returns Array of Command objects.
     */
    getCommands(): Command[] {
        return getCommandsInternal(this.getReadOnlyModel());
    }

    /**
     * Handle move requested events from views.
     * @param event The MoveRequestedEvent containing move details.
     */
    private handleMoveRequested(event: MoveRequestedEvent): void {
        // Ignore tentative moves (for preview only).
        const tentative = !!event.tentative;
        const notation = event.moveNotation || '';

        if (!tentative) {
            // Execute move using applyMove.
            this.applyMove(notation, false, false, true);
        }
    }

    /**
     * Handle undo requested events from views.
     * @param event The event object (not used).
     */
    private handleUndoRequested(_event: any): void {
        this.undo();
    }

    /**
     * Handle redo requested events from views.
     * @param event The event object (not used).
     */
    private handleRedoRequested(_event: any): void {
        this.redo();
    }

    /**
     * Get the current cube state.
     * IReadOnlyCubeModel implementation - delegate to stateManager.
     * @returns The current CubeState.
     */
    getCurrentState(): CubeState {
        return this.stateManager.getCurrentState();
    }

    /**
     * Get the original cube state.
     * IReadOnlyCubeModel implementation - delegate to stateManager.
     * @returns The original CubeState.
     */
    getOriginalState(): CubeState {
        return this.stateManager.getOriginalState();
    }

    /**
     * Get the move history.
     * @returns The MoveHistory object.
     */
    getMoveHistory(): MoveHistory {
        return this.moveHistory;
    }

    /**
     * Get read-only model interface.
     * @returns The ReadOnlyCubeModel (this).
     */
    getReadOnlyModel(): ReadOnlyCubeModel {
        return this;
    }
}
