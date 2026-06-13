import { Branded } from '@/global';

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
