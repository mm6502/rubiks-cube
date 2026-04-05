import { beforeEach, describe, expect, it } from 'vitest';

import { canColorizeOutput, detectOS } from './global';

describe('detectOS', () => {
    const originalNavigator = globalThis.navigator;

    beforeEach(() => {
        // Reset navigator mock before each test
        Object.defineProperty(globalThis, 'navigator', {
            value: { ...originalNavigator },
            writable: true,
        });
    });

    it('should return platform from userAgentData when available', () => {
        // Arrange
        (globalThis.navigator as any).userAgentData = { platform: 'TestOS' };

        // Act
        const result = detectOS();

        // Assert
        expect(result).toBe('TestOS');
    });

    it('should detect macOS from userAgent', () => {
        // Arrange
        (globalThis.navigator as any).userAgentData = undefined;
        (globalThis.navigator as any).userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

        // Act
        const result = detectOS();

        // Assert
        expect(result).toBe('macOS');
    });

    it('should detect Windows from userAgent', () => {
        // Arrange
        (globalThis.navigator as any).userAgentData = undefined;
        (globalThis.navigator as any).userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

        // Act
        const result = detectOS();

        // Assert
        expect(result).toBe('Windows');
    });

    it('should detect Linux from userAgent', () => {
        // Arrange
        (globalThis.navigator as any).userAgentData = undefined;
        (globalThis.navigator as any).userAgent = 'Mozilla/5.0 (X11; Linux x86_64)';

        // Act
        const result = detectOS();

        // Assert
        expect(result).toBe('Linux');
    });

    it('should detect iOS from userAgent', () => {
        // Arrange
        (globalThis.navigator as any).userAgentData = undefined;
        (globalThis.navigator as any).userAgent =
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)';

        // Act
        const result = detectOS();

        // Assert
        expect(result).toBe('iOS');
    });

    it('should detect Android from userAgent', () => {
        // Arrange
        (globalThis.navigator as any).userAgentData = undefined;
        (globalThis.navigator as any).userAgent = 'Mozilla/5.0 (Linux; Android 10; SM-G975F)';

        // Act
        const result = detectOS();

        // Assert
        expect(result).toBe('Android');
    });

    it('should return Unknown for unrecognized userAgent', () => {
        // Arrange
        (globalThis.navigator as any).userAgentData = undefined;
        (globalThis.navigator as any).userAgent = 'Some unknown user agent string';

        // Act
        const result = detectOS();

        // Assert
        expect(result).toBe('Unknown');
    });
});

describe('canColorizeOutput', () => {
    const originalNavigator = globalThis.navigator;

    beforeEach(() => {
        // Reset navigator before each test
        Object.defineProperty(globalThis, 'navigator', {
            value: { ...originalNavigator },
            writable: true,
        });
    });

    it('should return true for jsdom', () => {
        // Arrange
        (globalThis.navigator as any).userAgent = 'jsdom/16.4.0';

        // Act
        const result = canColorizeOutput();

        // Assert
        expect(result).toBe(true);
    });

    it('should return false for Firefox', () => {
        // Arrange
        (globalThis.navigator as any).userAgent =
            'Mozilla/5.0 (Windows NT 10.0; rv:78.0) Gecko/20100101 Firefox/78.0';

        // Act
        const result = canColorizeOutput();

        // Assert
        expect(result).toBe(false);
    });

    it('should return true for other browsers', () => {
        // Arrange
        (globalThis.navigator as any).userAgent =
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

        // Act
        const result = canColorizeOutput();

        // Assert
        expect(result).toBe(true);
    });
});
