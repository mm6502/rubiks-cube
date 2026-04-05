import { Map as IMap } from 'immutable';

import { Cubie, CubieId, PositionKey, Sticker } from '@/cube/types';

/**
 * A 2D grid of sticker objects representing a single face.
 * Empty cells are undefined (e.g., for positions that don't have physical stickers).
 * Virtual center cubies have one sticker each that tracks their face identity.
 */
export type FaceGrid = {
    /**
     * The 2D grid of physical stickers on this face.
     */
    grid: Sticker[][];
    /**
     * The virtual center sticker for this face, if present.
     */
    virtualCenter?: Sticker;
};

/**
 * State of a 3D cube at a given time
 * @param cubeSize Size of the cube (3 for 3x3x3, etc.)
 * @param cubiesById Map of cubie ID to Cubie object
 * @param cubiesByPosition Map of position key to Cubie object
 * @param timestamp Timestamp of when this state was recorded
 **/
export type CubeState = {
    readonly cubeSize: number;
    readonly cubiesById: IMap<CubieId, Cubie>;
    readonly cubiesByPosition: IMap<PositionKey, Cubie>;
    readonly timestamp: number;
};
