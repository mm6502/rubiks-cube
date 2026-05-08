import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Face, StickerId } from '@/cube/types';
import { EventName } from '@/types';

import * as rendering from './rendering';
import {
    attachContainerListeners,
    attachStickerListeners,
    buildCubeElement,
    buildCubeFace,
    destroy,
    handleStickerMouseOut,
    handleStickerMouseOver,
    initialize,
} from './initialization';

// Minimal styles stub — CSS modules return empty strings in JSDOM.
const styles: Record<string, string> = {};

describe('basic/initialization', () => {
    afterEach(() => {
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // handleStickerMouseOver
    // -------------------------------------------------------------------------

    describe('handleStickerMouseOver', () => {
        it('should emit HIGHLIGHT_CHANGED with the sticker id from the element', () => {
            // Arrange
            const el = document.createElement('div');
            el.setAttribute('data-sticker-id', 'F4');
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');

            // Act
            handleStickerMouseOver(el, 'basic-front');

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.HIGHLIGHT_CHANGED, {
                stickerId: 'F4',
                viewId: 'basic-front',
            });
        });

        it('should emit HIGHLIGHT_CHANGED with null when element has no data-sticker-id', () => {
            // Arrange
            const el = document.createElement('div');
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');

            // Act
            handleStickerMouseOver(el, 'basic-front');

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.HIGHLIGHT_CHANGED, {
                stickerId: null,
                viewId: 'basic-front',
            });
        });
    });

    // -------------------------------------------------------------------------
    // handleStickerMouseOut
    // -------------------------------------------------------------------------

    describe('handleStickerMouseOut', () => {
        it('should emit HIGHLIGHT_CHANGED with undefined sticker id', () => {
            // Arrange
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');

            // Act
            handleStickerMouseOut('basic-front');

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.HIGHLIGHT_CHANGED, {
                stickerId: undefined,
                viewId: 'basic-front',
            });
        });
    });

    // -------------------------------------------------------------------------
    // attachStickerListeners
    // -------------------------------------------------------------------------

    describe('attachStickerListeners', () => {
        it('should call onStickerSelected with the sticker id on click', () => {
            // Arrange
            const el = document.createElement('div');
            el.setAttribute('data-sticker-id', 'F4' as StickerId);
            const onSelected = vi.fn();

            // Act
            attachStickerListeners(el, 'basic-front', onSelected);
            el.dispatchEvent(new MouseEvent('click'));

            // Assert
            expect(onSelected).toHaveBeenCalledWith('F4');
        });

        it('should emit HIGHLIGHT_CHANGED on mouseover via the element', () => {
            // Arrange
            const el = document.createElement('div');
            el.setAttribute('data-sticker-id', 'R7' as StickerId);
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');

            // Act
            attachStickerListeners(el, 'basic-back', vi.fn());
            el.dispatchEvent(new MouseEvent('mouseover'));

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.HIGHLIGHT_CHANGED, {
                stickerId: 'R7',
                viewId: 'basic-back',
            });
        });

        it('should emit HIGHLIGHT_CHANGED with undefined on mouseout', () => {
            // Arrange
            const el = document.createElement('div');
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');

            // Act
            attachStickerListeners(el, 'basic-front', vi.fn());
            el.dispatchEvent(new MouseEvent('mouseout'));

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.HIGHLIGHT_CHANGED, {
                stickerId: undefined,
                viewId: 'basic-front',
            });
        });
    });

    // -------------------------------------------------------------------------
    // buildCubeFace
    // -------------------------------------------------------------------------

    describe('buildCubeFace', () => {
        let model: CubeController;

        beforeEach(() => {
            model = new CubeController();
        });

        it('should set data-face attribute on the blocker', () => {
            // Act
            const { blocker } = buildCubeFace(
                Face.F,
                'front',
                model,
                styles,
                'basic-front',
                vi.fn()
            );

            // Assert
            expect(blocker.getAttribute('data-face')).toBe('front');
        });

        it('should create sticker elements per face equal to cubeSize * cubeSize', () => {
            // Act
            const { faceDiv } = buildCubeFace(Face.U, 'top', model, styles, 'basic-front', vi.fn());

            // Assert: 3×3 = 9 stickers
            expect(faceDiv.querySelectorAll('[data-sticker-id]').length).toBe(9);
        });

        it('should create 4 stickers per face for a 2×2 model', () => {
            // Arrange
            const model2 = new CubeController(2);

            // Act
            const { faceDiv } = buildCubeFace(
                Face.U,
                'top',
                model2,
                styles,
                'basic-front',
                vi.fn()
            );

            // Assert
            expect(faceDiv.querySelectorAll('[data-sticker-id]').length).toBe(4);
        });

        it('should create 16 stickers per face for a 4×4 model', () => {
            // Arrange
            const model4 = new CubeController(4);

            // Act
            const { faceDiv } = buildCubeFace(
                Face.U,
                'top',
                model4,
                styles,
                'basic-front',
                vi.fn()
            );

            // Assert
            expect(faceDiv.querySelectorAll('[data-sticker-id]').length).toBe(16);
        });

        it('should attach sticker ids to each sticker element', () => {
            // Act
            const { faceDiv } = buildCubeFace(
                Face.F,
                'front',
                model,
                styles,
                'basic-front',
                vi.fn()
            );
            const ids = Array.from(faceDiv.querySelectorAll('[data-sticker-id]')).map(el =>
                el.getAttribute('data-sticker-id')
            );

            // Assert
            expect(ids.every(id => id && id.length > 0)).toBe(true);
        });

        it('should call onStickerSelected when a sticker is clicked', () => {
            // Arrange
            const onSelected = vi.fn();

            // Act
            const { faceDiv } = buildCubeFace(
                Face.F,
                'front',
                model,
                styles,
                'basic-front',
                onSelected
            );
            const firstSticker = faceDiv.querySelector('[data-sticker-id]') as HTMLElement;
            firstSticker.dispatchEvent(new MouseEvent('click'));

            // Assert
            expect(onSelected).toHaveBeenCalledTimes(1);
        });

        it('should set data-basic-pos on each sticker element for a 4×4 face', () => {
            // Arrange
            const model4 = new CubeController(4);

            // Act
            const { faceDiv } = buildCubeFace(
                Face.F,
                'front',
                model4,
                styles,
                'basic-front',
                vi.fn()
            );
            const positions = Array.from(faceDiv.querySelectorAll('[data-basic-pos]')).map(el =>
                el.getAttribute('data-basic-pos')
            );

            // Assert
            expect(positions.length).toBe(16);
            expect(positions.every(p => p !== null)).toBe(true);
            expect(new Set(positions).size).toBe(16); // all unique
        });
    });

    // -------------------------------------------------------------------------
    // buildCubeElement
    // -------------------------------------------------------------------------

    describe('buildCubeElement', () => {
        it('should set the element id to viewType', () => {
            // Arrange
            const model = new CubeController();

            // Act
            const el = buildCubeElement(model, styles, 'basic-front', vi.fn());

            // Assert
            expect(el.id).toBe('basic-front');
        });

        it('should include the correct number of sticker elements for any cube size', () => {
            // Arrange
            const model = new CubeController();

            // Act
            const el = buildCubeElement(model, styles, 'basic-front', vi.fn());

            // Assert: 3×3 = 6 faces × 9 stickers = 54
            expect(el.querySelectorAll('[data-sticker-id]').length).toBe(54);
        });

        it('should include 96 sticker elements for a 4×4 model (6 faces × 16)', () => {
            // Arrange
            const model4 = new CubeController(4);

            // Act
            const el = buildCubeElement(model4, styles, 'basic-front', vi.fn());

            // Assert
            expect(el.querySelectorAll('[data-sticker-id]').length).toBe(96);
        });

        it('should include 6 blockers (one per face)', () => {
            // Arrange
            const model = new CubeController();

            // Act
            const el = buildCubeElement(model, styles, 'basic-front', vi.fn());

            // Assert — each face produces one blocker with data-face attribute
            expect(el.querySelectorAll('[data-face]').length).toBe(6);
        });
    });

    // -------------------------------------------------------------------------
    // attachContainerListeners
    // -------------------------------------------------------------------------

    describe('attachContainerListeners', () => {
        let container: HTMLElement;
        let cubeElement: HTMLElement;
        let state: any;

        beforeEach(() => {
            container = document.createElement('div');
            document.body.appendChild(container);
            cubeElement = document.createElement('div');
            container.appendChild(cubeElement);

            state = {
                viewType: 'basic-front',
                isHovered: false,
                cubeElement,
                container,
                styles: {},
                isTilted: false,
                isPitched: false,
                yRotation: 0,
                xRotation: 0,
                zRotation: 0,
            };

            vi.spyOn(rendering, 'updateRotation').mockImplementation(() => {});
        });

        afterEach(() => {
            document.body.removeChild(container);
        });

        it('should emit VIEW_INTERACTED and focus container on mouseenter', () => {
            // Arrange
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            const focusSpy = vi.spyOn(container, 'focus');
            attachContainerListeners(container, cubeElement, state);

            // Act
            container.dispatchEvent(new MouseEvent('mouseenter'));

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_INTERACTED, {
                viewId: 'basic-front',
            });
            expect(focusSpy).toHaveBeenCalled();
        });

        it('should not emit MOVE_REQUESTED on cube mousedown with data-face target', () => {
            // Arrange — the old tentative move system has been replaced by BasicTouchHandler.
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            const blocker = document.createElement('div');
            blocker.setAttribute('data-face', 'front');
            cubeElement.appendChild(blocker);
            attachContainerListeners(container, cubeElement, state);

            // Act
            blocker.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

            // Assert — no MOVE_REQUESTED from attachContainerListeners itself
            expect(emitSpy).not.toHaveBeenCalledWith(EventName.MOVE_REQUESTED, expect.anything());
        });

        it('should not emit MOVE_REQUESTED on mousedown when target has no data-face', () => {
            // Arrange
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            attachContainerListeners(container, cubeElement, state);

            // Act
            cubeElement.dispatchEvent(new MouseEvent('mousedown'));

            // Assert
            expect(emitSpy).not.toHaveBeenCalled();
            expect(state.pendingMoveFace).toBeUndefined();
        });

        it('should not emit MOVE_REQUESTED on mouseup (move handling is done by BasicTouchHandler)', () => {
            // Arrange
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            attachContainerListeners(container, cubeElement, state);

            // Act
            cubeElement.dispatchEvent(new MouseEvent('mouseup'));

            // Assert
            expect(emitSpy).not.toHaveBeenCalledWith(EventName.MOVE_REQUESTED, expect.anything());
        });

        it('should not emit on mouseup when no pending state', () => {
            // Arrange
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            attachContainerListeners(container, cubeElement, state);

            // Act
            cubeElement.dispatchEvent(new MouseEvent('mouseup'));

            // Assert
            expect(emitSpy).not.toHaveBeenCalled();
        });

        it('should set isHovered to true on cube mouseenter', () => {
            // Arrange
            attachContainerListeners(container, cubeElement, state);

            // Act
            cubeElement.dispatchEvent(new MouseEvent('mouseenter'));

            // Assert
            expect(state.isHovered).toBe(true);
            expect(rendering.updateRotation).toHaveBeenCalledWith(state);
        });

        it('should set isHovered to false on cube mouseleave', () => {
            // Arrange
            state.isHovered = true;
            attachContainerListeners(container, cubeElement, state);

            // Act
            cubeElement.dispatchEvent(new MouseEvent('mouseleave'));

            // Assert
            expect(state.isHovered).toBe(false);
            expect(rendering.updateRotation).toHaveBeenCalledWith(state);
        });

        it('should emit VIEW_INTERACTED on cube click', () => {
            // Arrange
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            attachContainerListeners(container, cubeElement, state);

            // Act
            cubeElement.dispatchEvent(new MouseEvent('click'));

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_INTERACTED, {
                viewId: 'basic-front',
            });
        });
    });

    // -------------------------------------------------------------------------
    // initialize
    // -------------------------------------------------------------------------

    describe('initialize', () => {
        let container: HTMLElement;
        let model: CubeController;

        beforeEach(() => {
            container = document.createElement('div');
            container.style.width = '400px';
            container.style.height = '400px';
            document.body.appendChild(container);
            model = new CubeController();
        });

        afterEach(() => {
            document.body.removeChild(container);
        });

        it('should return a state object with correct viewType and variant', () => {
            // Act
            const state = initialize(container, model, styles, 'front', 'basic-front', vi.fn());

            // Assert
            expect(state.viewType).toBe('basic-front');
            expect(state.variant).toBe('front');
        });

        it('should create cubeElement inside the container', () => {
            // Act
            const state = initialize(container, model, styles, 'front', 'basic-front', vi.fn());

            // Assert
            expect(container.contains(state.cubeElement)).toBe(true);
        });

        it('should set container tabIndex to 0', () => {
            // Act
            initialize(container, model, styles, 'front', 'basic-front', vi.fn());

            // Assert
            expect(container.tabIndex).toBe(0);
        });

        it('should reuse existing .cube-container if present', () => {
            // Arrange
            const existingContainer = document.createElement('div');
            existingContainer.className = 'cube-container';
            container.appendChild(existingContainer);

            // Act
            initialize(container, model, styles, 'front', 'basic-front', vi.fn());

            // Assert — there is still only one .cube-container
            expect(container.querySelectorAll('.cube-container').length).toBe(1);
        });
    });

    // -------------------------------------------------------------------------
    // destroy
    // -------------------------------------------------------------------------

    describe('destroy', () => {
        it('should remove the cubeElement from the DOM', () => {
            // Arrange
            const parent = document.createElement('div');
            const cubeElement = document.createElement('div');
            parent.appendChild(cubeElement);
            document.body.appendChild(parent);

            // Act
            destroy({ cubeElement } as any);

            // Assert
            expect(parent.contains(cubeElement)).toBe(false);
            document.body.removeChild(parent);
        });

        it('should not throw when cubeElement is null or undefined', () => {
            // Act & Assert
            expect(() => destroy({ cubeElement: null } as any)).not.toThrow();
            expect(() => destroy({ cubeElement: undefined } as any)).not.toThrow();
        });
    });
});
