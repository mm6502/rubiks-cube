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
 * Re-apply the selected class for the currently-selected sticker.
 *
 * Derived DOM state — the `selected` class — is written when the selection is
 * made, but the cube's cubie elements are rebuilt wholesale on every resize and
 * model update. The rebuilt elements never carry the class, so the highlight
 * disappears while `state.currentSelected` survives: the app reports a selection
 * the user cannot see.
 *
 * This re-derives the markup from the state that already exists, and is called
 * at the rebuild boundary so every rebuild path is covered. It deliberately does
 * **not** call {@link updateSelected}: that would re-run selection side effects
 * (clearing classes, re-resolving the cubie) for what is purely a repaint. It is
 * also safe when nothing is selected — it applies nothing rather than inventing
 * a selection — and therefore cannot resurrect one that was cleared.
 *
 * @param state The view state carrying `currentSelected` and the DOM container
 */
export function reapplySelectionMarkup(state: BasicViewInternalData): void {
    const selectedSticker = state.currentSelected;
    if (!selectedSticker || !state.container) return;

    const stickerElement = state.container.querySelector(
        `.${state.styles.sticker}[data-sticker-id="${selectedSticker}"]`
    ) as HTMLElement | null;

    stickerElement?.classList.add(state.styles.selected);
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
