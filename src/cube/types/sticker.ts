import { Color, CubieId, Face } from '@/cube/types';
import { Branded } from '@/global';

/**
 * A sticker ID from cubie ID and face
 * @param cubieId The cubie ID
 * @param face The face (U, D, F, B, L, R)
 * @returns Sticker ID in format "{cubie_id}_{face}_sticker"
 */
export type StickerId = Branded<string, 'StickerId'>;

/**
 * Sticker on a cube cubie
 * Immutable representation of a sticker on a cube cubie.
 * @param id Unique sticker ID
 * @param color Color of the sticker
 * @param cubieId ID of the cubie this sticker belongs to
 * @param localIndex Local index on the cubie (0-2 for corners, 0-1 for edges)
 * @param currentFace The face this sticker currently appears on (pre-computed)
 * @param facePosition The position (0-8 for 3x3) on that face (pre-computed)
 */
export type Sticker = {
    readonly id: StickerId; // Format: "{cubie_id}_{face}_sticker" (e.g., "00_00_00_F_sticker")
    readonly color: Color;
    readonly cubieId: CubieId; // Reference to cubie ID
    readonly localIndex: number; // Local index: 0-2 for corners, 0-1 for edges
    readonly currentFace: Face; // Pre-computed face this sticker appears on
    readonly facePosition: number; // Pre-computed position on that face (0-based index)
};
