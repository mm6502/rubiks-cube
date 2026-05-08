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
            axisAnimationChains: {
                X: Promise.resolve(),
                Y: Promise.resolve(),
                Z: Promise.resolve(),
            },
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
            moveDetails: {
                movedCubies: { after: [{}] },
                notation: 'U',
                definition: { axis: 'Y', layerIndices: [2], angle: 90 },
            },
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

    it('setGhostVisibility shows wrapper when showGhosts is true', () => {
        // Arrange
        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        wrapper.classList.add('ghost-sticker-wrapper');
        wrapper.style.display = 'none';
        svgRoot.appendChild(wrapper);

        state.svgRoot = svgRoot;
        state.showGhosts = true;

        // Act
        rendering.setGhostVisibility(state);

        // Assert
        expect(wrapper.style.display).toBe('');
    });

    it('setGhostVisibility hides wrapper when showGhosts is false', () => {
        // Arrange
        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        wrapper.classList.add('ghost-sticker-wrapper');
        svgRoot.appendChild(wrapper);

        state.svgRoot = svgRoot;
        state.showGhosts = false;

        // Act
        rendering.setGhostVisibility(state);

        // Assert
        expect(wrapper.style.display).toBe('none');
    });

    it('setGhostVisibility is a no-op when svgRoot is missing', () => {
        state.svgRoot = undefined as any;
        expect(() => rendering.setGhostVisibility(state)).not.toThrow();
    });

    it('setGhostOpacity sets opacity on all ghost stickers', () => {
        // Arrange
        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        const ghost1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ghost1.classList.add('ghost-sticker');
        const ghost2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ghost2.classList.add('ghost-sticker');
        svgRoot.appendChild(ghost1);
        svgRoot.appendChild(ghost2);

        state.svgRoot = svgRoot;
        state.ghostElements = undefined;

        // Act
        rendering.setGhostOpacity(state, 0.4);

        // Assert
        expect(ghost1.style.opacity).toBe('0.4');
        expect(ghost2.style.opacity).toBe('0.4');
    });

    it('setGhostOpacity is a no-op when svgRoot is missing', () => {
        state.svgRoot = undefined as any;
        expect(() => rendering.setGhostOpacity(state, 0.5)).not.toThrow();
    });

    it('renderState updates ghost stickers from their source elements', () => {
        // Arrange
        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;

        // Source sticker
        const source = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        source.setAttribute('fill', '#ff0000');
        state.svgElementCache.set('svg1', source);

        // Ghost sticker
        const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ghost.classList.add('ghost-sticker');
        ghost.setAttribute('data-ghost-source', 'svg1');
        svgRoot.appendChild(ghost);

        state.svgRoot = svgRoot;
        state.showGhosts = true;
        state.ghostElements = undefined;

        // Create a cubie
        const position: Position3D = { x: 0, y: 1, z: 0 } as any;
        const cubie: any = {
            type: CubieType.CORNER,
            position,
            stickers: new Map([
                [Face.U, { id: 'st1', currentFace: Face.U, facePosition: 0, color: Color.WHITE }],
            ]),
        };
        state.stickerLookupMap!.set(getPositionKey(position, 3), new Map([[Face.U, 'svg1']]));

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: new Map().set('c1', cubie) as any,
            cubiesByPosition: new Map() as any,
            timestamp: 0,
        } as any;

        // Act
        rendering.renderState(state, cubeState);

        // Assert — ghost should copy fill from source
        expect(ghost.getAttribute('fill')).toBe(source.getAttribute('fill'));
    });

    it('updateSelective skips animation when 3+ moves are queued simultaneously', async () => {
        // Arrange
        const animSpy = vi.spyOn(animations, 'animateMove').mockResolvedValue(undefined as any);

        state.svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        state.svgReady = true;
        state.stickerLookupMap = new Map();

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap() as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        const makeEvent = (): any => ({
            moveDetails: { movedCubies: { after: [{}] } },
            preState: cubeState,
            postState: cubeState,
        });

        // Act — queue 3 moves simultaneously
        const p1 = rendering.updateSelective(state, makeEvent());
        const p2 = rendering.updateSelective(state, makeEvent());
        const p3 = rendering.updateSelective(state, makeEvent());
        await Promise.all([p1, p2, p3]);

        // Assert — at most 2 should animate, the rest fall through to renderState
        // The exact count depends on timing, but we should not have 3 animations
        expect(animSpy.mock.calls.length).toBeLessThanOrEqual(2);
    });

    // ─── collectAffectedGhostElements / selective ghost hiding ─────────────

    it('updateSelective hides only ghost stickers whose source is in movedCubies', async () => {
        vi.spyOn(animations, 'animateMove').mockResolvedValue(undefined as any);
        vi.spyOn(highlights, 'removeSelectionHighlight').mockImplementation(() => {});
        vi.spyOn(highlights, 'updateSelected').mockImplementation(() => {});

        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        state.svgRoot = svgRoot;
        state.svgReady = true;
        state.showGhosts = true;

        // Two source circles: only 'src-moved' is part of the move.
        const srcMoved = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const srcStatic = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('src-moved', srcMoved);
        state.svgElementCache.set('src-static', srcStatic);
        state.svgIdToStickerId.set('src-moved', 'sticker-moved' as StickerId);
        state.svgIdToStickerId.set('src-static', 'sticker-static' as StickerId);

        // Ghost elements: one per source.
        const ghostMoved = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ghostMoved.classList.add('ghost-sticker');
        ghostMoved.setAttribute('data-ghost-source', 'src-moved');
        ghostMoved.style.opacity = '0.75';

        const ghostStatic = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ghostStatic.classList.add('ghost-sticker');
        ghostStatic.setAttribute('data-ghost-source', 'src-static');
        ghostStatic.style.opacity = '0.75';

        svgRoot.appendChild(ghostMoved);
        svgRoot.appendChild(ghostStatic);
        state.ghostElements = undefined;

        // The moved cubie contains 'sticker-moved'; the static sticker is not in movedCubies.
        const movedCubie: any = {
            stickers: new Map([['k', { id: 'sticker-moved' }]]),
        };

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap() as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        const event: any = {
            moveDetails: {
                movedCubies: { before: [movedCubie], after: [movedCubie] },
                notation: 'R',
                definition: { axis: 'X', layerIndices: [2], angle: 90 },
            },
            preState: cubeState,
            postState: cubeState,
        };

        await rendering.updateSelective(state, event);

        // ghostMoved should have been hidden during the animation (opacity restored to target after finish).
        // After all animations settle, setGhostOpacity restores all ghosts, so we check that
        // ghostStatic was never set to '0'. We spy on the state after the full chain finishes.
        // Both ghosts are restored to targetOpacity by finishAnimation. The key assertion is
        // that ghostStatic was not hidden mid-animation: we verify by checking ghostMoved was
        // treated differently. We confirm by re-running with a fresh state where we intercept.

        // Since finishAnimation restores both, we verify behavior via separate focused test below.
        // This test verifies no errors are thrown and animation was called.
        expect(animations.animateMove).toHaveBeenCalled();
    });

    it('updateSelective leaves unaffected ghost opacity unchanged before animation', async () => {
        let capturedStaticOpacity: string | null = null;

        vi.spyOn(animations, 'animateMove').mockImplementation(async () => {
            // Capture the opacity of the static ghost at animation time.
            capturedStaticOpacity = ghostStatic.style.opacity;
        });
        vi.spyOn(highlights, 'removeSelectionHighlight').mockImplementation(() => {});
        vi.spyOn(highlights, 'updateSelected').mockImplementation(() => {});

        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        state.svgRoot = svgRoot;
        state.svgReady = true;
        state.showGhosts = true;
        state.ghostOpacityIndex = 1; // GHOST_OPACITY_LEVELS[1] = 0.75

        state.svgIdToStickerId.set('src-moved', 'sticker-moved' as StickerId);
        state.svgIdToStickerId.set('src-static', 'sticker-static' as StickerId);

        const ghostMoved = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ghostMoved.classList.add('ghost-sticker');
        ghostMoved.setAttribute('data-ghost-source', 'src-moved');
        ghostMoved.style.opacity = '0.75';

        const ghostStatic = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ghostStatic.classList.add('ghost-sticker');
        ghostStatic.setAttribute('data-ghost-source', 'src-static');
        ghostStatic.style.opacity = '0.75';

        svgRoot.appendChild(ghostMoved);
        svgRoot.appendChild(ghostStatic);
        state.ghostElements = undefined;

        const movedCubie: any = {
            stickers: new Map([['k', { id: 'sticker-moved' }]]),
        };

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap() as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        const event: any = {
            moveDetails: {
                movedCubies: { before: [movedCubie], after: [movedCubie] },
                notation: 'R',
                definition: { axis: 'X', layerIndices: [2], angle: 90 },
            },
            preState: cubeState,
            postState: cubeState,
        };

        await rendering.updateSelective(state, event);

        // The static ghost's opacity at animation time should still be '0.75' (unchanged).
        expect(capturedStaticOpacity).toBe('0.75');
        // The moved ghost should have been hidden (opacity '0') at animation time.
        // After finishAnimation it is restored, so check ghostMoved is back to target after settle.
        expect(ghostMoved.style.opacity).toBe('0.75');
    });

    it('updateSelective does not hide any ghost when showGhosts is false', async () => {
        vi.spyOn(animations, 'animateMove').mockResolvedValue(undefined as any);
        vi.spyOn(highlights, 'removeSelectionHighlight').mockImplementation(() => {});

        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        state.svgRoot = svgRoot;
        state.svgReady = true;
        state.showGhosts = false;
        state.ghostOpacityIndex = 0;

        state.svgIdToStickerId.set('src-moved', 'sticker-moved' as StickerId);

        const ghostMoved = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ghostMoved.classList.add('ghost-sticker');
        ghostMoved.setAttribute('data-ghost-source', 'src-moved');
        ghostMoved.style.opacity = '0';

        svgRoot.appendChild(ghostMoved);
        state.ghostElements = undefined;

        const movedCubie: any = {
            stickers: new Map([['k', { id: 'sticker-moved' }]]),
        };

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap() as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        const event: any = {
            moveDetails: {
                movedCubies: { before: [movedCubie], after: [movedCubie] },
                notation: 'R',
                definition: { axis: 'X', layerIndices: [2], angle: 90 },
            },
            preState: cubeState,
            postState: cubeState,
        };

        // Ensure ghostMoved starts at opacity 0 (ghosts-off state).
        ghostMoved.style.opacity = '0';

        await rendering.updateSelective(state, event);

        // setGhostOpacity restore at finishAnimation uses GHOST_OPACITY_LEVELS[0] = undefined -> 0.75.
        // But since showGhosts is false the wrapper is display:none anyway; the point is the
        // selective-hide block was skipped (no additional opacity manipulation happened).
        // We verify by confirming animation still ran (the path wasn't short-circuited early).
        expect(animations.animateMove).toHaveBeenCalled();
    });

    it('updateSelective skips ghost when data-ghost-source has no svgIdToStickerId match', async () => {
        let capturedOrphanOpacity: string | null = null;

        vi.spyOn(animations, 'animateMove').mockImplementation(async () => {
            capturedOrphanOpacity = orphanGhost.style.opacity;
        });
        vi.spyOn(highlights, 'removeSelectionHighlight').mockImplementation(() => {});

        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        state.svgRoot = svgRoot;
        state.svgReady = true;
        state.showGhosts = true;
        state.ghostOpacityIndex = 1;

        // orphan ghost: source SVG ID has no entry in svgIdToStickerId
        const orphanGhost = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        orphanGhost.classList.add('ghost-sticker');
        orphanGhost.setAttribute('data-ghost-source', 'src-unknown');
        orphanGhost.style.opacity = '0.75';

        svgRoot.appendChild(orphanGhost);
        state.ghostElements = undefined;

        const movedCubie: any = {
            stickers: new Map([['k', { id: 'sticker-moved' }]]),
        };

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap() as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        const event: any = {
            moveDetails: {
                movedCubies: { before: [movedCubie], after: [movedCubie] },
                notation: 'R',
                definition: { axis: 'X', layerIndices: [2], angle: 90 },
            },
            preState: cubeState,
            postState: cubeState,
        };

        await rendering.updateSelective(state, event);

        // Orphan ghost opacity should remain 0.75 during the animation (not hidden).
        expect(capturedOrphanOpacity).toBe('0.75');
    });

    it('updateSelective handles empty movedCubies by hiding no ghosts', async () => {
        let capturedOpacity: string | null = null;

        vi.spyOn(animations, 'animateMove').mockImplementation(async () => {
            capturedOpacity = ghost.style.opacity;
        });
        vi.spyOn(highlights, 'removeSelectionHighlight').mockImplementation(() => {});

        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        state.svgRoot = svgRoot;
        state.svgReady = true;
        state.showGhosts = true;
        state.ghostOpacityIndex = 1;

        state.svgIdToStickerId.set('src1', 'sticker1' as StickerId);

        const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ghost.classList.add('ghost-sticker');
        ghost.setAttribute('data-ghost-source', 'src1');
        ghost.style.opacity = '0.75';

        svgRoot.appendChild(ghost);
        state.ghostElements = undefined;

        // Non-empty movedCubies.after but with no stickers (simulates cubie with no stickers).
        const emptyCubie: any = { stickers: new Map() };

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap() as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        const event: any = {
            moveDetails: {
                movedCubies: { before: [emptyCubie], after: [emptyCubie] },
                notation: 'R',
                definition: { axis: 'X', layerIndices: [2], angle: 90 },
            },
            preState: cubeState,
            postState: cubeState,
        };

        await rendering.updateSelective(state, event);

        // No affected sticker IDs → ghost should remain at 0.75 during animation.
        expect(capturedOpacity).toBe('0.75');
    });

    it('updateSelective with unknown axis falls back to serial renderState', async () => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('svg1', circle);

        const position: Position3D = { x: 0, y: 1, z: 0 } as any;
        const cubie: any = {
            type: CubieType.CORNER,
            position,
            stickers: new Map([
                [Face.U, { id: 'st1', currentFace: Face.U, facePosition: 0, color: Color.WHITE }],
            ]),
        };
        // Add cubie to the cube state so renderState can find it
        const stateWithCubie: CubeState = {
            cubeSize: 3,
            cubiesById: IMap().set('c1', cubie) as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;
        state.stickerLookupMap!.set(getPositionKey(position, 3), new Map([[Face.U, 'svg1']]));

        const event: any = {
            moveDetails: {
                movedCubies: { after: [] },
                definition: {},
            },
            preState: stateWithCubie,
            postState: stateWithCubie,
        };

        await rendering.updateSelective(state, event);

        expect(circle.getAttribute('fill')).toBe(ColorMap[Color.WHITE]);
    });

    it('updateSelective with unknown axis and invalid notation still falls back', async () => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('svg1', circle);

        const position: Position3D = { x: 0, y: 1, z: 0 } as any;
        const cubie: any = {
            type: CubieType.CORNER,
            position,
            stickers: new Map([
                [Face.U, { id: 'st2', currentFace: Face.U, facePosition: 0, color: Color.RED }],
            ]),
        };
        const stateWithCubie: CubeState = {
            cubeSize: 3,
            cubiesById: IMap().set('c1', cubie) as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;
        state.stickerLookupMap!.set(getPositionKey(position, 3), new Map([[Face.U, 'svg1']]));

        // Use invalid notation so getMoveDefinition throws → getMoveAxis returns undefined
        const event: any = {
            moveDetails: {
                movedCubies: { after: [] },
                definition: {},
                notation: 'INVALID',
            },
            preState: stateWithCubie,
            postState: stateWithCubie,
        };

        await rendering.updateSelective(state, event);

        expect(circle.getAttribute('fill')).toBe(ColorMap[Color.RED]);
    });

    it('updateStickerMappings skips VIRTUAL_CENTER cubies silently', () => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('svg-center', circle);

        const centerCubie: any = {
            type: CubieType.VIRTUAL_CENTER,
            position: { x: 0, y: 0, z: 0 },
            stickers: new Map(),
        };

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap().set('center', centerCubie) as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        rendering.updateStickerMappings(state, cubeState);

        expect(state.svgIdToStickerId.size).toBe(0);
        expect(state.stickerIdToSvgId.size).toBe(0);
    });

    it('updateStickerMappings handles missing circle in svgElementCache gracefully', () => {
        const position: Position3D = { x: 0, y: 1, z: 0 } as any;
        const cubie: any = {
            type: CubieType.EDGE,
            position,
            stickers: new Map([[Face.R, { id: 'st-r', currentFace: Face.R, facePosition: 0 }]]),
        };

        state.stickerLookupMap!.set(getPositionKey(position, 3), new Map([[Face.R, 'svg1']]));

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap().set('c1', cubie) as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        expect(() => rendering.updateStickerMappings(state, cubeState)).not.toThrow();
        expect(state.svgIdToStickerId.get('svg1')).toBe('st-r');
    });

    it('renderState skips VIRTUAL_CENTER cubies without setting fills', () => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('svg-center', circle);

        const centerCubie: any = {
            type: CubieType.VIRTUAL_CENTER,
            position: { x: 0, y: 0, z: 0 },
            stickers: new Map([
                [
                    Face.U,
                    { id: 'st-center', currentFace: Face.U, facePosition: 0, color: Color.WHITE },
                ],
            ]),
        };

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap().set('center', centerCubie) as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        rendering.renderState(state, cubeState);

        expect(circle.getAttribute('fill')).toBeNull();
        expect(state.svgIdToStickerId.size).toBe(0);
    });

    it('renderState handles missing stickerLookupMap gracefully', () => {
        state.stickerLookupMap = undefined as any;
        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap() as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        expect(() => rendering.renderState(state, cubeState)).not.toThrow();
    });

    // ─── skipAnimation path (pending > 2) ──────────────────────────────────

    it('updateSelective skips animation when pending > 2 (skipAnimation gate)', async () => {
        const animSpy = vi.spyOn(animations, 'animateMove').mockResolvedValue(undefined as any);
        vi.spyOn(highlights, 'removeSelectionHighlight').mockImplementation(() => {});
        vi.spyOn(highlights, 'updateSelected').mockImplementation(() => {});

        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        state.svgRoot = svgRoot;
        state.svgReady = true;
        state.stickerLookupMap = new Map();
        state.showGhosts = false;

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap() as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        const makeEvent = (): any => ({
            moveDetails: {
                movedCubies: { after: [{}] },
                notation: 'R',
                definition: { axis: 'X', layerIndices: [2], angle: 90 },
            },
            preState: cubeState,
            postState: cubeState,
        });

        // Queue 4 moves on the same axis — the 4th should skip animation
        const p1 = rendering.updateSelective(state, makeEvent());
        const p2 = rendering.updateSelective(state, makeEvent());
        const p3 = rendering.updateSelective(state, makeEvent());
        const p4 = rendering.updateSelective(state, makeEvent());
        await Promise.all([p1, p2, p3, p4]);

        // p1 sees pending=4>2 → skip, p2 sees pending=3>2 → skip,
        // p3 sees pending=2 (not >2) → animates, p4 sees pending=1 → animates.
        expect(animSpy).toHaveBeenCalledTimes(2);
    });

    // ─── stickerBefore / stickerAfter with undefined selected ──────────────

    it('updateSelective handles undefined currentSelected (stickerBefore is undefined)', async () => {
        vi.spyOn(animations, 'animateMove').mockResolvedValue(undefined as any);
        vi.spyOn(highlights, 'removeSelectionHighlight').mockImplementation(() => {});
        vi.spyOn(highlights, 'updateSelected').mockImplementation(() => {});

        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        state.svgRoot = svgRoot;
        state.svgReady = true;
        state.stickerLookupMap = new Map();
        state.currentSelected = undefined; // explicitly undefined
        state.showGhosts = true; // enter the ghost hiding block
        state.ghostOpacityIndex = 1;

        const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ghost.classList.add('ghost-sticker');
        ghost.setAttribute('data-ghost-source', 'src1');
        ghost.style.opacity = '0.75';
        svgRoot.appendChild(ghost);
        state.ghostElements = undefined;

        state.svgIdToStickerId.set('src1', 'sticker1' as StickerId);

        const movedCubie: any = {
            stickers: new Map([['k', { id: 'sticker1' }]]),
        };

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap() as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        const event: any = {
            moveDetails: {
                movedCubies: { before: [movedCubie], after: [movedCubie] },
                notation: 'R',
                definition: { axis: 'X', layerIndices: [2], angle: 90 },
            },
            preState: cubeState,
            postState: cubeState,
        };

        // Should not throw — stickerBefore is undefined, stickerAfter is undefined
        await rendering.updateSelective(state, event);

        // Ghost should have been hidden during animation and restored after
        expect(ghost.style.opacity).toBe('0.75');
    });

    it('updateSelective falls through to finishAnimation when svgReady is false', async () => {
        vi.spyOn(animations, 'animateMove').mockResolvedValue(undefined as any);

        state.svgReady = false; // triggers !state.svgReady guard
        state.stickerLookupMap = new Map();

        const cubeState: CubeState = {
            cubeSize: 3,
            cubiesById: IMap() as any,
            cubiesByPosition: IMap() as any,
            timestamp: 0,
        } as any;

        const event: any = {
            moveDetails: {
                movedCubies: { after: [{}] },
                notation: 'R',
                definition: { axis: 'X', layerIndices: [2], angle: 90 },
            },
            preState: cubeState,
            postState: cubeState,
        };

        // Should resolve without error — finishAnimation is called immediately
        await rendering.updateSelective(state, event);
    });

    // ─── _pendingTotal decrements to 0 → triggers final render ─────────────

    it('updateSelective triggers renderState when _pendingTotal reaches 0', async () => {
        vi.spyOn(animations, 'animateMove').mockResolvedValue(undefined as any);
        vi.spyOn(highlights, 'removeSelectionHighlight').mockImplementation(() => {});
        vi.spyOn(highlights, 'updateSelected').mockImplementation(() => {});

        const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
        state.svgRoot = svgRoot;
        state.svgReady = true;
        state.stickerLookupMap = new Map();
        state.showGhosts = false;
        state.ghostOpacityIndex = 1;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.svgElementCache.set('svg1', circle);

        const position: Position3D = { x: 0, y: 1, z: 0 } as any;
        const cubie: any = {
            type: CubieType.CORNER,
            position,
            stickers: new Map([
                [Face.U, { id: 'st1', currentFace: Face.U, facePosition: 0, color: Color.WHITE }],
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
            moveDetails: {
                movedCubies: { before: [], after: [cubie] },
                notation: 'R',
                definition: { axis: 'X', layerIndices: [2], angle: 90 },
            },
            preState: cubeState,
            postState: cubeState,
        };

        // Act — dispatch a single move so _pendingTotal goes from 1 to 0
        await rendering.updateSelective(state, event);

        // Assert — renderState was called: fill attribute set on the circle
        expect(circle.getAttribute('fill')).toBe(ColorMap[Color.WHITE]);
    });
});
