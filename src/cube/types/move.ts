import { Axis, CubeState, QuarterTurn, ReadonlyCubie } from '@/cube/types';

/**
 * Definition of a single move on the cube
 * @field name - The move name (e.g., "U", "R'", "F2")
 * @field axis - The axis around which the move rotates
 * @field layerIndices - The indices of the layers affected by the move
 * @field angle - The angle of rotation in quarter turns (90, -90, 180, etc.)
 */
export type MoveDefinition = {
    name: string;
    axis: Axis;
    layerIndices: number[];
    angle: QuarterTurn;
};

/**
 * Result of computing a move transformation (pure computation, no state mutation)
 * MoveEngine computes the transformation; StateManager applies it.
 * This eliminates bidirectional coupling: MoveEngine only reads state, never writes.
 */
export type MoveResult = {
    /** Cubies that were moved, with their before and after states */
    movedCubies: { before: ReadonlyCubie[]; after: ReadonlyCubie[] };
    /** Cube state before the move was executed */
    preState: CubeState;
    /** Cube state after the move was executed */
    postState: CubeState;
};

/** A sequence of moves that can be named and described */
export type MoveSequence = {
    /** Array of moves in the sequence */
    moves: MoveDefinition[];
    /** Optional name for the sequence */
    name?: string;
    /** Optional description of what the sequence does */
    description?: string;
};
