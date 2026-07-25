// Unit tests for initialization.ts — scoped to the ghost-anchor wiring added
// for Basic 2's ghost stickers (U3): anchors must exist in the DOM by the
// time initialize() returns, alongside cubies and blockers.
// See docs/plans/2026-07-25-001-feat-basic-2-ghost-stickers-plan.md
import { beforeEach, describe, expect, it } from 'vitest';

import { StateManager } from '@/cube/core/state-manager';
import { Face } from '@/cube/types';
import type { ReadOnlyCubeModel } from '@/cube/types';

import { initialize } from './initialization';

const styles: Record<string, string> = {
    cube: 'cube',
    'cube-container': 'cube-container',
    'cube-wrapper': 'cube-wrapper',
    cubie: 'cubie',
    sticker: 'sticker',
    'cube-blocker': 'cube-blocker',
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

    it('populates all six ghost-anchor elements by the time initialize() returns', () => {
        const state = initialize(container, model, styles, 'front', 'basic-2-front', () => {});

        const wrapper = state.cubeElement!.querySelector('.ghost-anchor-container');
        expect(wrapper).not.toBeNull();

        const anchors = wrapper!.querySelectorAll('[data-basic-face]');
        expect(anchors).toHaveLength(6);
        const faces = Array.from(anchors).map(el => el.getAttribute('data-basic-face'));
        expect(new Set(faces)).toEqual(new Set([Face.F, Face.B, Face.U, Face.D, Face.L, Face.R]));
    });

    it('stores the wrapper reference on the returned state as ghostAnchorContainer', () => {
        const state = initialize(container, model, styles, 'front', 'basic-2-front', () => {});

        expect(state.ghostAnchorContainer).not.toBeUndefined();
        expect(state.ghostAnchorContainer).toBe(
            state.cubeElement!.querySelector('.ghost-anchor-container')
        );
    });

    it('does not throw when the container has zero size (fallback anchor-init path)', () => {
        // container stays detached-with-zero-size by not appending to body,
        // so clientWidth/clientHeight are 0 and updateSize's fallback default applies.
        const detachedContainer = document.createElement('div');
        expect(() =>
            initialize(detachedContainer, model, styles, 'front', 'basic-2-front', () => {})
        ).not.toThrow();
    });
});
