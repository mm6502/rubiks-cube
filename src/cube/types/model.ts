// Cube model interfaces
import { MoveHistory } from '@/cube/core/move-history';
import { CubeState } from '@/cube/types';
import { Command } from '@/types';

/**
 * Read-only interface for views to query model data
 * Prevents views from accidentally modifying the cube state
 */
export interface ReadOnlyCubeModel {
    /** Get the current cube state */
    getCurrentState(): CubeState;

    /** Get the original cube state */
    getOriginalState(): CubeState;

    /** Check if the cube is in solved state */
    isSolved(): boolean;

    /** Get the move history object for read-only access */
    getMoveHistory(): MoveHistory;
}

/**
 * Basic mutable interface for the cube model
 * Simple implementation for initial development
 */
export interface CubeModel {
    // State modifications

    /**
     * Apply a move to the cube
     * @param move - The move notation (e.g., 'U', 'R\'', 'F2')
     * @param skipUndoLogic - Whether to skip adding this move to undo history
     */
    applyMove(move: string, skipUndoLogic?: boolean): void;

    /**
     * Scramble the cube with random moves
     * @param moveCount - Number of random moves to apply (default: 20)
     * @returns Array of move strings that were applied
     */
    scramble(moveCount?: number): string[];

    /** Reset the cube to its solved state */
    reset(): void;

    /**
     * Undo the last move
     * @returns True if undo was successful, false if no moves to undo
     */
    undo(): boolean;

    /**
     * Redo the last undone move
     * @returns True if redo was successful, false if no moves to redo
     */
    redo(): boolean;

    // State checks

    /** Check if the cube is in solved state */
    isSolved(): boolean;

    // History

    /** Get the move history object for read-only access */
    getMoveHistory(): MoveHistory;

    // Commands

    /** Get the list of available commands for this model */
    getCommands(): Command[];

    // Read-only model access

    /** Get a read-only interface to this model */
    getReadOnlyModel(): ReadOnlyCubeModel;
}
