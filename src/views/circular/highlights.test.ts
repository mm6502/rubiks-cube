import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StickerId } from '@/cube/types/sticker';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

import * as highlights from './highlights';
import { CircularCubeViewInternalData } from './circular-view';

describe('highlights helpers', () => {
    let state: CircularCubeViewInternalData;
    const styles = { highlighted: 'highlighted', selected: 'selected' };

    beforeEach(() => {
        state = {
            model: undefined,
            container: null,
            styles: {},
            svgRoot: undefined,
            svgReady: true,
            axisCircles: [],
            stickerLookupMap: new Map(),
            svgElementCache: new Map<string, SVGCircleElement>(),
            svgIdToStickerId: new Map<string, StickerId>(),
            stickerIdToSvgId: new Map<StickerId, string>(),
            animationChain: Promise.resolve(),
            axisAnimationChains: {
                X: Promise.resolve(),
                Y: Promise.resolve(),
                Z: Promise.resolve(),
            },
            cubeWalk: false,
            showGhosts: true,
            ghostOpacityIndex: 0,
            zoomPan: null,
            touchHandler: null,
            panMode: false,
        } as CircularCubeViewInternalData;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('removeSelectionHighlight clears selected class on all circles', () => {
        // Arrange
        const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c1.classList.add(styles.selected);
        c2.classList.add(styles.selected);

        state.svgElementCache.set('a', c1);
        state.svgElementCache.set('b', c2);

        // Act
        highlights.removeSelectionHighlight(state, styles);

        // Assert
        expect(c1.classList.contains(styles.selected)).toBe(false);
        expect(c2.classList.contains(styles.selected)).toBe(false);
    });

    it('updateHighlight removes prior highlights and adds highlight to target sticker', () => {
        // Arrange
        const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c1.classList.add(styles.highlighted);
        c2.classList.add(styles.highlighted);

        state.svgElementCache.set('svg1', c1);
        state.svgElementCache.set('svg2', c2);
        state.stickerIdToSvgId.set('stA' as StickerId, 'svg1');
        state.stickerIdToSvgId.set('stB' as StickerId, 'svg2');

        // Act
        highlights.updateHighlight(state, styles, 'stB' as StickerId);

        // Assert
        expect(c1.classList.contains(styles.highlighted)).toBe(false);
        expect(c2.classList.contains(styles.highlighted)).toBe(true);
    });

    it('updateHighlight with missing sticker id clears previous highlights and does not throw', () => {
        // Arrange
        const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c1.classList.add(styles.highlighted);
        state.svgElementCache.set('svg1', c1);

        // Act & Assert
        expect(() => highlights.updateHighlight(state, styles, 'nope' as StickerId)).not.toThrow();
        expect(c1.classList.contains(styles.highlighted)).toBe(false);
    });

    it('updateSelected sets currentSelected and updates classes appropriately', () => {
        // Arrange
        const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c1.classList.add(styles.selected); // previous selection

        state.svgElementCache.set('svg1', c1);
        state.svgElementCache.set('svg2', c2);
        state.stickerIdToSvgId.set('st1' as StickerId, 'svg1');
        state.stickerIdToSvgId.set('st2' as StickerId, 'svg2');

        // Act
        highlights.updateSelected(state, styles, 'st2' as StickerId);

        // Assert
        expect(state.currentSelected).toBe('st2');
        expect(c1.classList.contains(styles.selected)).toBe(false);
        expect(c2.classList.contains(styles.selected)).toBe(true);
    });

    it('updateSelected with undefined clears selection', () => {
        // Arrange
        const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c1.classList.add(styles.selected);

        state.svgElementCache.set('svg1', c1);
        state.stickerIdToSvgId.set('st1' as StickerId, 'svg1');
        state.currentSelected = 'st1' as any;

        // Act
        highlights.updateSelected(state, styles, undefined);

        // Assert
        expect(state.currentSelected).toBeUndefined();
        expect(c1.classList.contains(styles.selected)).toBe(false);
    });

    it('updateSelected sets currentSelected even if mapping missing and does not add class', () => {
        // Arrange
        const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('svg1', c1);

        // Act
        highlights.updateSelected(state, styles, 'missing' as any);

        // Assert
        expect(state.currentSelected).toBe('missing');
        // no element mapped for 'missing' so no class added
        expect(c1.classList.contains(styles.selected)).toBe(false);
    });

    it('updateHighlight with undefined highlightedSticker clears highlights and returns early', () => {
        const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c1.classList.add(styles.highlighted);
        state.svgElementCache.set('svg1', c1);

        highlights.updateHighlight(state, styles, undefined);

        expect(c1.classList.contains(styles.highlighted)).toBe(false);
    });

    it('updateSelected with model sets selectedFace and selectedPosition from sticker', () => {
        const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('svg1', c1);
        state.stickerIdToSvgId.set('st1' as StickerId, 'svg1');

        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            id: 'st1' as StickerId,
            currentFace: 'F' as any,
            facePosition: 4,
        } as any);

        state.model = { getCurrentState: () => ({}) as any } as any;

        highlights.updateSelected(state, styles, 'st1' as StickerId);

        expect(state.selectedFace).toBe('F');
        expect(state.selectedPosition).toBe(4);
        expect(state.currentSelected).toBe('st1');
    });
});
