import { flatViewFactory } from './index';

describe('flatViewFactory', () => {
    it('should create a FlatView instance', () => {
        // Act
        const view = flatViewFactory.create();
        // Assert
        expect(view).toBeDefined();
        expect(typeof view).toBe('object');
    });

    it('should return correct view type', () => {
        // Act & Assert
        expect(flatViewFactory.getViewType()).toBe('flat');
    });

    it('should return correct title', () => {
        // Act & Assert
        expect(flatViewFactory.getTitle()).toBe('Flat View');
    });

    it('should return default config with expected shape', () => {
        // Act
        const config = flatViewFactory.getDefaultConfig();
        // Assert
        expect(config).toHaveProperty('x');
        expect(config).toHaveProperty('y');
        expect(config).toHaveProperty('width');
        expect(config).toHaveProperty('height');
    });
});
