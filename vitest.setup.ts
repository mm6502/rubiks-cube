import { vi } from 'vitest';

import { LogLevel, logger } from './src/diagnostics/logger';

logger.setLogLevel(LogLevel.WARN);

// Suppress test environment warnings that don't affect functionality
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: any, ...args: any[]) => {
    const str = chunk?.toString() || '';

    // Suppress jsdom "Not implemented" warnings
    if (str.includes('Not implemented: navigation')) return true;

    // Suppress Node.js localStorage warning
    if (str.includes('--localstorage-file')) return true;

    return originalStderrWrite(chunk, ...args);
}) as any;

// Create a localStorage mock that works in all test contexts
class LocalStorageMock implements Storage {
    private store: Record<string, string> = {};

    getItem(key: string): string | null {
        return this.store[key] || null;
    }

    setItem(key: string, value: string): void {
        this.store[key] = value.toString();
    }

    removeItem(key: string): void {
        delete this.store[key];
    }

    clear(): void {
        this.store = {};
    }

    get length(): number {
        return Object.keys(this.store).length;
    }

    key(index: number): string | null {
        const keys = Object.keys(this.store);
        return keys[index] || null;
    }
}

// Force localStorage to be properly defined in all contexts
const localStorageInstance = new LocalStorageMock();

// Ensure localStorage is available on globalThis
if (typeof globalThis !== 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
        value: localStorageInstance,
        writable: true,
        configurable: true,
    });
}

// Also ensure it's available on window if window exists
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
        value: localStorageInstance,
        writable: true,
        configurable: true,
    });
}

// Mock scrollIntoView for jsdom compatibility
if (typeof Element !== 'undefined') {
    Element.prototype.scrollIntoView = vi.fn();
}

// jsdom implements no hit testing at all: `document.elementFromPoint` is simply
// absent, not stubbed. Every browser has it, and the views call it on every
// pointer-down — the touch handlers hit-test the point under the pointer to
// decide whether the gesture starts on a sticker, and `updateHoverCursor` calls
// it again. A suite that dispatches contact without stubbing it therefore throws
// inside a DOM listener, where jsdom reports the error out of band rather than
// failing the test — a green suite with an error on stderr.
//
// `null` is the honest answer for an environment that cannot lay out: nothing is
// at that point. It is also what the suites that stub this per file resolve to,
// so a suite overriding it for real hit testing keeps working.
if (typeof document !== 'undefined' && typeof document.elementFromPoint !== 'function') {
    Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        writable: true,
        value: () => null,
    });
}
