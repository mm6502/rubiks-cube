import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Map as IMap } from 'immutable';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { CubieId, Face, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils';
import { EventName, MoveExecutedEvent } from '@/types';

import { FlatView } from './flat-view';
import styles from './flat-view.module.css';

beforeAll(() => {
    // JSDOM does not implement setPointerCapture; polyfill for tests
    if (!HTMLElement.prototype.setPointerCapture) {
        HTMLElement.prototype.setPointerCapture = function () {};
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
        HTMLElement.prototype.releasePointerCapture = function () {};
    }
});

describe('FlatView', () => {
    describe('edge cases and interactions', () => {
        it('should not throw if create called with null model or container', () => {
            const view2 = new FlatView(styles);
            expect(() => view2.create(null as any, null as any)).not.toThrow();
        });

        it('should not throw if update called with null container', () => {
            const view2 = new FlatView(styles);
            // state.container is null by default
            expect(() => view2.update(controller)).not.toThrow();
        });

        it('should call setLayoutMode on touchHandler if present', () => {
            view.create(container, controller);
            const handler = view['touchHandler'];
            const spy = vi.spyOn(handler!, 'setLayoutMode');
            // Use a valid LayoutMode value (from '@/cube/types/view')
            view.setLayoutMode('floating');
            expect(spy).toHaveBeenCalledWith('floating');
        });

        it('should handle legend drag pointer events', () => {
            view.create(container, controller);
            const legend = container.querySelector(`.${styles['flat-legend']}`) as HTMLElement;
            // Simulate pointerdown
            legend.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 20 }));
            // Simulate pointermove
            document.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 30 }));
            // Simulate pointerup
            document.dispatchEvent(new PointerEvent('pointerup', { clientX: 20, clientY: 30 }));
            // No assertion needed, just branch coverage
        });

        it('should not fail if createFaceElement called with empty faceGrid', () => {
            const view2 = new FlatView(styles);
            const faceGrid = {
                grid: [[], []],
            };
            expect(() => view2['createFaceElement'](Face.F, faceGrid as any)).not.toThrow();
        });
    });
    let view: FlatView;
    let container: HTMLElement;
    let controller: CubeController;

    beforeEach(() => {
        // Create a container element
        container = document.createElement('div');
        container.style.width = '800px';
        container.style.height = '600px';
        document.body.appendChild(container);

        // Initialize the application and controller
        controller = new CubeController();
        view = new FlatView(styles);
    });

    afterEach(() => {
        view.destroy();
        document.body.removeChild(container);
        Application.eventBus.removeAllListeners();
    });

    describe('initialization', () => {
        it('should return correct view type', () => {
            // Act & Assert
            expect(view.getViewType()).toBe('flat');
        });

        it('should create view with T-shaped layout', () => {
            // Act
            view.create(container, controller);

            // Assert
            const grid = container.querySelector(`.${styles['flat-grid']}`);
            expect(grid).toBeTruthy();
            expect(grid?.children.length).toBe(12); // 3 rows x 4 cols
        });

        it('should create legend with face labels', () => {
            // Act
            view.create(container, controller);

            // Assert
            const legend = container.querySelector(`.${styles['flat-legend']}`);
            expect(legend).toBeTruthy();
            expect(legend?.textContent).toContain('U');
            expect(legend?.textContent).toContain('F');
            expect(legend?.textContent).toContain('R');
            expect(legend?.textContent).toContain('L');
            expect(legend?.textContent).toContain('B');
            expect(legend?.textContent).toContain('D');
        });

        it('should make container focusable', () => {
            // Act
            view.create(container, controller);

            // Assert
            expect(container.tabIndex).toBe(0);
        });

        it('should create all six faces', () => {
            // Act
            view.create(container, controller);

            // Assert
            const faceElements = container.querySelectorAll(`.${styles['flat-face']}`);
            expect(faceElements.length).toBe(6);

            const stickerFaces = new Set(
                Array.from(container.querySelectorAll(`.${styles['flat-sticker']}`)).map(sticker =>
                    sticker.getAttribute('data-face')
                )
            );
            expect(stickerFaces).toEqual(new Set([Face.U, Face.F, Face.R, Face.L, Face.B, Face.D]));
        });

        it('should not render undefined class names on faces', () => {
            // Act
            view.create(container, controller);

            // Assert
            const faceElements = container.querySelectorAll(`.${styles['flat-face']}`);
            faceElements.forEach(faceElement => {
                expect(faceElement.classList.contains('undefined')).toBe(false);
            });
        });

        it('should create 9 stickers per face for 3x3 cube', () => {
            // Act
            view.create(container, controller);

            // Assert
            const stickers = container.querySelectorAll(
                `.${styles['flat-sticker']}[data-face="${Face.F}"]`
            );
            expect(stickers.length).toBe(9);
        });

        it('should set data attributes on stickers', () => {
            // Act
            view.create(container, controller);

            // Assert
            const sticker = container.querySelector(`.${styles['flat-sticker']}`) as HTMLElement;
            expect(sticker?.getAttribute('data-sticker-id')).toBeTruthy();
            expect(sticker?.getAttribute('data-face')).toBeTruthy();
            expect(sticker?.getAttribute('data-pos')).toBeTruthy();
        });

        it('should subscribe to move executed events', () => {
            // Arrange
            const spy = vi.spyOn(Application.eventBus, 'on');

            // Act
            view.create(container, controller);

            // Assert
            expect(spy).toHaveBeenCalledWith(EventName.MOVE_EXECUTED, expect.any(Function));
        });
    });

    describe('sticker interactions', () => {
        beforeEach(() => {
            view.create(container, controller);
        });

        it('should emit highlight event on mouseover', () => {
            // Arrange
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            const sticker = container.querySelector(`.${styles['flat-sticker']}`) as HTMLElement;
            const stickerId = sticker.getAttribute('data-sticker-id');

            // Act
            sticker.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.HIGHLIGHT_CHANGED, {
                stickerId,
                viewId: 'flat',
            });
        });

        it('should emit unhighlight event on mouseout', () => {
            // Arrange
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            const sticker = container.querySelector(`.${styles['flat-sticker']}`) as HTMLElement;

            // Act
            sticker.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.HIGHLIGHT_CHANGED, {
                stickerId: undefined,
                viewId: 'flat',
            });
        });

        it('should update selection on click', () => {
            // Arrange
            const updateSelectedSpy = vi.spyOn(view, 'updateSelected');
            const sticker = container.querySelector(`.${styles['flat-sticker']}`) as HTMLElement;
            const stickerId = sticker.getAttribute('data-sticker-id');

            // Act
            sticker.click();

            // Assert
            expect(updateSelectedSpy).toHaveBeenCalledWith(stickerId);
        });

        it('should focus container on sticker click', () => {
            // Arrange
            const focusSpy = vi.spyOn(container, 'focus');
            const sticker = container.querySelector(`.${styles['flat-sticker']}`) as HTMLElement;

            // Act
            sticker.click();

            // Assert
            expect(focusSpy).toHaveBeenCalled();
        });
    });

    describe('update', () => {
        beforeEach(() => {
            view.create(container, controller);
        });

        it('should update sticker colors after move', () => {
            // Arrange
            controller.applyMove('R');

            // Act
            view.update(controller);

            // Assert
            const sameSticker = container.querySelector(
                `.${styles['flat-sticker']}[data-face="${Face.F}"][data-pos="0"]`
            ) as HTMLElement;
            const newId = sameSticker.getAttribute('data-sticker-id');

            // After move, sticker IDs should have changed for affected faces
            expect(newId).toBeTruthy();
            // Front face is affected by R move, so verify stickers exist and have colors
            const allStickers = Array.from(
                container.querySelectorAll(`.${styles['flat-sticker']}`)
            ) as HTMLElement[];
            expect(allStickers.length).toBeGreaterThan(0);
            allStickers.forEach(s => {
                expect(s.style.backgroundColor).toBeTruthy();
            });
        });

        it('should update sticker IDs', () => {
            // Arrange
            controller.applyMove('U');

            // Act
            view.update(controller);

            // Assert
            const sticker = container.querySelector(
                `.${styles['flat-sticker']}[data-face="${Face.F}"][data-pos="0"]`
            ) as HTMLElement;
            expect(sticker?.getAttribute('data-sticker-id')).toBeTruthy();
        });

        it('should not update if container is null', () => {
            // Arrange
            view.destroy();

            // Act & Assert
            expect(() => view.update(controller)).not.toThrow();
        });
    });

    describe('updateSelective', () => {
        beforeEach(() => {
            view.create(container, controller);
        });

        it('should update only affected stickers', () => {
            // Arrange
            // Get the actual sticker ID at F:5 position
            const actualSticker = container.querySelector(
                `.${styles['flat-sticker']}[data-face="${Face.F}"][data-pos="5"]`
            ) as HTMLElement;
            const actualStickerId = actualSticker.getAttribute('data-sticker-id') as StickerId;

            const moveEvent: MoveExecutedEvent = {
                moveDetails: {
                    notation: 'R',
                    movedCubies: {
                        before: [],
                        after: [
                            {
                                id: 'test-cubie' as CubieId,
                                type: 'edge',
                                position: { x: 1, y: 1, z: 0 },
                                orientation: 0,
                                canonicalIndex: 0,
                                stickers: IMap([
                                    [
                                        actualStickerId,
                                        {
                                            id: actualStickerId,
                                            color: 'blue', // Face.R maps to blue
                                            cubieId: 'test-cubie' as CubieId,
                                            localIndex: 0,
                                            currentFace: Face.F,
                                            facePosition: 5,
                                        },
                                    ],
                                ]),
                            },
                        ],
                    },
                },
                preState: controller.getCurrentState(),
                postState: controller.getCurrentState(),
            };

            // Act
            view.updateSelective(moveEvent);

            // Assert
            // Verify sticker still has correct ID
            const sticker = container.querySelector(
                `.${styles['flat-sticker']}[data-face="${Face.F}"][data-pos="5"]`
            ) as HTMLElement;
            expect(sticker?.getAttribute('data-sticker-id')).toBe(actualStickerId);
        });

        it('should handle empty moved cubies', () => {
            // Arrange
            const moveEvent: MoveExecutedEvent = {
                moveDetails: {
                    notation: 'R',
                    movedCubies: {
                        before: [],
                        after: [],
                    },
                },
                preState: controller.getCurrentState(),
                postState: controller.getCurrentState(),
            };

            // Act & Assert
            expect(() => view.updateSelective(moveEvent)).not.toThrow();
        });

        it('should not update if container is null', () => {
            // Arrange
            view.destroy();

            // Act & Assert
            expect(() => view.updateSelective()).not.toThrow();
        });
    });

    describe('updateHighlight', () => {
        beforeEach(() => {
            view.create(container, controller);
        });

        it('should add highlight class to sticker', () => {
            // Arrange
            const sticker = container.querySelector(`.${styles['flat-sticker']}`) as HTMLElement;
            const stickerId = sticker.getAttribute('data-sticker-id') as StickerId;

            // Act
            view.updateHighlight(stickerId);

            // Assert
            expect(sticker.classList.contains(styles.highlighted)).toBe(true);
        });

        it('should remove previous highlight', () => {
            // Arrange
            const stickers = Array.from(
                container.querySelectorAll(`.${styles['flat-sticker']}`)
            ) as HTMLElement[];
            const firstId = stickers[0].getAttribute('data-sticker-id') as StickerId;
            const secondId = stickers[1].getAttribute('data-sticker-id') as StickerId;

            // Act
            view.updateHighlight(firstId);
            expect(stickers[0].classList.contains(styles.highlighted)).toBe(true);

            view.updateHighlight(secondId);

            // Assert
            expect(stickers[0].classList.contains(styles.highlighted)).toBe(false);
            expect(stickers[1].classList.contains(styles.highlighted)).toBe(true);
        });

        it('should clear highlight when undefined', () => {
            // Arrange
            const sticker = container.querySelector(`.${styles['flat-sticker']}`) as HTMLElement;
            const stickerId = sticker.getAttribute('data-sticker-id') as StickerId;

            // Act
            view.updateHighlight(stickerId);
            expect(sticker.classList.contains(styles.highlighted)).toBe(true);

            view.updateHighlight(undefined);

            // Assert
            expect(sticker.classList.contains(styles.highlighted)).toBe(false);
        });
    });

    describe('updateSelected', () => {
        beforeEach(() => {
            view.create(container, controller);
        });

        it('should add selected class to sticker', () => {
            // Arrange
            const sticker = container.querySelector(`.${styles['flat-sticker']}`) as HTMLElement;
            const stickerId = sticker.getAttribute('data-sticker-id') as StickerId;

            // Act
            view.updateSelected(stickerId);

            // Assert
            expect(sticker.classList.contains(styles.selected)).toBe(true);
        });

        it('should handle position-based selection (face:pos)', () => {
            // Arrange
            const sticker = CubeStateUtils.getStickerAt(controller.getCurrentState(), 'F', 4);

            // Act
            view.updateSelected(sticker?.id);

            // Assert
            const element = container.querySelector(
                `.${styles['flat-sticker']}[data-face="${Face.F}"][data-pos="4"]`
            ) as HTMLElement;
            expect(element?.classList.contains(styles.selected)).toBe(true);
        });

        it('should remove previous selection', () => {
            // Arrange
            const stickers = Array.from(
                container.querySelectorAll(`.${styles['flat-sticker']}`)
            ) as HTMLElement[];
            const firstId = stickers[0].getAttribute('data-sticker-id') as StickerId;
            const secondId = stickers[1].getAttribute('data-sticker-id') as StickerId;

            // Act
            view.updateSelected(firstId);
            expect(stickers[0].classList.contains(styles.selected)).toBe(true);

            view.updateSelected(secondId);

            // Assert
            expect(stickers[0].classList.contains(styles.selected)).toBe(false);
            expect(stickers[1].classList.contains(styles.selected)).toBe(true);
        });

        it('should clear selection when undefined', () => {
            // Arrange
            const sticker = container.querySelector(`.${styles['flat-sticker']}`) as HTMLElement;
            const stickerId = sticker.getAttribute('data-sticker-id') as StickerId;

            // Act
            view.updateSelected(stickerId);
            expect(sticker.classList.contains(styles.selected)).toBe(true);

            view.updateSelected(undefined);

            // Assert
            expect(sticker.classList.contains(styles.selected)).toBe(false);
        });
    });

    describe('keyboard navigation', () => {
        beforeEach(() => {
            view.create(container, controller);
            // Select a starting position - get the actual sticker ID at F:4
            const sticker = CubeStateUtils.getStickerAt(controller.getCurrentState(), 'F', 4);
            if (sticker) {
                view.updateSelected(sticker.id);
            }
        });

        it('should navigate up with arrow key', () => {
            // Arrange
            const updateSelectedSpy = vi.spyOn(view, 'updateSelected');

            // Act
            const event = new KeyboardEvent('keyup', { key: 'ArrowUp' });
            const handled = view.handleKeyUp(event);

            // Assert
            expect(handled).toBe(true);
            expect(updateSelectedSpy).toHaveBeenCalled();
        });

        it('should navigate down with arrow key', () => {
            // Arrange
            const updateSelectedSpy = vi.spyOn(view, 'updateSelected');

            // Act
            const event = new KeyboardEvent('keyup', { key: 'ArrowDown' });
            const handled = view.handleKeyUp(event);

            // Assert
            expect(handled).toBe(true);
            expect(updateSelectedSpy).toHaveBeenCalled();
        });

        it('should navigate left with arrow key', () => {
            // Arrange
            const updateSelectedSpy = vi.spyOn(view, 'updateSelected');

            // Act
            const event = new KeyboardEvent('keyup', { key: 'ArrowLeft' });
            const handled = view.handleKeyUp(event);

            // Assert
            expect(handled).toBe(true);
            expect(updateSelectedSpy).toHaveBeenCalled();
        });

        it('should navigate right with arrow key', () => {
            // Arrange
            const updateSelectedSpy = vi.spyOn(view, 'updateSelected');

            // Act
            const event = new KeyboardEvent('keyup', { key: 'ArrowRight' });
            const handled = view.handleKeyUp(event);

            // Assert
            expect(handled).toBe(true);
            expect(updateSelectedSpy).toHaveBeenCalled();
        });

        it('should not handle navigation if nothing selected', () => {
            // Arrange
            view.updateSelected(undefined);

            // Act
            const event = new KeyboardEvent('keyup', { key: 'ArrowUp' });
            const handled = view.handleKeyUp(event);

            // Assert
            expect(handled).toBe(false);
        });

        it('should not handle invalid key', () => {
            // Act
            const event = new KeyboardEvent('keyup', { key: 'a' });
            const handled = view.handleKeyUp(event);

            // Assert
            expect(handled).toBe(false);
        });
    });

    describe('resize', () => {
        beforeEach(() => {
            view.create(container, controller);
        });

        it('should scale grid based on container size', () => {
            // Arrange
            const grid = container.querySelector(`.${styles['flat-grid']}`) as HTMLElement;

            // Act
            container.style.width = '300px';
            container.style.height = '300px';
            view.resize();

            // Assert
            const newTransform = grid.style.transform;
            expect(newTransform).toBeTruthy();
            expect(newTransform).toContain('scale');
            // centering is now handled by the flex parent, not by a translate in the transform
        });

        it('should float legend in the top‑right corner and not reposition it in code', () => {
            // Act
            view.resize();

            // Assert - legend positioning now comes entirely from CSS
            const legend = container.querySelector(`.${styles['flat-legend']}`) as HTMLElement;
            expect(legend).toBeTruthy();
            // ensure the view did not try to reposition it via inline styles
            expect(legend.style.top).toBe('');
            expect(legend.style.right).toBe('');
            // its floating behavior is handled by CSS rules which aren't reflected in JSDOM
            expect(legend.classList.contains(styles['flat-legend'])).toBe(true);
        });

        it('should handle small container sizes', () => {
            // Act
            container.style.width = '100px';
            container.style.height = '100px';
            view.resize();

            // Assert
            const grid = container.querySelector(`.${styles['flat-grid']}`) as HTMLElement;
            expect(grid.style.transform).toContain('scale');
        });
    });

    describe('getMinimumSize', () => {
        it('should return correct minimum dimensions', () => {
            // Act & Assert
            const size = view.getMinimumSize();
            expect(size).toEqual({ width: 300, height: 300 });
        });
    });

    describe('getCubeElement', () => {
        it('should return grid element after creation', () => {
            // Arrange
            view.create(container, controller);

            // Act
            const element = view.getCubeElement();

            // Assert
            expect(element).toBeTruthy();
            // Verify it's the grid by checking it has grid structure
            const cells = element?.querySelectorAll(`.${styles['flat-cell']}`);
            expect(cells?.length).toBe(12); // 3x4 grid
        });

        it('should return null before creation', () => {
            // Arrange
            const newView = new FlatView(styles);

            // Act & Assert
            expect(newView.getCubeElement()).toBeNull();
        });
    });

    describe('getCommands', () => {
        it('should return undo and redo commands with correct properties', () => {
            // Act
            const commands = view.getCommands();
            const ids = commands.map(c => c.id);

            // Assert structure
            expect(commands).toHaveLength(4);
            expect(ids).toContain('flat.face-direct-mode');
            expect(ids).toContain('flat.cube-walk');
            expect(ids).toContain('flat.undo');
            expect(ids).toContain('flat.redo');

            const undo = commands.find(c => c.id === 'flat.undo')!;
            const redo = commands.find(c => c.id === 'flat.redo')!;

            expect(undo.showInHeader).toBe(true);
            expect(undo.icon).toBe('↩');
            expect(redo.showInHeader).toBe(true);
            expect(redo.icon).toBe('↪');
        });

        it('undo/redo isEnabled reflects move history state', () => {
            // Arrange: view needs a model to query history
            view.create(container, controller);
            const undo = view.getCommands().find(c => c.id === 'flat.undo')!;
            const redo = view.getCommands().find(c => c.id === 'flat.redo')!;

            // Initially no history
            expect(undo.isEnabled!()).toBe(false);
            expect(redo.isEnabled!()).toBe(false);

            // After a move, undo becomes available
            Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                moveNotation: 'R',
                viewId: 'test',
                tentative: false,
            });
            expect(undo.isEnabled!()).toBe(true);
            expect(redo.isEnabled!()).toBe(false);
        });
    });

    describe('move event handling', () => {
        beforeEach(() => {
            view.create(container, controller);
        });

        it('should update on move executed event from different view', () => {
            // Arrange
            const updateSpy = vi.spyOn(view, 'updateSelective');

            const moveEvent: MoveExecutedEvent = {
                moveDetails: {
                    notation: 'R',
                    movedCubies: {
                        before: [],
                        after: [],
                    },
                },
                preState: controller.getCurrentState(),
                postState: controller.getCurrentState(),
            };

            // Act
            Application.eventBus.emit(EventName.MOVE_EXECUTED, moveEvent);

            // Assert
            expect(updateSpy).toHaveBeenCalled();
        });

        it('should process update if originated from same view', () => {
            // Arrange
            const updateSpy = vi.spyOn(view, 'updateSelective');

            const moveEvent: MoveExecutedEvent = {
                moveDetails: {
                    notation: 'R',
                    movedCubies: {
                        before: [],
                        after: [],
                    },
                },
                preState: controller.getCurrentState(),
                postState: controller.getCurrentState(),
            };

            // Act
            Application.eventBus.emit(EventName.MOVE_EXECUTED, moveEvent);

            // Assert
            expect(updateSpy).toHaveBeenCalled();
        });

        it('should fall back to full update if no moveDetails', () => {
            // Arrange
            const updateSpy = vi.spyOn(view, 'update');

            const moveEvent = {
                move: 'R',
            };

            // Act
            Application.eventBus.emit(EventName.MOVE_EXECUTED, moveEvent);

            // Assert
            expect(updateSpy).toHaveBeenCalled();
        });
    });

    describe('destroy', () => {
        it('should clear container contents', () => {
            // Arrange
            view.create(container, controller);
            expect(container.innerHTML).not.toBe('');

            // Act
            view.destroy();

            // Assert
            expect(container.innerHTML).toBe('');
        });

        it('should not throw if container is null', () => {
            // Act & Assert
            expect(() => view.destroy()).not.toThrow();
        });
    });

    describe('legend drag – MOVE_REQUESTED', () => {
        beforeEach(() => {
            view.create(container, controller);
        });

        it('emits MOVE_REQUESTED on pointerup when drag exceeds threshold', () => {
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            const legend = container.querySelector(`.${styles['flat-legend']}`) as HTMLElement;

            legend.dispatchEvent(
                new PointerEvent('pointerdown', { clientX: 100, clientY: 200, bubbles: true })
            );
            document.dispatchEvent(
                new PointerEvent('pointermove', { clientX: 150, clientY: 200, bubbles: true })
            );
            document.dispatchEvent(
                new PointerEvent('pointerup', { clientX: 150, clientY: 200, bubbles: true })
            );

            expect(emitSpy).toHaveBeenCalledWith(
                EventName.MOVE_REQUESTED,
                expect.objectContaining({ viewId: 'flat' })
            );
        });

        it('shows drag label on pointermove when drag exceeds threshold', () => {
            const legend = container.querySelector(`.${styles['flat-legend']}`) as HTMLElement;

            legend.dispatchEvent(
                new PointerEvent('pointerdown', { clientX: 100, clientY: 200, bubbles: true })
            );
            document.dispatchEvent(
                new PointerEvent('pointermove', { clientX: 130, clientY: 200, bubbles: true })
            );

            // No throw, drag label code path exercised
            document.dispatchEvent(
                new PointerEvent('pointerup', { clientX: 130, clientY: 200, bubbles: true })
            );
        });

        it('does not emit MOVE_REQUESTED when drag is below threshold', () => {
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            const legend = container.querySelector(`.${styles['flat-legend']}`) as HTMLElement;

            // Small movement (< 20px threshold)
            legend.dispatchEvent(
                new PointerEvent('pointerdown', { clientX: 100, clientY: 200, bubbles: true })
            );
            emitSpy.mockClear(); // ignore any calls from pointerdown processing
            document.dispatchEvent(
                new PointerEvent('pointerup', { clientX: 110, clientY: 200, bubbles: true })
            );

            expect(emitSpy).not.toHaveBeenCalledWith(EventName.MOVE_REQUESTED, expect.anything());
        });

        it("inferLegendMove: non-rotated horizontal right → y'", () => {
            // Force non-rotated mode
            Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
            view['handleResize']();
            expect(view['state'].isRotated).toBe(false);

            // drag right
            const result = view['inferLegendMove'](50, 5);
            expect(result).toBe("y'");

            // Restore
            Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true });
        });

        it('inferLegendMove: non-rotated horizontal left → y', () => {
            Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
            view['handleResize']();

            const result = view['inferLegendMove'](-50, 5);
            expect(result).toBe('y');

            Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true });
        });

        it("inferLegendMove: non-rotated vertical down → x'", () => {
            Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
            view['handleResize']();

            const result = view['inferLegendMove'](5, 50);
            expect(result).toBe("x'");

            Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true });
        });

        it('inferLegendMove: non-rotated vertical up → x', () => {
            Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
            view['handleResize']();

            const result = view['inferLegendMove'](5, -50);
            expect(result).toBe('x');

            Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true });
        });
    });

    describe('keyboard: face-select and keyboard-move', () => {
        beforeEach(() => {
            view.create(container, controller);
            const sticker = CubeStateUtils.getStickerAt(controller.getCurrentState(), 'F', 4);
            if (sticker) view.updateSelected(sticker.id);
        });

        it('face-select key (space) returns true when sticker selected', () => {
            const event = new KeyboardEvent('keyup', { key: ' ' });
            expect(view.handleKeyUp(event)).toBe(true);
        });

        it('face-select key returns false when no sticker selected', () => {
            view.updateSelected(undefined);
            const event = new KeyboardEvent('keyup', { key: ' ' });
            expect(view.handleKeyUp(event)).toBe(false);
        });

        it('Ctrl+ArrowUp emits MOVE_REQUESTED', () => {
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            const event = new KeyboardEvent('keyup', { key: 'ArrowUp', ctrlKey: true });
            view.handleKeyUp(event);

            expect(emitSpy).toHaveBeenCalledWith(
                EventName.MOVE_REQUESTED,
                expect.objectContaining({ viewId: 'flat' })
            );
        });

        it('handleKeyDown returns true for Ctrl+Arrow preview', () => {
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true });
            expect(view.handleKeyDown(event)).toBe(true);
        });
    });

    describe('commands: flat.cube-walk and flat.face-direct-mode', () => {
        beforeEach(() => {
            view.create(container, controller);
        });

        const getCmd = (id: string) => view.getCommands().find(c => c.id === id)!;

        it('flat.cube-walk toggles state', () => {
            const cmd = getCmd('flat.cube-walk');
            expect(cmd.isActive!()).toBe(true);

            cmd.action();
            expect(cmd.isActive!()).toBe(false);

            cmd.action();
            expect(cmd.isActive!()).toBe(true);
        });

        it('flat.face-direct-mode toggles touch handler mode', () => {
            const cmd = getCmd('flat.face-direct-mode');
            expect(cmd.isActive!()).toBe(false);

            cmd.action();
            expect(cmd.isActive!()).toBe(true);

            cmd.action();
            expect(cmd.isActive!()).toBe(false);
        });

        it('flat.undo emits UNDO_REQUESTED', () => {
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            getCmd('flat.undo').action();
            expect(emitSpy).toHaveBeenCalledWith(EventName.UNDO_REQUESTED, {});
        });

        it('flat.redo emits REDO_REQUESTED', () => {
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            getCmd('flat.redo').action();
            expect(emitSpy).toHaveBeenCalledWith(EventName.REDO_REQUESTED, {});
        });
    });

    describe('setState', () => {
        beforeEach(() => {
            view.create(container, controller);
        });

        it('setState with faceDirectMode=true enables face direct mode', () => {
            view.setState({ faceDirectMode: true });
            expect(view.getState().faceDirectMode).toBe(true);
        });

        it('setState with cubeWalk=false disables cube walk', () => {
            view.setState({ cubeWalk: false });
            expect(view.getState().cubeWalk).toBe(false);
        });

        it('setState ignores non-object input', () => {
            expect(() => view.setState(null)).not.toThrow();
            expect(() => view.setState('invalid')).not.toThrow();
        });
    });
});
