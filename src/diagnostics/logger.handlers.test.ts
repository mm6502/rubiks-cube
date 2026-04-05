import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initializeErrorHandlers, logger } from './logger';

describe('global error handlers', () => {
    let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Logger caches console methods at module init, so spy the logger method directly.
        loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        // Re-initialize handlers after setting up the spy so they use the mocked method.
        initializeErrorHandlers();
    });

    afterEach(() => {
        loggerErrorSpy.mockRestore();
    });

    it('prevents default browser error reporting and blocks subsequent error listeners', () => {
        // Arrange
        const otherListener = vi.fn();
        // Add this listener after initialization so it would normally run after ours.
        window.addEventListener('error', otherListener);

        const err = new Error('boom');
        // Use the window ErrorEvent constructor to ensure JSDOM's implementation is used.
        const ev = new (window as any).ErrorEvent('error', {
            error: err,
            message: 'boom',
            cancelable: true,
        });

        // Act
        window.dispatchEvent(ev);

        // Assert
        expect(logger.error).toHaveBeenCalled();
        expect(otherListener).not.toHaveBeenCalled();

        window.removeEventListener('error', otherListener);
    });

    it('logs non-cancelable error events without blocking propagation', () => {
        // Arrange
        const otherListener = vi.fn();
        window.addEventListener('error', otherListener);
        const err = new Error('non-cancelable boom');
        const ev = new (window as any).ErrorEvent('error', {
            error: err,
            message: 'non-cancelable boom',
            cancelable: false,
        });

        // Act
        window.dispatchEvent(ev);

        // Assert
        expect(logger.error).toHaveBeenCalled();
        expect(otherListener).toHaveBeenCalled();

        window.removeEventListener('error', otherListener);
    });

    it('prevents default unhandledrejection reporting and blocks subsequent rejection listeners', () => {
        // Arrange
        const otherRej = vi.fn();
        window.addEventListener('unhandledrejection', otherRej);

        // Use the window Event constructor to ensure JSDOM's implementation is used.
        const ev = new (window as any).Event('unhandledrejection', { cancelable: true });
        // Provide reason field that our handler expects
        (ev as any).reason = 'oops';

        // Act
        window.dispatchEvent(ev);

        // Assert
        expect(logger.error).toHaveBeenCalled();
        expect(otherRej).not.toHaveBeenCalled();

        window.removeEventListener('unhandledrejection', otherRej);
    });

    it('logs non-cancelable unhandledrejection events without blocking propagation', () => {
        // Arrange
        const otherRej = vi.fn();
        window.addEventListener('unhandledrejection', otherRej);
        const ev = new (window as any).Event('unhandledrejection', { cancelable: false });
        (ev as any).reason = 'non-cancelable reason';

        // Act
        window.dispatchEvent(ev);

        // Assert
        expect(logger.error).toHaveBeenCalled();
        expect(otherRej).toHaveBeenCalled();

        window.removeEventListener('unhandledrejection', otherRej);
    });
});
