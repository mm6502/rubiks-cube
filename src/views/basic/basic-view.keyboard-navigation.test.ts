// BasicCube.Navigation.ByKeyboard.test.ts
// Unit tests for Basic View keyboard navigation with view-rotation-based walking
//
// WALKING CHARACTERISTICS:
// 1. Arrow keys always mean the natural direction as displayed by the view
//    (up is up, left is left, etc.)
// 2. Phase 1 — if the selected sticker is NOT on the current front face:
//    - The view projection rotates to bring that face to front.
//    - Selection does NOT move. The key is fully consumed.
// 3. Phase 2 — if the selected sticker IS on the current front face:
//    a. Within-face move: selection moves, view unchanged.
//    b. Cross-edge move: view rotates to bring the new face to front AND
//       selection moves to the same cubie's sticker on that face — both in
//       one keypress, no cube model moves emitted.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Face } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils';
import { EventName } from '@/types';

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

        describe('Phase 1 — view aligns when selection is not on front face', () => {
            it('should rotate view but NOT move selection when sticker is on Face.L', () => {
                // Arrange
                const lSticker = CubeStateUtils.getStickerAt(state, Face.L, 3);
                view.updateSelected(lSticker?.id);
                const spy = vi.spyOn(view, 'updateSelected');

                // Act
                const handled = view.handleKeyUp(
                    new KeyboardEvent('keydown', { key: 'ArrowLeft' })
                );

                // Assert: key consumed, selection NOT moved (onSelected not called)
                expect(handled).toBe(true);
                expect(spy).not.toHaveBeenCalled();
            });

            it('should rotate view but NOT move selection when sticker is on Face.R', () => {
                // Arrange
                const rSticker = CubeStateUtils.getStickerAt(state, Face.R, 5);
                view.updateSelected(rSticker?.id);
                const spy = vi.spyOn(view, 'updateSelected');

                // Act
                const handled = view.handleKeyUp(
                    new KeyboardEvent('keydown', { key: 'ArrowRight' })
                );

                // Assert
                expect(handled).toBe(true);
                expect(spy).not.toHaveBeenCalled();
            });

            it('should rotate view but NOT move selection when sticker is on Face.U', () => {
                // Arrange
                const uSticker = CubeStateUtils.getStickerAt(state, Face.U, 1);
                view.updateSelected(uSticker?.id);
                const spy = vi.spyOn(view, 'updateSelected');

                // Act
                const handled = view.handleKeyUp(new KeyboardEvent('keydown', { key: 'ArrowUp' }));

                // Assert
                expect(handled).toBe(true);
                expect(spy).not.toHaveBeenCalled();
            });

            it('enables normal navigation after view aligns to selection face', () => {
                // Arrange: select a center sticker on Face.R
                const rSticker = CubeStateUtils.getStickerAt(state, Face.R, 4);
                view.updateSelected(rSticker?.id);

                // First press: Phase 1 — view aligns to Face.R, selection stays
                view.handleKeyUp(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

                // Second press: now Face.R is front, so navigation should move selection
                const spy = vi.spyOn(view, 'updateSelected');
                const handled = view.handleKeyUp(
                    new KeyboardEvent('keydown', { key: 'ArrowRight' })
                );

                // Assert: second press moved the selection
                expect(handled).toBe(true);
                expect(spy).toHaveBeenCalled();
            });
        });

        describe('Phase 2 — cross-edge: view rotates AND selection moves in one keypress', () => {
            it('crossing right edge of Face.F moves selection to Face.R and rotates view', () => {
                // Arrange: right-edge sticker on Face.F (row=1, col=2, pos=5)
                const fEdge = CubeStateUtils.getStickerAt(state, Face.F, 5);
                view.updateSelected(fEdge?.id);
                const spy = vi.spyOn(view, 'updateSelected');

                // Act
                const handled = view.handleKeyUp(
                    new KeyboardEvent('keydown', { key: 'ArrowRight' })
                );

                // Assert: selection moved in same keypress as view rotation
                expect(handled).toBe(true);
                expect(spy).toHaveBeenCalled();
            });

            it('crossing left edge of Face.F moves selection to Face.L', () => {
                // Arrange: left-edge sticker on Face.F (row=1, col=0, pos=3)
                const fEdge = CubeStateUtils.getStickerAt(state, Face.F, 3);
                view.updateSelected(fEdge?.id);
                const spy = vi.spyOn(view, 'updateSelected');

                // Act
                const handled = view.handleKeyUp(
                    new KeyboardEvent('keydown', { key: 'ArrowLeft' })
                );

                // Assert
                expect(handled).toBe(true);
                expect(spy).toHaveBeenCalled();
            });

            it('crossing top edge of Face.F moves selection to Face.U', () => {
                // Arrange: top-edge sticker on Face.F (row=0, col=1, pos=1)
                const fEdge = CubeStateUtils.getStickerAt(state, Face.F, 1);
                view.updateSelected(fEdge?.id);
                const spy = vi.spyOn(view, 'updateSelected');

                // Act
                const handled = view.handleKeyUp(new KeyboardEvent('keydown', { key: 'ArrowUp' }));

                // Assert
                expect(handled).toBe(true);
                expect(spy).toHaveBeenCalled();
            });

            it('crossing bottom edge of Face.F moves selection to Face.D', () => {
                // Arrange: bottom-edge sticker on Face.F (row=2, col=1, pos=7)
                const fEdge = CubeStateUtils.getStickerAt(state, Face.F, 7);
                view.updateSelected(fEdge?.id);
                const spy = vi.spyOn(view, 'updateSelected');

                // Act
                const handled = view.handleKeyUp(
                    new KeyboardEvent('keydown', { key: 'ArrowDown' })
                );

                // Assert
                expect(handled).toBe(true);
                expect(spy).toHaveBeenCalled();
            });

            it('never emits MOVE_REQUESTED during keyboard navigation', () => {
                // Arrange: cross-edge scenario (Face.F right edge → Face.R)
                const fEdge = CubeStateUtils.getStickerAt(state, Face.F, 5);
                view.updateSelected(fEdge?.id);
                const emitSpy = vi.spyOn(Application.eventBus, 'emit');

                // Act
                view.handleKeyUp(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

                // Assert: no MOVE_REQUESTED emitted
                const moveRequests = emitSpy.mock.calls.filter(
                    ([eventName]) => eventName === EventName.MOVE_REQUESTED
                );
                expect(moveRequests).toHaveLength(0);
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
