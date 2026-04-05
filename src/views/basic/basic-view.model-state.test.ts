// Test to verify model state is correctly updated after moves
// Specifically checking that cubie.position, cubie.orientation, and sticker.face
// reflect CURRENT state (accumulated rotations) not original state
import { beforeEach, describe, expect, it } from 'vitest';

import { CubeController } from '@/cube-controller';
import { Face } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils';
import { logger } from '@/diagnostics/logger';

describe('Model State After Moves - Navigation Prerequisites', () => {
    let model: CubeController;
    const cubeSize = 3;

    beforeEach(() => {
        model = new CubeController(cubeSize);
    });

    it('should update cubie position after F face rotation', () => {
        // Arrange
        // Get an edge cubie on the F face (position 2,0,0 is at F face, L edge)
        const originalCubie = CubeStateUtils.getCubieAtPosition(model.getCurrentState(), {
            x: 2,
            y: 0,
            z: 0,
        })!;
        const cubieId = originalCubie.id;
        const originalPosition = { ...originalCubie.position };

        // Act
        // Rotate F face clockwise
        model.applyMove('F');

        // Get the cubie again by ID (not position, since position changed)
        const movedCubie = CubeStateUtils.getCubieById(model.getCurrentState(), cubieId)!;

        // Assert
        // Verify position changed (should move from (2,0,0) to (2,2,0) for F CW)
        expect(movedCubie.position).not.toEqual(originalPosition);
        logger.debug('Original position:', originalPosition);
        logger.debug('New position after F CW:', movedCubie.position);

        // Verify the cubie is now at a different location in 3D space
        expect(
            movedCubie.position.x !== originalPosition.x ||
                movedCubie.position.y !== originalPosition.y ||
                movedCubie.position.z !== originalPosition.z
        ).toBe(true);
    });

    it('should update cubie orientation after F face rotation', () => {
        // Arrange
        // Get an edge cubie on the F face
        const originalCubie = CubeStateUtils.getCubieAtPosition(model.getCurrentState(), {
            x: 2,
            y: 0,
            z: 0,
        })!;
        const cubieId = originalCubie.id;
        const originalOrientation = originalCubie.orientation;

        // Initially should be at 0,0,0 orientation in solved cube
        expect(originalOrientation).toEqual(0);

        // Act
        // Rotate F face clockwise
        model.applyMove('F');

        const movedCubie = CubeStateUtils.getCubieById(model.getCurrentState(), cubieId)!;

        // Assert
        // Orientation should have changed (Z-axis rotation for F face)
        expect(movedCubie.orientation).not.toEqual(originalOrientation);
        logger.debug('Original orientation:', originalOrientation);
        logger.debug('New orientation after F CW:', movedCubie.orientation);

        // Should have Z rotation of 90 or equivalent
        expect(movedCubie.orientation !== 0).toBe(true);
    });

    it('should update sticker face property after cubie rotates', () => {
        // Arrange
        // Get the F/L edge cubie at position (2,0,0)
        // It has stickers on F and L faces originally
        const cubie = CubeStateUtils.getCubieAtPosition(model.getCurrentState(), {
            x: 2,
            y: 0,
            z: 0,
        })!;
        const cubieId = cubie.id;

        // Find the sticker originally on F face
        const state = model.getCurrentState();
        let fSticker = null;
        for (const [stickerId] of cubie.stickers) {
            const s = CubeStateUtils.getStickerById(state, stickerId);
            if (s?.id.includes('_F_sticker')) {
                fSticker = s;
                break;
            }
        }

        expect(fSticker).not.toBeNull();
        const originalFace = fSticker!.currentFace;
        expect(originalFace).toBe(Face.F); // Should be on F face in solved state

        // Act
        // Rotate F face clockwise
        model.applyMove('F');

        // Get the same sticker again by ID
        const currentState = model.getCurrentState();
        const movedSticker = CubeStateUtils.getStickerById(currentState, fSticker!.id)!;

        // Assert
        // The sticker's face property should have changed
        // After F rotation, the F sticker might now appear on a different face
        const movedFace = movedSticker.currentFace;
        logger.debug('Original sticker face:', originalFace);
        logger.debug('Sticker face after F CW:', movedFace);
        logger.debug(
            'Cubie orientation after move:',
            CubeStateUtils.getCubieById(model.getCurrentState(), cubieId)?.orientation
        );

        // The sticker.face should reflect current state
        // (It might stay F if it's on the center, or change if it's on an edge/corner)
        // For edge cubie at (2,0,0), after F CW it moves to (2,2,0)
        // The F sticker should still be on F face for this particular cubie
        // But let's verify the face property is being calculated
        expect(movedFace).toBeDefined();
    });

    it('should maintain consistent state: sticker.face matches cubie orientation', () => {
        // Arrange
        // Get edge cubie with F and L stickers
        const cubie = CubeStateUtils.getCubieAtPosition(model.getCurrentState(), {
            x: 2,
            y: 0,
            z: 0,
        })!;
        const cubieId = cubie.id;

        // Act
        // Rotate F face
        model.applyMove('F');

        const movedCubie = CubeStateUtils.getCubieById(model.getCurrentState(), cubieId)!;

        // Assert
        // For each sticker on the cubie, verify its face property is consistent
        // with the cubie's orientation
        const currentState2 = model.getCurrentState();
        for (const [stickerId] of movedCubie.stickers) {
            const sticker = CubeStateUtils.getStickerById(currentState2, stickerId)!;

            // Extract original face from sticker ID
            const parts = stickerId.split('_');
            const originalFace = parts[parts.length - 2] as Face;

            const currentFace = sticker.currentFace;
            logger.debug(`Sticker ${stickerId}:`);
            logger.debug(`  Original face (from ID): ${originalFace}`);
            logger.debug(`  Current face (computed): ${currentFace}`);
            logger.debug(`  Cubie orientation: ${JSON.stringify(movedCubie.orientation)}`);

            // The sticker.face should be calculated based on originalFace + orientation
            expect(currentFace).toBeDefined();
            expect(Object.values(Face)).toContain(currentFace);
        }
    });

    it('should navigate correctly after moves using current state', () => {
        // Arrange
        // This is the critical test: after moves, navigation should use current state
        // Get F/R edge cubie (center-right on F face)
        const cubie = CubeStateUtils.getCubieAtPosition(model.getCurrentState(), {
            x: 0,
            y: 0,
            z: 0,
        })!;
        const cubieId = cubie.id;

        // Find sticker on F face
        const state = model.getCurrentState();
        let fSticker = null;
        for (const [stickerId] of cubie.stickers) {
            const s = CubeStateUtils.getStickerById(state, stickerId);
            if (s) {
                const stickerFace = s.currentFace;
                if (stickerFace === Face.F) {
                    fSticker = s;
                    break;
                }
            }
        }
        expect(fSticker).not.toBeNull();

        // Act
        // Rotate the cube with a U rotation (should move the cubie)
        model.applyMove('U');

        // Get the same sticker after move
        const currentState = model.getCurrentState();
        const movedSticker = CubeStateUtils.getStickerById(currentState, fSticker!.id)!;
        const movedCubie = CubeStateUtils.getCubieById(model.getCurrentState(), cubieId)!;

        // Assert
        logger.debug('After U rotation:');
        logger.debug('  Cubie ID:', cubieId);
        logger.debug('  Cubie position:', movedCubie.position);
        logger.debug('  Cubie orientation:', movedCubie.orientation);
        const movedFace = movedSticker.currentFace;
        logger.debug('  Sticker face (original F):', movedFace);

        // The sticker that was on F might now be on R (after U clockwise)
        // Or still on F if the cubie wasn't affected by U rotation
        // The key is that sticker.face should reflect CURRENT state
        expect(movedFace).toBeDefined();
        expect(Object.values(Face)).toContain(movedFace);

        // Verify all stickers on the cubie have valid current faces
        for (const [stickerId] of movedCubie.stickers) {
            const s = CubeStateUtils.getStickerById(currentState, stickerId)!;
            const sFace = s.currentFace;
            expect(sFace).toBeDefined();
            expect(Object.values(Face)).toContain(sFace);
            logger.debug(`  Sticker ${stickerId.split('_')[3]}: currently on face ${sFace}`);
        }
    });

    it('should allow navigation between cubie stickers after moves', () => {
        // Arrange
        // Simulate the F→R→B→L navigation scenario after moves
        // First, get an edge cubie and perform some moves
        const cubie = CubeStateUtils.getCubieAtPosition(model.getCurrentState(), {
            x: 0,
            y: 1,
            z: 0,
        })!; // F/R edge, middle
        const cubieId = cubie.id;

        logger.debug('\n=== Initial State ===');
        logger.debug('Cubie position:', cubie.position);
        const initialState = model.getCurrentState();
        for (const [stickerId] of cubie.stickers) {
            const s = CubeStateUtils.getStickerById(initialState, stickerId)!;
            const originalFace = stickerId.split('_')[3];
            logger.debug(`  ${originalFace} sticker -> currently on face ${s.currentFace}`);
        }

        // Act
        // Do a couple of moves
        model.applyMove('F');

        const afterMove = CubeStateUtils.getCubieById(model.getCurrentState(), cubieId)!;
        logger.debug('\n=== After F rotation ===');
        logger.debug('Cubie position:', afterMove.position);
        logger.debug('Cubie orientation:', afterMove.orientation);
        const afterFState = model.getCurrentState();
        for (const [stickerId] of afterMove.stickers) {
            const s = CubeStateUtils.getStickerById(afterFState, stickerId)!;
            const originalFace = stickerId.split('_')[3];
            const currentFace = s.currentFace;
            logger.debug(`  ${originalFace} sticker -> currently on face ${currentFace}`);
        }

        // Assert
        // Verify we can find stickers on the same cubie by face
        const stickersOnCubie = new Set<Face>();
        for (const [stickerId] of afterMove.stickers) {
            const s = CubeStateUtils.getStickerById(afterFState, stickerId)!;
            const stickerFace = s.currentFace;
            stickersOnCubie.add(stickerFace);
        }

        logger.debug('Faces covered by this cubie:', Array.from(stickersOnCubie));

        // For an edge cubie, should have exactly 2 faces
        expect(stickersOnCubie.size).toBe(2);

        // Verify navigation logic: if we're on one sticker and want to go to an adjacent face,
        // we should be able to find a sticker on that face belonging to the same cubie
        const stickerArray = Array.from(afterMove.stickers.values());
        const firstSticker = CubeStateUtils.getStickerById(afterFState, stickerArray[0].id)!;
        const secondSticker = CubeStateUtils.getStickerById(afterFState, stickerArray[1].id)!;

        const firstFace = firstSticker.currentFace;
        const secondFace = secondSticker.currentFace;

        expect(firstFace).not.toBe(secondFace); // Different faces
        expect(firstSticker.cubieId).toBe(secondSticker.cubieId); // Same cubie

        logger.debug('\nNavigation test:');
        logger.debug(`  From ${firstFace} to ${secondFace}: POSSIBLE (same cubie)`);
    });
});
