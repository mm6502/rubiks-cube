// Rubik's Cube - Main Entry Point (v1)
// Application initialization and DOM setup
import { Application } from './application';
import { logger } from './diagnostics/logger';
import './main.css';
import './styles/buttons.module.css';
import favicon from '/favicon.svg?raw';

const THEME_PREFERENCE_STORAGE_KEY = 'ui.theme.preference';

let systemThemeMediaQuery: MediaQueryList | null = null;

type ThemePreference = 'system' | 'light' | 'dark';

// Logging startup and console helpers are initialized
// in `diagnostics/logger.ts` to keep concerns separated.

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', onDomReady.bind(this));

/**
 * Main function to initialize the application once the DOM is fully loaded.
 * This includes injecting the favicon, logging startup messages,
 * and initializing the main Application class.
 */
export function onDomReady() {
    // Inject favicon dynamically.
    injectFavicon();

    // Apply persisted user theme preference before app initialization.
    applySavedThemePreference();
    setupThemePreferenceControl();
    setupSystemThemeListener();

    // Log application start.
    logger.log("Rubik's Cube v1");

    // Initialize the main application.
    const app = new Application();
    app.initialize();

    // Log completion of initialization.
    logger.log('Application initialized');
}

/**
 * Applies the persisted theme preference if available.
 */
export function applySavedThemePreference(): void {
    const preference = readThemePreference();
    applyThemePreference(preference);
}

/**
 * Wires the UI theme selector to persistent preference storage.
 */
export function setupThemePreferenceControl(): void {
    const radios = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[name="theme-preference"]')
    );
    if (!radios.length) return;

    const preference = readThemePreference();
    radios.forEach(radio => {
        radio.checked = radio.value === preference;
        radio.addEventListener('change', () => {
            if (!radio.checked) return;

            const next = radio.value as ThemePreference;
            if (!isThemePreference(next)) return;

            persistThemePreference(next);
            applyThemePreference(next);
        });
    });
}

/**
 * Applies the requested theme preference via a root-level data attribute.
 */
export function applyThemePreference(preference: ThemePreference): void {
    const root = document.documentElement;
    if (!root) return;

    const effectiveTheme = resolveEffectiveTheme(preference);

    root.setAttribute('data-theme', preference);
    root.setAttribute('data-theme-effective', effectiveTheme);

    // Keep browser-native theming in sync with our semantic-theme tokens.
    // `only light` prevents unwanted auto-dark transforms in light mode.
    if (root.style) {
        root.style.colorScheme = effectiveTheme === 'light' ? 'only light' : 'dark';
    }

    const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
    colorSchemeMeta?.setAttribute('content', effectiveTheme);
}

/**
 * Keeps the effective theme synchronized with OS theme changes when preference is "system".
 */
export function setupSystemThemeListener(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    if (!systemThemeMediaQuery) {
        systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    }

    const handleSystemThemeChange = (): void => {
        const currentPreference = readThemePreference();
        if (currentPreference === 'system') {
            applyThemePreference('system');
        }
    };

    systemThemeMediaQuery.addEventListener('change', handleSystemThemeChange);
}

function isThemePreference(value: string): value is ThemePreference {
    return value === 'system' || value === 'light' || value === 'dark';
}

function resolveEffectiveTheme(preference: ThemePreference): 'light' | 'dark' {
    if (preference === 'light' || preference === 'dark') {
        return preference;
    }

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    return 'light';
}

function readThemePreference(): ThemePreference {
    try {
        const value = localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
        if (!value || !isThemePreference(value)) {
            return 'system';
        }

        return value;
    } catch {
        return 'system';
    }
}

function persistThemePreference(preference: ThemePreference): void {
    try {
        localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
    } catch {
        // Ignore storage errors (private mode/quota issues) and keep runtime preference.
    }
}

/**
 * Injects the favicon into the document head.
 */
export function injectFavicon() {
    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.setAttribute('rel', 'icon');
    link.setAttribute('type', 'image/svg+xml');
    link.setAttribute('href', `data:image/svg+xml,${encodeURIComponent(favicon)}`);
    if (!link.parentNode) {
        document.head.appendChild(link);
    }
}
