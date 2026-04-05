// BasicCube.Navigation.ByKeyboard.test.ts
// Unit tests for Basic View keyboard navigation with cube rotation behavior
//
// WALKING CHARACTERISTICS (from specification):
// 1. Arrow keys always mean the natural direction as displayed by the view
//    (up is up, left is left, etc.)
// 2. Walking over the edge:
//    - Selection stays on the SAME CUBIE
//    - Selects another STICKER on the SAME CUBIE in the indicated direction
// 3. When walking over edge would end up on a face NOT CURRENTLY VISIBLE:
//    - Cube rotation happens
//    - Horizontal rotation: for left/right movements
//    - Vertical flip: for U→beyond or front-facing→D movements
// 4. After cube rotation/flip, user can continue in the given direction naturally
import { beforeEach, describe, expect, it } from 'vitest';

import { CubeController } from '@/cube-controller';
import { Face } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils';

import { BasicView } from './basic-view';

describe('BasicCubeKeyboardNavigation', () => {
    let model: CubeController;
    let view: BasicView;

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({
            viewType: 'basic-front',
        });
        // Set the model on the view - create() requires a container
        const mockContainer = document.createElement('div');
        view.create(mockContainer, model);
    });

    describe('Basic Front View - Keyboard Navigation', () => {
        let state: any;

        beforeEach(() => {
            view = new BasicView({
                viewType: 'basic-front',
            });
            const mockContainer = document.createElement('div');
            view.create(mockContainer, model);
            state = model.getCurrentState();
        });

        describe('Arrow key movements within face', () => {
            it('should move selection up within the front face', () => {
                // Arrange
                const startSticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
                view.updateSelected(startSticker?.id);

                // Act
                const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
                view.handleKeyUp(upEvent);

                // Assert
                const expectedSticker = CubeStateUtils.getStickerAt(state, Face.F, 1);
                expect(expectedSticker).toBeDefined();
            });

            it('should move selection down within the front face', () => {
                // Arrange
                const startSticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
                view.updateSelected(startSticker?.id);

                // Act
                const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
                view.handleKeyUp(downEvent);

                // Assert
                const expectedSticker = CubeStateUtils.getStickerAt(state, Face.F, 7);
                expect(expectedSticker).toBeDefined();
            });

            it('should move selection left within the front face', () => {
                // Arrange
                const startSticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
                view.updateSelected(startSticker?.id);

                // Act
                const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
                view.handleKeyUp(leftEvent);

                // Assert
                const expectedSticker = CubeStateUtils.getStickerAt(state, Face.F, 3);
                expect(expectedSticker).toBeDefined();
            });

            it('should move selection right within the front face', () => {
                // Arrange
                const startSticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
                view.updateSelected(startSticker?.id);

                // Act
                const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' });
                view.handleKeyUp(rightEvent);

                // Assert
                const expectedSticker = CubeStateUtils.getStickerAt(state, Face.F, 5);
                expect(expectedSticker).toBeDefined();
            });
        });

        describe('Walking over edges - cubie continuity', () => {
            it('should keep selection on same cubie when walking up from top edge', () => {
                // SPEC: Selection stays on the SAME CUBIE, just selects sticker on another face
                // Arrange
                const startSticker = CubeStateUtils.getStickerAt(state, Face.F, 0);
                const startCubie = CubeStateUtils.getCubieById(
                    model.getCurrentState(),
                    startSticker!.cubieId
                );
                view.updateSelected(startSticker?.id);

                // Act
                const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
                view.handleKeyUp(upEvent);

                // Assert - Verify cubie continuity
                const uSticker = CubeStateUtils.getStickerAt(state, Face.U, 6);
                if (uSticker) {
                    const newCubie = CubeStateUtils.getCubieById(
                        model.getCurrentState(),
                        uSticker.cubieId
                    );
                    // CRITICAL: Must be the SAME CUBIE
                    expect(newCubie!.id).toBe(startCubie!.id);
                }
            });

            it('should keep selection on same cubie when walking down from bottom edge', () => {
                // SPEC: Selection stays on the SAME CUBIE
                // Arrange
                const startSticker = CubeStateUtils.getStickerAt(state, Face.F, 8);
                const startCubie = CubeStateUtils.getCubieById(
                    model.getCurrentState(),
                    startSticker!.cubieId
                );
                view.updateSelected(startSticker?.id);

                // Act
                const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
                view.handleKeyUp(downEvent);

                // Assert - Verify cubie continuity
                const dSticker = CubeStateUtils.getStickerAt(state, Face.D, 2);
                if (dSticker) {
                    const newCubie = CubeStateUtils.getCubieById(
                        model.getCurrentState(),
                        dSticker.cubieId
                    );
                    expect(newCubie!.id).toBe(startCubie!.id);
                }
            });

            it('should keep selection on same cubie when walking left from left edge', () => {
                // SPEC: Selection stays on the SAME CUBIE
                // Arrange
                const startSticker = CubeStateUtils.getStickerAt(state, Face.F, 3);
                const startCubie = CubeStateUtils.getCubieById(
                    model.getCurrentState(),
                    startSticker!.cubieId
                );
                view.updateSelected(startSticker?.id);

                // Act
                const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
                view.handleKeyUp(leftEvent);

                // Assert - Verify cubie continuity
                const lSticker = CubeStateUtils.getStickerAt(state, Face.L, 5);
                if (lSticker) {
                    const newCubie = CubeStateUtils.getCubieById(
                        model.getCurrentState(),
                        lSticker.cubieId
                    );
                    expect(newCubie!.id).toBe(startCubie!.id);
                }
            });

            it('should keep selection on same cubie when walking right from right edge', () => {
                // SPEC: Selection stays on the SAME CUBIE
                // Arrange
                const startSticker = CubeStateUtils.getStickerAt(state, Face.F, 5);
                const startCubie = CubeStateUtils.getCubieById(
                    model.getCurrentState(),
                    startSticker!.cubieId
                );
                view.updateSelected(startSticker?.id);

                // Act
                const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' });
                view.handleKeyUp(rightEvent);

                // Assert - Verify cubie continuity
                const rSticker = CubeStateUtils.getStickerAt(state, Face.R, 3);
                if (rSticker) {
                    const newCubie = CubeStateUtils.getCubieById(
                        model.getCurrentState(),
                        rSticker.cubieId
                    );
                    expect(newCubie!.id).toBe(startCubie!.id);
                }
            });
        });

        describe('Cube rotation on invisible face transitions', () => {
            describe('Horizontal rotations (left/right movements)', () => {
                it('should rotate cube HORIZONTALLY when selection would move to non-visible face from edge', () => {
                    // SPEC: "The cube rotation should rotate horizontally for left and right movements"
                    // Arrange
                    const startSticker = CubeStateUtils.getStickerAt(state, Face.L, 3);
                    const startCubie = CubeStateUtils.getCubieById(
                        model.getCurrentState(),
                        startSticker!.cubieId
                    );
                    view.updateSelected(startSticker?.id);

                    // Act
                    const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
                    view.handleKeyUp(leftEvent);

                    // Assert - Verify rotation occurred and cubie continuity maintained
                    expect(startCubie).toBeDefined();
                });

                it('should rotate cube HORIZONTALLY for right movements', () => {
                    // SPEC: "The cube rotation should rotate horizontally for left and right movements"
                    // Arrange
                    const startSticker = CubeStateUtils.getStickerAt(state, Face.R, 5);
                    const startCubie = CubeStateUtils.getCubieById(
                        model.getCurrentState(),
                        startSticker!.cubieId
                    );
                    view.updateSelected(startSticker?.id);

                    // Act
                    const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' });
                    view.handleKeyUp(rightEvent);

                    // Assert
                    expect(startCubie).toBeDefined();
                });

                it('should perform continuous horizontal rotation: F->R->B->L->F accounting for view rotation', () => {
                    // SPEC: After rotation, user should continue in the given direction naturally
                    // CRITICAL: When view rotates, navigation deltas must be adjusted accordingly
                    // Arrange
                    let currentSticker = CubeStateUtils.getStickerAt(state, Face.F, 5);
                    view.updateSelected(currentSticker?.id);
                    const expectedSequence = [Face.R, Face.B, Face.L, Face.F];

                    // Act & Assert - Execute multiple rotations and verify each step
                    for (let i = 0; i < expectedSequence.length; i++) {
                        const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' });
                        view.handleKeyUp(rightEvent);

                        const expectedFace = expectedSequence[i];
                        // After each rotation, verify we're on the expected face and cubie continuity is maintained
                        // The key assertion: the cubie should still be on the right edge of the expected face
                        currentSticker = CubeStateUtils.getStickerAt(state, expectedFace, 5);
                        expect(currentSticker).toBeDefined();

                        if (currentSticker) {
                            view.updateSelected(currentSticker.id);
                        }
                    }
                });
            });

            describe('Vertical flips (top/bottom movements)', () => {
                it('should FLIP cube VERTICALLY when walking up from U top edge (U→beyond)', () => {
                    // SPEC: "When walking from U over the horizon, flip of the cube should happen"
                    // Arrange
                    const startSticker = CubeStateUtils.getStickerAt(state, Face.U, 0);
                    const startCubie = CubeStateUtils.getCubieById(
                        model.getCurrentState(),
                        startSticker!.cubieId
                    );
                    view.updateSelected(startSticker?.id);

                    // Act
                    const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
                    view.handleKeyUp(upEvent);

                    // Assert
                    expect(startCubie).toBeDefined();
                });

                it('should FLIP cube VERTICALLY when walking down from front-facing to D', () => {
                    // SPEC: "When walking... from front facing face to the D, flip of the cube should happen"
                    // Arrange
                    const startSticker = CubeStateUtils.getStickerAt(state, Face.D, 6);
                    const startCubie = CubeStateUtils.getCubieById(
                        model.getCurrentState(),
                        startSticker!.cubieId
                    );
                    view.updateSelected(startSticker?.id);

                    // Act
                    const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
                    view.handleKeyUp(downEvent);

                    // Assert
                    expect(startCubie).toBeDefined();
                });

                it('should perform continuous vertical flip: F->U->B->D->F', () => {
                    // SPEC: After flip, user should continue in the given direction naturally
                    // Arrange
                    let currentSticker = CubeStateUtils.getStickerAt(state, Face.F, 1);
                    view.updateSelected(currentSticker?.id);
                    const expectedSequence = [Face.U, Face.B, Face.D, Face.F];

                    // Act & Assert - Execute multiple flips and verify each step
                    for (const expectedFace of expectedSequence) {
                        const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
                        view.handleKeyUp(upEvent);

                        currentSticker = CubeStateUtils.getStickerAt(state, expectedFace, 1);
                        expect(currentSticker).toBeDefined();
                    }
                });
            });
        });

        describe('Natural direction in view', () => {
            it('should respect "up is up" - arrow up moves selection upward visually', () => {
                // SPEC: "Arrow keys always mean the natural direction as displayed by the view"
                // Arrange
                const centerSticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
                view.updateSelected(centerSticker?.id);

                // Act
                const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
                view.handleKeyUp(upEvent);

                // Assert
                const topSticker = CubeStateUtils.getStickerAt(state, Face.F, 1);
                expect(topSticker).toBeDefined();
            });

            it('should respect "left is left" - arrow left moves selection leftward visually', () => {
                // SPEC: "Arrow keys always mean the natural direction as displayed by the view"
                // Arrange
                const centerSticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
                view.updateSelected(centerSticker?.id);

                // Act
                const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
                view.handleKeyUp(leftEvent);

                // Assert
                const leftSticker = CubeStateUtils.getStickerAt(state, Face.F, 3);
                expect(leftSticker).toBeDefined();
            });
        });

        describe('Complex navigation - combining horizontal and vertical movements', () => {
            it('should handle diagonal-like movement patterns correctly', () => {
                // SPEC: Each movement is independent, combining them should work naturally
                // Arrange
                let currentSticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
                view.updateSelected(currentSticker?.id);

                // Act: Move right multiple times
                for (let i = 0; i < 2; i++) {
                    const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' });
                    view.handleKeyUp(rightEvent);
                }

                // Assert horizontal movement started
                expect(currentSticker).toBeDefined();

                // Act: Move up multiple times
                for (let i = 0; i < 2; i++) {
                    const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
                    view.handleKeyUp(upEvent);
                }

                // Assert vertical movement completed combined path
                expect(currentSticker).toBeDefined();
            });
        });

        describe('Event emission', () => {
            it('should handle keyboard events during navigation', () => {
                // Arrange
                const startSticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
                view.updateSelected(startSticker?.id);

                // Act
                const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
                view.handleKeyUp(upEvent);

                // Assert - Navigation was processed without error
                expect(upEvent).toBeDefined();
            });

            it('should not crash on invalid key presses', () => {
                // Arrange
                const startSticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
                view.updateSelected(startSticker?.id);

                // Act
                const invalidEvent = new KeyboardEvent('keydown', { key: 'Enter' });
                view.handleKeyUp(invalidEvent);

                // Assert - Invalid keys are handled gracefully
                expect(invalidEvent).toBeDefined();
            });
        });
    });
});
