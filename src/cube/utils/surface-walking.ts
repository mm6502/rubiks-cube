/**
 * Cube-surface walking utility.
 *
 * Provides a pure function that, given a sticker and a face-intrinsic
 * direction (up/down/left/right as seen when looking directly at that face),
 * returns the adjacent sticker following the real cube surface topology.
 *
 * - **In-bounds**: neighbour cubie's sticker on the same face.
 * - **Out-of-bounds**: same cubie's sticker on the adjacent face (cubie continuity).
 *
 * The algorithm mirrors `getAdjacentSticker` from BasicView's navigation but
 * uses `FACE_BASIS` instead of view-camera vectors, making it view-agnostic.
 */
import { CubeState, Face, StickerId, Vector3 } from '@/cube/types';
import { NavDirection } from '@/types';

import { FACE_BASIS } from './face-utils';
import { CubeStateUtils } from './state-conversion';

/**
 * Returns the face whose outer layer the out-of-range coordinate belongs to.
 */
function getTransitionFace(tx: number, ty: number, tz: number, cubeSize: number): Face {
    if (tx < 0) return Face.L;
    if (tx >= cubeSize) return Face.R;
    if (ty < 0) return Face.D;
    if (ty >= cubeSize) return Face.U;
    if (tz < 0) return Face.F;
    return Face.B; // tz >= cubeSize
}

/**
 * Convert a face-intrinsic NavDirection into a 3D displacement vector
 * using the face's canonical basis (FACE_BASIS).
 */
function navDirToVector(face: Face, dir: NavDirection): Vector3 {
    const basis = FACE_BASIS[face];
    switch (dir) {
        case NavDirection.Up:
            return basis.up;
        case NavDirection.Down:
            return { x: -basis.up.x, y: -basis.up.y, z: -basis.up.z };
        case NavDirection.Left:
            return { x: -basis.right.x, y: -basis.right.y, z: -basis.right.z };
        case NavDirection.Right:
            return basis.right;
    }
    // unreachable — NavDirection only has the 4 members above
    return { x: 0, y: 0, z: 0 };
}

/**
 * Returns the adjacent sticker when walking in a face-intrinsic direction on
 * the cube surface.
 *
 * @param cubeState - The current cube state.
 * @param stickerId - The sticker to start from.
 * @param direction - Face-intrinsic direction (up/down/left/right as seen
 *   looking straight at the sticker's face).
 * @returns The target sticker ID, or `undefined` if the input sticker is not
 *   found or no candidate exists.
 */
export function getAdjacentStickerOnSurface(
    cubeState: CubeState,
    stickerId: StickerId,
    direction: NavDirection
): StickerId | undefined {
    const sticker = CubeStateUtils.getStickerById(cubeState, stickerId);
    if (!sticker) return undefined;

    const cubie = CubeStateUtils.getCubieById(cubeState, sticker.cubieId);
    if (!cubie) return undefined;

    const face = sticker.currentFace;
    const n = cubeState.cubeSize;
    const pos = cubie.position;

    const d = navDirToVector(face, direction);
    const tx = pos.x + d.x;
    const ty = pos.y + d.y;
    const tz = pos.z + d.z;

    if (tx >= 0 && tx < n && ty >= 0 && ty < n && tz >= 0 && tz < n) {
        // In-bounds — neighbour cubie, same face
        const neighbour = CubeStateUtils.getCubieAtPosition(cubeState, {
            x: tx,
            y: ty,
            z: tz,
        });
        if (!neighbour) return undefined;
        for (const s of neighbour.stickers.values()) {
            if (s.currentFace === face) return s.id;
        }
        return undefined;
    }

    // Out-of-bounds — same cubie, adjacent face (cubie continuity)
    const targetFace = getTransitionFace(tx, ty, tz, n);
    for (const s of cubie.stickers.values()) {
        if (s.currentFace === targetFace) return s.id;
    }
    return undefined;
}
