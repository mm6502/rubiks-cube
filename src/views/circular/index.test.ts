import { describe, expect, it, vi } from 'vitest';

import { circularViewFactory } from './index';

// Mock CSS modules
vi.mock('./circular.module.css', () => ({
    default: {
        highlighted: 'highlighted',
        selected: 'selected',
    },
}));

describe('circularViewFactory', () => {
    describe('getSupportedSizes', () => {
        it('offers the sizes that have a validated asset', () => {
            // Each size listed here must have a committed asset the loader can
            // resolve; svg-loader.test.ts asserts the other direction.
            expect(circularViewFactory.getSupportedSizes!()).toEqual([2, 3, 4]);
        });

        it('does not offer sizes whose assets are validation-only or absent', () => {
            const sizes = circularViewFactory.getSupportedSizes!();
            // 5x5 is a ghost-rule validation target with a real parameter set,
            // so it is the one most likely to be enabled by accident.
            expect(sizes).not.toContain(5);
            expect(sizes).not.toContain(6);
            expect(sizes).not.toContain(7);
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
