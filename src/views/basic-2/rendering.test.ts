// Unit tests for rendering.ts — scoped to initializeGhostAnchors, the new
// ghost-anchor wrapper/host lifecycle added for Basic 2's ghost stickers.
// See docs/plans/2026-07-25-001-feat-basic-2-ghost-stickers-plan.md
import { beforeEach, describe, expect, it } from 'vitest';

import { Face } from '@/cube/types';

import { getLayerCubieElements } from './animations';
import type { BasicViewInternalData } from './basic-2-view';
import { initializeGhostAnchors } from './rendering';

const styles: Record<string, string> = {
    'ghost-anchor-container': 'ghost-anchor-container',
    'ghost-anchor': 'ghost-anchor',
    sticker: 'sticker',
};

function makeState(cubeElement: HTMLElement): BasicViewInternalData {
    return {
        model: undefined,
        container: document.createElement('div'),
        cubeElement,
        cubeContainer: null,
        styles,
        stickerClass: 'sticker',
        highlightedClass: 'highlighted',
        variant: 'front',
        viewType: 'basic-2-front',
        viewRight: { x: 1, y: 0, z: 0 },
        viewUp: { x: 0, y: 1, z: 0 },
        viewForward: { x: 0, y: 0, z: 1 },
        isTilted: false,
        isPitched: false,
        isHovered: false,
        layoutMode: 'floating',
        currentSelected: undefined,
    };
}

describe('rendering - initializeGhostAnchors', () => {
    let cubeElement: HTMLElement;
    let state: BasicViewInternalData;

    beforeEach(() => {
        cubeElement = document.createElement('div');
        state = makeState(cubeElement);
    });

    it('does nothing when cubeElement is null', () => {
        const nullState = makeState(cubeElement);
        nullState.cubeElement = null;
        expect(() => initializeGhostAnchors(nullState, 300)).not.toThrow();
    });

    it('creates one wrapper with six anchors tagged by Face, sized to the cube', () => {
        initializeGhostAnchors(state, 300);

        const wrapper = cubeElement.querySelector('.ghost-anchor-container');
        expect(wrapper).not.toBeNull();

        const anchors = wrapper!.querySelectorAll('[data-basic-face]');
        expect(anchors).toHaveLength(6);

        const faces = Array.from(anchors).map(el => el.getAttribute('data-basic-face'));
        expect(new Set(faces)).toEqual(new Set([Face.F, Face.B, Face.U, Face.D, Face.L, Face.R]));

        anchors.forEach(el => {
            const anchor = el as HTMLElement;
            expect(anchor.hasAttribute('data-basic-pos')).toBe(false);
            expect(anchor.style.width).toBe('300px');
            expect(anchor.style.height).toBe('300px');
        });
    });

    it('applies the expected per-face transform at halfSize = size / 2', () => {
        initializeGhostAnchors(state, 300);

        const anchorFor = (face: Face) =>
            cubeElement.querySelector(`[data-basic-face="${face}"]`) as HTMLElement;

        expect(anchorFor(Face.F).style.transform).toBe('translateZ(150px)');
        expect(anchorFor(Face.B).style.transform).toBe('rotateY(180deg) translateZ(150px)');
        expect(anchorFor(Face.R).style.transform).toBe('rotateY(90deg) translateZ(150px)');
        expect(anchorFor(Face.L).style.transform).toBe('rotateY(-90deg) translateZ(150px)');
        expect(anchorFor(Face.U).style.transform).toBe('rotateX(90deg) translateZ(150px)');
        expect(anchorFor(Face.D).style.transform).toBe('rotateX(-90deg) translateZ(150px)');
    });

    it('does not duplicate anchors or wrappers when called twice', () => {
        initializeGhostAnchors(state, 300);
        initializeGhostAnchors(state, 300);

        expect(cubeElement.querySelectorAll('.ghost-anchor-container')).toHaveLength(1);
        expect(cubeElement.querySelectorAll('[data-basic-face]')).toHaveLength(6);
    });

    it('updates size and transform when resized', () => {
        initializeGhostAnchors(state, 300);
        initializeGhostAnchors(state, 450);

        const anchorF = cubeElement.querySelector('[data-basic-face="F"]') as HTMLElement;
        expect(anchorF.style.width).toBe('450px');
        expect(anchorF.style.height).toBe('450px');
        expect(anchorF.style.transform).toBe('translateZ(225px)');
        expect(cubeElement.querySelectorAll('[data-basic-face]')).toHaveLength(6);
    });

    it('stores the wrapper reference on state.ghostAnchorContainer', () => {
        initializeGhostAnchors(state, 300);

        expect(state.ghostAnchorContainer).not.toBeUndefined();
        expect(state.ghostAnchorContainer).toBe(
            cubeElement.querySelector('.ghost-anchor-container')
        );
    });

    it('is excluded from getLayerCubieElements, which only matches [data-cubie-id]', () => {
        initializeGhostAnchors(state, 300);

        // No cubie elements exist, only anchors — a lookup by any cubie id
        // must never accidentally resolve to an anchor.
        const result = getLayerCubieElements(['cubie_1'], cubeElement);
        expect(result).toEqual([]);

        // Anchors themselves never carry data-cubie-id.
        cubeElement.querySelectorAll('[data-basic-face]').forEach(el => {
            expect(el.hasAttribute('data-cubie-id')).toBe(false);
        });
    });

    it('scopes the shared query so it resolves to the anchor even when a stray sticker div shares the same attribute shape', () => {
        // Simulate a cubie sticker div sitting directly under cubeElement,
        // sharing data-basic-face with no data-basic-pos — the exact shape
        // GhostStickers queries for. It is NOT inside the wrapper.
        const strayStickerDiv = document.createElement('div');
        strayStickerDiv.className = 'sticker';
        strayStickerDiv.setAttribute('data-basic-face', Face.F);
        cubeElement.appendChild(strayStickerDiv);

        initializeGhostAnchors(state, 300);

        const wrapper = state.ghostAnchorContainer!;
        const resolved = wrapper.querySelector(
            '[data-basic-face="F"]:not([data-basic-pos])'
        ) as HTMLElement;

        expect(resolved).not.toBeNull();
        expect(resolved).not.toBe(strayStickerDiv);
        expect(resolved.classList.contains('ghost-anchor')).toBe(true);
    });
});
