import { describe, expect, it, vi } from 'vitest';

import { circularViewFactory } from './index';
import { loadedSizes, svgMarkupForSize } from './svg-loader';

// Mock CSS modules
vi.mock('./circular.module.css', () => ({
    default: {
        highlighted: 'highlighted',
        selected: 'selected',
    },
}));

describe('circularViewFactory', () => {
    describe('getSupportedSizes', () => {
        it('offers every size that has a resolvable asset', () => {
            // The list is derived from the loader rather than restated, so this
            // asserts the two agree and that the set is the expected one. Each
            // size named must have a committed asset; svg-loader.test.ts asserts
            // the same property from the other direction.
            const sizes = circularViewFactory.getSupportedSizes!();
            expect(sizes).toEqual(loadedSizes());
            expect(sizes).toEqual([2, 3, 4, 5, 6, 7]);
        });

        it('never offers a size the loader cannot resolve', () => {
            // The failure this guards against is a checkbox for a size with no
            // asset, which would throw on selection rather than being greyed out.
            for (const size of circularViewFactory.getSupportedSizes!()) {
                expect(svgMarkupForSize(size)).toBeDefined();
            }
        });
    });

    describe('create', () => {
        it('should create a new CircularCubeView instance', () => {
            // Arrange & Act
            const view = circularViewFactory.create();

            // Assert
            expect(view).toBeDefined();
            expect(view.constructor.name).toBe('CircularCubeView');
        });

        it('should create a new instance each time', () => {
            // Arrange & Act
            const view1 = circularViewFactory.create();
            const view2 = circularViewFactory.create();

            // Assert
            expect(view1).not.toBe(view2);
        });

        it('should accept optional config parameter', () => {
            // Arrange
            const config = { someOption: 'test' };

            // Act
            const view = circularViewFactory.create(config);

            // Assert
            expect(view).toBeDefined();
        });
    });

    describe('getViewType', () => {
        it('should return "circular"', () => {
            // Act
            const viewType = circularViewFactory.getViewType();

            // Assert
            expect(viewType).toBe('circular');
        });
    });

    describe('getTitle', () => {
        it('should return "Circular View"', () => {
            // Act
            const title = circularViewFactory.getTitle();

            // Assert
            expect(title).toBe('Circular View');
        });
    });

    describe('getDefaultConfig', () => {
        it('should return correct default configuration', () => {
            // Act
            const config = circularViewFactory.getDefaultConfig();

            // Assert
            expect(config).toEqual({
                x: 140,
                y: 0,
                width: 450,
                height: 450,
            });
        });

        it('should return an object with required properties', () => {
            // Act
            const config = circularViewFactory.getDefaultConfig();

            // Assert
            expect(config).toHaveProperty('x');
            expect(config).toHaveProperty('y');
            expect(config).toHaveProperty('width');
            expect(config).toHaveProperty('height');
            expect(typeof config.x).toBe('number');
            expect(typeof config.y).toBe('number');
            expect(typeof config.width).toBe('number');
            expect(typeof config.height).toBe('number');
        });
    });
});
