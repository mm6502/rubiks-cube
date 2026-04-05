import { Map as IMap } from 'immutable';

import {
    CubeState,
    Cubie,
    CubieId,
    CubieType,
    Face,
    FaceGrid,
    Position3D,
    PositionKey,
    ReadonlyCubie,
    Sticker,
    StickerId,
} from '@/cube/types';
import { createVirtualCenterCubieId } from '@/cube/utils/cubie';
import { computeStickerFace } from '@/cube/utils/face-utils';
import { calculateStickerPositionOnFace } from '@/cube/utils/sticker-position';

import { getPositionKey } from './coordinates';

// Type for functions that map a 3D sticker position to a face-relative index
export type StickerPositionMapper = (position: Position3D, face: Face, cubeSize: number) => number;

/**
 * Builds a grid mapping of stickers for each face using the provided mapper function.
 * @param state The current 3D cube state.
 * @param mapper A function that maps a sticker's 3D position to a 2D grid index.
 * @returns A map from each face to its corresponding 2D grid of stickers.
 */
export function buildGrid(state: CubeState, mapper: StickerPositionMapper): Map<Face, FaceGrid> {
    const n = state.cubeSize;
    const faceGrids = new Map<Face, FaceGrid>();

    // Initialize grids for all faces
    const faces = [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R];
    for (const face of faces) {
        faceGrids.set(face, {
            grid: Array.from({ length: n }, () => Array(n).fill(undefined)),
        });
    }

    // Find all physical stickers and place them in the appropriate grids
    const physicalCubies = state.cubiesById
        .filter(p => p.type !== CubieType.VIRTUAL_CENTER)
        .values();
    for (const cubie of physicalCubies) {
        for (const [, sticker] of cubie.stickers) {
            const face = computeStickerFace(
                cubie.position,
                cubie.orientation,
                sticker.localIndex,
                cubie.type,
                state.cubeSize
            );
            const faceGrid = faceGrids.get(face);
            if (!faceGrid) continue;

            const posIndexRaw = mapper(cubie.position, face, n);
            const posIndex = Number(posIndexRaw);

            if (!Number.isFinite(posIndex)) {
                continue; // defensive: skip invalid mapper results
            }

            const rx = Math.max(0, Math.min(n - 1, posIndex % n));
            const ry = Math.max(0, Math.min(n - 1, Math.floor(posIndex / n)));

            faceGrid.grid[ry][rx] = sticker;
        }
    }

    // Find virtual center stickers and assign them to their respective faces
    const virtualCenterCubies = state.cubiesById
        .filter(p => p.type === CubieType.VIRTUAL_CENTER)
        .values();
    for (const cubie of virtualCenterCubies) {
        // Virtual centers have exactly one sticker
        const sticker = cubie.stickers.first();
        if (sticker) {
            // For virtual centers, extract face from it
            const faceGrid = faceGrids.get(sticker.currentFace);
            if (faceGrid) {
                faceGrid.virtualCenter = sticker;
            }
        }
    }

    return faceGrids;
}

/**
 * Generates a display-oriented flat mapping of the cube.
 * Defaults to the display mapper which aligns face rotations for viewing.
 */
export function createFlatView(
    state: CubeState,
    mapper?: StickerPositionMapper
): Map<Face, FaceGrid> {
    const mapperToUse = mapper ?? calculateStickerPositionOnFace;
    return buildGrid(state, mapperToUse);
}

/**
 * Utility functions for working with CubeState objects
 * Provides query methods and serialization support while maintaining
 * CubeState as a plain serializable interface.
 */
export class CubeStateUtils {
    /**
     * Get a cubie by its ID from a cube state
     * @param state The cube state to query
     * @param cubieId The cubie ID to look for
     * @returns The cubie if found, undefined otherwise
     */
    static getCubieById(state: CubeState, cubieId: CubieId): Cubie | undefined {
        return state.cubiesById.get(cubieId);
    }

    /**
     * Get a cubie at a specific 3D position
     * @param state The cube state to query
     * @param position The 3D position to look for
     * @returns The cubie at the position if found, undefined otherwise
     */
    static getCubieAtPosition(state: CubeState, position: Position3D): Cubie | undefined {
        const key = getPositionKey(position, state.cubeSize);
        return state.cubiesByPosition.get(key);
    }

    /**
     * Convert CubeState to a serializable format
     * @param state The cube state to serialize
     * @returns Serializable representation
     */
    static toSerializable(state: CubeState): any {
        return {
            cubeSize: state.cubeSize,
            cubiesById: state.cubiesById.entrySeq().toArray(),
            cubiesByPosition: state.cubiesByPosition.entrySeq().toArray(),
            timestamp: state.timestamp,
        };
    }

    /**
     * Create CubeState from a serializable format
     * @param data The serialized data
     * @returns CubeState instance
     */
    static fromSerializable(data: any): CubeState {
        return {
            cubeSize: data.cubeSize,
            cubiesById: IMap(data.cubiesById) as IMap<CubieId, Cubie>,
            cubiesByPosition: IMap(data.cubiesByPosition) as IMap<PositionKey, Cubie>,
            timestamp: data.timestamp,
        };
    }

    /**
     * Check if two cube states are equal (deep comparison)
     * @param state1 First state
     * @param state2 Second state
     * @returns True if states are equal
     */
    static equals(state1: CubeState, state2: CubeState): boolean {
        if (state1.cubeSize !== state2.cubeSize || state1.timestamp !== state2.timestamp) {
            return false;
        }

        // Compare cubiesById
        if (state1.cubiesById.size !== state2.cubiesById.size) {
            return false;
        }

        for (const [id, cubie1] of state1.cubiesById) {
            const cubie2 = state2.cubiesById.get(id);
            if (!cubie2) return false;

            // Compare cubie properties (simplified - could be more thorough)
            if (
                cubie1.id !== cubie2.id ||
                cubie1.type !== cubie2.type ||
                cubie1.position.x !== cubie2.position.x ||
                cubie1.position.y !== cubie2.position.y ||
                cubie1.position.z !== cubie2.position.z
            ) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get a sticker by its ID from a cube state
     * @param state The cube state to query
     * @param stickerId The sticker ID to look for
     * @returns The sticker if found, undefined otherwise
     */
    static getStickerById(state: CubeState, stickerId?: StickerId): Sticker | undefined {
        if (!stickerId) return undefined;

        for (const cubie of state.cubiesById.values()) {
            const sticker = cubie.stickers.get(stickerId);
            if (sticker) return sticker;
        }

        return undefined;
    }

    /**
     * Get a sticker at a specific face and position from a cube state.
     * Ignores virtual center stickers since they don't have meaningful face positions.
     * @param state The cube state to query
     * @param face The face identifier
     * @param position The position on the face
     * @returns The sticker if found, undefined otherwise
     */
    static getStickerAt(state: CubeState, face?: string, position?: number): Sticker | undefined {
        const realCubies = state.cubiesById
            .filter(cubie => cubie.type !== CubieType.VIRTUAL_CENTER)
            .values();
        for (const cubie of realCubies) {
            for (const sticker of cubie.stickers.values()) {
                if (sticker.currentFace === face && sticker.facePosition === position) {
                    return sticker;
                }
            }
        }
        return undefined;
    }

    /**
     * Get a virtual center cubie from a cube state by face
     * @param state The cube state to query
     * @param face The face to get the virtual center cubie for
     * @returns The virtual center cubie for the specified face
     */
    static getVirtualCenterCubie(state: CubeState, face: Face): ReadonlyCubie {
        const cubieId = createVirtualCenterCubieId(face);
        const cubie = state.cubiesById.get(cubieId);

        if (!cubie) {
            throw new Error(`Virtual center cubie not found for face ${face}: ${cubieId}`);
        }

        return cubie;
    }

    /**
     * Compute the new cube state after applying moved cubies.
     * @param state Current state.
     * @param updatedCubies Cubies after the move (with new positions/orientations).
     * @returns New state with updated positions.
     */
    static computeNewState(state: CubeState, updatedCubies: Cubie[]): CubeState {
        // Pure applier: replace moved cubies in the current state with the
        // cubies provided by the caller (MoveEngine). MoveEngine has already
        // created immutable cubies via createCubieFromCubie, so we just store them.
        let newCubiesById = IMap(state.cubiesById);
        let newCubiesByPosition = IMap(state.cubiesByPosition);

        // For each moved cubie, update its entry in cubiesById and cubiesByPosition
        for (const cubie of updatedCubies) {
            newCubiesById = newCubiesById.set(cubie.id, cubie);
            if (cubie.type !== CubieType.VIRTUAL_CENTER) {
                var newPositionId = getPositionKey(cubie.position, state.cubeSize);
                newCubiesByPosition = newCubiesByPosition.set(newPositionId, cubie);
            }
        }

        var newState = {
            cubiesById: newCubiesById.asImmutable(),
            cubiesByPosition: newCubiesByPosition.asImmutable(),
            timestamp: Date.now(),
            cubeSize: state.cubeSize,
        } as CubeState;

        var result = Object.freeze(newState);

        return result;
    }
}
