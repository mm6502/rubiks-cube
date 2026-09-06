import { Axis, QuarterTurn } from '@/cube/types/common';
import { CubeState } from '@/cube/types/cube-state';
import { ReadonlyCubie } from '@/cube/types/cubie';

/**
 * Canonical family a move belongs to. Used by the icon resolver to map a
 * size-specific notation (numbered slice, wide, ...) to an existing family
 * glyph without parsing notation strings. Assigned at generation time in
 * {@link buildMoveDefinitions} and carried unchanged onto `'`/`2` variants.
 */
export type MoveFamily = 'slice' | 'face' | 'wide' | 'rotation';

/**
 * Definition of a single move on the cube
 * @field name - The move name (e.g., "U", "R'", "F2")
 * @field axis - The axis around which the move rotates
 * @field layerIndices - The indices of the layers affected by the move
 * @field angle - The angle of rotation in quarter turns (90, -90, 180, etc.)
 * @field canonicalFamily - Optional family label used for icon fallback (absent
 * on literal test constructions)
 */
export type MoveDefinition = {
    name: string;
    axis: Axis;
    layerIndices: number[];
    angle: QuarterTurn;
    canonicalFamily?: MoveFamily;
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
