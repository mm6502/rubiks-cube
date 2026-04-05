// Global Types and Interfaces

declare const __brand: unique symbol;

/**
 * A utility type for creating branded types, which are nominally typed.
 * @template T The underlying type.
 * @template B The unique brand identifier.
 */
export type Branded<T, B> = T & { readonly [__brand]: B };

/**
 * Detects the operating system of the user.
 * @returns A string representing the operating system.
 */
export function detectOS(): string {
    // Modern API
    const uaData = (navigator as any).userAgentData;
    if (uaData?.platform) {
        return uaData.platform;
    }

    // Fallback
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Mac/i.test(ua)) return 'macOS';
    if (/Win/i.test(ua)) return 'Windows';
    if (/Linux/i.test(ua)) return 'Linux';

    return 'Unknown';
}

/**
 * Checks if the console output can be colorized based on the platform.
 * @returns A boolean indicating if colorized output is supported.
 */
export function canColorizeOutput(): boolean {
    // Fallback
    const ua = navigator.userAgent;

    // jsdom does support colorized output
    if (/jsdom/i.test(ua)) return true;

    // Firefox's console does not support colorized output
    if (/Firefox/i.test(ua)) return false;

    return true;
}

/**
 * Detects whether the primary input device is coarse (touch screen).
 * Returns false in non-browser environments (e.g. jsdom test environment).
 */
export function isTouchDevice(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * A simple slugify function to convert text into a URL-friendly format.
 * @param text The input string to slugify.
 * @returns A slugified version of the input string.
 */
export function slugify(text: string) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}
