import { Map as IMap } from 'immutable';

import { Sticker, StickerId } from '@/cube/types/sticker';
import { Branded } from '@/global';
import type { Position3D } from '@/types/geometry';

export type { Position2D, Position3D, Size2D, Vector2, Vector3 } from '@/types/geometry';

/**
 * A cubie ID for use in CubeState3D.cubiesById
 * @param x X coordinate (0 to cubeSize-1)
 * @param y Y coordinate (0 to cubeSize-1)
 * @param z Z coordinate (0 to cubeSize-1)
 * @returns Cubie ID in format "id_XX_YY_ZZ" (zero-padded coordinates)
 **/
export type CubieId = Branded<string, 'CubieId'>;

/**
 * A position key for use in CubeState3D.cubiesByPosition
 * @param x X coordinate (0 to cubeSize-1)
 * @param y Y coordinate (0 to cubeSize-1)
 * @param z Z coordinate (0 to cubeSize-1)
 * @returns Position key in format "pos_XX_YY_ZZ" (zero-padded coordinates)
 **/
export type PositionKey = Branded<string, 'PositionKey'>;

/**
 * Type of cubie: corner, edge, center, or virtual center
 **/
export const CubieType = {
    CORNER: 'corner',
    EDGE: 'edge',
    CENTER: 'center',
    VIRTUAL_CENTER: 'virtual_center',
} as const;

export type CubieType = (typeof CubieType)[keyof typeof CubieType];

/**
 * Sub-type of cubie: corner, middle_edge, wing_edge, fixed_center, x_center, oblique_center
 **/
export const CubieSubType = {
    CORNER: 'corner',
    MIDDLE_EDGE: 'middle_edge',
    WING_EDGE: 'wing_edge',
    FIXED_CENTER: 'fixed_center',
    X_CENTER: 'x_center',
    OBLIQUE_CENTER: 'oblique_center',
} as const;

export type CubieSubType = (typeof CubieSubType)[keyof typeof CubieSubType];

/**
 * Orientation of a cubie in discrete values
 * For corners: 0, 1, 2 (twist states)
 * For edges: 0, 1 (flip states)
 * For centers: always 0
 **/
export type DiscreteOrientation = number; // 0, 1, or 2 depending on cubie type

/**
 * A cubie of the cube.
 * @param id Coordinate-based identifier calculated once on creation of the cube. Does not change with moves, can be used for lookups.
 * @param type CubieType.
 * @param position Current position (treat as immutable outside core).
 * @param orientation Current discrete orientation (treat as immutable outside core).
 * @param canonicalIndex Index for fast lookup (0–7 corners, 0–11 edges, 0–5 centers for 3x3x3).
 * @param stickers Sticker IDs mapped to sticker objects (Immutable.Map).
 **/
export type Cubie = {
    readonly id: CubieId;
    readonly type: CubieType;
    readonly position: Position3D;
    readonly orientation: DiscreteOrientation;
    readonly canonicalIndex: number;
    readonly stickers: IMap<StickerId, Sticker>;
};

/**
 * Read-only alias for Cubie used by views and public APIs.
 */
export type ReadonlyCubie = Cubie;
