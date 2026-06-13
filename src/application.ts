// Application Layer - Main application initialization and coordination
import { CubeController } from '@/cube-controller';
import { StatePersistence } from '@/cube/core/state-persistence';
import { getEventBus } from '@/event-bus-accessor';
import { EventName } from '@/types';
import { ViewManager } from '@/view-manager/view-manager';

import { AboutModal } from './about/about-modal';
import { LogLevel, logger } from './diagnostics/logger';
import { slugify } from './global';

/**
 * The Application class serves as the main entry point for the Rubik's Cube application.
 * It initializes the cube controller, view manager, and sets up event listeners for user
 * interactions and state management. It also handles state persistence to localStorage
 * and file import/export functionality.
 */
export class Application {
    private controller: CubeController;
    private viewManager: ViewManager;
    public static get eventBus() {
        return getEventBus();
    }

    /**
     * Constructor initializes the cube controller and view manager,
     * but does not perform any DOM-dependent initialization.
     */
    constructor() {
        this.controller = new CubeController();
        this.viewManager = new ViewManager(this.controller);
    }

    /**
     * Initialize the application, including restoring state, setting up views and event listeners.
     * This should be called once the DOM is ready (e.g. on window load).
     */
    initialize(): void {
        logger.group('Application initialization', LogLevel.INFO);

        // Only initialize DOM-dependent parts if document is available.
        if (typeof document !== 'undefined') {
            // Try to restore saved state before initializing views.
            this.restoreSavedState();

            this.viewManager.initialize();
            // Note: Default selected sticker is now set by ViewManager when first view is created.
            this.setupEventListeners();

            // Control sections are now native <details> elements styled with CSS; no JS toggles required.
            // Restore/persist visibility of these sections when opted in.
            this.setupControlVisibilityPersistence();

            // Set up the hamburger menu toggle for the collapsible controls panel on mobile.
            this.setupMenuToggle();

            // Set up the About modal triggered by the info button in the title bar.
            this.setupAboutButton();

            // Set up automatic state persistence on app exit.
            this.setupStatePersistence();
        }

        logger.info('Cube model created and ready');
        logger.groupEnd();
    }

    /**
     * Restore previously saved cube state from localStorage.
     */
    private restoreSavedState(): void {
        const loadedStateString = StatePersistence.loadState();
        if (!loadedStateString) return;

        try {
            // Reconstruct the state from the string.
            const result = StatePersistence.stringToState(loadedStateString);

            if (result) {
                // Import the restored state into the cube controller.
                this.controller.importState(result.state, result.moveHistory);
                logger.info('Cube state successfully restored from localStorage');
            } else {
                logger.error('Failed to reconstruct state from string');
            }
        } catch (error) {
            logger.error('Failed to restore saved state:', error);
        }
    }

    private setupAboutButton(): void {
        const btn = document.getElementById('about-button');
        if (!btn) return;
        const modal = new AboutModal();
        btn.addEventListener('click', () => modal.open());
    }

    /**
     * Set up automatic state persistence on app exit.
     */
    private setupStatePersistence(): void {
        // Save state when the page is about to unload.
        window.addEventListener('beforeunload', () => {
            const exported = this.controller.exportState();
            StatePersistence.saveState(exported.state, exported.moveHistory);
        });

        // Also periodically save state (every 30 seconds) to prevent data loss.
        setInterval(
            () => {
                const exported = this.controller.exportState();
                StatePersistence.saveState(exported.state, exported.moveHistory);
            },
            // 30 seconds
            30000
        );
    }

    /**
     * Set up event listeners for application-level events and user interactions.
     */
    private setupEventListeners(): void {
        // Set up event-based state management handlers.
        Application.eventBus.on(EventName.CUBE_RESET_REQUESTED, this.resetCube.bind(this));
        Application.eventBus.on(EventName.CUBE_SCRAMBLE_REQUESTED, this.scrambleCube.bind(this));
        Application.eventBus.on(EventName.STORAGE_CLEAR_REQUESTED, this.clearStorage.bind(this));
        Application.eventBus.on(EventName.STATE_EXPORT_REQUESTED, this.exportState.bind(this));
        Application.eventBus.on(EventName.STATE_IMPORT_REQUESTED, this.importState.bind(this));

        // Key bindings - delegate to ViewManager if not handled globally.
        // Use capture phase to intercept keyboard events before they reach focusable elements
        document.addEventListener('keydown', this.handleKeyDown.bind(this), true);
        document.addEventListener('keyup', this.handleKeyUp.bind(this), true);
    }

    /** Application-level event handlers. */

    /** Handle cube reset request. */
    private resetCube(): void {
        logger.log('Cube reset');
        this.controller.reset();
        this.viewManager.updateViews(undefined);
    }

    /** Handle cube scramble request. */
    private scrambleCube(): void {
        logger.log('Cube scramble');
        this.controller.scramble();
        this.viewManager.updateViews(undefined);
    }

    /** Storage-related event handlers. */
    private clearStorage(): void {
        logger.log('Storage clear');
        // Let the view manager handle its own storage keys.
        this.viewManager.clearViewStorage();

        // Also remove any control visibility persistence entries.
        this.clearControlVisibilityPersistence();

        // Clear saved cube state.
        StatePersistence.clearState();
    }

    /** Handle cube state export request. */
    private exportState(): void {
        logger.log('Cube state export');
        const exported = this.controller.exportState();
        StatePersistence.downloadState(exported.state, exported.moveHistory);
    }

    /** Handle cube state import request. */
    private async importState(): Promise<void> {
        logger.log('Cube state import');
        const result = await StatePersistence.uploadState();
        if (!result) {
            logger.log('Import cancelled or failed');
            return;
        }
        try {
            // Import the state and move history into the cube controller
            this.controller.importState(result.state, result.moveHistory);
            this.viewManager.updateViews(undefined);
            logger.log('State successfully imported from file');
            if (result.moveHistory) {
                logger.log('Move history imported:', result.moveHistory);
            }
            alert('Cube state successfully imported!');
        } catch (error) {
            logger.error('Failed to import cube state:', error);
            alert('Failed to import cube state. Please ensure the file is valid.');
        }
    }

    /** Handle global keyup events for application-level shortcuts. */
    private handleKeyDown(e: KeyboardEvent): void {
        // Check if ViewManager/view would handle this.
        const handled = this.viewManager.handleKeyDown(e);
        if (handled) {
            e.preventDefault();
        }
    }

    /** Handle global keyup events for application-level shortcuts. */
    private handleKeyUp(e: KeyboardEvent): void {
        // Check if ViewManager/view would handle this.
        const handled = this.viewManager.handleKeyUp(e);
        if (handled) {
            e.preventDefault();
        }
    }

    /**
     * Wire up the controls toggle button.
     * On mobile/tablet it opens/closes the slide-in panel.
     * On desktop it collapses/expands the fixed controls sidebar.
     */
    private setupMenuToggle(): void {
        const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
        const closeBtn = document.querySelector<HTMLButtonElement>('.controls-close');
        const controls = document.querySelector<HTMLElement>('.controls');
        const overlay = document.querySelector<HTMLElement>('.controls-overlay');
        const container = document.querySelector<HTMLElement>('.container');

        const desktopCollapsedClass = 'controls--desktop-collapsed';
        const containerCollapsedClass = 'container--controls-collapsed';

        const desktopQuery =
            typeof window.matchMedia === 'function'
                ? window.matchMedia('(min-width: 1025px)')
                : null;

        if (!toggle || !controls || !overlay || !closeBtn) return;

        const openPanel = (): void => {
            controls.classList.add('controls--open');
            overlay.classList.add('controls-overlay--visible');
            toggle.setAttribute('aria-expanded', 'true');
        };

        const closePanel = (): void => {
            controls.classList.remove('controls--open');
            overlay.classList.remove('controls-overlay--visible');
            toggle.setAttribute('aria-expanded', 'false');
        };

        const setDesktopCollapsed = (collapsed: boolean): void => {
            controls.classList.toggle(desktopCollapsedClass, collapsed);
            container?.classList.toggle(containerCollapsedClass, collapsed);
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            toggle.setAttribute('aria-label', collapsed ? 'Show controls' : 'Hide controls');
        };

        const syncToggleStateToLayout = (): void => {
            if (desktopQuery?.matches) {
                // Desktop uses its own collapsed state and never the mobile overlay drawer.
                closePanel();
                setDesktopCollapsed(controls.classList.contains(desktopCollapsedClass));
                return;
            }

            // Mobile/tablet always starts with panel closed and no desktop collapse state.
            setDesktopCollapsed(false);
            toggle.setAttribute('aria-label', 'Toggle controls');
            toggle.setAttribute(
                'aria-expanded',
                controls.classList.contains('controls--open') ? 'true' : 'false'
            );
        };

        toggle.addEventListener('click', () => {
            if (desktopQuery?.matches) {
                const collapsed = controls.classList.contains(desktopCollapsedClass);
                setDesktopCollapsed(!collapsed);
                return;
            }

            const isOpen = controls.classList.contains('controls--open');
            if (isOpen) {
                closePanel();
            } else {
                openPanel();
            }
        });

        // Close when the user taps the overlay backdrop or the in-panel close button.
        overlay.addEventListener('click', closePanel);
        closeBtn?.addEventListener('click', closePanel);

        // Toggle controls panel with Escape key.
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (desktopQuery?.matches) {
                    const collapsed = controls.classList.contains(desktopCollapsedClass);
                    setDesktopCollapsed(!collapsed);
                } else if (controls.classList.contains('controls--open')) {
                    closePanel();
                    toggle.focus();
                } else {
                    openPanel();
                }
                e.preventDefault();
            }
        });

        // Keep state and ARIA attributes in sync when crossing responsive breakpoints.
        if (desktopQuery) {
            if (typeof desktopQuery.addEventListener === 'function') {
                desktopQuery.addEventListener('change', syncToggleStateToLayout);
            } else {
                desktopQuery.addListener(syncToggleStateToLayout);
            }
        }

        syncToggleStateToLayout();
    }

    // Collapsible sections are implemented using native <details>/<summary> in the HTML
    // and styled with CSS. A small, opt-in persistence helper is available for
    // control sections to remember their visibility.
    private setupControlVisibilityPersistence(): void {
        const sections = Array.from(
            document.querySelectorAll('.controls .control-section[data-persist]')
        ) as HTMLDetailsElement[];
        if (!sections.length) return;

        sections.forEach(section => {
            const header = section.querySelector('h2');
            const title = header?.textContent?.trim() ?? 'section';
            const key = `controls.visibility.open:${slugify(title)}`;

            // Restore saved state if present.
            const saved = localStorage.getItem(key);
            if (saved === 'false') section.open = false;
            else if (saved === 'true') section.open = true;

            // Persist on toggle events (native event fired by <details>).
            section.addEventListener('toggle', () => {
                try {
                    localStorage.setItem(key, section.open ? 'true' : 'false');
                } catch (err) {
                    logger.warn('Failed to persist control section visibility state', err);
                }
            });
        });
    }

    /**
     * Scan localStorage and remove any keys used for `<details>` persistence.
     * The implementation mirrors the enumeration logic in `ViewManager` so it works
     * with both the real Storage API and the test mock object.
     */
    private clearControlVisibilityPersistence(): void {
        try {
            // Enumerate keys and remove those that match the control visibility pattern.
            const len = localStorage.length;
            for (let i = 0; i < len; i++) {
                const key = localStorage.key(i);
                if (!key || !key.startsWith('controls.visibility.open:')) continue;
                localStorage.removeItem(key);
            }
        } catch (err) {
            logger.warn('Failed to clear control visibility persistence keys', err);
        }
    }
}
