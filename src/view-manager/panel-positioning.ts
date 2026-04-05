import { Position2D, Size2D } from '@/cube/types/cubie';
import { CubeView } from '@/cube/types/view';
import { logger } from '@/diagnostics/logger';

import { getViewDefaultConfig } from './view-registry';

/**
 * Represents the saved state of a panel including position, size, and orientation.
 */
export interface PanelState {
    position: Position2D;
    size: Size2D;
    viewState?: unknown;
}

/**
 * Loads the saved panel state from localStorage for a specific view type.
 * Handles migration from old flat format to new nested format.
 * @param viewType - The type of view to load state for.
 * @returns The saved panel state or undefined if none exists.
 */
export function loadPanelState(viewType: string): PanelState | undefined {
    try {
        const saved = localStorage.getItem(`view-panel-${viewType}`);
        if (!saved) return undefined;
        const result = JSON.parse(saved);
        return result;
    } catch (e) {
        logger.warn(`Failed to load panel state for ${viewType}:`, e);
        return undefined;
    }
}

/**
 * Saves the current state of a panel to localStorage.
 * @param viewInstance - The active view object containing the view and its container.
 * @param visualizationsContainer - The container element holding all panels.
 * @param savePositionAndSize - When false, preserves existing position/size and only updates
 *   view-specific state. Use false in tabbed layout mode where panel geometry is not meaningful.
 *   Defaults to true.
 */
export function savePanelState(
    viewInstance: { view: CubeView; container: HTMLElement },
    visualizationsContainer: HTMLElement | null,
    savePositionAndSize: boolean = true
): void {
    const panel = viewInstance.container;
    const viewType = panel.id.replace('-panel', '');

    let state: PanelState;

    if (savePositionAndSize) {
        const rect = panel.getBoundingClientRect();
        const containerRect = visualizationsContainer?.getBoundingClientRect();
        state = {
            position: {
                x: containerRect
                    ? rect.left - containerRect.left
                    : parseFloat(panel.style.left) || 20,
                y: containerRect ? rect.top - containerRect.top : parseFloat(panel.style.top) || 20,
            },
            size: {
                width: rect.width || 200,
                height: rect.height || 200,
            },
        };
    } else {
        // Preserve existing position/size; only update view-specific state.
        const existing = loadPanelState(viewType);
        state = existing
            ? { ...existing }
            : { position: { x: 20, y: 20 }, size: { width: 200, height: 200 } };
    }

    // Save view-specific state if available
    if (viewInstance.view?.getState) {
        const viewState = viewInstance.view.getState();
        if (viewState !== undefined) {
            state.viewState = viewState;
        }
    }

    localStorage.setItem(`view-panel-${viewType}`, JSON.stringify(state));
}

// ==================== Main Function ====================

/**
 * Calculates the default position for a new panel to avoid overlapping existing panels.
 *
 * Strategy:
 * 1. Try the view's preferred default position
 * 2. Search for first available position using grid search
 * 3. Try cascading from active/last panel
 * 4. Fallback to gap position
 *
 * @param visualizationsContainer - The container element holding all panels.
 * @param activeViews - Map of active view types to their container elements.
 * @param viewType - The type of view being positioned.
 * @param desiredWidth - The desired width of the new panel.
 * @param desiredHeight - The desired height of the new panel.
 * @param getActiveViewId - Function to get the currently active view ID.
 * @returns The calculated position as x,y coordinates.
 */
export function calculateDefaultPosition(
    visualizationsContainer: HTMLElement | undefined,
    activeViews: Map<string, { container: HTMLElement }>,
    viewType: string,
    desiredSize: Size2D,
    getActiveViewId: () => string | undefined
): Position2D {
    if (!visualizationsContainer) return DEFAULT_POSITION;

    const containerRect = visualizationsContainer.getBoundingClientRect();
    const containerSize = getValidatedDimensions(containerRect);

    // Get preferred position from view config
    const defaultConfig = getViewDefaultConfig(viewType);
    const preferredX = Math.max(
        0,
        Math.min(defaultConfig.x, containerSize.width - desiredSize.width)
    );
    const preferredY = Math.max(
        0,
        Math.min(defaultConfig.y, containerSize.height - desiredSize.height)
    );

    // Collect all occupied panel positions
    const occupied = getOccupiedRects(activeViews, containerRect, containerSize, {
        width: Math.min(desiredSize.width, containerSize.width),
        height: Math.min(desiredSize.height, containerSize.height),
    });

    // Strategy 1: Try preferred position
    if (!hasOverlap({ x: preferredX, y: preferredY }, desiredSize, occupied)) {
        return { x: preferredX, y: preferredY };
    }

    // Strategy 2: Grid search for first available position
    const gridPosition = findGridPosition(containerSize, desiredSize, occupied);
    if (gridPosition) return gridPosition;

    // Strategy 3: Cascade from active or last panel
    const anchorRect = getAnchorRect(activeViews, getActiveViewId);
    const cascadePosition = findCascadePosition(
        anchorRect,
        containerRect,
        containerSize,
        desiredSize,
        occupied,
        getHeaderHeight(visualizationsContainer)
    );
    if (cascadePosition) return cascadePosition;

    // Strategy 4: Fallback to gap position
    return { x: PANEL_GAP, y: PANEL_GAP };
}

// ==================== Helper Functions ====================

type Rect = Position2D & Size2D;

const PANEL_GAP = 12;
const DEFAULT_HEADER_HEIGHT = 44;
const DEFAULT_POSITION = { x: 20, y: 20 };

/**
 * Validates and sanitizes container dimensions to prevent infinite/NaN values.
 */
function getValidatedDimensions(containerRect: DOMRect): Size2D {
    const maxReasonable = Math.max(window.innerWidth, window.innerHeight) * 10;
    const isInvalid = (n: number) => !isFinite(n) || isNaN(n) || n <= 0;

    return {
        width:
            isInvalid(containerRect.width) || containerRect.width > maxReasonable
                ? window.innerWidth
                : containerRect.width,
        height:
            isInvalid(containerRect.height) || containerRect.height > maxReasonable
                ? window.innerHeight
                : containerRect.height,
    };
}

/**
 * Collects positions of all occupied panels relative to the container.
 */
function getOccupiedRects(
    activeViews: Map<string, { container: HTMLElement }>,
    containerRect: DOMRect,
    containerSize: Size2D,
    fallbackSize: Size2D
): Rect[] {
    const occupied: Rect[] = [];

    for (const { container } of activeViews.values()) {
        const rect = container.getBoundingClientRect();
        const rawX = rect.left - containerRect.left;
        const rawY = rect.top - containerRect.top;

        const width =
            isFinite(rect.width) && !isNaN(rect.width) && rect.width > 0
                ? rect.width
                : fallbackSize.width;
        const height =
            isFinite(rect.height) && !isNaN(rect.height) && rect.height > 0
                ? rect.height
                : fallbackSize.height;

        const x = Math.max(0, Math.min(rawX, containerSize.width - width));
        const y = Math.max(0, Math.min(rawY, containerSize.height - height));

        occupied.push({ x, y, width, height });
    }

    return occupied;
}

/**
 * Checks if a rectangle at given position with given size overlaps any occupied areas.
 */
function hasOverlap(
    position: Position2D,
    size: Size2D,
    occupied: Rect[],
    gap: number = PANEL_GAP
): boolean {
    for (const r of occupied) {
        const marginX = r.x - gap;
        const marginY = r.y - gap;
        const marginW = r.width + 2 * gap;
        const marginH = r.height + 2 * gap;

        const overlapX = Math.max(
            0,
            Math.min(position.x + size.width, marginX + marginW) - Math.max(position.x, marginX)
        );
        const overlapY = Math.max(
            0,
            Math.min(position.y + size.height, marginY + marginH) - Math.max(position.y, marginY)
        );

        if (overlapX > 0 && overlapY > 0) return true;
    }
    return false;
}

/**
 * Finds a non-overlapping position using a simple grid search.
 * Returns undefined if no position found within container bounds.
 */
function findGridPosition(
    containerSize: Size2D,
    desiredSize: Size2D,
    occupied: Rect[]
): Position2D | undefined {
    // Simple grid search with 1px step
    for (let y = 0; y <= containerSize.height - desiredSize.height; y++) {
        for (let x = 0; x <= containerSize.width - desiredSize.width; x++) {
            if (!hasOverlap({ x, y }, desiredSize, occupied)) {
                return { x, y };
            }
        }
    }
    return undefined;
}

/**
 * Attempts to position the panel cascading from an anchor panel (active or last).
 */
function findCascadePosition(
    anchorRect: DOMRect | undefined,
    containerRect: DOMRect,
    containerSize: Size2D,
    desiredSize: Size2D,
    occupied: Rect[],
    headerHeight: number
): Position2D | undefined {
    if (!anchorRect) return undefined;

    const anchorX = anchorRect.left - containerRect.left;
    const anchorY = anchorRect.top - containerRect.top;

    // Try cascading positions (up to 10 steps)
    for (let i = 1; i <= 10; i++) {
        const x = Math.max(
            0,
            Math.min(anchorX + i * headerHeight, containerSize.width - desiredSize.width)
        );
        const y = Math.max(
            0,
            Math.min(anchorY + i * headerHeight, containerSize.height - desiredSize.height)
        );

        if (!hasOverlap({ x, y }, desiredSize, occupied)) {
            return { x, y };
        }
    }

    return undefined;
}

/**
 * Gets the header height from an existing panel, or uses default.
 */
function getHeaderHeight(container: HTMLElement): number {
    const anyPanel = container.querySelector(`[data-view-panel]`) as HTMLElement;
    const header = anyPanel?.querySelector(`[data-view-header]`) as HTMLElement;
    return header?.offsetHeight ?? DEFAULT_HEADER_HEIGHT;
}

/**
 * Gets the anchor panel rect (active panel or last panel).
 */
function getAnchorRect(
    activeViews: Map<string, { container: HTMLElement }>,
    getActiveViewId: () => string | undefined
): DOMRect | undefined {
    const activeId = getActiveViewId();
    if (activeId) {
        const entry = activeViews.get(activeId);
        if (entry) return entry.container.getBoundingClientRect();
    }

    const last = Array.from(activeViews.values()).pop();
    return last?.container.getBoundingClientRect();
}

export default {
    loadPanelState,
    savePanelState,
    calculateDefaultPosition,
};
