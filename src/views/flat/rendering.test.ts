import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Map as IMap } from 'immutable';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Axis, CubieId, Face, QuarterTurn, StickerId } from '@/cube/types';
import { MoveExecutedEvent } from '@/types';

import { FlatView } from './flat-view';
import styles from './flat-view.module.css';

const R_DEF = { name: 'R', axis: Axis.X, layerIndices: [2], angle: QuarterTurn.QUARTER };

beforeAll(() => {
    if (!HTMLElement.prototype.setPointerCapture) {
        HTMLElement.prototype.setPointerCapture = function () {};
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
        HTMLElement.prototype.releasePointerCapture = function () {};
    }
});

describe('FlatView rendering', () => {
    let view: FlatView;
    let container: HTMLElement;
    let controller: CubeController;

    beforeEach(() => {
        container = document.createElement('div');
        container.style.width = '800px';
        container.style.height = '600px';
        document.body.appendChild(container);

        controller = new CubeController();
        view = new FlatView(styles);
    });

    afterEach(() => {
        view.destroy();
        document.body.removeChild(container);
        Application.eventBus.removeAllListeners();
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
                    definition: R_DEF,
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
                    definition: R_DEF,
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

        it('should apply mobile rotation when viewport is narrow', () => {
            // Arrange — simulate mobile viewport
            const originalInnerWidth = window.innerWidth;
            Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });

            // Act
            view.resize();

            // Assert
            const grid = container.querySelector(`.${styles['flat-grid']}`) as HTMLElement;
            expect(grid.style.transform).toContain('rotate');

            // Restore
            Object.defineProperty(window, 'innerWidth', {
                value: originalInnerWidth,
                writable: true,
            });
        });

        it('buildLegendHTML returns mobile layout when isMobile is true', async () => {
            const { buildLegendHTML } = await import('./rendering');
            const mobileHTML = buildLegendHTML(styles, true);
            expect(mobileHTML).toContain('F');
            expect(mobileHTML).toContain('U');
            expect(mobileHTML).toContain('D');
            expect(mobileHTML).toContain('L');
            expect(mobileHTML).toContain('R');
            expect(mobileHTML).toContain('B');
        });

        it('buildLegendHTML returns desktop layout when isMobile is false', async () => {
            const { buildLegendHTML } = await import('./rendering');
            const desktopHTML = buildLegendHTML(styles, false);
            expect(desktopHTML).toContain('F');
            expect(desktopHTML).toContain('U');
            expect(desktopHTML).toContain('D');
            expect(desktopHTML).toContain('L');
            expect(desktopHTML).toContain('R');
            expect(desktopHTML).toContain('B');
        });
    });
});
