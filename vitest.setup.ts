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
