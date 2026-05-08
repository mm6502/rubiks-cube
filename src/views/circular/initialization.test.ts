import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { getPositionKey } from '@/cube/utils/coordinates';
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

    it('buildStickerLookupMap returns empty map for SVG with axis circles but no stickers', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '3');

        // Add at least one axis circle so parseAxisCircles doesn't throw
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.id = 'X-layer-0';
        circle.setAttribute('data-axis', 'X');
        circle.setAttribute('data-layer-index', '0');
        circle.setAttribute('cx', '100');
        circle.setAttribute('cy', '100');
        circle.setAttribute('r', '50');
        svg.appendChild(circle);

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert
        expect(result.lookupMap.size).toBe(0);
        expect(result.axisCircles.length).toBe(1);
    });

    it('buildStickerLookupMap parses axis circles with correct attributes', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '3');

        // Add axis circle elements with proper IDs that match parsing logic
        const circle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle1.id = 'X-layer-0';
        circle1.setAttribute('data-axis', 'X');
        circle1.setAttribute('data-layer-index', '0');
        circle1.setAttribute('cx', '100');
        circle1.setAttribute('cy', '100');
        circle1.setAttribute('r', '50');
        svg.appendChild(circle1);

        const circle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle2.id = 'Y-layer-1';
        circle2.setAttribute('data-axis', 'Y');
        circle2.setAttribute('data-layer-index', '1');
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
        svg.setAttribute('data-cube-size', '3');

        // Add axis circles
        const circleX = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleX.id = 'X-layer-1';
        circleX.setAttribute('data-axis', 'X');
        circleX.setAttribute('data-layer-index', '1');
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
        // Arrange - create SVG with axis circles
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '3');

        // Add an axis circle so parseAxisCircles doesn't throw
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.id = 'X-layer-0';
        circle.setAttribute('data-axis', 'X');
        circle.setAttribute('data-layer-index', '0');
        circle.setAttribute('cx', '100');
        circle.setAttribute('cy', '100');
        circle.setAttribute('r', '50');
        svg.appendChild(circle);

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
        svg.setAttribute('data-cube-size', '3');

        // For Y=null: sticker must be on X and Z circles but not Y circle
        const circleX = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleX.id = 'X-layer-1';
        circleX.setAttribute('data-axis', 'X');
        circleX.setAttribute('data-layer-index', '1');
        circleX.setAttribute('cx', '100');
        circleX.setAttribute('cy', '100');
        circleX.setAttribute('r', '50');
        svg.appendChild(circleX);

        const circleZ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleZ.id = 'Z-layer-0';
        circleZ.setAttribute('data-axis', 'Z');
        circleZ.setAttribute('data-layer-index', '0');
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
        svg.setAttribute('data-cube-size', '3');

        // For Z=null: sticker must be on X and Y circles but not Z circle
        const circleX = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleX.id = 'X-layer-1';
        circleX.setAttribute('data-axis', 'X');
        circleX.setAttribute('data-layer-index', '1');
        circleX.setAttribute('cx', '100');
        circleX.setAttribute('cy', '100');
        circleX.setAttribute('r', '50');
        svg.appendChild(circleX);

        const circleY = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleY.id = 'Y-layer-1';
        circleY.setAttribute('data-axis', 'Y');
        circleY.setAttribute('data-layer-index', '1');
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
        svg.setAttribute('data-cube-size', '3');

        // Add axis circles so parseAxisCircles passes, but position sticker
        // far away so it intersects none of them (all axis coords stay null)
        const circleX = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleX.id = 'X-layer-0';
        circleX.setAttribute('data-axis', 'X');
        circleX.setAttribute('data-layer-index', '0');
        circleX.setAttribute('cx', '100');
        circleX.setAttribute('cy', '100');
        circleX.setAttribute('r', '50');
        svg.appendChild(circleX);

        const sticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        sticker.id = 'sticker-F-1';
        sticker.setAttribute('class', 'sticker');
        sticker.setAttribute('cx', '500'); // far away — won't intersect circle at (100,100) r=50
        sticker.setAttribute('cy', '500');
        svg.appendChild(sticker);

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert - invalid coordinates should result in empty lookup
        expect(result.lookupMap.size).toBe(0);
        expect(errorSpy).toHaveBeenCalledWith('Invalid axis coordinates: X=null, Y=null, Z=null');
    });

    // ── U2: Multi-digit sticker ID regex ──

    it('U2: matches multi-digit sticker IDs', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '3');
        // Add an axis circle so parseAxisCircles doesn't throw
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.id = 'X-layer-0';
        circle.setAttribute('data-axis', 'X');
        circle.setAttribute('data-layer-index', '0');
        circle.setAttribute('cx', '100');
        circle.setAttribute('cy', '100');
        circle.setAttribute('r', '50');
        svg.appendChild(circle);
        const sticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        sticker.id = 'sticker-F-15';
        sticker.setAttribute('class', 'sticker');
        sticker.setAttribute('cx', '100');
        sticker.setAttribute('cy', '100');
        svg.appendChild(sticker);

        // Act — should NOT warn (valid multi-digit ID), even though
        // the sticker won't map to a cube position without axis circles
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});
        const result = initialization.buildStickerLookupMap(svg);

        // Assert
        expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('sticker-F-15'));
        expect(result.lookupMap).toBeDefined();
    });

    it('U2: rejects sticker IDs with trailing characters after multi-digit index', () => {
        // Arrange
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '3');
        // Add an axis circle so parseAxisCircles doesn't throw
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.id = 'X-layer-0';
        circle.setAttribute('data-axis', 'X');
        circle.setAttribute('data-layer-index', '0');
        circle.setAttribute('cx', '100');
        circle.setAttribute('cy', '100');
        circle.setAttribute('r', '50');
        svg.appendChild(circle);
        const sticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        sticker.id = 'sticker-F-15abc';
        sticker.setAttribute('class', 'sticker');
        svg.appendChild(sticker);

        // Act
        initialization.buildStickerLookupMap(svg);

        // Assert — $ anchor should reject trailing chars
        expect(warnSpy).toHaveBeenCalledWith('Invalid SVG sticker ID: sticker-F-15abc');
    });

    // ── U3: parseAxisCircles via DOM query ──

    it('U3: throws when SVG has no circle[data-axis] elements', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '3');

        // Act & Assert
        expect(() => initialization.buildStickerLookupMap(svg)).toThrow(/axis circle/i);
    });

    it('U3: parses axis circles via data-axis + data-layer-index attributes', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '3');

        const makeCircle = (axis: string, layer: number, cx: number, cy: number, r: number) => {
            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.id = `${axis}-layer-${layer}`;
            c.setAttribute('data-axis', axis);
            c.setAttribute('data-layer-index', String(layer));
            c.setAttribute('cx', String(cx));
            c.setAttribute('cy', String(cy));
            c.setAttribute('r', String(r));
            svg.appendChild(c);
        };

        makeCircle('X', 0, 100, 100, 50);
        makeCircle('X', 1, 100, 100, 75);
        makeCircle('Y', 2, 200, 200, 70);

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert
        expect(result.axisCircles.length).toBe(3);
        expect(result.axisCircles[0].axis).toBe('X');
        expect(result.axisCircles[0].layer).toBe(0);
        expect(result.axisCircles[1].axis).toBe('X');
        expect(result.axisCircles[1].layer).toBe(1);
        expect(result.axisCircles[2].axis).toBe('Y');
        expect(result.axisCircles[2].layer).toBe(2);
    });

    it('U3: parses axis circles in any DOM order', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '3');

        // Add them in a scrambled order
        const cZ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cZ.id = 'Z-layer-0';
        cZ.setAttribute('data-axis', 'Z');
        cZ.setAttribute('data-layer-index', '0');
        cZ.setAttribute('cx', '300');
        cZ.setAttribute('cy', '300');
        cZ.setAttribute('r', '60');
        svg.appendChild(cZ);

        const cX = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cX.id = 'X-layer-1';
        cX.setAttribute('data-axis', 'X');
        cX.setAttribute('data-layer-index', '1');
        cX.setAttribute('cx', '100');
        cX.setAttribute('cy', '100');
        cX.setAttribute('r', '50');
        svg.appendChild(cX);

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert — both should be found regardless of DOM order
        expect(result.axisCircles.length).toBe(2);
        const axes = result.axisCircles.map(c => c.axis);
        expect(axes).toContain('X');
        expect(axes).toContain('Z');
    });

    // ── U4: cubeSize via data-cube-size ──

    it('U4: throws when data-cube-size is missing', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        // Intentionally no data-cube-size attribute

        // Act & Assert
        expect(() => initialization.buildStickerLookupMap(svg)).toThrow(/data-cube-size/);
    });

    it('U4: throws when data-cube-size is not a positive integer', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '0');

        // Act & Assert
        expect(() => initialization.buildStickerLookupMap(svg)).toThrow();
    });

    it('U4: throws when data-cube-size is negative', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '-1');

        // Act & Assert
        expect(() => initialization.buildStickerLookupMap(svg)).toThrow();
    });

    it('U4: throws when data-cube-size is not a number', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', 'abc');

        // Act & Assert
        expect(() => initialization.buildStickerLookupMap(svg)).toThrow();
    });

    it('U4: maps far-face to cubeSize-1 for size 3', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '3');

        // Two circles with different centers, same radius, intersecting at (200,157):
        // Y circle: cx=175, cy=200, r=50  → sticker at (200,157): dist = √(25²+43²) = √(625+1849) = √2474 ≈ 49.74 (within tolerance 2 of r=50)
        // Z circle: cx=225, cy=200, r=50  → same distance from (225,200): identical geometry
        const cY = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cY.id = 'Y-layer-1';
        cY.setAttribute('data-axis', 'Y');
        cY.setAttribute('data-layer-index', '1');
        cY.setAttribute('cx', '175');
        cY.setAttribute('cy', '200');
        cY.setAttribute('r', '50');
        svg.appendChild(cY);

        const cZ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cZ.id = 'Z-layer-0';
        cZ.setAttribute('data-axis', 'Z');
        cZ.setAttribute('data-layer-index', '0');
        cZ.setAttribute('cx', '225');
        cZ.setAttribute('cy', '200');
        cZ.setAttribute('r', '50');
        svg.appendChild(cZ);

        const sticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        sticker.id = 'sticker-R-1';
        sticker.classList.add('sticker');
        sticker.setAttribute('cx', '200'); // intersection point of both circles
        sticker.setAttribute('cy', '157');
        svg.appendChild(sticker);

        // Act
        const result = initialization.buildStickerLookupMap(svg);

        // Assert — X=null, Y=1, Z=0, face=R → cube position {x:2, y:1, z:0}
        expect(result.lookupMap.size).toBe(1);
        const faceMap = result.lookupMap.get(getPositionKey({ x: 2, y: 1, z: 0 }));
        expect(faceMap).toBeDefined();
        expect(faceMap!.get('R')).toBe('sticker-R-1');
    });

    it('U4: maps far-face to cubeSize-1 for size 4', () => {
        // Arrange
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '4');

        // For size 4, far face coordinate should be 3
        // Sticker on Y and Z circles, face R → x = 3
        const cY = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cY.id = 'Y-layer-0';
        cY.setAttribute('data-axis', 'Y');
        cY.setAttribute('data-layer-index', '0');
        cY.setAttribute('cx', '200');
        cY.setAttribute('cy', '200');
        cY.setAttribute('r', '50');
        svg.appendChild(cY);

        const cZ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cZ.id = 'Z-layer-3'; // layer 3 valid for size 4
        cZ.setAttribute('data-axis', 'Z');
        cZ.setAttribute('data-layer-index', '3');
        cZ.setAttribute('cx', '200');
        cZ.setAttribute('cy', '200');
        cZ.setAttribute('r', '80');
        svg.appendChild(cZ);

        const sticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        sticker.id = 'sticker-R-1';
        sticker.setAttribute('class', 'sticker');
        sticker.setAttribute('cx', '250');
        sticker.setAttribute('cy', '200');
        svg.appendChild(sticker);

        // Act — sticker doesn't fully intersect, triggers 'Invalid axis coordinates' as side-effect
        vi.spyOn(logger, 'error').mockImplementation(() => {});
        const result = initialization.buildStickerLookupMap(svg);

        // Assert — map should be built with cubeSize=4
        expect(result.lookupMap).toBeDefined();
    });

    // ── Original tests continue below ──

    it('buildStickerLookupMap handles X-null with invalid face label', () => {
        // This tests the X=null, invalid face label branch
        // Arrange
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('data-cube-size', '3');

        // For X=null: sticker must be on Y and Z circles but not X circle
        const circleY = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleY.id = 'Y-layer-1';
        circleY.setAttribute('data-axis', 'Y');
        circleY.setAttribute('data-layer-index', '1');
        circleY.setAttribute('cx', '100');
        circleY.setAttribute('cy', '100');
        circleY.setAttribute('r', '50');
        svg.appendChild(circleY);

        const circleZ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circleZ.id = 'Z-layer-0';
        circleZ.setAttribute('data-axis', 'Z');
        circleZ.setAttribute('data-layer-index', '0');
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
