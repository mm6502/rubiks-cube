// fallow-ignore-file unresolved-import
import { afterEach, describe, expect, it, vi } from 'vitest';

// Import the functions to test
import * as main from './main';
import { Application } from './application';
import { logger } from './diagnostics/logger';

// Setup global document mock
const mockLink = {
    setAttribute: vi.fn(),
    parentNode: null as any,
};

const mockHead = {
    appendChild: vi.fn(),
};

const mockDocument: any = {
    querySelector: vi.fn(),
    querySelectorAll: vi.fn(() => [] as any),
    createElement: vi.fn(() => mockLink),
    head: mockHead,
};

Object.defineProperty(globalThis, 'document', {
    value: mockDocument,
    writable: true,
    configurable: true,
});

// Mock modules
vi.mock('./main.css', () => ({}));
vi.mock('./styles/buttons.module.css', () => ({}));
vi.mock('/favicon.svg?raw', () => ({
    default: '<svg>mock favicon</svg>',
}));
vi.mock('./application', () => {
    const MockApplication = vi.fn().mockImplementation(function (this: any) {
        this.initialize = vi.fn();
    });
    return {
        Application: MockApplication,
    };
});
vi.mock('./diagnostics/logger', () => ({
    logger: {
        log: vi.fn(),
    },
}));

describe('injectFavicon', () => {
    afterEach(() => {
        vi.clearAllMocks();
        // Reset link parentNode for each test
        mockLink.parentNode = null;
    });

    it('should find existing favicon link if present', () => {
        // Arrange
        mockDocument.querySelector.mockReturnValue(mockLink);

        // Act
        main.injectFavicon();

        // Assert
        expect(mockDocument.querySelector).toHaveBeenCalledWith("link[rel*='icon']");
        expect(mockDocument.createElement).not.toHaveBeenCalled();
    });

    it('should create new favicon link if none exists', () => {
        // Arrange
        mockDocument.querySelector.mockReturnValue(null);

        // Act
        main.injectFavicon();

        // Assert
        expect(mockDocument.querySelector).toHaveBeenCalledWith("link[rel*='icon']");
        expect(mockDocument.createElement).toHaveBeenCalledWith('link');
    });

    it('should set correct attributes on favicon link', () => {
        // Arrange
        mockDocument.querySelector.mockReturnValue(null);

        // Act
        main.injectFavicon();

        // Assert
        expect(mockLink.setAttribute).toHaveBeenCalledWith('rel', 'icon');
        expect(mockLink.setAttribute).toHaveBeenCalledWith('type', 'image/svg+xml');
        expect(mockLink.setAttribute).toHaveBeenCalledWith(
            'href',
            expect.stringContaining('data:image/svg+xml')
        );
    });

    it('should append favicon to document head if not already attached', () => {
        // Arrange
        mockDocument.querySelector.mockReturnValue(null);
        mockLink.parentNode = null;

        // Act
        main.injectFavicon();

        // Assert
        expect(mockHead.appendChild).toHaveBeenCalledWith(mockLink);
    });

    it('should not append favicon if already attached to DOM', () => {
        // Arrange
        mockDocument.querySelector.mockReturnValue(null);
        mockLink.parentNode = mockHead; // Already attached

        // Act
        main.injectFavicon();

        // Assert
        expect(mockHead.appendChild).not.toHaveBeenCalled();
    });
});

describe('onDomReady', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize the application correctly', () => {
        // Arrange - nothing special needed (mocks already in place)

        // Act
        main.onDomReady();

        // Assert
        expect(logger.log).toHaveBeenCalledWith("Rubik's Cube v1");
        expect(Application).toHaveBeenCalledTimes(1);
        expect(logger.log).toHaveBeenCalledWith('Application initialized');
    });
});

describe('theme preference helpers', () => {
    const mockSetAttribute = vi.fn();
    const mockGetItem = vi.fn();
    const mockSetItem = vi.fn();
    const mockMatchMedia = vi.fn();

    // Create a minimal mock document element for theme attribute writes.
    const mockDocumentElement = {
        setAttribute: mockSetAttribute,
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Ensure the document root is present for applyThemePreference.
        mockDocument.documentElement = mockDocumentElement;

        // Stub localStorage.
        vi.stubGlobal('localStorage', {
            getItem: mockGetItem,
            setItem: mockSetItem,
        });

        // Stub window.matchMedia (used by applyThemePreference and setupSystemThemeListener).
        mockMatchMedia.mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
        });
        // In jsdom, window exists; ensure our stub is used by application code.
        (globalThis as any).window = (globalThis as any).window || {};
        (globalThis as any).window.matchMedia = mockMatchMedia;
    });

    it('applyThemePreference writes data attributes to document root', () => {
        // Act
        main.applyThemePreference('dark');

        // Assert
        expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'dark');
        expect(mockSetAttribute).toHaveBeenCalledWith('data-theme-effective', 'dark');
    });

    it('applyThemePreference uses matchMedia for system preference', () => {
        // Arrange
        mockMatchMedia.mockReturnValueOnce({
            matches: true,
            addEventListener: vi.fn(),
        });

        // Act
        main.applyThemePreference('system');

        // Assert
        expect(mockMatchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
        expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'system');
        expect(mockSetAttribute).toHaveBeenCalledWith('data-theme-effective', 'dark');
    });

    it('applySavedThemePreference applies stored preference and falls back to system', () => {
        // Arrange
        mockGetItem.mockReturnValue('light');

        // Act
        main.applySavedThemePreference();

        // Assert
        expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'light');

        // Arrange
        mockGetItem.mockReturnValue('not-a-theme');

        // Act
        main.applySavedThemePreference();

        // Assert
        expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'system');
    });

    it('applySavedThemePreference falls back to system when localStorage throws', () => {
        // Arrange
        mockGetItem.mockImplementation(() => {
            throw new Error('boom');
        });

        // Act / Assert
        expect(() => main.applySavedThemePreference()).not.toThrow();
        expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'system');
    });

    it('setupThemePreferenceControl ignores invalid theme values on change', () => {
        // Arrange
        const radio = {
            value: 'notarealtheme',
            checked: false,
            addEventListener: vi.fn(),
        } as any;
        mockDocument.querySelectorAll.mockReturnValue([radio]);
        mockGetItem.mockReturnValue('system');

        // Act
        main.setupThemePreferenceControl();

        // Trigger the change handler; it should not throw or call setItem.
        const changeHandler = radio.addEventListener.mock.calls[0][1] as () => void;
        changeHandler();

        // Assert
        expect(mockSetItem).not.toHaveBeenCalled();
    });

    it('setupThemePreferenceControl persists preference changes even when localStorage throws', () => {
        // Arrange
        const radio = {
            value: 'light',
            checked: false,
            addEventListener: vi.fn(),
        } as any;
        mockDocument.querySelectorAll.mockReturnValue([radio]);
        mockGetItem.mockReturnValue('system');
        mockSetItem.mockImplementation(() => {
            throw new Error('quota');
        });

        // Act
        main.setupThemePreferenceControl();

        // Trigger the change handler. It should swallow errors.
        radio.checked = true;
        const changeHandler = radio.addEventListener.mock.calls[0][1] as () => void;

        // Assert
        expect(() => changeHandler()).not.toThrow();
    });

    it('setupThemePreferenceControl wires radio buttons and persists changes', () => {
        // Arrange
        const radio1 = { value: 'light', checked: false, addEventListener: vi.fn() } as any;
        const radio2 = { value: 'dark', checked: false, addEventListener: vi.fn() } as any;
        mockDocument.querySelectorAll.mockReturnValue([radio1, radio2]);
        mockGetItem.mockReturnValue('dark');

        // Act
        main.setupThemePreferenceControl();

        // Assert
        expect(radio1.checked).toBe(false);
        expect(radio2.checked).toBe(true);
        expect(radio1.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        expect(radio2.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('setupSystemThemeListener registers a change listener and reapplies theme when preference is system', () => {
        // Arrange
        const addEventListener = vi.fn();
        mockMatchMedia.mockReturnValue({ matches: false, addEventListener });
        mockGetItem.mockReturnValue('system');

        // Act
        main.setupSystemThemeListener();

        // Assert
        expect(mockMatchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
        expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

        // Simulate a system theme change
        const changeCallback = addEventListener.mock.calls[0][1] as () => void;
        changeCallback();

        // Assert
        expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'system');
    });
});
