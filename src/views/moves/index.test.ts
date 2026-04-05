import MovesViewFactory from './index';

describe('MovesViewFactory', () => {
    it('should create a MovesView instance', () => {
        // Act
        const view = MovesViewFactory.create();
        // Assert
        expect(view).toBeDefined();
        expect(typeof view).toBe('object');
    });

    it('should return correct view type', () => {
        // Act & Assert
        expect(MovesViewFactory.getViewType()).toBe('moves');
    });

    it('should return correct title', () => {
        // Act & Assert
        expect(MovesViewFactory.getTitle()).toBe('Moves');
    });

    it('should return default config with expected shape', () => {
        // Act
        const config = MovesViewFactory.getDefaultConfig();
        // Assert
        expect(config).toHaveProperty('x');
        expect(config).toHaveProperty('y');
        expect(config).toHaveProperty('width');
        expect(config).toHaveProperty('height');
    });
});
