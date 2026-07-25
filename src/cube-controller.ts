// fallow-ignore-file unused-class-member
import { MoveHistory } from '@/cube/core/move-history';
import { getInverseMoveString, parseStringMove } from '@/cube/core/move-parser';
import { StateManager } from '@/cube/core/state-manager';
import {
    CubeModel,
    CubeState,
    Face,
    MoveDefinition,
    MoveResult,
    ReadOnlyCubeModel,
} from '@/cube/types';
import { getEventBus } from '@/event-bus-accessor';
import { Command, EventName, MoveRequestedEvent } from '@/types';

import { getCommands as getCommandsInternal } from './cube-controller.commands';
import { logger } from './diagnostics/logger';

/**
 * Cube Controller - Implements ICubeModel using the new 3D state system.
 */
export class CubeController implements CubeModel, ReadOnlyCubeModel {
    private stateManager: StateManager;
    private moveHistory: MoveHistory;

    /**
     * Create a new CubeController.
     * @param cubeSize The size of the cube (default is 3 for 3x3x3).
     */
    constructor(cubeSize: number = 3) {
        this.stateManager = new StateManager(cubeSize);
        this.moveHistory = new MoveHistory();

        // Listen to moveRequested events
        getEventBus().on(EventName.MOVE_REQUESTED, this.handleMoveRequested.bind(this));
        getEventBus().on(EventName.UNDO_REQUESTED, this.handleUndoRequested.bind(this));
        getEventBus().on(EventName.REDO_REQUESTED, this.handleRedoRequested.bind(this));
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

        for (const moveObj of parseStringMove(move)) {
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
     * @param moveCount The number of random moves to apply (default is 20).
     * @returns An array of the move notations applied during scrambling.
     */
    scramble(moveCount: number = 20): string[] {
        // Clear move history before scrambling.
        this.moveHistory.clear();

        const moves: string[] = [];
        const faces: Face[] = [Face.U, Face.D, Face.F, Face.B, Face.R, Face.L];
        const modifiers = ['', "'", '2'];

        for (let i = 0; i < moveCount; i++) {
            const face = faces[Math.floor(Math.random() * faces.length)];
            const modifier = modifiers[Math.floor(Math.random() * modifiers.length)];
            const move: string = `${face}${modifier}`;
            moves.push(move);
            // Apply, but do not add to history.
            this.applyMove(move, true, true);
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
        const [inverseDefinition] = parseStringMove(inverseMove);

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
        const [redoDefinition] = parseStringMove(move);

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
