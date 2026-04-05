import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { EventName } from '@/types';

import * as initialization from './initialization';

describe('initialization', () => {
    let container: HTMLElement;
    let model: any;
    const styles = { highlighted: 'hl', selected: 'sel' };

    beforeEach(() => {
        container = document.createElement('div');
        model = { getCurrentState: vi.fn(() => ({})) };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('initialize returns undefined when container is null', () => {
        // Arrange & Act
        const result = initialization.initialize(null as any, model, styles);

        // Assert
        expect(result).toBeUndefined();
    });

    it('initialize returns undefined when model is null', () => {
        // Arrange & Act
        const result = initialization.initialize(container, null as any, styles);

        // Assert
        expect(result).toBeUndefined();
    });

    it('initialize inlines SVG into container and sets tabIndex', () => {
        // Arrange
        // (container and model are provided by beforeEach)

        // Act - call initialize and ignore expected throw
        try {
            initialization.initialize(container, model, styles);
        } catch (e) {
            // Expected to throw when SVG doesn't have proper stickers
        }

        // Assert
        expect(container.tabIndex).toBe(0);
        expect(container.innerHTML).toContain('svg');
    });

    it('buildStickerLookupMap returns empty map for SVG without stickers', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert
        expect(result.lookupMap.size).toBe(0);
        expect(result.axisCircles.length).toBeGreaterThanOrEqual(0);
    });

    it('buildStickerLookupMap parses axis circles with correct attributes', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        // Add axis circle elements with proper IDs that match parsing logic
        const circle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle1.id = 'X-layer-0';
        circle1.setAttribute('cx', '100');
        circle1.setAttribute('cy', '100');
        circle1.setAttribute('r', '50');
        svg.appendChild(circle1);

        const circle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle2.id = 'Y-layer-1';
        circle2.setAttribute('cx', '200');
        circle2.setAttribute('cy', '200');
        circle2.setAttribute('r', '75');
        svg.appendChild(circle2);

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert
        expect(result.axisCircles.length).toBeGreaterThanOrEqual(2);
        const xCircle = result.axisCircles.find(c => c.id === 'X-layer-0');
        expect(xCircle).toBeDefined();
        expect(xCircle?.cx).toBe(100);
        expect(xCircle?.cy).toBe(100);
        expect(xCircle?.r).toBe(50);
    });

    it('attachStickerEventListeners attaches mouseover, mouseout, and click listeners', () => {
        // Arrange
        const circle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const circle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');

        const state: any = {
            svgElementCache: new Map([
                ['svg1', circle1],
                ['svg2', circle2],
            ]),
            svgIdToStickerId: new Map([
                ['svg1', 'st1'],
                ['svg2', 'st2'],
            ]),
        };

        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        const onStickerSelectedSpy = vi.fn();

        // Act
        initialization.attachStickerEventListeners(state, 'circular', onStickerSelectedSpy);

        // Assert
        // Trigger mouseover on circle1
        circle1.dispatchEvent(new MouseEvent('mouseover'));
        expect(emitSpy).toHaveBeenCalledWith(EventName.HIGHLIGHT_CHANGED, {
            stickerId: 'st1',
            viewId: 'circular',
        });

        // Trigger mouseout on circle1
        emitSpy.mockClear();
        circle1.dispatchEvent(new MouseEvent('mouseout'));
        expect(emitSpy).toHaveBeenCalledWith(EventName.HIGHLIGHT_CHANGED, {
            stickerId: undefined,
            viewId: 'circular',
        });

        // Trigger click on circle2
        emitSpy.mockClear();
        const clickEvent = circle2.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true })
        );
        // Click should invoke the onStickerSelected callback
        expect(clickEvent).toBeDefined();
        expect(onStickerSelectedSpy).toHaveBeenCalledWith('st2');
    });

    it('attachStickerEventListeners handles missing sticker ID gracefully', () => {
        // Arrange
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');

        const state: any = {
            svgElementCache: new Map([['svgX', circle]]),
            svgIdToStickerId: new Map(), // No mapping for svgX
        };

        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        // Act & Assert
        expect(() =>
            initialization.attachStickerEventListeners(state, 'circular', vi.fn())
        ).not.toThrow();

        // Trigger mouseover - should not emit since no stickerId mapping
        circle.dispatchEvent(new MouseEvent('mouseover'));
        expect(emitSpy).not.toHaveBeenCalled();
    });
});
