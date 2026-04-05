import { Map as IMap } from 'immutable';

import {
    Color,
    Cubie,
    CubieId,
    CubieType,
    Face,
    Position3D,
    Sticker,
    StickerId,
} from '@/cube/types';
import {
    createVirtualCenterCubieId,
    getCornerFacesInStandardOrder,
    getCubieId,
    getStickerId,
} from '@/cube/utils';
import {
    getAllPositions,
    getCanonicalIndex,
    getCubieType,
    isValidPosition,
} from '@/cube/utils/coordinates';
import { computeStickerFace } from '@/cube/utils/face-utils';
import { approximatelyEqual } from '@/cube/utils/math';
import { calculateStickerPositionOnFace } from '@/cube/utils/sticker-position';

/**
 * Manages the creation and management of cubies for the cube
 */
export class CubieManager {
    private cubeSize: number;

    constructor(cubeSize: number) {
        if (cubeSize < 2) {
            throw new Error('Cube size must be at least 2');
        }
        this.cubeSize = cubeSize;
    }

    /**
     * Create all cubies for the cube in original state
     * @returns Map of cubie ID to Cubie object
     */
    createAllCubies(): Map<CubieId, Cubie> {
        const cubies = new Map<CubieId, Cubie>();
        const positions = getAllPositions(this.cubeSize);

        // Create physical cubies
        for (const position of positions) {
            const cubieId = getCubieId(position, this.cubeSize);
            const cubie = this.createCubie(cubieId, position);
            cubies.set(cubieId, cubie);
        }

        // Create virtual center cubies and merge
        const virtualCubies = this.createVirtualCenterCubies(this.cubeSize);
        for (const [cubieId, cubie] of virtualCubies) {
            cubies.set(cubieId, cubie);
        }

        return cubies;
    }

    /**
     * Create virtual center cubies for face identity tracking
     * Creates one virtual cubie for each face (F, U, R, B, L, D)
     * @param cubeSize Size of the cube
     * @returns Map of virtual cubie ID to virtual Cubie object
     */
    private createVirtualCenterCubies(cubeSize: number): Map<CubieId, Cubie> {
        const virtualCubies = new Map<CubieId, Cubie>();
        const centerCoord = (cubeSize - 1) / 2;
        const maxIndex = cubeSize - 1;

        // Define virtual center positions for each face using cube-space axes
        const virtualCenters = [
            { face: Face.F, position: { x: centerCoord, y: centerCoord, z: 0 } },
            { face: Face.B, position: { x: centerCoord, y: centerCoord, z: maxIndex } },
            { face: Face.L, position: { x: 0, y: centerCoord, z: centerCoord } },
            { face: Face.R, position: { x: maxIndex, y: centerCoord, z: centerCoord } },
            { face: Face.D, position: { x: centerCoord, y: 0, z: centerCoord } },
            { face: Face.U, position: { x: centerCoord, y: maxIndex, z: centerCoord } },
        ];

        for (const { face, position } of virtualCenters) {
            const cubieId: CubieId = createVirtualCenterCubieId(face);
            const cubie = this.createVirtualCenterCubie(cubieId, face, position);
            virtualCubies.set(cubieId, cubie);
        }

        return virtualCubies;
    }

    /**
     * Create a single virtual center cubie
     * @param cubieId The virtual cubie ID (e.g., "virtual_center_F")
     * @param face The face this virtual cubie represents
     * @param position The geometric center position of the face
     * @returns The created virtual center cubie
     */
    private createVirtualCenterCubie(cubieId: CubieId, face: Face, position: Position3D): Cubie {
        const orientation = 0; // Virtual centers don't rotate
        const canonicalIndex = -1; // Virtual centers don't participate in permutations
        const stickers = this.createStickersForVirtualCenterCubie(cubieId, face);

        return {
            id: cubieId,
            type: CubieType.VIRTUAL_CENTER,
            position: { ...position }, // Copy position
            orientation,
            canonicalIndex,
            stickers,
        };
    }

    /**
     * Create stickers for a virtual center cubie
     * Virtual center cubies have exactly one sticker with the face property set to the original face
     * @param cubieId The virtual cubie ID
     * @param face The face this virtual cubie represents
     * @returns Immutable.Map of sticker ID to sticker object
     */
    private createStickersForVirtualCenterCubie(cubieId: CubieId, face: Face): any {
        const stickerId: StickerId = getStickerId(cubieId, face);

        // Virtual centers always have orientation 0 and position at face center
        // They need position for calculateStickerPositionOnFace
        const centerCoord = (this.cubeSize - 1) / 2;
        const maxIndex = this.cubeSize - 1;

        // Get position based on face
        let position: Position3D;
        switch (face) {
            case Face.F:
                position = { x: centerCoord, y: centerCoord, z: 0 };
                break;
            case Face.B:
                position = { x: centerCoord, y: centerCoord, z: maxIndex };
                break;
            case Face.L:
                position = { x: 0, y: centerCoord, z: centerCoord };
                break;
            case Face.R:
                position = { x: maxIndex, y: centerCoord, z: centerCoord };
                break;
            case Face.D:
                position = { x: centerCoord, y: 0, z: centerCoord };
                break;
            case Face.U:
                position = { x: centerCoord, y: maxIndex, z: centerCoord };
                break;
        }

        const currentFace = face; // Virtual centers always show their original face
        const facePosition = calculateStickerPositionOnFace(position, currentFace, this.cubeSize);

        const sticker: Sticker = {
            id: stickerId,
            color: this.getDefaultColorForFace(face),
            cubieId: cubieId,
            localIndex: 0, // Virtual centers have one sticker at localIndex 0
            currentFace: currentFace,
            facePosition: facePosition,
        };

        return IMap<StickerId, Sticker>([[stickerId, sticker]]);
    }

    /**
     * Create a single cubie at the given position
     * @param cubieId The cubie ID
     * @param position The position
     * @returns The created cubie
     */
    private createCubie(cubieId: CubieId, position: Position3D): Cubie {
        const type = getCubieType(position, this.cubeSize);
        const orientation = 0; // Original orientation for physical cubies
        const canonicalIndex = getCanonicalIndex(position, this.cubeSize);
        const stickers = this.createStickersForCubie(cubieId, position);

        return {
            id: cubieId,
            type,
            position: { ...position }, // Copy position
            orientation,
            canonicalIndex,
            stickers,
        };
    }

    /**
     * Create stickers for a cubie based on its type and position
     * @param cubieId The cubie ID
     * @param type The cubie type
     * @param position The cubie position
     * @returns Map of sticker ID to sticker object
     */
    private createStickersForCubie(cubieId: CubieId, position: Position3D): any {
        // Build entries and return an Immutable.Map for stickers
        const entries: Array<[StickerId, Sticker]> = [];

        const cubieType = getCubieType(position, this.cubeSize);
        const faces = this.getFacesForCubie(position);

        for (let localIndex = 0; localIndex < faces.length; localIndex++) {
            const face = faces[localIndex];
            const stickerId: StickerId = getStickerId(cubieId, face);

            // Compute currentFace and facePosition (orientation is 0 for initial state)
            const orientation = 0;
            const currentFace = computeStickerFace(
                position,
                orientation,
                localIndex,
                cubieType,
                this.cubeSize
            );
            const facePosition = calculateStickerPositionOnFace(
                position,
                currentFace,
                this.cubeSize
            );

            const sticker: Sticker = {
                id: stickerId,
                color: this.getDefaultColorForFace(face),
                cubieId: cubieId,
                localIndex: localIndex,
                currentFace: currentFace,
                facePosition: facePosition,
            };
            entries.push([stickerId, sticker]);
        }

        return IMap<StickerId, Sticker>(entries);
    }

    /**
     * Get the faces that a cubie has based on its type and position
     * @param _type Cubie type (kept for future extensibility)
     * @param position Cubie position
     * @returns Array of faces this cubie has
     */
    private getFacesForCubie(position: Position3D): Face[] {
        // Check if this is a corner (3 faces)
        let faceCount = 0;
        if (position.x === 0 || position.x === this.cubeSize - 1) faceCount++;
        if (position.y === 0 || position.y === this.cubeSize - 1) faceCount++;
        if (position.z === 0 || position.z === this.cubeSize - 1) faceCount++;

        // For corners, use standard cubing order
        if (faceCount === 3) {
            return getCornerFacesInStandardOrder(position, this.cubeSize);
        }

        // For edges and centers, collect faces normally
        const faces: Face[] = [];
        if (position.x === 0) faces.push(Face.L);
        if (position.x === this.cubeSize - 1) faces.push(Face.R);
        if (position.y === 0) faces.push(Face.D);
        if (position.y === this.cubeSize - 1) faces.push(Face.U);
        if (position.z === 0) faces.push(Face.F);
        if (position.z === this.cubeSize - 1) faces.push(Face.B);

        return faces;
    }

    /**
     * Validate that a cubie is correctly formed
     * @param cubie The cubie to validate
     * @returns True if valid
     */
    validateCubie(cubie: Cubie): boolean {
        // Special validation for virtual center cubies
        if (cubie.type === CubieType.VIRTUAL_CENTER) {
            return this.validateVirtualCenterCubie(cubie);
        }

        // Standard validation for physical cubies
        // Check position is valid
        if (!isValidPosition(cubie.position, this.cubeSize)) {
            return false;
        }

        // Check ID matches position
        const expectedId = getCubieId(cubie.position);
        if (cubie.id !== expectedId) {
            return false;
        }

        // Check type matches position
        const expectedType = getCubieType(cubie.position, this.cubeSize);
        if (cubie.type !== expectedType) {
            return false;
        }

        // Check stickers match expected faces
        const expectedFaces = this.getFacesForCubie(cubie.position);
        const actualStickerIds = Array.from(cubie.stickers.keys());

        if (expectedFaces.length !== actualStickerIds.length) {
            return false;
        }

        for (const face of expectedFaces) {
            const expectedStickerId = getStickerId(cubie.id, face);
            if (!actualStickerIds.includes(expectedStickerId)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Validate a virtual center cubie
     * @param cubie The virtual center cubie to validate
     * @returns True if valid
     */
    private validateVirtualCenterCubie(cubie: Cubie): boolean {
        // Check type is VIRTUAL_CENTER
        if (cubie.type !== CubieType.VIRTUAL_CENTER) {
            return false;
        }

        // Check ID format: "virtual_center_{F|U|R|B|L|D}"
        const idPattern = /^virtual_center_(F|U|R|B|L|D)$/;
        if (!idPattern.test(cubie.id)) {
            return false;
        }

        // Check has exactly one sticker
        if (cubie.stickers.size !== 1) {
            return false;
        }

        // Check sticker ID format and face property
        const [stickerId, sticker] = Array.from(cubie.stickers.entries())[0];
        const computedFace = computeStickerFace(
            cubie.position,
            cubie.orientation,
            sticker.localIndex,
            cubie.type,
            this.cubeSize
        );
        const expectedStickerId = getStickerId(cubie.id, computedFace);
        if (stickerId !== expectedStickerId) {
            return false;
        }

        // Check sticker cubieId matches cubie id
        if (sticker.cubieId !== cubie.id) {
            return false;
        }

        // Ensure cubie ID face suffix matches computed face
        const faceMatch = cubie.id.match(/virtual_center_(.+)/);
        if (!faceMatch || faceMatch[1] !== computedFace) {
            return false;
        }

        // Verify position sits on a face with other coordinates centered
        const centerCoord = (this.cubeSize - 1) / 2;
        const maxIndex = this.cubeSize - 1;

        const axisMatches = [
            {
                value: cubie.position.x,
                isCenter: approximatelyEqual(cubie.position.x, centerCoord),
                isBoundary:
                    approximatelyEqual(cubie.position.x, 0) ||
                    approximatelyEqual(cubie.position.x, maxIndex),
            },
            {
                value: cubie.position.y,
                isCenter: approximatelyEqual(cubie.position.y, centerCoord),
                isBoundary:
                    approximatelyEqual(cubie.position.y, 0) ||
                    approximatelyEqual(cubie.position.y, maxIndex),
            },
            {
                value: cubie.position.z,
                isCenter: approximatelyEqual(cubie.position.z, centerCoord),
                isBoundary:
                    approximatelyEqual(cubie.position.z, 0) ||
                    approximatelyEqual(cubie.position.z, maxIndex),
            },
        ];

        const centerCount = axisMatches.filter(match => match.isCenter).length;
        const boundaryCount = axisMatches.filter(
            match => match.isBoundary && !match.isCenter
        ).length;

        if (centerCount !== 2 || boundaryCount !== 1) {
            return false;
        }

        return true;
    }

    /**
     * Get default color for a face (standard Rubik's cube colors)
     * @param face Face enum
     * @returns Color enum value
     */
    private getDefaultColorForFace(face: Face): Color {
        switch (face) {
            case Face.U:
                return Color.WHITE;
            case Face.D:
                return Color.YELLOW;
            case Face.F:
                return Color.RED;
            case Face.B:
                return Color.ORANGE;
            case Face.L:
                return Color.GREEN;
            case Face.R:
                return Color.BLUE;
            default:
                throw new Error(`Unknown face: ${face}`);
        }
    }
}
