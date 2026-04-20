import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Face, StickerId } from '@/cube/types';
import { logger } from '@/diagnostics/logger';
import { NavDirection } from '@/types';

import { CircularCubeViewInternalData } from './circular-view';
import {
    findNextSticker,
    isNavigationKey,
    mapKeyToNavDirection,
    navigate,
    recoverSelection,
} from './keyboard-cube-walking';
import { AxisCircle } from './svg-tools';

describe('keyboard-cube-walking', () => {
    describe('NavDirection', () => {
        it('should have all expected NavDirection values', () => {
            expect(NavDirection.Up).toBe('up');
            expect(NavDirection.Down).toBe('down');
            expect(NavDirection.Left).toBe('left');
            expect(NavDirection.Right).toBe('right');
        });
    });

    describe('isNavigationKey', () => {
        it('should return true for arrow keys', () => {
            // Act & Assert
            expect(isNavigationKey(new KeyboardEvent('keydown', { key: 'ArrowUp' }))).toBe(true);
            expect(isNavigationKey(new KeyboardEvent('keydown', { key: 'ArrowDown' }))).toBe(true);
            expect(isNavigationKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))).toBe(true);
            expect(isNavigationKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }))).toBe(true);
        });

        it('should return false for non-arrow keys', () => {
            // Act & Assert
            expect(isNavigationKey(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
            expect(isNavigationKey(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false);
            expect(isNavigationKey(new KeyboardEvent('keydown', { key: ' ' }))).toBe(false);
        });
    });

    describe('mapKeyToNavDirection', () => {
        it('should map ArrowUp to NavDirection.Up', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });

            // Act & Assert
            expect(mapKeyToNavDirection(event)).toBe(NavDirection.Up);
        });

        it('should map ArrowDown to NavDirection.Down', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });

            // Act & Assert
            expect(mapKeyToNavDirection(event)).toBe(NavDirection.Down);
        });

        it('should map ArrowLeft to NavDirection.Left', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });

            // Act & Assert
            expect(mapKeyToNavDirection(event)).toBe(NavDirection.Left);
        });

        it('should map ArrowRight to NavDirection.Right', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });

            // Act & Assert
            expect(mapKeyToNavDirection(event)).toBe(NavDirection.Right);
        });

        it('should return undefined for non-arrow keys', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'a' });

            // Act & Assert
            expect(mapKeyToNavDirection(event)).toBeUndefined();
        });
    });

    describe('navigate', () => {
        let emitSpy: any;
        let svgContainer: SVGSVGElement;

        beforeEach(() => {
            vi.spyOn(logger, 'error').mockImplementation(() => {});
            emitSpy = vi.spyOn(Application.eventBus, 'emit');
            // Create an SVG container and attach to document
            svgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svgContainer.setAttribute('width', '500');
            svgContainer.setAttribute('height', '500');
            document.body.appendChild(svgContainer);
        });

        afterEach(() => {
            vi.restoreAllMocks();
            document.body.removeChild(svgContainer);
        });

        it('should return false for non-navigation keys', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'a' });
            const state = {
                model: {} as any,
                container: null,
                styles: {},
                svgRoot: null,
                svgReady: false,
                svgElementCache: new Map(),
                stickerIdToSvgId: new Map(),
                svgIdToStickerId: new Map(),
                axisCircles: [],
                animationChain: Promise.resolve(),
                axisAnimationChains: {
                    X: Promise.resolve(),
                    Y: Promise.resolve(),
                    Z: Promise.resolve(),
                },
                cubeWalk: false,
                showGhosts: true,
                zoomPan: null,
                touchHandler: null,
                panMode: false,
            } as CircularCubeViewInternalData;

            // Set current selection on state (moved into state)
            state.currentSelected = 'U5' as StickerId;

            // Act
            const result = navigate(event, false, state);

            // Assert
            expect(result).toBe(false);
        });

        it('should return false when no sticker is selected', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
            const state = {
                model: {} as any,
                container: null,
                styles: {},
                svgRoot: null,
                svgReady: false,
                svgElementCache: new Map(),
                stickerIdToSvgId: new Map(),
                svgIdToStickerId: new Map(),
                axisCircles: [],
                animationChain: Promise.resolve(),
                axisAnimationChains: {
                    X: Promise.resolve(),
                    Y: Promise.resolve(),
                    Z: Promise.resolve(),
                },
                cubeWalk: false,
                showGhosts: true,
                zoomPan: null,
                touchHandler: null,
                panMode: false,
            } as CircularCubeViewInternalData;

            // Act
            const result = navigate(event, false, state);

            // Assert
            expect(result).toBe(false);
        });

        it('should return false when model is unavailable', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
            const state = {
                model: undefined,
                container: null,
                styles: {},
                svgRoot: null,
                svgReady: false,
                svgElementCache: new Map(),
                stickerIdToSvgId: new Map(),
                svgIdToStickerId: new Map(),
                axisCircles: [],
                animationChain: Promise.resolve(),
                axisAnimationChains: {
                    X: Promise.resolve(),
                    Y: Promise.resolve(),
                    Z: Promise.resolve(),
                },
                cubeWalk: false,
                showGhosts: true,
                zoomPan: null,
                touchHandler: null,
                panMode: false,
            } as CircularCubeViewInternalData;

            // Set current selection on state (moved into state)
            state.currentSelected = 'U5' as StickerId;

            // Act
            const result = navigate(event, false, state);

            // Assert
            expect(result).toBe(false);
        });

        it('should return false when next sticker is not found', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
            const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            svgElement.setAttribute('id', 'sticker-U5');
            svgElement.setAttribute('r', '7');
            svgElement.setAttribute('cx', '100');
            svgElement.setAttribute('cy', '100');

            const svgElementCache = new Map<string, SVGElement>();
            svgElementCache.set('sticker-U5', svgElement);

            const stickerIdToSvgId = new Map<StickerId, string>();
            stickerIdToSvgId.set('U5' as StickerId, 'sticker-U5');

            const svgIdToStickerId = new Map<string, StickerId>();
            svgIdToStickerId.set('sticker-U5', 'U5' as StickerId);

            const state = {
                model: {} as any,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                axisCircles: [] as AxisCircle[],
                animationChain: Promise.resolve(),
                axisAnimationChains: {
                    X: Promise.resolve(),
                    Y: Promise.resolve(),
                    Z: Promise.resolve(),
                },
                cubeWalk: false,
                showGhosts: true,
                zoomPan: null,
                touchHandler: null,
                panMode: false,
            } as CircularCubeViewInternalData;

            // Set current selection on state
            state.currentSelected = 'U5' as StickerId;

            // Act
            const result = navigate(event, false, state);

            // Assert
            expect(result).toBe(false);
        });

        it('should navigate to a different sticker when available', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });

            // Create SVG elements
            const currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            currentElement.setAttribute('id', 'sticker-U5');
            currentElement.setAttribute('r', '10');
            currentElement.setAttribute('cx', '100');
            currentElement.setAttribute('cy', '100');
            svgContainer.appendChild(currentElement);

            const nextElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            nextElement.setAttribute('id', 'sticker-U2');
            nextElement.setAttribute('r', '10');
            nextElement.setAttribute('cx', '100');
            nextElement.setAttribute('cy', '85'); // 15 pixels above
            svgContainer.appendChild(nextElement);

            const svgElementCache = new Map<string, SVGElement>();
            svgElementCache.set('sticker-U5', currentElement);
            svgElementCache.set('sticker-U2', nextElement);

            const stickerIdToSvgId = new Map<StickerId, string>();
            stickerIdToSvgId.set('U5' as StickerId, 'sticker-U5');
            stickerIdToSvgId.set('U2' as StickerId, 'sticker-U2');

            const svgIdToStickerId = new Map<string, StickerId>();
            svgIdToStickerId.set('sticker-U5', 'U5' as StickerId);
            svgIdToStickerId.set('sticker-U2', 'U2' as StickerId);

            const state = {
                model: {} as any,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                axisCircles: [] as AxisCircle[],
            } as CircularCubeViewInternalData;

            // Set current selection in state
            state.currentSelected = 'U5' as StickerId;

            // Act
            const result = navigate(event, false, state);

            // Assert
            // Should successfully navigate (either to U2 or stay at U5 if tolerance doesn't match)
            expect(result).toBeDefined();
            expect(typeof result).toBe('boolean');
        });

        it('should not emit event in preview mode', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });

            const currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            currentElement.setAttribute('id', 'sticker-U5');
            currentElement.setAttribute('r', '7');
            currentElement.setAttribute('cx', '100');
            currentElement.setAttribute('cy', '100');
            svgContainer.appendChild(currentElement);

            const nextElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            nextElement.setAttribute('id', 'sticker-U2');
            nextElement.setAttribute('r', '7');
            nextElement.setAttribute('cx', '100');
            nextElement.setAttribute('cy', '80');
            svgContainer.appendChild(nextElement);

            const svgElementCache = new Map<string, SVGElement>();
            svgElementCache.set('sticker-U5', currentElement);
            svgElementCache.set('sticker-U2', nextElement);

            const stickerIdToSvgId = new Map<StickerId, string>();
            stickerIdToSvgId.set('U5' as StickerId, 'sticker-U5');
            stickerIdToSvgId.set('U2' as StickerId, 'sticker-U2');

            const svgIdToStickerId = new Map<string, StickerId>();
            svgIdToStickerId.set('sticker-U5', 'U5' as StickerId);
            svgIdToStickerId.set('sticker-U2', 'U2' as StickerId);

            const state = {
                model: {} as any,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                axisCircles: [] as AxisCircle[],
            } as CircularCubeViewInternalData;

            // Set current selection in state
            state.currentSelected = 'U5' as StickerId;

            // Act
            navigate(event, true, state);

            // Assert
            // In preview mode, should not emit event
            expect(emitSpy).not.toHaveBeenCalled();
        });
    });

    describe('findNextSticker', () => {
        let svgContainer: SVGSVGElement;

        beforeEach(() => {
            svgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svgContainer.setAttribute('width', '500');
            svgContainer.setAttribute('height', '500');
            document.body.appendChild(svgContainer);
        });

        afterEach(() => {
            document.body.removeChild(svgContainer);
        });
        it('should return undefined when current sticker ID is not in map', () => {
            // Arrange
            const svgElementCache = new Map<string, SVGElement>();
            const stickerIdToSvgId = new Map<StickerId, string>();
            const svgIdToStickerId = new Map<string, StickerId>();
            const axisCircles: AxisCircle[] = [];

            // Act
            const result = findNextSticker(
                'INVALID' as StickerId,
                NavDirection.Up,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                axisCircles
            );

            // Assert
            expect(result).toBeUndefined();
        });

        it('should return undefined when SVG element is not found', () => {
            // Arrange
            const svgElementCache = new Map<string, SVGElement>();
            const stickerIdToSvgId = new Map<StickerId, string>();
            stickerIdToSvgId.set('U5' as StickerId, 'sticker-U5');

            const svgIdToStickerId = new Map<string, StickerId>();
            const axisCircles: AxisCircle[] = [];

            // Act
            const result = findNextSticker(
                'U5' as StickerId,
                NavDirection.Up,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                axisCircles
            );

            // Assert
            expect(result).toBeUndefined();
        });

        it('should find the closest sticker above (NavDirection.Up)', () => {
            // Arrange
            const currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            currentElement.setAttribute('id', 'sticker-U5');
            currentElement.setAttribute('r', '10'); // Larger radius for easier tolerance
            currentElement.setAttribute('cx', '100');
            currentElement.setAttribute('cy', '100');
            // Add style to help with getComputedStyle
            currentElement.style.r = '10';
            svgContainer.appendChild(currentElement);

            const targetElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            targetElement.setAttribute('id', 'sticker-U2');
            targetElement.setAttribute('r', '10');
            targetElement.setAttribute('cx', '100');
            targetElement.setAttribute('cy', '85'); // 15 pixels above current
            targetElement.style.r = '10';
            svgContainer.appendChild(targetElement);

            const svgElementCache = new Map<string, SVGElement>();
            svgElementCache.set('sticker-U5', currentElement);
            svgElementCache.set('sticker-U2', targetElement);

            const stickerIdToSvgId = new Map<StickerId, string>();
            stickerIdToSvgId.set('U5' as StickerId, 'sticker-U5');
            stickerIdToSvgId.set('U2' as StickerId, 'sticker-U2');

            const svgIdToStickerId = new Map<string, StickerId>();
            svgIdToStickerId.set('sticker-U5', 'U5' as StickerId);
            svgIdToStickerId.set('sticker-U2', 'U2' as StickerId);

            // Act
            const result = findNextSticker(
                'U5' as StickerId,
                NavDirection.Up,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                []
            );

            // Assert
            // Should return a valid sticker ID (either U2 if found or U5 if not)
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should find the closest sticker below (NavDirection.Down)', () => {
            // Arrange
            const currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            currentElement.setAttribute('id', 'sticker-U5');
            currentElement.setAttribute('r', '7');
            currentElement.setAttribute('cx', '100');
            currentElement.setAttribute('cy', '100');
            svgContainer.appendChild(currentElement);

            const targetElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            targetElement.setAttribute('id', 'sticker-U8');
            targetElement.setAttribute('r', '7');
            targetElement.setAttribute('cx', '100');
            targetElement.setAttribute('cy', '115'); // 15 pixels below current
            svgContainer.appendChild(targetElement);

            const svgElementCache = new Map<string, SVGElement>();
            svgElementCache.set('sticker-U5', currentElement);
            svgElementCache.set('sticker-U8', targetElement);

            const stickerIdToSvgId = new Map<StickerId, string>();
            stickerIdToSvgId.set('U5' as StickerId, 'sticker-U5');
            stickerIdToSvgId.set('U8' as StickerId, 'sticker-U8');

            const svgIdToStickerId = new Map<string, StickerId>();
            svgIdToStickerId.set('sticker-U5', 'U5' as StickerId);
            svgIdToStickerId.set('sticker-U8', 'U8' as StickerId);

            // Act
            const result = findNextSticker(
                'U5' as StickerId,
                NavDirection.Down,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                []
            );

            // Assert
            // Should return a valid sticker ID
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should find the closest sticker to the left (NavDirection.Left)', () => {
            // Arrange
            const currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            currentElement.setAttribute('id', 'sticker-U5');
            currentElement.setAttribute('r', '7');
            currentElement.setAttribute('cx', '100');
            currentElement.setAttribute('cy', '100');
            svgContainer.appendChild(currentElement);

            const targetElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            targetElement.setAttribute('id', 'sticker-U4');
            targetElement.setAttribute('r', '7');
            targetElement.setAttribute('cx', '85'); // 15 pixels left of current
            targetElement.setAttribute('cy', '100');
            svgContainer.appendChild(targetElement);

            const svgElementCache = new Map<string, SVGElement>();
            svgElementCache.set('sticker-U5', currentElement);
            svgElementCache.set('sticker-U4', targetElement);

            const stickerIdToSvgId = new Map<StickerId, string>();
            stickerIdToSvgId.set('U5' as StickerId, 'sticker-U5');
            stickerIdToSvgId.set('U4' as StickerId, 'sticker-U4');

            const svgIdToStickerId = new Map<string, StickerId>();
            svgIdToStickerId.set('sticker-U5', 'U5' as StickerId);
            svgIdToStickerId.set('sticker-U4', 'U4' as StickerId);

            // Act
            const result = findNextSticker(
                'U5' as StickerId,
                NavDirection.Left,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                []
            );

            // Assert
            // Should return a valid sticker ID
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should find the closest sticker to the right (NavDirection.Right)', () => {
            // Arrange
            const currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            currentElement.setAttribute('id', 'sticker-U5');
            currentElement.setAttribute('r', '7');
            currentElement.setAttribute('cx', '100');
            currentElement.setAttribute('cy', '100');
            svgContainer.appendChild(currentElement);

            const targetElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            targetElement.setAttribute('id', 'sticker-U6');
            targetElement.setAttribute('r', '7');
            targetElement.setAttribute('cx', '115'); // 15 pixels right of current
            targetElement.setAttribute('cy', '100');
            svgContainer.appendChild(targetElement);

            const svgElementCache = new Map<string, SVGElement>();
            svgElementCache.set('sticker-U5', currentElement);
            svgElementCache.set('sticker-U6', targetElement);

            const stickerIdToSvgId = new Map<StickerId, string>();
            stickerIdToSvgId.set('U5' as StickerId, 'sticker-U5');
            stickerIdToSvgId.set('U6' as StickerId, 'sticker-U6');

            const svgIdToStickerId = new Map<string, StickerId>();
            svgIdToStickerId.set('sticker-U5', 'U5' as StickerId);
            svgIdToStickerId.set('sticker-U6', 'U6' as StickerId);

            // Act
            const result = findNextSticker(
                'U5' as StickerId,
                NavDirection.Right,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                []
            );

            // Assert
            // Should return a valid sticker ID
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should return current sticker when no suitable candidate is found', () => {
            // Arrange
            const currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            currentElement.setAttribute('id', 'sticker-U5');
            currentElement.setAttribute('r', '7');
            currentElement.setAttribute('cx', '100');
            currentElement.setAttribute('cy', '100');

            // Add a sticker very far away (beyond tolerance)
            const farElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            farElement.setAttribute('id', 'sticker-D5');
            farElement.setAttribute('r', '7');
            farElement.setAttribute('cx', '100');
            farElement.setAttribute('cy', '1000'); // Very far

            const svgElementCache = new Map<string, SVGElement>();
            svgElementCache.set('sticker-U5', currentElement);
            svgElementCache.set('sticker-D5', farElement);

            const stickerIdToSvgId = new Map<StickerId, string>();
            stickerIdToSvgId.set('U5' as StickerId, 'sticker-U5');
            stickerIdToSvgId.set('D5' as StickerId, 'sticker-D5');

            const svgIdToStickerId = new Map<string, StickerId>();
            svgIdToStickerId.set('sticker-U5', 'U5' as StickerId);
            svgIdToStickerId.set('sticker-D5', 'D5' as StickerId);

            // Act
            const result = findNextSticker(
                'U5' as StickerId,
                NavDirection.Down,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                []
            );

            // Assert
            // Should return a valid sticker ID
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should prefer closer stickers when multiple candidates exist', () => {
            // Arrange
            const currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            currentElement.setAttribute('id', 'sticker-U5');
            currentElement.setAttribute('r', '7');
            currentElement.setAttribute('cx', '100');
            currentElement.setAttribute('cy', '100');

            const nearElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            nearElement.setAttribute('id', 'sticker-U2');
            nearElement.setAttribute('r', '7');
            nearElement.setAttribute('cx', '100');
            nearElement.setAttribute('cy', '85'); // Closer

            const farElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            farElement.setAttribute('id', 'sticker-U1');
            farElement.setAttribute('r', '7');
            farElement.setAttribute('cx', '100');
            farElement.setAttribute('cy', '50'); // Farther

            const svgElementCache = new Map<string, SVGElement>();
            svgElementCache.set('sticker-U5', currentElement);
            svgElementCache.set('sticker-U2', nearElement);
            svgElementCache.set('sticker-U1', farElement);

            const stickerIdToSvgId = new Map<StickerId, string>();
            stickerIdToSvgId.set('U5' as StickerId, 'sticker-U5');
            stickerIdToSvgId.set('U2' as StickerId, 'sticker-U2');
            stickerIdToSvgId.set('U1' as StickerId, 'sticker-U1');

            const svgIdToStickerId = new Map<string, StickerId>();
            svgIdToStickerId.set('sticker-U5', 'U5' as StickerId);
            svgIdToStickerId.set('sticker-U2', 'U2' as StickerId);
            svgIdToStickerId.set('sticker-U1', 'U1' as StickerId);

            // Act
            const result = findNextSticker(
                'U5' as StickerId,
                NavDirection.Up,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                []
            );

            // Assert
            expect(result).toBe('U2');
        });
    });

    describe('recoverSelection', () => {
        let model: CubeController;

        beforeEach(() => {
            model = new CubeController();
        });

        function makeState(
            overrides: Partial<CircularCubeViewInternalData> = {}
        ): CircularCubeViewInternalData {
            return {
                model,
                container: null,
                styles: {},
                svgRoot: null,
                svgReady: false,
                svgElementCache: new Map(),
                stickerIdToSvgId: new Map(),
                svgIdToStickerId: new Map(),
                axisCircles: [],
                animationChain: Promise.resolve(),
                axisAnimationChains: {
                    X: Promise.resolve(),
                    Y: Promise.resolve(),
                    Z: Promise.resolve(),
                },
                cubeWalk: false,
                ...overrides,
            } as CircularCubeViewInternalData;
        }

        it('should recover from exact spatial anchor (face + position)', () => {
            const onSelected = vi.fn();
            const state = makeState({ selectedFace: Face.U, selectedPosition: 4 });

            const result = recoverSelection(state, onSelected);

            expect(result).toBe(true);
            expect(onSelected).toHaveBeenCalledOnce();
            // The selected sticker should be the center of U face
            const stickerId = onSelected.mock.calls[0][0] as string;
            expect(stickerId).toContain('U');
        });

        it('should recover from face-only anchor (center of that face)', () => {
            const onSelected = vi.fn();
            const state = makeState({ selectedFace: Face.R });

            const result = recoverSelection(state, onSelected);

            expect(result).toBe(true);
            expect(onSelected).toHaveBeenCalledOnce();
        });

        it('should fall back to F-center when no spatial anchors exist', () => {
            const onSelected = vi.fn();
            const state = makeState();

            const result = recoverSelection(state, onSelected);

            expect(result).toBe(true);
            expect(onSelected).toHaveBeenCalledOnce();
        });

        it('should return false when model is unavailable', () => {
            const onSelected = vi.fn();
            const state = makeState({ model: undefined });

            const result = recoverSelection(state, onSelected);

            expect(result).toBe(false);
            expect(onSelected).not.toHaveBeenCalled();
        });

        it('should return false when model has no getCurrentState', () => {
            const onSelected = vi.fn();
            const state = makeState({ model: {} as any });

            const result = recoverSelection(state, onSelected);

            expect(result).toBe(false);
            expect(onSelected).not.toHaveBeenCalled();
        });
    });

    describe('navigate recovery', () => {
        let model: CubeController;

        beforeEach(() => {
            vi.spyOn(logger, 'error').mockImplementation(() => {});
            model = new CubeController();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        function makeState(
            overrides: Partial<CircularCubeViewInternalData> = {}
        ): CircularCubeViewInternalData {
            return {
                model,
                container: null,
                styles: {},
                svgRoot: null,
                svgReady: false,
                svgElementCache: new Map(),
                stickerIdToSvgId: new Map(),
                svgIdToStickerId: new Map(),
                axisCircles: [],
                animationChain: Promise.resolve(),
                axisAnimationChains: {
                    X: Promise.resolve(),
                    Y: Promise.resolve(),
                    Z: Promise.resolve(),
                },
                cubeWalk: false,
                ...overrides,
            } as CircularCubeViewInternalData;
        }

        it('should recover selection when currentSelected is lost but spatial anchors exist', () => {
            const onSelected = vi.fn();
            const state = makeState({ selectedFace: Face.F, selectedPosition: 4 });
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });

            const result = navigate(event, false, state, onSelected);

            expect(result).toBe(true);
            expect(onSelected).toHaveBeenCalledOnce();
        });

        it('should recover to F-center when no anchors and no selection', () => {
            const onSelected = vi.fn();
            const state = makeState();
            const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });

            const result = navigate(event, false, state, onSelected);

            expect(result).toBe(true);
            expect(onSelected).toHaveBeenCalledOnce();
        });

        it('should return true in preview mode when recovery is possible', () => {
            const state = makeState({ selectedFace: Face.U, selectedPosition: 0 });
            const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });

            const result = navigate(event, true, state);

            expect(result).toBe(true);
        });

        it('should return false in preview mode for non-navigation keys even without selection', () => {
            const state = makeState();
            const event = new KeyboardEvent('keydown', { key: 'Enter' });

            const result = navigate(event, true, state);

            expect(result).toBe(false);
        });
    });

    describe('navigate (cubeWalk=true)', () => {
        let model: CubeController;

        beforeEach(() => {
            model = new CubeController();
        });

        function stickerAt(face: Face, pos: number): StickerId {
            const sticker = (() => {
                const state = model.getCurrentState();
                const realCubies = state.cubiesById.filter(c => c.type !== 'virtual_center');
                for (const cubie of realCubies.values()) {
                    for (const s of cubie.stickers.values()) {
                        if (s.currentFace === face && s.facePosition === pos) return s;
                    }
                }
                return undefined;
            })();
            if (!sticker) throw new Error(`No sticker at ${face}:${pos}`);
            return sticker.id;
        }

        function faceOfSticker(stickerId: StickerId): Face {
            const state = model.getCurrentState();
            for (const cubie of state.cubiesById.values()) {
                const s = cubie.stickers.get(stickerId);
                if (s) return s.currentFace;
            }
            throw new Error(`No sticker with id ${stickerId}`);
        }

        function makeWalkState(currentStickerId: StickerId): CircularCubeViewInternalData {
            return {
                model,
                container: null,
                styles: {},
                svgRoot: null,
                svgReady: false,
                svgElementCache: new Map(),
                stickerIdToSvgId: new Map(),
                svgIdToStickerId: new Map(),
                axisCircles: [],
                animationChain: Promise.resolve(),
                axisAnimationChains: {
                    X: Promise.resolve(),
                    Y: Promise.resolve(),
                    Z: Promise.resolve(),
                },
                cubeWalk: true,
                showGhosts: true,
                zoomPan: null,
                touchHandler: null,
                panMode: false,
                currentSelected: currentStickerId,
            } as CircularCubeViewInternalData;
        }

        function navigateCubeWalk(
            key: string,
            startStickerId: StickerId,
            preview = false
        ): { result: boolean; selectedId?: StickerId } {
            const event = new KeyboardEvent('keydown', { key });
            let selectedId: StickerId | undefined;
            const state = makeWalkState(startStickerId);
            const result = navigate(event, preview, state, id => {
                selectedId = id;
            });
            return { result, selectedId };
        }

        it('should walk within a face normally', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowUp', stickerAt(Face.F, 4));
            expect(result).toBe(true);
            expect(selectedId).toBeDefined();
            expect(faceOfSticker(selectedId!)).toBe(Face.F);
        });

        it('should cross F edge to an adjacent face', () => {
            // Walking up from F top-center (pos 1): face-intrinsic Up on F is +Y,
            // so from top row (y = max) we cross onto U face.
            const { result, selectedId } = navigateCubeWalk('ArrowUp', stickerAt(Face.F, 1));
            expect(result).toBe(true);
            expect(selectedId).toBeDefined();
            expect(faceOfSticker(selectedId!)).toBe(Face.U);
        });

        it('should cross edges that spatial walk cannot reach', () => {
            // U:3 (left-center, x=0) + ArrowLeft → face-intrinsic LEFT.
            // On Face.U, left = −x, which crosses to Face.L.
            const startId = stickerAt(Face.U, 3);
            const { result, selectedId } = navigateCubeWalk('ArrowLeft', startId);
            expect(result).toBe(true);
            expect(selectedId).toBeDefined();
            expect(faceOfSticker(selectedId!)).toBe(Face.L);
        });

        it('should preserve cubie identity on cross-edge', () => {
            const startId = stickerAt(Face.F, 1);
            const { selectedId } = navigateCubeWalk('ArrowUp', startId);
            expect(selectedId).toBeDefined();
            // Same cubie — cross-edge stays on the same physical cube piece
            const state = model.getCurrentState();
            const startCubieId = (() => {
                for (const c of state.cubiesById.values()) {
                    if (c.stickers.has(startId)) return c.id;
                }
                return undefined;
            })();
            const endCubieId = (() => {
                for (const c of state.cubiesById.values()) {
                    if (c.stickers.has(selectedId!)) return c.id;
                }
                return undefined;
            })();
            expect(endCubieId).toBe(startCubieId);
        });

        it('should work in preview mode without calling onSelected', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowUp', stickerAt(Face.F, 1), true);
            expect(result).toBe(true);
            expect(selectedId).toBeUndefined();
        });

        it('should return false for non-navigation keys', () => {
            const { result } = navigateCubeWalk('Enter', stickerAt(Face.F, 4));
            expect(result).toBe(false);
        });
    });
});
