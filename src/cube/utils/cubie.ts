import { Map as IMap } from 'immutable';

import { CubieSubType, Face, Vector3 } from '@/cube/types';
import { Cubie, CubieId, CubieType, ReadonlyCubie } from '@/cube/types/cubie';
import { Sticker, StickerId } from '@/cube/types/sticker';
import { computeStickerFace } from '@/cube/utils/face-utils';
import { approximatelyEqual, isExtreme, normalizeComponent } from '@/cube/utils/math';
import { calculateStickerPositionOnFace } from '@/cube/utils/sticker-position';

/**
 * Create a stored Cubie object from an input Cubie-like value.
 * Centralizes defensive copying of position, orientation and stickers.
 * @param cubie Incoming cubie (producer output)
 * @param cubeSize The size of the cube (needed to recompute sticker face/position)
 */
export function createCubieFromCubie(cubie: Cubie, cubeSize: number): Cubie {
    // Freeze each sticker object to prevent runtime mutation of sticker fields
    const stickerEntries: Array<[StickerId, Sticker]> = [];

    for (const [sid, s] of cubie.stickers) {
        // Recompute currentFace and facePosition based on cubie's current position/orientation
        const currentFace = computeStickerFace(
            cubie.position,
            cubie.orientation,
            s.localIndex,
            cubie.type,
            cubeSize
        );
        const facePosition = calculateStickerPositionOnFace(cubie.position, currentFace, cubeSize);

        // Always create a new sticker object with updated values, then freeze it
        const frozenSticker = Object.freeze({
            ...s,
            currentFace,
            facePosition,
        });
        stickerEntries.push([sid, frozenSticker]);
    }

    // Store stickers internally as an Immutable.Map to guarantee persistent
    // immutability of the collection (zero-copy safe).
    const immutableStickers = IMap<StickerId, Sticker>(stickerEntries);

    var cubie = {
        id: cubie.id,
        type: cubie.type,
        position: Object.freeze({ ...cubie.position }),
        orientation: cubie.orientation,
        canonicalIndex: cubie.canonicalIndex,
        // We cast here to the declared Cubie shape. At runtime this is an
        // Immutable.Map instance which we treat as the authoritative immutable
        // representation for internal storage.
        stickers: immutableStickers.asImmutable(),
    } as Cubie;

    return Object.freeze(cubie);
}

/**
 * Type guard to check if a cubie is a virtual center cubie
 * @param cubie The cubie to check
 * @returns True if the cubie is a virtual center cubie
 */
export function isVirtualCenterCubie(cubie: ReadonlyCubie): boolean {
    return cubie.type === CubieType.VIRTUAL_CENTER;
}

/**
 * Generate a virtual center cubie ID from face
 * @param face The face this virtual cubie represents
 * @returns Virtual center cubie ID in format "virtual_center_{face}"
 */
export function createVirtualCenterCubieId(face: Face): CubieId {
    return `virtual_center_${face}` as CubieId;
}

/**
 * Classify a centered coordinate into a CubieType (CORNER/EDGE/CENTER).
 * Returns undefined for interior positions that are not part of the surface.
 */
export function classifyCubieType(centered: Vector3, cubeSize: number): CubieType | undefined {
    const maxCoord = (cubeSize - 1) / 2;
    const extremes = [centered.x, centered.y, centered.z].filter(value =>
        isExtreme(value, maxCoord)
    );

    if (extremes.length === 3) {
        return CubieType.CORNER;
    }
    if (extremes.length === 2) {
        return CubieType.EDGE;
    }
    if (extremes.length === 1) {
        return CubieType.CENTER;
    }
    return undefined;
}

/**
 * Determine the CubieCategory for a centered coordinate.
 * Handles distinction between middle/wing edges and different center types.
 */
export function classifyCubieSubType(
    centered: Vector3,
    cubeSize: number
): CubieSubType | undefined {
    // Determine how many coordinates are on the extreme (face) plane.  This
    // tells us whether the position is a corner (3), edge (2), or center (1).
    const maxCoord = (cubeSize - 1) / 2;
    const components = [centered.x, centered.y, centered.z];
    const extremeFlags = components.map(component => isExtreme(component, maxCoord));
    const extremeCount = extremeFlags.filter(Boolean).length;

    if (extremeCount === 3) {
        return CubieSubType.CORNER;
    }

    if (extremeCount === 2) {
        const freeIndex = extremeFlags.findIndex(flag => !flag);
        const freeValue = freeIndex === -1 ? 0 : normalizeComponent(components[freeIndex]);
        // If the free coordinate is (approximately) zero this is a middle-edge
        // otherwise it is a wing-edge (e.g. on non-middle slice on even-sized cubes)
        return approximatelyEqual(Math.abs(freeValue), 0)
            ? CubieSubType.MIDDLE_EDGE
            : CubieSubType.WING_EDGE;
    }

    if (extremeCount === 1) {
        const nonExtremeValues = components
            .filter((_, index) => !extremeFlags[index])
            .map(normalizeComponent);
        return classifyCenterSubType(nonExtremeValues, cubeSize);
    }

    return undefined;
}

/**
 * Helper to classify a center cubie based on its two non-extreme components.
 * Returns FIXED_CENTER, X_CENTER, or OBLIQUE_CENTER depending on symmetry.
 */
export function classifyCenterSubType(values: number[], cubeSize: number): CubieSubType {
    const absValues = values.map(value => Math.abs(value));
    const zeroCount = absValues.filter(value => approximatelyEqual(value, 0)).length;

    if (cubeSize % 2 === 1) {
        if (zeroCount === 2) {
            return CubieSubType.FIXED_CENTER;
        }
        if (zeroCount === 1) {
            return CubieSubType.X_CENTER;
        }
        return CubieSubType.OBLIQUE_CENTER;
    }

    if (absValues.length !== 2) {
        throw new Error('Center classification expects two non-extreme components');
    }

    if (approximatelyEqual(absValues[0], absValues[1])) {
        return CubieSubType.X_CENTER;
    }

    return CubieSubType.OBLIQUE_CENTER;
}
