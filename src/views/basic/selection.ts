import { StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

import type { BasicViewInternalData } from './types';

/**
 * Applies a hover highlight to the given sticker, clearing any previous one.
 */
export function updateHighlight(
    state: BasicViewInternalData,
    highlightedSticker?: StickerId
): void {
    const stickerClass = state.stickerClass || state.styles.sticker;
    const highlightClass = state.highlightedClass || state.styles.highlighted;
    const allStickers = state.container?.querySelectorAll(`.${stickerClass}`);
    allStickers?.forEach((sticker: Element) => sticker.classList.remove(highlightClass));

    if (highlightedSticker && state.container) {
        const stickerElement = state.container.querySelector(
            `.${stickerClass}[data-sticker-id="${highlightedSticker}"]`
        ) as HTMLElement;
        if (stickerElement) {
            stickerElement.classList.add(highlightClass);
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

    if (selectedSticker && state.model) {
        const cubeState = state.model.getCurrentState();
        const stickerObj = CubeStateUtils.getStickerById(cubeState, selectedSticker);
        if (stickerObj) {
            const cubie = CubeStateUtils.getCubieById(cubeState, stickerObj.cubieId);
            if (cubie) {
                state.selectedCubiePosition = cubie.position;
                state.selectedFace = stickerObj.currentFace;
            }
        }
    } else {
        state.selectedCubiePosition = undefined;
        state.selectedFace = undefined;
    }

    if (selectedSticker && state.container) {
        const stickerElement = state.container.querySelector(
            `.${state.styles.sticker}[data-sticker-id="${selectedSticker}"]`
        ) as HTMLElement;
        if (stickerElement) {
            stickerElement.classList.add(state.styles.selected);
        }
    }
}
