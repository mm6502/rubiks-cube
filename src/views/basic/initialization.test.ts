// Unit tests for initialization.ts — scoped to the ghost-anchor wiring added
// for Basic 2's ghost stickers (U3): anchors must exist in the DOM by the
// time initialize() returns, alongside cubies.
// See docs/plans/2026-07-25-001-feat-basic-2-ghost-stickers-plan.md
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { StateManager } from '@/cube/core/state-manager';
import { Face } from '@/cube/types';
import type { ReadOnlyCubeModel } from '@/cube/types';
import { EventName } from '@/types';

import { destroy, initialize } from './initialization';

const styles: Record<string, string> = {
    cube: 'cube',
    'cube-container': 'cube-container',
    'cube-wrapper': 'cube-wrapper',
    cubie: 'cubie',
    sticker: 'sticker',
    front: 'front',
    back: 'back',
    right: 'right',
    left: 'left',
    top: 'top',
    bottom: 'bottom',
    'ghost-anchor-container': 'ghost-anchor-container',
    'ghost-anchor': 'ghost-anchor',
};

describe('initialization - ghost-anchor wiring', () => {
    let container: HTMLElement;
    let model: ReadOnlyCubeModel;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);

        const stateManager = new StateManager(3);
        model = {
            getCurrentState: () => stateManager.getCurrentState(),
        } as ReadOnlyCubeModel;
    });

    afterEach(() => {
        container.remove();
    });

    it('populates all six ghost-anchor elements by the time initialize() returns', () => {
        const state = initialize(container, model, styles, 'front', 'basic-front', () => {});

        const wrapper = state.cubeElement!.querySelector('.ghost-anchor-container');
        expect(wrapper).not.toBeNull();

        const anchors = wrapper!.querySelectorAll('[data-basic-face]');
        expect(anchors).toHaveLength(6);
        const faces = Array.from(anchors).map(el => el.getAttribute('data-basic-face'));
        expect(new Set(faces)).toEqual(new Set([Face.F, Face.B, Face.U, Face.D, Face.L, Face.R]));
    });

    it('stores the wrapper reference on the returned state as ghostAnchorContainer', () => {
        const state = initialize(container, model, styles, 'front', 'basic-front', () => {});

        expect(state.ghostAnchorContainer).not.toBeUndefined();
        expect(state.ghostAnchorContainer).toBe(
            state.cubeElement!.querySelector('.ghost-anchor-container')
        );
    });

    it('wires the sticker-selection callback into the rendered cubie stickers', () => {
        const onStickerSelected = vi.fn();
        const state = initialize(
            container,
            model,
            styles,
            'front',
            'basic-front',
            onStickerSelected
        );

        const sticker = state.cubeElement!.querySelector('[data-sticker-id]') as HTMLElement | null;
        expect(sticker).not.toBeNull();

        sticker!.click();

        expect(onStickerSelected).toHaveBeenCalledTimes(1);
        expect(onStickerSelected).toHaveBeenCalledWith(sticker!.getAttribute('data-sticker-id'));
    });

    it('emits highlight-change events for sticker hover and hover exit', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const state = initialize(container, model, styles, 'front', 'basic-front', () => {});

        const sticker = state.cubeElement!.querySelector('[data-sticker-id]') as HTMLElement;
        sticker.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.HIGHLIGHT_CHANGED,
            expect.objectContaining({
                stickerId: sticker.getAttribute('data-sticker-id'),
                viewId: 'basic-front',
            })
        );

        const outside = document.createElement('div');
        document.body.appendChild(outside);
        state.cubeElement!.dispatchEvent(
            new MouseEvent('mouseout', { bubbles: true, relatedTarget: outside })
        );

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.HIGHLIGHT_CHANGED,
            expect.objectContaining({ stickerId: undefined, viewId: 'basic-front' })
        );
        outside.remove();
    });

    it('removes the cube element from the DOM when the state is destroyed', () => {
        const state = initialize(container, model, styles, 'front', 'basic-front', () => {});
        const cubeElement = state.cubeElement!;

        expect(document.body.contains(cubeElement)).toBe(true);

        destroy(state);

        expect(document.body.contains(cubeElement)).toBe(false);
    });

    it('does not throw when the container has zero size (fallback anchor-init path)', () => {
        // container stays detached-with-zero-size by not appending to body,
        // so clientWidth/clientHeight are 0 and updateSize's fallback default applies.
        const detachedContainer = document.createElement('div');
        expect(() =>
            initialize(detachedContainer, model, styles, 'front', 'basic-front', () => {})
        ).not.toThrow();
    });
});
