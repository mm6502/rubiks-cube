import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Map as IMap } from 'immutable';

import { Color, ColorMap, CubeState, Face, StickerId } from '@/cube/types';
import { CubieType, Position3D } from '@/cube/types/cubie';
import { getPositionKey } from '@/cube/utils';

import * as animations from './animations';
import * as highlights from './highlights';
import * as rendering from './rendering';
import { CircularCubeViewInternalData } from './circular-view';
import { AxisCircle } from './svg-tools';

describe('rendering utilities', () => {
    let state: CircularCubeViewInternalData;

    beforeEach(() => {
        state = {
            model: undefined,
            container: null,
            styles: {},
            svgRoot: undefined,
            svgReady: true,
            axisCircles: [] as AxisCircle[],
            stickerLookupMap: new Map(),
            svgElementCache: new Map<string, SVGCircleElement>(),
            svgIdToStickerId: new Map<string, StickerId>(),
            stickerIdToSvgId: new Map<StickerId, string>(),
            animationChain: Promise.resolve(),
        } as unknown as CircularCubeViewInternalData;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('setStickerFillById sets the fill attribute when element exists', () => {
        // Arrange
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('s1', circle);

        // Act
        rendering.setStickerFillById(state, 's1', '#abc');

        // Assert
        expect(circle.getAttribute('fill')).toBe('#abc');
    });

    it('renderState updates fills and mappings from cube state', () => {
        // Arrange
        // create svg element
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('svg1', circle);

        // Create a cubie with one sticker
        const position: Position3D = { x: 0, y: 1, z: 0 } as any;
        const cubie: any = {
            type: CubieType.CORNER,
            position,
            stickers: new Map([
                [
                    Face.U,
                    {
                        id: 'st1',
                        currentFace: Face.U,
                        facePosition: 0,
                        color: Color.WHITE,
                    },
                ],
            ]),
        };

        const posKey = getPositionKey(position, 3);
        const faceMap = new Map<Face, string>();
        faceMap.set(Face.U, 'svg1');
        state.stickerLookupMap!.set(posKey, faceMap);

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: new Map().set('c1', cubie) as any,
            cubiesByPosition: new Map() as any,
            timestamp: 0,
        } as any;

        // Act
        rendering.renderState(state, cubeState);

        // Assert
        expect(circle.getAttribute('fill')).toBe(ColorMap[Color.WHITE]);
        expect(circle.getAttribute('data-sticker-id')).toBe('st1');
        expect(state.svgIdToStickerId.get('svg1')).toBe('st1');
        expect(state.stickerIdToSvgId.get('st1' as StickerId)).toBe('svg1');
    });

    it('updateStickerMappings updates data-sticker-id and reverse maps', () => {
        // Arrange
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('svg1', circle);

        const position: Position3D = { x: 0, y: 1, z: 0 } as any;
        const cubie: any = {
            type: CubieType.EDGE,
            position,
            stickers: new Map([[Face.F, { id: 'sF', currentFace: Face.F, facePosition: 0 }]]),
        };

        const posKey = getPositionKey(position, 3);
        const faceMap = new Map<Face, string>();
        faceMap.set(Face.F, 'svg1');
        state.stickerLookupMap!.set(posKey, faceMap);

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap().set('cX', cubie) as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        // Act
        rendering.updateStickerMappings(state, cubeState);

        // Assert
        expect(circle.getAttribute('data-sticker-id')).toBe('sF');
        expect(state.svgIdToStickerId.get('svg1')).toBe('sF');
        expect(state.stickerIdToSvgId.get('sF' as StickerId)).toBe('svg1');
    });

    it('updateSelective without movedCubies completes without error', async () => {
        // Arrange
        const event: any = {
            moveDetails: { movedCubies: { after: [] } },
            preState: { cubeSize: 3, cubiesById: IMap() } as any,
            postState: { cubeSize: 3, cubiesById: IMap() } as any,
        };

        // Act & Assert - ensure it resolves and doesn't throw
        await expect(rendering.updateSelective(state, event)).resolves.toBeUndefined();
    });

    it('updateSelective animated delegates to animateMove and updates selection', async () => {
        // Arrange
        const animSpy = vi.spyOn(animations, 'animateMove').mockResolvedValue(undefined as any);

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        state.svgElementCache.set('svg1', circle);

        const position: Position3D = { x: 0, y: 1, z: 0 } as any;
        const cubie: any = {
            type: CubieType.CORNER,
            position,
            stickers: new Map([['s1', { id: 's1', currentFace: Face.U, facePosition: 0 }]]),
        };
        const posKey = getPositionKey(position, 3);
        state.stickerLookupMap!.set(posKey, new Map([[Face.U, 'svg1']]));

        const preState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap().set('c1', cubie) as any,
            cubiesByPosition: IMap(),
            timestamp: 0,
        } as any;
        const postState = preState;

        const event: any = {
            moveDetails: { movedCubies: { after: [{}] } },
            preState,
            postState,
        };

        // Set current selection in state so updateSelective can compute stickerBefore/after
        state.currentSelected = 's1' as StickerId;

        const removeSpy = vi
            .spyOn(highlights, 'removeSelectionHighlight')
            .mockImplementation(() => {});
        const updateSelectedSpy = vi
            .spyOn(highlights, 'updateSelected')
            .mockImplementation(() => {});

        // Act
        await rendering.updateSelective(state, event);

        // Assert
        expect(animSpy).toHaveBeenCalled();
        expect(removeSpy).toHaveBeenCalledWith(state, state.styles);
        expect(updateSelectedSpy).toHaveBeenCalledWith(state, state.styles, 's1');
    });

    it('setStickerFillById is a no-op when element not in cache', () => {
        expect(() => rendering.setStickerFillById(state, 'missing', '#fff')).not.toThrow();
    });

    it('renderState returns early when svgReady is false', () => {
        state.svgReady = false;
        const cubeState = { cubeSize: 3, cubiesById: IMap() } as any;
        expect(() => rendering.renderState(state, cubeState)).not.toThrow();
        // no fills set
        expect(state.svgIdToStickerId.size).toBe(0);
    });

    it('renderState uses FACE_COLORS fallback when sticker color is undefined', () => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('svg1', circle);

        const position: Position3D = { x: 0, y: 1, z: 0 } as any;
        const cubie: any = {
            type: CubieType.CORNER,
            position,
            stickers: new Map([
                [
                    Face.U,
                    {
                        id: 'st-nocolor',
                        currentFace: Face.U,
                        facePosition: 0,
                        color: undefined, // triggers FACE_COLORS fallback
                    },
                ],
            ]),
        };

        const posKey = getPositionKey(position, 3);
        state.stickerLookupMap!.set(posKey, new Map([[Face.U, 'svg1']]));

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap().set('c1', cubie) as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        rendering.renderState(state, cubeState);

        // Color should be non-empty (a hex string from FACE_COLORS)
        const fill = circle.getAttribute('fill');
        expect(fill).toBeTruthy();
        expect(fill).toMatch(/^#/);
    });

    it('updateSelective with svgRoot=null falls back to renderState (no throw)', async () => {
        state.svgRoot = undefined as any;
        state.svgReady = true;
        state.stickerLookupMap = new Map();

        // Set up a sticker so renderState would set a fill if called
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('svg1', circle);

        const position: Position3D = { x: 0, y: 1, z: 0 } as any;
        const cubie: any = {
            type: CubieType.CORNER,
            position,
            stickers: new Map([
                [Face.U, { id: 'st9', currentFace: Face.U, facePosition: 0, color: Color.WHITE }],
            ]),
        };
        state.stickerLookupMap!.set(getPositionKey(position, 3), new Map([[Face.U, 'svg1']]));

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap().set('c1', cubie) as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        const event: any = {
            moveDetails: { movedCubies: { after: [{}] } },
            preState: cubeState,
            postState: cubeState,
        };

        await expect(rendering.updateSelective(state, event)).resolves.toBeUndefined();
        // renderState path was taken: fill attribute set on the circle
        expect(circle.getAttribute('fill')).toBe(ColorMap[Color.WHITE]);
    });
});
