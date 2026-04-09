import { CubeView, LayoutMode, Position2D, Size2D } from '@/cube/types';
import { logger } from '@/diagnostics/logger';

import { calculateDefaultPosition, loadPanelState, savePanelState } from './panel-positioning';
import { addResizeHandles } from './panel-resize-utils';
import { getViewDefaultConfig } from './view-registry';

/**
 * Valid resize directions for panel handles
 */
type ResizeDirection = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';

/**
 * Handles user interactions with view panels including dragging, resizing, and positioning
 */
export class PanelInteractionHandler {
    private visualizationsContainer: HTMLElement;
    private styles: Record<string, string>;
    private activeViews: Map<string, { view: CubeView; container: HTMLElement }>;
    private zIndexCounter: number;
    private getActiveViewId: () => string | undefined;
    private onPanelClick: (viewType: string) => void;
    private layoutMode: LayoutMode = 'floating';
    private dragState: {
        isDragging: boolean;
        isResizing: boolean;
        panel: HTMLElement | undefined | null;
        pointerId: number | undefined;
        startX: number;
        startY: number;
        initialX: number;
        initialY: number;
        initialWidth: number;
        initialHeight: number;
        resizeDirection: ResizeDirection | undefined;
        offsetX: number;
        offsetY: number;
    } = {
        isDragging: false,
        isResizing: false,
        panel: undefined,
        pointerId: undefined,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        initialWidth: 0,
        initialHeight: 0,
        resizeDirection: undefined,
        offsetX: 0,
        offsetY: 0,
    };

    /**
     * Creates a new PanelInteractionHandler
     * @param visualizationsContainer - The container element holding all view panels
     * @param styles - CSS class names for styling panels and handles
     * @param activeViews - Map of active view types to their view and container objects
     * @param zIndexCounter - Counter for managing panel z-index stacking order
     * @param getActiveViewId - Function to get the currently active view ID
     * @param onPanelClick - Callback function called when a panel is clicked
     */
    constructor(
        visualizationsContainer: HTMLElement,
        styles: Record<string, string>,
        activeViews: Map<string, { view: CubeView; container: HTMLElement }>,
        zIndexCounter: number,
        getActiveViewId: () => string | undefined,
        onPanelClick: (viewType: string) => void
    ) {
        this.visualizationsContainer = visualizationsContainer;
        this.styles = styles;
        this.activeViews = activeViews;
        this.zIndexCounter = zIndexCounter;
        this.getActiveViewId = getActiveViewId;
        this.onPanelClick = onPanelClick;
    }

    /**
     * Updates the layout mode; drag and resize are disabled in tabbed mode.
     */
    setLayoutMode(mode: LayoutMode): void {
        this.layoutMode = mode;
    }

    /**
     * Sets up event listeners for drag and resize interactions on panels
     */
    setupDragAndResizeHandlers(): void {
        // Pointer down handler
        this.visualizationsContainer.addEventListener('pointerdown', e => {
            const target = e.target as HTMLElement;
            const panel = target.closest(`.${this.styles['view-panel']}`) as HTMLElement;

            if (!panel) return;

            // Update focus whenever a panel is clicked
            const viewType = panel.id.replace('-panel', '');
            // Bring clicked panel to front so it visually stacks above others
            this.bringToFront(panel);

            this.onPanelClick(viewType);

            // Skip dragging if clicking on a command button
            const isCommandButton = target.closest('[data-view-commands-container]');

            // Check if clicking on header (drag) or resize handle
            if (target.closest(`.${this.styles['view-header']}`) && !isCommandButton) {
                if (this.layoutMode !== LayoutMode.Tabbed) this.startDrag(e, panel);
            } else if (target.classList.contains(this.styles['resize-handle'])) {
                if (this.layoutMode !== LayoutMode.Tabbed) {
                    const direction = target.getAttribute('data-resize-direction') || '';
                    this.startResize(e, panel, direction as ResizeDirection);
                }
            }
        });

        // Mouse move handler
        document.addEventListener('pointermove', e => {
            if (this.dragState.isDragging) {
                this.handleDrag(e);
            } else if (this.dragState.isResizing) {
                this.handleResize(e);
            }
        });

        // Mouse up handler
        document.addEventListener('pointerup', () => {
            if (this.dragState.isDragging || this.dragState.isResizing) {
                this.endDragOrResize();
            }
        });
    }

    /**
     * Initiates a drag operation on a panel
     * @param e - The mouse event that started the drag
     * @param panel - The panel element being dragged
     */
    private startDrag(e: PointerEvent, panel: HTMLElement): void {
        this.dragState.isDragging = true;
        this.dragState.panel = panel;
        this.dragState.pointerId = e.pointerId;
        this.dragState.startX = e.clientX;
        this.dragState.startY = e.clientY;

        const rect = panel.getBoundingClientRect();
        this.dragState.initialX = rect.left;
        this.dragState.initialY = rect.top;

        // Calculate mouse offset within the panel
        this.dragState.offsetX = e.clientX - rect.left;
        this.dragState.offsetY = e.clientY - rect.top;

        // Bring the panel to the front when starting to drag
        this.bringToFront(panel);

        // Capture pointer for reliable tracking
        panel.setPointerCapture(e.pointerId);

        panel.classList.add(this.styles.dragging);
        e.preventDefault();
    }

    /**
     * Initiates a resize operation on a panel
     * @param e - The mouse event that started the resize
     * @param panel - The panel element being resized
     * @param direction - The resize direction (e.g., 'nw', 'se', etc.)
     */
    private startResize(e: PointerEvent, panel: HTMLElement, direction: ResizeDirection): void {
        this.dragState.isResizing = true;
        this.dragState.panel = panel;
        this.dragState.pointerId = e.pointerId;
        this.dragState.resizeDirection = direction;
        this.dragState.startX = e.clientX;
        this.dragState.startY = e.clientY;

        const rect = panel.getBoundingClientRect();
        const containerRect = this.visualizationsContainer.getBoundingClientRect();

        // Convert viewport coordinates to container-relative coordinates
        this.dragState.initialX = rect.left - containerRect.left;
        this.dragState.initialY = rect.top - containerRect.top;
        this.dragState.initialWidth = rect.width;
        this.dragState.initialHeight = rect.height;

        // Bring the panel to the front when starting to resize
        this.bringToFront(panel);

        // Capture pointer for reliable tracking
        panel.setPointerCapture(e.pointerId);

        panel.classList.add(this.styles.resizing);
        e.preventDefault();
    }

    /**
     * Handles mouse movement during a drag operation
     * @param e - The mouse move event
     */
    private handleDrag(e: PointerEvent): void {
        if (!this.dragState.panel) return;

        // Get container position relative to viewport
        const containerRect = this.visualizationsContainer.getBoundingClientRect();

        // Calculate mouse position relative to container
        const mouseX = e.clientX - containerRect.left;
        const mouseY = e.clientY - containerRect.top;

        // Position the panel so the mouse stays at the same relative position within the panel
        let newX = mouseX - this.dragState.offsetX;
        let newY = mouseY - this.dragState.offsetY;

        // Clamp so the header is always reachable:
        //   - vertically: header top can reach up to PANEL_GAP from the viewport top edge
        //     (panels may cover the application title bar)
        //   - horizontally: at least MIN_VISIBLE pixels must stay inside the viewport
        const PANEL_GAP = 8;
        const MIN_VISIBLE = 50;
        const panelWidth = parseFloat(this.dragState.panel.style.width) || 200;

        // Convert viewport limits to container-relative coordinates
        const viewportTopInContainer = -containerRect.top + PANEL_GAP;
        const viewportRightInContainer = window.innerWidth - containerRect.left;
        const viewportLeftInContainer = -containerRect.left;

        newY = Math.max(viewportTopInContainer, newY);
        newX = Math.max(
            viewportLeftInContainer + MIN_VISIBLE - panelWidth,
            Math.min(newX, viewportRightInContainer - MIN_VISIBLE)
        );

        this.dragState.panel.style.left = `${newX}px`;
        this.dragState.panel.style.top = `${newY}px`;
    }

    /**
     * Handles mouse movement during a resize operation
     * @param e - The mouse move event
     */
    private handleResize(e: PointerEvent): void {
        if (!this.dragState.panel || !this.dragState.resizeDirection) return;

        const deltaX = e.clientX - this.dragState.startX;
        const deltaY = e.clientY - this.dragState.startY;

        let newWidth = this.dragState.initialWidth;
        let newHeight = this.dragState.initialHeight;
        let newX = this.dragState.initialX;
        let newY = this.dragState.initialY;

        const direction = this.dragState.resizeDirection;

        // Get minimum size from the view
        const viewType = this.dragState.panel.id.replace('-panel', '');
        const activeView = this.activeViews.get(viewType);
        const minSize = activeView?.view.getMinimumSize() || { width: 20, height: 20 };

        // Handle different resize directions
        if (direction.includes('e'))
            newWidth = Math.max(minSize.width, this.dragState.initialWidth + deltaX);
        if (direction.includes('s'))
            newHeight = Math.max(minSize.height, this.dragState.initialHeight + deltaY);
        if (direction.includes('w')) {
            newWidth = Math.max(minSize.width, this.dragState.initialWidth - deltaX);
            newX = this.dragState.initialX + (this.dragState.initialWidth - newWidth);
        }
        if (direction.includes('n')) {
            newHeight = Math.max(minSize.height, this.dragState.initialHeight - deltaY);
            newY = this.dragState.initialY + (this.dragState.initialHeight - newHeight);
        }

        // Apply new dimensions
        this.dragState.panel.style.left = `${newX}px`;
        this.dragState.panel.style.top = `${newY}px`;
        this.dragState.panel.style.width = `${newWidth}px`;
        this.dragState.panel.style.height = `${newHeight}px`;

        // Notify the view that it has been resized
        if (activeView && activeView.view.resize) {
            activeView.view.resize();
        }
    }

    /**
     * Ends the current drag or resize operation and saves the panel state
     */
    private endDragOrResize(): void {
        if (this.dragState.panel) {
            this.dragState.panel.classList.remove(this.styles.dragging, this.styles.resizing);

            // Release pointer capture
            if (this.dragState.pointerId !== undefined) {
                this.dragState.panel.releasePointerCapture(this.dragState.pointerId);
            }

            const viewType = this.dragState.panel.id.replace('-panel', '');
            const activeView = this.activeViews.get(viewType);
            if (activeView) {
                savePanelState(activeView, this.visualizationsContainer);
            }
        }

        this.dragState.isDragging = false;
        this.dragState.isResizing = false;
        this.dragState.panel = undefined;
        this.dragState.pointerId = undefined;
        this.dragState.resizeDirection = undefined;
    }

    /**
     * Sets the initial position and size of a panel, either from saved state or calculated defaults
     * @param panel - The panel element to position
     * @param viewType - The type of view this panel contains
     * @param view - Optional view instance to get minimum size requirements
     */
    setInitialPanelPosition(panel: HTMLElement, viewType: string, view?: CubeView): void {
        // In tabbed mode the CSS class controls layout; absolute positioning must not be applied.
        if (this.layoutMode === LayoutMode.Tabbed) return;

        const savedState = loadPanelState(viewType);
        const minSize = view ? view.getMinimumSize() : { width: 100, height: 100 };
        const containerRect = this.visualizationsContainer.getBoundingClientRect();

        let position: Position2D;
        let size: Size2D;

        // Try saved state first
        if (savedState) {
            size = {
                width: Math.max(savedState.size.width, minSize.width),
                height: Math.max(savedState.size.height, minSize.height),
            };

            // Check if saved position is still usable
            if (this.isSavedPositionUsable(savedState.position, size, containerRect)) {
                position = savedState.position;
            } else {
                // Saved position not usable, calculate new position
                position = calculateDefaultPosition(
                    this.visualizationsContainer,
                    this.activeViews as any,
                    viewType,
                    size,
                    this.getActiveViewId
                );
            }
        } else {
            // No saved state, use factory defaults
            const defaultConfig = getViewDefaultConfig(viewType);
            size = {
                width: Math.max(defaultConfig.width, minSize.width),
                height: Math.max(defaultConfig.height, minSize.height),
            };

            position = calculateDefaultPosition(
                this.visualizationsContainer,
                this.activeViews as any,
                viewType,
                size,
                this.getActiveViewId
            );
        }

        this.applyPanelLayout(panel, viewType, position, size);
    }

    /**
     * Checks if a saved position is still usable (at least 50% visible in container)
     * @param position - The saved position to check
     * @param size - The size of the panel
     * @param containerRect - The container's bounding rectangle
     * @returns true if the saved position is usable, false otherwise
     */
    private isSavedPositionUsable(
        position: Position2D,
        size: Size2D,
        containerRect: DOMRect
    ): boolean {
        // If container has no layout (e.g. jsdom returns zero sizes), treat saved state as valid
        if (containerRect.width === 0 || containerRect.height === 0) {
            return true;
        }

        const panelRect = {
            left: position.x + containerRect.left,
            top: position.y + containerRect.top,
            width: size.width,
            height: size.height,
        };

        const visibleIntersectionWidth = Math.max(
            0,
            Math.min(panelRect.left + panelRect.width, containerRect.left + containerRect.width) -
                Math.max(panelRect.left, containerRect.left)
        );
        const visibleIntersectionHeight = Math.max(
            0,
            Math.min(panelRect.top + panelRect.height, containerRect.top + containerRect.height) -
                Math.max(panelRect.top, containerRect.top)
        );
        const visibleArea = visibleIntersectionWidth * visibleIntersectionHeight;
        const panelArea = panelRect.width * panelRect.height;

        const visibleFraction = panelArea > 0 ? visibleArea / panelArea : 0;

        // Also require that the header row (top of the panel) is reachable.
        // Panels may extend above the container into the app title area, so check against
        // the viewport top (with PANEL_GAP margin) rather than the container top (y=0).
        const PANEL_GAP = 8;
        const minY = -(containerRect.top - PANEL_GAP); // container-relative minimum y
        const headerIsAccessible = position.y >= minY && position.y < containerRect.height;

        return visibleFraction >= 0.5 && headerIsAccessible;
    }

    /**
     * Applies layout (position, size, z-index) to a panel
     * @param panel - The panel element to apply layout to
     * @param viewType - The type of view for logging purposes
     * @param position - The position to apply
     * @param size - The size to apply
     */
    private applyPanelLayout(
        panel: HTMLElement,
        viewType: string,
        position: Position2D,
        size: Size2D
    ): void {
        panel.style.position = 'absolute';
        panel.style.left = `${position.x}px`;
        panel.style.top = `${position.y}px`;
        panel.style.width = `${size.width}px`;
        panel.style.height = `${size.height}px`;

        this.zIndexCounter++;
        panel.style.zIndex = this.zIndexCounter.toString();

        this.reportViewInitialization(viewType, panel);
    }

    private reportViewInitialization(viewType: string, panel: HTMLElement) {
        logger.debug(
            `View '${viewType}'` +
                ` opened at ${panel.style.left}, ${panel.style.top}` +
                ` with size ${panel.style.width} x ${panel.style.height}`
        );
    }

    /**
     * Brings a panel to the front by setting its z-index to the highest value
     * @param panel - The panel element to bring to front
     */
    private bringToFront(panel: HTMLElement): void {
        this.zIndexCounter++;
        panel.style.zIndex = this.zIndexCounter.toString();
    }

    /**
     * Repositions all currently active panels to valid on-screen positions.
     * Used after clearing saved data so panels are immediately accessible without a reload.
     */
    repositionAllActivePanels(): void {
        if (this.layoutMode === LayoutMode.Tabbed) return;

        const containerRect = this.visualizationsContainer.getBoundingClientRect();
        if (containerRect.width === 0 || containerRect.height === 0) return;

        for (const [viewType, activeView] of this.activeViews) {
            const minSize = activeView.view.getMinimumSize();
            const currentWidth = parseFloat(activeView.container.style.width) || minSize.width;
            const currentHeight = parseFloat(activeView.container.style.height) || minSize.height;
            const size: Size2D = {
                width: Math.max(currentWidth, minSize.width),
                height: Math.max(currentHeight, minSize.height),
            };

            const position = calculateDefaultPosition(
                this.visualizationsContainer,
                this.activeViews as Map<string, { container: HTMLElement }>,
                viewType,
                size,
                this.getActiveViewId
            );

            this.applyPanelLayout(activeView.container, viewType, position, size);
            savePanelState(activeView, this.visualizationsContainer);
        }
    }

    /**
     * Adds resize handles to a panel for user interaction
     * @param panel - The panel element to add resize handles to
     */
    addResizeHandlesToPanel(panel: HTMLElement): void {
        addResizeHandles(panel, this.styles);
    }
}
