import { Size2D } from '@/cube/types';

/**
 * Calculates the available content size within a view container
 * @param container - The content container element
 * @returns The available width and height for content
 */
export function computeAvailableContentSize(container: HTMLElement): Size2D {
    // Find the panel (container's parent) via data attribute
    const panel = container.closest('[data-view-panel]') as HTMLElement;
    if (!panel) {
        return { width: 0, height: 0 };
    }

    // Get panel dimensions
    const panelWidth = panel.clientWidth;
    const panelHeight = panel.clientHeight;

    // Find the header to get its height
    const header = panel.querySelector('[data-view-header]') as HTMLElement;
    const headerHeight = header ? header.offsetHeight : 44; // Default to ~44px if not found

    // Calculate available space
    // Subtract: header height + view-content padding (16px top + 16px bottom)
    const availableWidth = panelWidth - 32; // 16px left + 16px right padding
    const availableHeight = panelHeight - headerHeight - 32;

    return {
        width: Math.max(0, availableWidth),
        height: Math.max(0, availableHeight),
    };
}
