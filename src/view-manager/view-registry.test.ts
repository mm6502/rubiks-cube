import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LogLevel, logger } from '@/diagnostics/logger';
import {
    createView,
    getAvailableViews,
    getViewDefaultConfig,
    getViewTitle,
} from '@/view-manager/view-registry';

beforeAll(() => {
    // Suppress logs during tests.
    logger.setLogLevel(LogLevel.NONE);
});

afterAll(() => {
    // Restore log level after tests.
    logger.setLogLevel(LogLevel.WARN);
});

describe('ViewRegistry', () => {
    it('should discover all view types at build time', () => {
        // Act
        const availableViews = getAvailableViews();

        // Assert
        expect(availableViews).toContain('basic-front');
        expect(availableViews).toContain('basic-back');
        expect(availableViews).toContain('flat');
        expect(availableViews).toContain('circular');
    });

    it('should create views for all discovered types', () => {
        // Arrange
        const availableViews = getAvailableViews();

        // Act & Assert
        for (const viewType of availableViews) {
            const view = createView(viewType);
            expect(view).toBeDefined();
            expect(view?.getViewType()).toBe(viewType);
        }
    });

    it('should return correct titles for all views', () => {
        // Act & Assert
        expect(getViewTitle('basic-front')).toBe('Basic (Front)');
        expect(getViewTitle('basic-back')).toBe('Basic (Back)');
        expect(getViewTitle('flat')).toBe('Flat View');
        expect(getViewTitle('circular')).toBe('Circular View');
    });

    it('should return default configs for all views', () => {
        // Arrange
        const availableViews = getAvailableViews();

        // Act & Assert
        for (const viewType of availableViews) {
            const config = getViewDefaultConfig(viewType);
            expect(config).toHaveProperty('x');
            expect(config).toHaveProperty('y');
            expect(config).toHaveProperty('width');
            expect(config).toHaveProperty('height');
            expect(typeof config.x).toBe('number');
            expect(typeof config.y).toBe('number');
            expect(typeof config.width).toBe('number');
            expect(typeof config.height).toBe('number');
        }
    });

    it('should handle unknown view types gracefully', () => {
        // Act
        const view = createView('unknown-view');

        // Assert
        expect(view).toBeUndefined();
    });
});
