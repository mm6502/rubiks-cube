import { StickerId } from '@/cube/types';

import type { BasicViewInternalData } from './basic-view';

/**
 * Applies a hover highlight to the given sticker, clearing any previous one.
 */
export function updateHighlight(
    state: BasicViewInternalData,
    highlightedSticker?: StickerId
): void {
    const allStickers = state.container?.querySelectorAll(`.${state.styles.sticker}`);
    allStickers?.forEach((sticker: Element) => sticker.classList.remove(state.styles.highlighted));

    if (highlightedSticker && state.container) {
        const stickerElement = state.container.querySelector(
            `.${state.styles.sticker}[data-sticker-id="${highlightedSticker}"]`
        ) as HTMLElement;
        if (stickerElement) {
            stickerElement.classList.add(state.styles.highlighted);
        }
    }
}

/**
 * Applies a keyboard/click selection to the given sticker, clearing any
 * previous selection and updating the state.
 */
export function updateSelected(state: BasicViewInternalData, selectedSticker?: StickerId): void {
    const allStickers = state.container?.querySelectorAll(`.${state.styles.sticker}`);
    allStickers?.forEach((sticker: Element) => sticker.classList.remove(state.styles.selected));

    state.currentSelected = selectedSticker;

    if (selectedSticker && state.container) {
        const stickerElement = state.container.querySelector(
            `.${state.styles.sticker}[data-sticker-id="${selectedSticker}"]`
        ) as HTMLElement;
        if (stickerElement) {
            stickerElement.classList.add(state.styles.selected);
        }
    }
}
