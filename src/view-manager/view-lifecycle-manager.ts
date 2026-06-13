import { CubeModel, CubeView, LayoutMode } from '@/cube/types';
import { logger } from '@/diagnostics/logger';
import { getEventBus } from '@/event-bus-accessor';
import { EventName, ViewStateChangedEvent } from '@/types';

import { CommandManager } from './command-manager';
import { PanelInteractionHandler } from './panel-interaction-handler';
import { loadPanelState, savePanelState } from './panel-positioning';
import { PlaceholderView } from './placeholder-view';
import { createView, getAvailableViews, getViewTitle } from './view-registry';

/**
 * Manages the lifecycle of view panels including creation, showing, hiding, and state persistence.
 */
export class ViewLifecycleManager {
    private cubeModel: CubeModel;
    private styles: Record<string, string>;
    private visualizationsContainer: HTMLElement;
    private panelInteractionHandler: PanelInteractionHandler;
    private activeViews: Map<string, { view: CubeView; container: HTMLElement }>;
    private commandManager: CommandManager;
    private onUpdateFocus: (viewId: string) => void;
    private getLayoutMode: () => LayoutMode;
    private onPanelAdded: ((viewType: string, container: HTMLElement) => void) | undefined;
    private onPanelRemoved: ((viewType: string) => void) | undefined;

    constructor(
        cubeModel: CubeModel,
        styles: Record<string, string>,
        visualizationsContainer: HTMLElement,
        panelInteractionHandler: PanelInteractionHandler,
        activeViews: Map<string, { view: CubeView; container: HTMLElement }>,
        commandManager: CommandManager,
        callbacks: {
            onUpdateFocus: (viewId: string) => void;
            getLayoutMode: () => LayoutMode;
            onPanelAdded?: (viewType: string, container: HTMLElement) => void;
            onPanelRemoved?: (viewType: string) => void;
        }
    ) {
        this.cubeModel = cubeModel;
        this.styles = styles;
        this.visualizationsContainer = visualizationsContainer;
        this.panelInteractionHandler = panelInteractionHandler;
        this.activeViews = activeViews;
        this.commandManager = commandManager;
        this.onUpdateFocus = callbacks.onUpdateFocus;
        this.getLayoutMode = callbacks.getLayoutMode;
        this.onPanelAdded = callbacks.onPanelAdded;
        this.onPanelRemoved = callbacks.onPanelRemoved;

        // Subscribe to view state change events for immediate persistence.
        getEventBus().on(EventName.VIEW_STATE_CHANGED, this.handleViewStateChanged.bind(this));
    }

    /**
     * Creates the view control checkboxes for showing/hiding views.
     */
    createViewControls(): void {
        const viewControlsContainer = document.querySelector('.view-controls');
        if (!viewControlsContainer) {
            logger.warn('View controls container not found');
            return;
        }

        // Clear existing controls.
        viewControlsContainer.innerHTML = '';

        // Get all available views.
        const availableViews = getAvailableViews();

        // Create checkboxes for each view.
        availableViews.forEach(viewType => {
            const label = document.createElement('label');
            label.className = 'view-checkbox';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `show-${viewType}`;

            // Set default checked state for some views.
            if (
                viewType === 'moves' ||
                viewType === 'circular' ||
                viewType === 'basic-front' ||
                viewType === 'basic-back' ||
                viewType === 'flat'
            ) {
                checkbox.checked = true;
            }

            const text = document.createTextNode(getViewTitle(viewType));

            label.appendChild(checkbox);
            label.appendChild(text);

            // Add event listener.
            checkbox.addEventListener('change', e => {
                const target = e.target as HTMLInputElement;
                if (target.checked) {
                    this.showView(viewType);
                } else {
                    this.hideView(viewType);
                }
                this.persistVisibleViews();
            });

            viewControlsContainer.appendChild(label);
        });

        // Load saved visibility preferences.
        this.restoreVisibleViews();

        // Show initially checked views.
        const checkedViews = document.querySelectorAll(
            '.view-checkbox input[type="checkbox"]:checked'
        );
        checkedViews.forEach(checkbox => {
            const viewType = (checkbox as HTMLInputElement).id.replace('show-', '');
            // Don't update focus for each view
            this.showView(viewType, false);
        });

        // Set focus to first non-moves view by default.
        let firstViewType: string | null = null;
        checkedViews.forEach(checkbox => {
            const viewType = (checkbox as HTMLInputElement).id.replace('show-', '');
            if (!firstViewType && viewType !== 'moves') {
                firstViewType = viewType;
            }
        });
        if (firstViewType) {
            this.onUpdateFocus(firstViewType);
        }
    }

    /**
     * Shows a view by creating and displaying its panel.
     * @param viewType - The type of view to show.
     * @param updateFocus - Whether to update focus to this view (default: true).
     */
    showView(viewType: string, updateFocus: boolean = true): void {
        // Ignore if already shown.
        if (this.activeViews.has(viewType as string)) {
            return;
        }

        // Create and setup the view panel DOM structure.
        const { container: viewContainer, content } = this.createViewPanelDOM(viewType);
        this.visualizationsContainer.appendChild(viewContainer);

        try {
            // Create the view first to get minimum size.
            const view = this.createView(viewType as string);

            // Set initial position and size.
            this.panelInteractionHandler.setInitialPanelPosition(
                viewContainer,
                viewType as string,
                view
            );

            // Initialize the view.
            view.create(content, this.cubeModel.getReadOnlyModel());
            // Propagate the current layout mode immediately after creation so views
            // that adjust gesture handling (e.g. circular view) start in the right mode.
            view.setLayoutMode?.(this.getLayoutMode());
            this.activeViews.set(viewType as string, { view, container: viewContainer });

            // Notify view of initial size.
            view.resize?.();

            // Load and apply saved state (includes flip state and view-specific state).
            const savedState = loadPanelState(viewType as string);
            if (savedState) {
                // Restore view-specific state if view implements setState.
                if (savedState.viewState !== undefined && typeof view.setState === 'function') {
                    view.setState(savedState.viewState);
                    // Trigger a re-render to apply the restored state visually.
                    if (typeof view.update === 'function') {
                        view.update(this.cubeModel.getReadOnlyModel());
                    }
                }
            }

            // Notify parent so tabbed-mode panels get their CSS class and tab bar updated.
            this.onPanelAdded?.(viewType as string, viewContainer);

            // Persist the panel position immediately on open so reopening restores same placement.
            // Skip in tabbed mode — panel geometry is not meaningful there.
            if (this.getLayoutMode() !== LayoutMode.Tabbed) {
                const activeViewEntry = this.activeViews.get(viewType as string);
                if (activeViewEntry) {
                    savePanelState(activeViewEntry, this.visualizationsContainer);
                }
            }

            // Register commands.
            this.commandManager.registerViewCommands(viewType as string, view);
            this.commandManager.updateViewHeaderCommands(viewType as string);
            this.commandManager.renderGlobalCommands();

            // Update focus if requested.
            if (updateFocus) {
                this.onUpdateFocus(viewType as string);
            }
        } catch (error) {
            logger.error(`Failed to initialize view "${viewType}":`, error);

            // Clean up the partially-created panel so the DOM is not left in a broken state.
            viewContainer.remove();
            this.activeViews.delete(viewType);

            // Clear saved settings for this view so a corrupted/incompatible state
            // does not prevent initialization on the next attempt.
            localStorage.removeItem(`view-panel-${viewType}`);

            // Uncheck the corresponding visibility checkbox so UI stays consistent.
            const checkbox = document.getElementById(`show-${viewType}`) as HTMLInputElement | null;
            if (checkbox) {
                checkbox.checked = false;
            }
        }
    }

    /**
     * Hides a view by destroying its panel and removing it from active views.
     * @param viewType - The type of view to hide.
     * @param onRemoveFromFocusStack - Callback to remove view from focus stack.
     * @param onUpdateVisualFocus - Callback to update visual focus indication.
     */
    hideView(
        viewType: string,
        onRemoveFromFocusStack?: (viewType: string) => void,
        onUpdateVisualFocus?: () => void
    ): void {
        const activeView = this.activeViews.get(viewType);
        if (activeView) {
            // Save final panel state before destroying so position is persisted.
            // In tabbed mode only save view-specific state; position/size are not meaningful.
            savePanelState(
                activeView,
                this.visualizationsContainer,
                this.getLayoutMode() !== LayoutMode.Tabbed
            );
            activeView.view.destroy();
            this.visualizationsContainer.removeChild(activeView.container);
            this.activeViews.delete(viewType);

            // Remove from focus stack
            if (onRemoveFromFocusStack) {
                onRemoveFromFocusStack(viewType);
            }

            // Update visual focus since active view may have changed.
            if (onUpdateVisualFocus) {
                onUpdateVisualFocus();
            }

            // Update global commands since active view may have changed.
            this.commandManager.renderGlobalCommands();

            // Notify parent so the tab bar is updated.
            this.onPanelRemoved?.(viewType);
        }
    }

    /**
     * Creates the DOM structure for a view panel.
     * @param viewType - The type of view to create the panel for.
     * @returns Object containing the container element and content element.
     */
    private createViewPanelDOM(viewType: string): { container: HTMLElement; content: HTMLElement } {
        // Create container for the view.
        const viewContainer = document.createElement('div');
        viewContainer.className = `${this.styles['view-panel']} ${viewType as string}-view`;
        viewContainer.id = `${viewType as string}-panel`;
        // Data attribute to identify panel elements in the DOM.
        viewContainer.setAttribute('data-view-panel', viewType as string);

        // Add header.
        const header = document.createElement('div');
        header.className = this.styles['view-header'];
        header.setAttribute('data-view-header', '');

        const title = document.createElement('h3');
        title.className = this.styles['view-title'];
        title.setAttribute('data-view-title', '');
        title.textContent = getViewTitle(viewType as string);
        header.appendChild(title);

        viewContainer.appendChild(header);

        // Add content container.
        const content = document.createElement('div');
        content.className = this.styles['view-content'];
        content.setAttribute('data-view-content', '');
        viewContainer.appendChild(content);

        // Add resize handles.
        this.panelInteractionHandler.addResizeHandlesToPanel(viewContainer);

        return { container: viewContainer, content };
    }

    /**
     * Creates a view instance of the specified type.
     * @param viewType - The type of view to create.
     * @returns The created view instance.
     */
    private createView(viewType: string): CubeView {
        const view = createView(viewType, { viewType });
        if (!view) {
            // Fallback to placeholder if view not found.
            return new PlaceholderView(viewType);
        }
        return view;
    }

    /**
     * Handles view state change events by persisting the view's current state.
     */
    private handleViewStateChanged(event: ViewStateChangedEvent): void {
        const activeView = this.activeViews.get(event.viewType);
        if (!activeView) return;

        // In tabbed mode only save view-specific state; position/size are not meaningful.
        savePanelState(
            activeView,
            this.visualizationsContainer,
            this.getLayoutMode() !== LayoutMode.Tabbed
        );

        // Refresh header command buttons so toggle states (aria-pressed) stay in sync.
        this.commandManager.updateViewHeaderCommands(event.viewType);
    }

    /**
     * Persists the set of views that are currently visible to localStorage.
     */
    private persistVisibleViews(): void {
        const viewStates: { [key: string]: boolean } = {};
        const viewCheckboxes = document.querySelectorAll('.view-checkbox input[type="checkbox"]');
        viewCheckboxes.forEach(checkbox => {
            const input = checkbox as HTMLInputElement;
            const viewType = input.id.replace('show-', '');
            viewStates[viewType] = input.checked;
        });
        localStorage.setItem('rubiksCubeVisibleViews', JSON.stringify(viewStates));
    }

    /**
     * Restores visibility settings from localStorage and applies them to the checkboxes.
     */
    private restoreVisibleViews(): void {
        const saved = localStorage.getItem('rubiksCubeVisibleViews');
        if (!saved) return;

        const viewStates = JSON.parse(saved);
        for (const [viewType, checked] of Object.entries(viewStates)) {
            const checkbox = document.getElementById(`show-${viewType}`) as HTMLInputElement;
            if (checkbox) {
                checkbox.checked = checked as boolean;
            }
        }
    }
}
