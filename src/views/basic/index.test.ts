import { describe, expect, it, vi } from 'vitest';

import { basicViewFactory } from './index';

// BasicView itself imports styles; nothing exported from the factory uses CSS,
// but mocking the module keeps the tests isolated in case the constructor
// accesses styles during initialization.
vi.mock('./basic-view.module.css', () => ({
    default: {
        someClass: 'someClass',
    },
}));

describe('basicViewFactory', () => {
    describe('create', () => {
        it('should create a new BasicView instance', () => {
            // Act
            const view = basicViewFactory.create();

            // Assert
            expect(view).toBeDefined();
            expect(view.constructor.name).toBe('BasicView');
        });

        it('should create a different instance each time', () => {
            // Act
            const v1 = basicViewFactory.create();
            const v2 = basicViewFactory.create();

            // Assert
            expect(v1).not.toBe(v2);
        });

        it('should accept an optional config argument', () => {
            // Arrange
            const config = { foo: 'bar' };

            // Act
            const view = basicViewFactory.create(config);

            // Assert
            expect(view).toBeDefined();
        });
    });

    describe('getViewType', () => {
        it('returns "basic"', () => {
            // Act
            const type = basicViewFactory.getViewType();

            // Assert
            expect(type).toBe('basic');
        });
    });

    describe('getTitle', () => {
        it('returns "Basic View"', () => {
            // Act
            const title = basicViewFactory.getTitle();

            // Assert
            expect(title).toBe('Basic View');
        });
    });

    describe('getDefaultConfig', () => {
        it('returns the expected default configuration', () => {
            // Act
            const cfg = basicViewFactory.getDefaultConfig();

            // Assert
            expect(cfg).toEqual({
                x: 20,
                y: 20,
                width: 300,
                height: 300,
            });
        });

        it('returns an object with numeric x/y/width/height', () => {
            // Act
            const cfg = basicViewFactory.getDefaultConfig();

            // Assert
            expect(cfg).toHaveProperty('x');
            expect(cfg).toHaveProperty('y');
            expect(cfg).toHaveProperty('width');
            expect(cfg).toHaveProperty('height');
            expect(typeof cfg.x).toBe('number');
            expect(typeof cfg.y).toBe('number');
            expect(typeof cfg.width).toBe('number');
            expect(typeof cfg.height).toBe('number');
        });
    });

    describe('getVariants', () => {
        it('returns an array of two variants with correct structure', () => {
            // Act
            const variants = basicViewFactory.getVariants!();

            // Assert
            expect(Array.isArray(variants)).toBe(true);
            expect(variants.length).toBe(2);

            for (const v of variants) {
                expect(v).toHaveProperty('viewType');
                expect(v).toHaveProperty('title');
                expect(v).toHaveProperty('defaultConfig');
                const cfg = v.defaultConfig;
                expect(cfg).toHaveProperty('x');
                expect(cfg).toHaveProperty('y');
                expect(cfg).toHaveProperty('width');
                expect(cfg).toHaveProperty('height');
            }

            expect(variants[0].viewType).toBe('basic-front');
            expect(variants[0].title).toBe('Basic (Front)');
            expect(variants[1].viewType).toBe('basic-back');
            expect(variants[1].title).toBe('Basic (Back)');
        });
    });
});
