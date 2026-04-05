// View Manager - Handles dynamic view creation and management.
import { Application } from '@/application';
import { CubeModel, CubeView, LayoutMode, StickerId } from '@/cube/types';
import { logger } from '@/diagnostics/logger';
import buttonStyles from '@/styles/buttons.module.css';
import { Command, EventName, HighlightChangedEvent, KeyBinding, MoveExecutedEvent } from '@/types';

import { CommandManager } from './command-manager';
import { CommandRenderer } from './command-renderer';
import { PanelInteractionHandler } from './panel-interaction-handler';
import { TabBar } from './tab-bar';
import { ViewLifecycleManager } from './view-lifecycle-manager';
import styles from './view-manager.module.css';

/**
 * Manages dynamic creation, positioning, and interaction of cube visualization views.
 */
export class ViewManager implements CommandManager {
    //#region Private Fields

    /**
     * The cube model to visualize.
     */
    private cubeModel: CubeModel;

    /**
     * CSS module styles.
     */
    private styles: Record<string, string>;

    /**
     * Mapping of registered commands for the controller and each view.
     */
    protected commandRegistry = new Map<string, Command[]>();

    /**
     * Panel interaction handler for drag/resize.
     */
    private panelInteractionHandler: PanelInteractionHandler | null = null;

    /**
     * Command renderer for rendering command buttons and groups.
     */
    private commandRenderer: CommandRenderer;

    /**
     * View lifecycle manager for creating, showing, and hiding views.
     */
    private viewLifecycleManager: ViewLifecycleManager | null = null;

    /**
     * Container for all visualization panels.
     */
    private visualizationsContainer: HTMLElement | null = null;

    /**
     * Z-index counter for layering view panels.
     */
    private zIndexCounter: number = 1000;

    /**
     * Current layout mode — floating (desktop) or tabbed (mobile/tablet).
     */
    private layoutMode: LayoutMode = 'floating';

    /**
     * Tab bar component shown in tabbed layout mode.
     */
    private tabBar: TabBar | null = null;

    /**
     * Map of active views by their type.
     */
    private activeViews = new Map<string, { view: CubeView; container: HTMLElement }>();

    /**
     * Stack to track focus order of views.
     */
    private focusStack: string[] = [];

    /**
     * Track current highlight state.
     */
    private currentHighlightedSticker?: StickerId;

    /**
     * Debounce timer id for the window resize handler.
     */
    private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    //#endregion Private Fields

    /**
     * Creates a new ViewManager instance
     * @param cubeModel - The cube model to visualize
     */
    constructor(cubeModel: CubeModel) {
        this.cubeModel = cubeModel;
        this.styles = styles;
        this.commandRenderer = new CommandRenderer(styles, buttonStyles);
    }

    /**
     * Initializes the ViewManager by setting up containers and event handlers
     */
    initialize(): void {
        this.visualizationsContainer = document.getElementById('visualizations');
        if (!this.visualizationsContainer) {
            throw new Error('Visualizations container not found');
        }

        // Create tab bar (hidden by default; JS shows it in tabbed layout mode)
        this.tabBar = new TabBar(
            this.visualizationsContainer,
            this.styles,
            () => this.getActiveViewId(),
            (viewType: string) => this.updateFocus(viewType)
        );

        // Determine initial layout mode and listen for breakpoint changes
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
            const mq = window.matchMedia('(min-width: 1025px)');
            this.layoutMode = mq.matches ? 'floating' : 'tabbed';
            mq.addEventListener('change', (e: MediaQueryListEvent) => {
                this.layoutMode = e.matches ? 'floating' : 'tabbed';
                this.applyLayoutMode();
            });
        }

        // Create panel interaction handler
        this.panelInteractionHandler = new PanelInteractionHandler(
            this.visualizationsContainer,
            this.styles,
            this.activeViews,
            this.zIndexCounter,
            () => this.getActiveViewId(),
            (viewType: string) => this.updateFocus(viewType)
        );

        // Set up drag and resize event listeners
        this.panelInteractionHandler.setupDragAndResizeHandlers();

        // Create view lifecycle manager
        this.viewLifecycleManager = new ViewLifecycleManager(
            this.cubeModel,
            this.styles,
            this.visualizationsContainer,
            this.panelInteractionHandler,
            this.activeViews,
            this, // Pass itself as CommandManager
            {
                onUpdateFocus: viewId => this.updateFocus(viewId),
                getLayoutMode: () => this.layoutMode,
                onPanelAdded: (_viewType, container) => this.handlePanelAdded(container),
            }
        );

        // Create dynamic view controls
        this.viewLifecycleManager.createViewControls();

        // Apply the initial layout mode now that views are open
        this.applyLayoutMode();

        // Register controller commands
        this.registerCommands('controller', this.cubeModel.getCommands());

        // Render global command buttons
        this.renderGlobalCommands();

        // Subscribe to MOVE_EXECUTED events to update all views
        Application.eventBus.on(EventName.MOVE_EXECUTED, this.handleMoveExecuted.bind(this));

        // Also subscribe to MOVE_EXECUTED to refresh command button enabled/disabled states.
        // This runs independently of view updates so command states stay in sync after every
        // move, undo, and redo operation.
        Application.eventBus.on(
            EventName.MOVE_EXECUTED,
            this.handleCommandStatesRefresh.bind(this)
        );

        // Also subscribe to highlight change events so external emitters can update views
        Application.eventBus.on(
            EventName.HIGHLIGHT_CHANGED,
            this.handleHighlightChanged.bind(this)
        );

        // Re-scale view content whenever the viewport size changes (debounced).
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', () => {
                if (this.resizeDebounceTimer !== null) {
                    clearTimeout(this.resizeDebounceTimer);
                }
                this.resizeDebounceTimer = setTimeout(() => {
                    this.resizeAllViews();
                }, 100);
            });
        }
    }

    /**
     * Handles MOVE_EXECUTED events and updates all views
     */
    private handleMoveExecuted(event: MoveExecutedEvent): void {
        this.updateViews(event);
    }

    /**
     * Refreshes command button enabled/disabled states after any move, undo, or redo.
     * Subscribed independently to MOVE_EXECUTED so command state stays in sync
     * even if view updates are skipped or fail.
     */
    private handleCommandStatesRefresh(): void {
        this.commandRenderer.refreshCommandStates(this.commandRegistry);
    }

    /**
     * Handles highlight change events emitted on the EventBus and updates all views.
     * Avoids redundant updates by checking current highlighted sticker.
     */
    private handleHighlightChanged(event: HighlightChangedEvent): void {
        if (this.currentHighlightedSticker === event.stickerId) {
            return;
        }

        this.currentHighlightedSticker = event.stickerId;

        for (const { view } of this.activeViews.values()) {
            try {
                if (typeof view.updateHighlight === 'function') {
                    view.updateHighlight(event.stickerId);
                }
            } catch (error) {
                logger.error('Error updating view highlight:', error);
            }
        }
    }

    /**
     * Handles keyboard down events by delegating to active views
     * @param e - The keyboard event
     * @returns True if the event was handled, false otherwise
     */
    public handleKeyDown(e: KeyboardEvent): boolean {
        // Offer the active view a chance to handle the keydown event
        // This allows views to prevent default behavior (e.g., button navigation)
        if (this.focusStack.length > 0) {
            const activeViewId = this.focusStack[this.focusStack.length - 1];
            const activeViewEntry = this.activeViews.get(activeViewId);
            if (activeViewEntry?.view.handleKeyDown) {
                const handled = activeViewEntry.view.handleKeyDown(e);
                if (handled) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Handles keyboard up events by checking command bindings and delegating to active views
     * @param e - The keyboard event
     * @returns True if the event was handled, false otherwise
     */
    public handleKeyUp(e: KeyboardEvent): boolean {
        // First, offer the active view a chance to handle the key event
        // This allows views to override command bindings (e.g., for text input)
        if (this.focusStack.length > 0) {
            const activeViewId = this.focusStack[this.focusStack.length - 1];
            const activeViewEntry = this.activeViews.get(activeViewId);
            if (activeViewEntry?.view.handleKeyUp) {
                const handled = activeViewEntry.view.handleKeyUp(e);
                if (handled) {
                    // View handled it
                    return true;
                }
            }

            // If view didn't handle it, check view-specific commands
            const commands = this.commandRegistry.get(activeViewId);
            const matchingCommand = commands?.find(cmd =>
                this.matchesKeyBindings(cmd.keyBindings, e)
            );
            if (matchingCommand) {
                // Handled by view command
                matchingCommand.action();
                return true;
            }
        }

        // Finally check controller commands (global)
        const controllerCommands = this.commandRegistry.get('controller');
        const matchingCommand = controllerCommands?.find(cmd =>
            this.matchesKeyBindings(cmd.keyBindings, e)
        );
        if (matchingCommand) {
            // Handled by controller command
            matchingCommand.action();
            return true;
        }

        // Not handled
        return false;
    }

    /**
     * Checks if any of the provided key bindings match the keyboard event
     * @param bindings - Array of key bindings to check
     * @param e - The keyboard event
     * @returns True if any binding matches, false otherwise
     */
    private matchesKeyBindings(bindings: KeyBinding[] | undefined, e: KeyboardEvent): boolean {
        if (!bindings || bindings.length === 0) return false;
        return bindings.some(binding => this.matchesKeyBinding(binding, e));
    }

    /**
     * Checks if a single key binding matches the keyboard event
     * @param binding - The key binding to check
     * @param e - The keyboard event
     * @returns True if the binding matches, false otherwise
     */
    private matchesKeyBinding(binding: KeyBinding, e: KeyboardEvent): boolean {
        const keyMatch = binding.key.toLowerCase() === e.key.toLowerCase();
        const modifiersMatch =
            e.shiftKey === (binding.shiftKey ?? false) &&
            e.ctrlKey === (binding.ctrlKey ?? false) &&
            e.altKey === (binding.altKey ?? false) &&
            e.metaKey === (binding.metaKey ?? false);
        return keyMatch && modifiersMatch;
    }

    /**
     * Removes any view-related data from localStorage (visibility preferences and panel
     * positioning state). This is used when the user requests a full storage clear so
     * that the view manager can manage its own keys.
     */
    public clearViewStorage(): void {
        try {
            localStorage.removeItem('rubiksCubeVisibleViews');

            const len = localStorage.length;
            for (let i = 0; i < len; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('view-panel-')) {
                    localStorage.removeItem(key);
                }
            }
        } catch (err) {
            logger.warn('Failed to clear view-related storage', err);
        }
    }

    /**
     * Registers commands for a specific view or controller
     * @param viewId - The ID of the view or 'controller' for global commands
     * @param commands - Array of commands to register
     */
    public registerCommands(viewId: string, commands: Command[]): void {
        this.commandRegistry.set(viewId, commands);
    }

    /**
     * Updates the focus to the specified view, bringing it to the front
     * @param viewId - The ID of the view to focus
     */
    public updateFocus(viewId: string): void {
        // Remove if already in stack
        const index = this.focusStack.indexOf(viewId);
        if (index > -1) {
            this.focusStack.splice(index, 1);
        }
        // Push to top
        this.focusStack.push(viewId);

        // Update visual focus indication
        this.updateVisualFocus();

        // Update global commands when focus changes
        this.renderGlobalCommands();

        // In tabbed mode, update tabs and show only the active panel
        this.tabBar?.updateTabs(this.activeViews);
        this.showOnlyActivePanel();
    }

    /**
     * Gets the ID of the currently active (focused) view
     * @returns The active view ID or undefined if no view is active
     */
    public getActiveViewId(): string | undefined {
        return this.focusStack.length > 0 ? this.focusStack[this.focusStack.length - 1] : undefined;
    }

    /**
     * Updates the visual focus indication on view panels
     */
    private updateVisualFocus(): void {
        const activeViewId = this.getActiveViewId();

        // Remove focused class from all view panels
        this.activeViews.forEach(({ container }) => {
            container.classList.remove(this.styles.focused);
        });

        // Add focused class to the active view
        if (activeViewId) {
            const activeView = this.activeViews.get(activeViewId);
            if (activeView) {
                activeView.container.classList.add(this.styles.focused);
            }
        }
    }

    /**
     * Renders global command buttons and view-specific action buttons
     */
    renderGlobalCommands(): void {
        this.commandRenderer.renderGlobalCommands(this.commandRegistry, this.getActiveViewId());
    }

    /**
     * Applies the current layoutMode to all open panels and tab bar visibility.
     */
    private applyLayoutMode(): void {
        if (this.layoutMode === 'tabbed') {
            this.tabBar?.show();
            this.panelInteractionHandler?.setLayoutMode('tabbed');
            for (const [, { view, container }] of this.activeViews) {
                this.applyTabbedLayoutToPanel(container);
                view.setLayoutMode?.('tabbed');
            }
            this.tabBar?.updateTabs(this.activeViews);
            this.showOnlyActivePanel();
            // Defer resize so the browser applies the new CSS before we measure.
            requestAnimationFrame(() => this.resizeAllViews());
        } else {
            this.tabBar?.hide();
            this.panelInteractionHandler?.setLayoutMode('floating');
            for (const [viewType, { view, container }] of this.activeViews) {
                this.applyFloatingLayoutToPanel(viewType, container, view);
                view.setLayoutMode?.('floating');
                container.style.display = '';
            }
            // Resize all views now that floating dimensions are restored.
            requestAnimationFrame(() => this.resizeAllViews());
        }
    }

    /**
     * Called when a new panel is added to the container.
     * In tabbed mode, applies tabbed CSS, updates the tab bar, and shows only the active panel.
     */
    private handlePanelAdded(container: HTMLElement): void {
        if (this.layoutMode === 'tabbed') {
            this.applyTabbedLayoutToPanel(container);
            this.tabBar?.updateTabs(this.activeViews);
            this.showOnlyActivePanel();
        }
    }

    /**
     * Applies tabbed-mode CSS to a single panel.
     */
    private applyTabbedLayoutToPanel(container: HTMLElement): void {
        container.classList.add(this.styles['view-panel--tabbed'] ?? 'view-panel--tabbed');
    }

    /**
     * Calls resize() on every active view so content re-scales to current dimensions.
     */
    private resizeAllViews(): void {
        for (const { view } of this.activeViews.values()) {
            try {
                view.resize?.();
            } catch (err) {
                logger.warn('Error resizing view', err);
            }
        }
    }

    /**
     * Restores floating-mode positioning on a panel (reverts tabbed CSS and reapplies saved position).
     */
    private applyFloatingLayoutToPanel(
        viewType: string,
        container: HTMLElement,
        view: CubeView
    ): void {
        container.classList.remove(this.styles['view-panel--tabbed'] ?? 'view-panel--tabbed');
        // Restore absolute positioning from saved state / defaults
        this.panelInteractionHandler?.setInitialPanelPosition(container, viewType, view);
    }

    /**
     * In tabbed mode, shows only the active panel and hides all others.
     * No-op in floating mode.
     */
    private showOnlyActivePanel(): void {
        if (this.layoutMode !== 'tabbed') return;
        const activeId = this.getActiveViewId();
        for (const [viewType, { view, container }] of this.activeViews) {
            const isActive = viewType === activeId;
            container.style.display = isActive ? '' : 'none';
            if (isActive) {
                // Trigger resize so content scales to correct dimensions (the
                // panel may have been hidden when resize() was last called).
                requestAnimationFrame(() => view.resize?.());
                // Force a full update so any state changes that accumulated
                // while this tab was hidden are applied immediately.
                view.update?.(this.cubeModel.getReadOnlyModel());
            }
        }
    }

    /**
     * Updates the command buttons in a view's header
     * @param viewId - The ID of the view to update
     */
    updateViewHeaderCommands(viewId: string): void {
        const activeView = this.activeViews.get(viewId);
        if (!activeView) return;

        this.commandRenderer.updateViewHeaderCommands(
            viewId,
            activeView.container,
            this.commandRegistry
        );
    }

    /**
     * Registers commands for a specific view
     * @param viewId - The ID of the view
     * @param view - The view instance to get commands from
     */
    registerViewCommands(viewId: string, view: CubeView): void {
        const commands = view.getCommands();
        this.registerCommands(viewId, commands);
    }

    /**
     * Shows a view by delegating to the lifecycle manager
     */
    showView(viewType: string): void {
        this.viewLifecycleManager!.showView(viewType);
        // Apply tabbed layout to the newly added panel if in tabbed mode
        if (this.layoutMode === 'tabbed') {
            const entry = this.activeViews.get(viewType);
            if (entry) {
                this.applyTabbedLayoutToPanel(entry.container);
            }
        }
        this.tabBar?.updateTabs(this.activeViews);
        this.showOnlyActivePanel();
    }

    /**
     * Hides a view by delegating to the lifecycle manager
     */
    hideView(viewType: string): void {
        this.viewLifecycleManager!.hideView(viewType);
        this.tabBar?.updateTabs(this.activeViews);
        this.showOnlyActivePanel();
    }

    /**
     * Updates all active views with the current cube model state
     */
    updateViews(event?: MoveExecutedEvent): void {
        for (const { view, container } of this.activeViews.values()) {
            // Skip views that are hidden (e.g. inactive tabs) — no point touching
            // their DOM, and doing so synchronously would block animation frames.
            if (container.style.display === 'none') continue;
            try {
                if (view.updateSelective && event) {
                    view.updateSelective(event);
                } else if (view.update) {
                    view.update(this.cubeModel.getReadOnlyModel());
                }
            } catch (error) {
                logger.error('Error updating view:', error);
            }
        }
        this.commandRenderer.refreshCommandStates(this.commandRegistry);
    }

    /**
     * Sets the highlighted sticker across all active views and emits a highlight-change event
     * @param stickerId - The ID of the sticker to highlight, or undefined to clear highlighting
     * @param sourceView - The view that initiated the highlight
     */
    setHighlightedSticker(stickerId: StickerId | undefined, sourceView: CubeView): void {
        // No-op if nothing changed
        if (this.currentHighlightedSticker === stickerId) {
            return;
        }

        this.currentHighlightedSticker = stickerId; // Track current highlight

        for (const { view } of this.activeViews.values()) {
            view.updateHighlight(stickerId);
        }

        // Emit highlight change for other interested parties (e.g., UI overlays)
        try {
            const viewId =
                typeof sourceView.getViewType === 'function' ? sourceView.getViewType() : undefined;
            Application.eventBus.emit(EventName.HIGHLIGHT_CHANGED, {
                stickerId,
                viewId,
            } as HighlightChangedEvent);
        } catch (error) {
            logger.error('Error emitting highlight change', error);
        }
    }
}
