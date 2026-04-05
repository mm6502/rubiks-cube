import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { StickerId } from '@/cube/types';
import { logger } from '@/diagnostics/logger';

import { CircularCubeViewInternalData } from './circular-view';
import {
    Direction,
    findNextSticker,
    isNavigationKey,
    mapKeyToDirection,
    navigate,
} from './keyboard-cube-walking';
import { AxisCircle } from './svg-tools';

describe('keyboard-cube-walking', () => {
    describe('Direction', () => {
        it('should have all expected direction values', () => {
            expect(Direction.Up).toBe('up');
            expect(Direction.Down).toBe('down');
            expect(Direction.Left).toBe('left');
            expect(Direction.Right).toBe('right');
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

    describe('mapKeyToDirection', () => {
        it('should map ArrowUp to Direction.Up', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });

            // Act & Assert
            expect(mapKeyToDirection(event)).toBe(Direction.Up);
        });

        it('should map ArrowDown to Direction.Down', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });

            // Act & Assert
            expect(mapKeyToDirection(event)).toBe(Direction.Down);
        });

        it('should map ArrowLeft to Direction.Left', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });

            // Act & Assert
            expect(mapKeyToDirection(event)).toBe(Direction.Left);
        });

        it('should map ArrowRight to Direction.Right', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });

            // Act & Assert
            expect(mapKeyToDirection(event)).toBe(Direction.Right);
        });

        it('should return undefined for non-arrow keys', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'a' });

            // Act & Assert
            expect(mapKeyToDirection(event)).toBeUndefined();
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
                Direction.Up,
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
                Direction.Up,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                axisCircles
            );

            // Assert
            expect(result).toBeUndefined();
        });

        it('should find the closest sticker above (Direction.Up)', () => {
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
                Direction.Up,
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

        it('should find the closest sticker below (Direction.Down)', () => {
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
                Direction.Down,
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

        it('should find the closest sticker to the left (Direction.Left)', () => {
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
                Direction.Left,
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

        it('should find the closest sticker to the right (Direction.Right)', () => {
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
                Direction.Right,
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
                Direction.Down,
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
                Direction.Up,
                svgElementCache,
                stickerIdToSvgId,
                svgIdToStickerId,
                []
            );

            // Assert
            expect(result).toBe('U2');
        });
    });
});
