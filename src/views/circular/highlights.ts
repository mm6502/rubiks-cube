import { StickerId } from '@/cube/types';

import { CircularCubeViewInternalData } from './circular-view';

/**
 * Remove selection highlight from all stickers. @internal
 */
export function removeSelectionHighlight(
    state: CircularCubeViewInternalData,
    styles: Record<string, string>
): void {
    for (const circle of state.svgElementCache.values()) {
        circle.classList.remove(styles['selected']);
    }
}

/**
 * Update highlight class for a given sticker id. @internal
 */
export function updateHighlight(
    state: CircularCubeViewInternalData,
    styles: Record<string, string>,
    highlightedSticker?: StickerId
): void {
    // Remove previous highlights
    for (const circle of state.svgElementCache.values()) {
        circle.classList.remove(styles['highlighted']);
    }

    if (!highlightedSticker) return;

    const svgId = state.stickerIdToSvgId.get(highlightedSticker);
    if (!svgId) return;

    const circle = state.svgElementCache.get(svgId);
    if (!circle) return;

    circle.classList.add(styles['highlighted']);
}

/**
 * Update selection highlight and track current selection. @internal
 */
export function updateSelected(
    state: CircularCubeViewInternalData,
    styles: Record<string, string>,
    selectedSticker?: StickerId
): void {
    // Track current selection for keyboard navigation.
    state.currentSelected = selectedSticker;

    // Remove previous selections.
    removeSelectionHighlight(state, styles);

    if (!selectedSticker) return;

    const svgId = state.stickerIdToSvgId.get(selectedSticker);
    if (!svgId) return;

    const circle = state.svgElementCache.get(svgId);
    if (!circle) return;

    circle.classList.add(styles['selected']);
}
