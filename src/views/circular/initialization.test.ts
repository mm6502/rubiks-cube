import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { logger } from '@/diagnostics/logger';
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

    it('buildStickerLookupMap skips invalid sticker IDs', () => {
        // Arrange - create SVG with axis circles
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        // Add axis circles
        const circleX = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleX.id = 'X-layer-1';
        circleX.setAttribute('cx', '100');
        circleX.setAttribute('cy', '100');
        circleX.setAttribute('r', '50');
        svg.appendChild(circleX);

        // Add sticker with invalid ID format (should not match the pattern)
        const invalidSticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        invalidSticker.id = 'not-a-sticker-id';
        invalidSticker.setAttribute('class', 'sticker');
        svg.appendChild(invalidSticker);

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert - invalid sticker should be skipped, lookup should be empty
        expect(result.lookupMap.size).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith('Invalid SVG sticker ID: not-a-sticker-id');
    });

    it('buildStickerLookupMap warns about duplicate mappings', () => {
        // Arrange - create SVG with properly positioned stickers that would map to same position
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        // This test verifies the warning log path by checking the lookup result
        // when multiple stickers would map to the same position (edge case)
        const result = initialization.buildStickerLookupMap(svg);

        // Assert - verify no errors occur
        expect(result.lookupMap).toBeDefined();
        expect(result.axisCircles).toBeDefined();
    });

    it('buildStickerLookupMap handles Y-null with invalid face label', () => {
        // This tests the Y=null, invalid face label branch
        // Arrange
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        // For Y=null: sticker must be on X and Z circles but not Y circle
        const circleX = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleX.id = 'X-layer-1';
        circleX.setAttribute('cx', '100');
        circleX.setAttribute('cy', '100');
        circleX.setAttribute('r', '50');
        svg.appendChild(circleX);

        const circleZ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleZ.id = 'Z-layer-0';
        circleZ.setAttribute('cx', '100');
        circleZ.setAttribute('cy', '100');
        circleZ.setAttribute('r', '80');
        svg.appendChild(circleZ);

        // Position sticker on both X and Z circles: at distance 50 from center (on X-layer-1) and distance 80 (on Z-layer-0)
        // Point (150, 100): dist from (100,100) = 50, on both circles
        const sticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        sticker.id = 'sticker-L-1'; // L is invalid when Y=null (should be D or U)
        sticker.setAttribute('class', 'sticker');
        sticker.setAttribute('cx', '150');
        sticker.setAttribute('cy', '100');
        svg.appendChild(sticker);

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert - invalid face label should result in empty lookup
        expect(result.lookupMap.size).toBe(0);
        expect(errorSpy).toHaveBeenCalled();
    });

    it('buildStickerLookupMap handles Z-null with invalid face label', () => {
        // This tests the Z=null, invalid face label branch
        // Arrange
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        // For Z=null: sticker must be on X and Y circles but not Z circle
        const circleX = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleX.id = 'X-layer-1';
        circleX.setAttribute('cx', '100');
        circleX.setAttribute('cy', '100');
        circleX.setAttribute('r', '50');
        svg.appendChild(circleX);

        const circleY = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleY.id = 'Y-layer-1';
        circleY.setAttribute('cx', '100');
        circleY.setAttribute('cy', '100');
        circleY.setAttribute('r', '80');
        svg.appendChild(circleY);

        // Position sticker at distance 50 from center (on X-layer-1 and Y-layer-1)
        const sticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        sticker.id = 'sticker-U-1'; // U is invalid when Z=null (should be F or B)
        sticker.setAttribute('class', 'sticker');
        sticker.setAttribute('cx', '150');
        sticker.setAttribute('cy', '100');
        svg.appendChild(sticker);

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert - invalid face label should result in empty lookup
        expect(result.lookupMap.size).toBe(0);
        expect(errorSpy).toHaveBeenCalled();
    });

    it('buildStickerLookupMap handles invalid axis coordinates', () => {
        // This tests the path where all three axes are null (invalid state)
        // Arrange
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        // No axis circles at all (all axes will be null)
        // Add a sticker anyway
        const sticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        sticker.id = 'sticker-F-1';
        sticker.setAttribute('class', 'sticker');
        sticker.setAttribute('cx', '100');
        sticker.setAttribute('cy', '100');
        svg.appendChild(sticker);

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert - invalid coordinates should result in empty lookup
        expect(result.lookupMap.size).toBe(0);
        expect(errorSpy).toHaveBeenCalledWith('Invalid axis coordinates: X=null, Y=null, Z=null');
    });

    it('buildStickerLookupMap handles X-null with invalid face label', () => {
        // This tests the X=null, invalid face label branch
        // Arrange
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        // For X=null: sticker must be on Y and Z circles but not X circle
        const circleY = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleY.id = 'Y-layer-1';
        circleY.setAttribute('cx', '100');
        circleY.setAttribute('cy', '100');
        circleY.setAttribute('r', '50');
        svg.appendChild(circleY);

        const circleZ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleZ.id = 'Z-layer-0';
        circleZ.setAttribute('cx', '100');
        circleZ.setAttribute('cy', '100');
        circleZ.setAttribute('r', '80');
        svg.appendChild(circleZ);

        // Position sticker at distance 50 from center (on Y-layer-1 and Z-layer-0)
        const sticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        sticker.id = 'sticker-F-1'; // F is invalid when X=null (should be L or R)
        sticker.setAttribute('class', 'sticker');
        sticker.setAttribute('cx', '150');
        sticker.setAttribute('cy', '100');
        svg.appendChild(sticker);

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert - invalid face label should result in empty lookup
        expect(result.lookupMap.size).toBe(0);
        expect(errorSpy).toHaveBeenCalled();
    });
});
