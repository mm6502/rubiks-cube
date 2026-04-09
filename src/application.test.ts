// @vitest-environment jsdom
// Application unit tests
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from './application';
import { MoveHistory } from './cube/core/move-history';
import { StateManager } from './cube/core/state-manager';
import { StatePersistence } from './cube/core/state-persistence';
import { LogLevel, logger } from './diagnostics/logger';

// Mock StatePersistence before importing Application
vi.mock('./cube/core/state-persistence', () => ({
    StatePersistence: {
        loadState: vi.fn(),
        stringToState: vi.fn(),
        saveState: vi.fn(),
        clearState: vi.fn(),
        downloadState: vi.fn(),
        uploadState: vi.fn(),
    },
}));

beforeAll(() => {
    // Suppress logs during tests.
    logger.setLogLevel(LogLevel.NONE);
});

afterAll(() => {
    // Restore log level after tests.
    logger.setLogLevel(LogLevel.WARN);
});

describe('Application', () => {
    let app: Application;

    beforeEach(() => {
        // Set up basic DOM for all tests
        document.body.innerHTML = `
            <div id="app">
                <div id="visualizations"></div>
            </div>
        `;
        app = new Application();
    });

    describe('initialization', () => {
        it('should create an application instance', () => {
            // Arrange
            // Act
            const app = new Application();

            // Assert
            expect(app).toBeInstanceOf(Application);
        });

        it('should initialize without errors', () => {
            // Act
            // Assert
            expect(() => app.initialize()).not.toThrow();
        });

        it('uses native <details> and optionally persists open state when data-persist is present', () => {
            // Arrange - use native <details> markup for control sections; opt-in persistence on first
            document.body.innerHTML = `
                <div id="app">
                    <div class="controls">
                        <details class="control-section" data-persist open>
                            <summary><h2>First</h2></summary>
                            <div class="content">first content</div>
                        </details>
                        <details class="control-section" open>
                            <summary><h2>Second</h2></summary>
                            <div class="content">second content</div>
                        </details>
                    </div>
                    <div id="visualizations"></div>
                </div>
            `;

            // Pre-populate saved state to verify restore behavior
            localStorage.setItem('controls.visibility.open:first', 'false');

            const app = new Application();

            // Act
            app.initialize();

            // Assert - legacy JS toggles should NOT be present
            const toggles = document.querySelectorAll('.controls .section-toggle');
            expect(toggles.length).toBe(0);

            // Native <details> elements should exist
            const detailsEls = document.querySelectorAll('.controls .control-section');
            expect(detailsEls.length).toBe(2);

            const first = detailsEls[0] as HTMLDetailsElement;
            // restored from localStorage (was set to false above)
            expect(first.open).toBe(false);

            // Simulate opening by user and ensure persistence updates
            first.open = true;
            first.dispatchEvent(new Event('toggle'));
            expect(localStorage.getItem('controls.visibility.open:first')).toBe('true');

            const controlsEl = document.querySelector('.controls') as HTMLElement;
            expect(controlsEl).toBeTruthy();
        });

        it('should handle global keydown events and delegate to ViewManager', () => {
            // Arrange
            app.initialize();
            const viewManager = (app as any).viewManager;
            const handleKeyUpSpy = vi.spyOn(viewManager, 'handleKeyUp');

            // Act - simulate keydown event
            const event = new KeyboardEvent('keyup', { key: 'ArrowUp' });
            document.dispatchEvent(event);

            // Assert
            expect(handleKeyUpSpy).toHaveBeenCalledWith(event);
        });
    });

    describe('event handlers', () => {
        beforeEach(() => {
            app.initialize();
        });

        describe('resetCube', () => {
            it('should reset controller and update views', () => {
                // Arrange
                const controllerResetSpy = vi.spyOn((app as any).controller, 'reset');
                const viewManagerUpdateSpy = vi.spyOn((app as any).viewManager, 'updateViews');

                // Act
                (app as any).resetCube();

                // Assert
                expect(controllerResetSpy).toHaveBeenCalled();
                expect(viewManagerUpdateSpy).toHaveBeenCalledWith(undefined);
            });
        });

        describe('scrambleCube', () => {
            it('should scramble controller and update views', () => {
                // Arrange
                const controllerScrambleSpy = vi.spyOn((app as any).controller, 'scramble');
                const viewManagerUpdateSpy = vi.spyOn((app as any).viewManager, 'updateViews');

                // Act
                (app as any).scrambleCube();

                // Assert
                expect(controllerScrambleSpy).toHaveBeenCalled();
                expect(viewManagerUpdateSpy).toHaveBeenCalledWith(undefined);
            });
        });

        describe('clearStorage', () => {
            it('should delegate to viewManager, clear details persistence and saved cube state', () => {
                const clearStateSpy = vi.spyOn(StatePersistence, 'clearState');
                const clearViewSpy = vi.spyOn((app as any).viewManager, 'clearViewStorage');

                // add a details persistence key that should be removed
                localStorage.setItem('controls.visibility.open:first', 'true');

                // Act
                (app as any).clearStorage();

                // Assert
                expect(clearViewSpy).toHaveBeenCalled();
                expect(localStorage.getItem('controls.visibility.open:first')).toBeNull();
                expect(clearStateSpy).toHaveBeenCalled();
            });
        });

        describe('exportState', () => {
            it('should export state and download it', () => {
                // Arrange
                const downloadSpy = vi.spyOn(StatePersistence, 'downloadState');
                const controllerExportSpy = vi.spyOn((app as any).controller, 'exportState');
                const stateManager = new StateManager(3);
                const moveHistory = new MoveHistory(['U', 'R']);
                const mockExported = { state: stateManager.getCurrentState(), moveHistory };
                controllerExportSpy.mockReturnValue(mockExported);

                // Act
                (app as any).exportState();

                // Assert
                expect(controllerExportSpy).toHaveBeenCalled();
                expect(downloadSpy).toHaveBeenCalledWith(mockExported.state, moveHistory);
            });
        });

        describe('importState', () => {
            it('should import state successfully', async () => {
                // Arrange
                const uploadSpy = vi.spyOn(StatePersistence, 'uploadState');
                const controllerImportSpy = vi.spyOn((app as any).controller, 'importState');
                const viewManagerUpdateSpy = vi.spyOn((app as any).viewManager, 'updateViews');
                const stateManager = new StateManager(3);
                const moveHistory = new MoveHistory(['U']);
                const mockResult = { state: stateManager.getCurrentState(), moveHistory };
                uploadSpy.mockResolvedValue(mockResult);
                const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

                // Act
                await (app as any).importState();

                // Assert
                expect(uploadSpy).toHaveBeenCalled();
                expect(controllerImportSpy).toHaveBeenCalledWith(
                    mockResult.state,
                    mockResult.moveHistory
                );
                expect(viewManagerUpdateSpy).toHaveBeenCalledWith(undefined);
                expect(alertSpy).toHaveBeenCalledWith('Cube state successfully imported!');
            });

            it('should handle cancelled import', async () => {
                // Arrange
                const uploadSpy = vi.spyOn(StatePersistence, 'uploadState');
                uploadSpy.mockResolvedValue(null);

                // Act
                await (app as any).importState();

                // Assert
                expect(uploadSpy).toHaveBeenCalled();
            });

            it('should handle import error', async () => {
                // Arrange
                const uploadSpy = vi.spyOn(StatePersistence, 'uploadState');
                const controllerImportSpy = vi.spyOn((app as any).controller, 'importState');
                const stateManager = new StateManager(3);
                const moveHistory = new MoveHistory([]);
                const mockResult = { state: stateManager.getCurrentState(), moveHistory };
                uploadSpy.mockResolvedValue(mockResult);
                controllerImportSpy.mockImplementation(() => {
                    throw new Error('Invalid state');
                });
                const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

                // Act
                await (app as any).importState();

                // Assert
                expect(alertSpy).toHaveBeenCalledWith(
                    'Failed to import cube state. Please ensure the file is valid.'
                );
            });
        });
    });

    describe('restoreSavedState', () => {
        let app: Application;

        beforeEach(() => {
            // Clear all mocks
            vi.clearAllMocks();

            // Set up basic DOM
            document.body.innerHTML = `
            <div id="app">
                <div id="visualizations"></div>
            </div>
        `;
            app = new Application();
        });

        it('should do nothing when no saved state exists', () => {
            // Arrange
            (StatePersistence.loadState as any).mockReturnValue(null);

            // Act
            app.initialize();

            // Assert
            expect(StatePersistence.loadState).toHaveBeenCalled();
            expect(StatePersistence.stringToState).not.toHaveBeenCalled();
        });

        it('should successfully restore saved state when valid state exists', () => {
            // Arrange
            const mockStateString = 'valid-state-string';
            const mockState = {
                /* mock state */
            };
            const mockMoveHistory = {
                /* mock move history */
            };

            (StatePersistence.loadState as any).mockReturnValue(mockStateString);
            (StatePersistence.stringToState as any).mockReturnValue({
                state: mockState,
                moveHistory: mockMoveHistory,
            });

            const controllerSpy = vi.spyOn((app as any).controller, 'importState');

            // Act
            app.initialize();

            // Assert
            expect(StatePersistence.loadState).toHaveBeenCalled();
            expect(StatePersistence.stringToState).toHaveBeenCalledWith(mockStateString);
            expect(controllerSpy).toHaveBeenCalledWith(mockState, mockMoveHistory);
        });

        it('should handle invalid state string gracefully', () => {
            // Arrange
            const mockStateString = 'invalid-state-string';

            (StatePersistence.loadState as any).mockReturnValue(mockStateString);
            (StatePersistence.stringToState as any).mockReturnValue(null);

            // Act
            app.initialize();

            // Assert
            expect(StatePersistence.loadState).toHaveBeenCalled();
            expect(StatePersistence.stringToState).toHaveBeenCalledWith(mockStateString);
        });

        it('should handle exceptions during state restoration', () => {
            // Arrange
            const mockStateString = 'corrupted-state-string';
            const mockError = new Error('Parse error');

            (StatePersistence.loadState as any).mockReturnValue(mockStateString);
            (StatePersistence.stringToState as any).mockImplementation(() => {
                throw mockError;
            });

            // Act
            app.initialize();

            // Assert
            expect(StatePersistence.loadState).toHaveBeenCalled();
            expect(StatePersistence.stringToState).toHaveBeenCalledWith(mockStateString);
        });
    });

    describe('setupStatePersistence', () => {
        it('should save state on beforeunload', () => {
            // Arrange
            app.initialize();
            const saveStateSpy = vi.spyOn(StatePersistence, 'saveState');
            const controllerExportSpy = vi.spyOn((app as any).controller, 'exportState');
            const mockExported = { state: {} as any, moveHistory: undefined };
            controllerExportSpy.mockReturnValue(mockExported);

            // Act
            window.dispatchEvent(new Event('beforeunload'));

            // Assert
            expect(saveStateSpy).toHaveBeenCalledWith(mockExported.state, mockExported.moveHistory);
        });

        it('should save state periodically via setInterval', () => {
            // Arrange
            vi.useFakeTimers();
            app.initialize();
            const saveStateSpy = vi.spyOn(StatePersistence, 'saveState');
            const controllerExportSpy = vi.spyOn((app as any).controller, 'exportState');
            const mockExported = { state: {} as any, moveHistory: undefined };
            controllerExportSpy.mockReturnValue(mockExported);

            // Act
            vi.advanceTimersByTime(30000);

            // Assert
            expect(saveStateSpy).toHaveBeenCalled();
            vi.useRealTimers();
        });
    });

    describe('handleKeyDown / handleKeyUp preventDefault', () => {
        beforeEach(() => {
            app.initialize();
        });

        it('should call preventDefault when keyDown is handled by ViewManager', () => {
            // Arrange
            const viewManager = (app as any).viewManager;
            vi.spyOn(viewManager, 'handleKeyDown').mockReturnValue(true);
            const event = new KeyboardEvent('keydown', {
                key: 'r',
                bubbles: true,
                cancelable: true,
            });
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

            // Act
            document.dispatchEvent(event);

            // Assert
            expect(preventDefaultSpy).toHaveBeenCalled();
        });

        it('should not call preventDefault when keyDown is not handled', () => {
            // Arrange
            const viewManager = (app as any).viewManager;
            vi.spyOn(viewManager, 'handleKeyDown').mockReturnValue(false);
            const event = new KeyboardEvent('keydown', {
                key: 'r',
                bubbles: true,
                cancelable: true,
            });
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

            // Act — call the private method directly to avoid interference from stale document listeners
            (app as any).handleKeyDown(event);

            // Assert
            expect(preventDefaultSpy).not.toHaveBeenCalled();
        });

        it('should call preventDefault when keyUp is handled by ViewManager', () => {
            // Arrange
            const viewManager = (app as any).viewManager;
            vi.spyOn(viewManager, 'handleKeyUp').mockReturnValue(true);
            const event = new KeyboardEvent('keyup', { key: 'r', bubbles: true, cancelable: true });
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

            // Act — call the private method directly to avoid interference from stale document listeners
            (app as any).handleKeyUp(event);

            // Assert
            expect(preventDefaultSpy).toHaveBeenCalled();
        });
    });

    describe('setupMenuToggle', () => {
        let app: Application;

        const mockMatchMedia = (isDesktop: boolean): void => {
            Object.defineProperty(window, 'matchMedia', {
                writable: true,
                configurable: true,
                value: vi.fn().mockImplementation(() => ({
                    matches: isDesktop,
                    media: '(min-width: 1025px)',
                    onchange: null,
                    addListener: vi.fn(),
                    removeListener: vi.fn(),
                    addEventListener: vi.fn(),
                    removeEventListener: vi.fn(),
                    dispatchEvent: vi.fn(),
                })),
            });
        };

        beforeEach(() => {
            mockMatchMedia(false);
            document.body.innerHTML = `
                <div id="visualizations"></div>
                <button class="menu-toggle" aria-expanded="false"></button>
                <button class="controls-close"></button>
                <div class="controls"></div>
                <div class="controls-overlay"></div>
            `;
            app = new Application();
            app.initialize();
        });

        it('should open the panel when toggle is clicked while closed', () => {
            // Arrange
            const controls = document.querySelector('.controls')!;
            const overlay = document.querySelector('.controls-overlay')!;
            const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle')!;

            // Act
            toggle.click();

            // Assert
            expect(controls.classList.contains('controls--open')).toBe(true);
            expect(overlay.classList.contains('controls-overlay--visible')).toBe(true);
            expect(toggle.getAttribute('aria-expanded')).toBe('true');
        });

        it('should close the panel when toggle is clicked while open', () => {
            // Arrange
            const controls = document.querySelector('.controls')!;
            const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle')!;
            controls.classList.add('controls--open');

            // Act
            toggle.click();

            // Assert
            expect(controls.classList.contains('controls--open')).toBe(false);
            expect(toggle.getAttribute('aria-expanded')).toBe('false');
        });

        it('should close the panel when overlay is clicked', () => {
            // Arrange
            const controls = document.querySelector('.controls')!;
            const overlay = document.querySelector<HTMLElement>('.controls-overlay')!;
            controls.classList.add('controls--open');
            overlay.classList.add('controls-overlay--visible');

            // Act
            overlay.click();

            // Assert
            expect(controls.classList.contains('controls--open')).toBe(false);
            expect(overlay.classList.contains('controls-overlay--visible')).toBe(false);
        });

        it('should close the panel on Escape keydown when open', () => {
            // Arrange
            const controls = document.querySelector('.controls')!;
            const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle')!;
            controls.classList.add('controls--open');

            // Act
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

            // Assert
            expect(controls.classList.contains('controls--open')).toBe(false);
            // toggle should receive focus
            expect(document.activeElement).toBe(toggle);
        });

        it('should open the panel on Escape when closed', () => {
            // Arrange
            const controls = document.querySelector('.controls')!;
            const overlay = document.querySelector('.controls-overlay')!;
            // controls is already closed (no controls--open class)

            // Act
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

            // Assert
            expect(controls.classList.contains('controls--open')).toBe(true);
            expect(overlay.classList.contains('controls-overlay--visible')).toBe(true);
        });

        it('should do nothing when required DOM elements are absent', () => {
            // Arrange
            document.body.innerHTML = '<div id="visualizations"></div>';
            const app2 = new Application();

            // Act & Assert — must not throw
            expect(() => app2.initialize()).not.toThrow();
        });

        it('should default to expanded controls in desktop mode', () => {
            // Arrange
            mockMatchMedia(true);
            document.body.innerHTML = `
                <div class="container">
                    <div id="visualizations"></div>
                    <button class="menu-toggle" aria-expanded="false"></button>
                    <button class="controls-close"></button>
                    <div class="controls"></div>
                    <div class="controls-overlay"></div>
                </div>
            `;
            const app2 = new Application();

            // Act
            app2.initialize();

            // Assert
            const controls = document.querySelector('.controls')!;
            const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle')!;
            expect(controls.classList.contains('controls--desktop-collapsed')).toBe(false);
            expect(toggle.getAttribute('aria-expanded')).toBe('true');
        });

        it('should toggle desktop collapsed state on Escape key', () => {
            // Arrange
            mockMatchMedia(true);
            document.body.innerHTML = `
                <div class="container">
                    <div id="visualizations"></div>
                    <button class="menu-toggle" aria-expanded="false"></button>
                    <button class="controls-close"></button>
                    <div class="controls"></div>
                    <div class="controls-overlay"></div>
                </div>
            `;
            const app2 = new Application();
            app2.initialize();

            const controls = document.querySelector('.controls')!;
            const container = document.querySelector('.container')!;

            // Act: collapse via Escape
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

            // Assert: collapsed
            expect(controls.classList.contains('controls--desktop-collapsed')).toBe(true);
            expect(container.classList.contains('container--controls-collapsed')).toBe(true);

            // Act: expand via Escape
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

            // Assert: expanded
            expect(controls.classList.contains('controls--desktop-collapsed')).toBe(false);
            expect(container.classList.contains('container--controls-collapsed')).toBe(false);
        });

        it('should collapse and expand controls when clicking toggle in desktop mode', () => {
            // Arrange
            mockMatchMedia(true);
            document.body.innerHTML = `
                <div class="container">
                    <div id="visualizations"></div>
                    <button class="menu-toggle" aria-expanded="false"></button>
                    <button class="controls-close"></button>
                    <div class="controls"></div>
                    <div class="controls-overlay"></div>
                </div>
            `;
            const app2 = new Application();
            app2.initialize();

            const controls = document.querySelector('.controls')!;
            const container = document.querySelector('.container')!;
            const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle')!;

            // Act: collapse
            toggle.click();

            // Assert: collapsed
            expect(controls.classList.contains('controls--desktop-collapsed')).toBe(true);
            expect(container.classList.contains('container--controls-collapsed')).toBe(true);
            expect(toggle.getAttribute('aria-expanded')).toBe('false');

            // Act: expand
            toggle.click();

            // Assert: expanded
            expect(controls.classList.contains('controls--desktop-collapsed')).toBe(false);
            expect(container.classList.contains('container--controls-collapsed')).toBe(false);
            expect(toggle.getAttribute('aria-expanded')).toBe('true');
        });
    });

    describe('setupControlVisibilityPersistence', () => {
        it('should restore open=true from localStorage', () => {
            // Arrange
            document.body.innerHTML = `
                <div id="visualizations"></div>
                <div class="controls">
                    <details class="control-section" data-persist>
                        <summary><h2>MySection</h2></summary>
                    </details>
                </div>
            `;
            localStorage.setItem('controls.visibility.open:mysection', 'true');
            const app2 = new Application();

            // Act
            app2.initialize();

            // Assert
            const section = document.querySelector('.control-section') as HTMLDetailsElement;
            expect(section.open).toBe(true);
        });

        it('should persist open=false when toggle fires after closing', () => {
            // Arrange
            document.body.innerHTML = `
                <div id="visualizations"></div>
                <div class="controls">
                    <details class="control-section" data-persist open>
                        <summary><h2>MySection</h2></summary>
                    </details>
                </div>
            `;
            const app2 = new Application();
            app2.initialize();
            const section = document.querySelector('.control-section') as HTMLDetailsElement;

            // Act
            section.open = false;
            section.dispatchEvent(new Event('toggle'));

            // Assert
            expect(localStorage.getItem('controls.visibility.open:mysection')).toBe('false');
        });

        it('should fall back to "section" label when h2 is absent', () => {
            // Arrange
            document.body.innerHTML = `
                <div id="visualizations"></div>
                <div class="controls">
                    <details class="control-section" data-persist open>
                        <summary>No heading</summary>
                    </details>
                </div>
            `;
            const app2 = new Application();

            // Act & Assert — must not throw
            expect(() => app2.initialize()).not.toThrow();
        });
    });
});
