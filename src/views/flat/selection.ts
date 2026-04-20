import { StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { getAdjacentStickerOnSurface } from '@/cube/utils/surface-walking';
import { NavDirection } from '@/types';

import type { FlatViewInternalData } from './flat-view';

/**
 * Remove previous highlights and apply the `highlighted` class to the given
 * sticker, plus `adjacent-highlight` on its surface-adjacent neighbours that
 * lie on a different face.
 */
export function updateHighlight(state: FlatViewInternalData, highlightedSticker?: StickerId): void {
    // Remove previous highlights
    state.container
        ?.querySelectorAll(`.${state.styles['flat-sticker']}.${state.styles.highlighted}`)
        .forEach(el => {
            el.classList.remove(state.styles.highlighted);
        });

    // Remove previous adjacent highlights
    state.container
        ?.querySelectorAll(`.${state.styles['flat-sticker']}.${state.styles['adjacent-highlight']}`)
        .forEach(el => {
            el.classList.remove(state.styles['adjacent-highlight']);
        });

    if (highlightedSticker && state.container) {
        const sticker = state.container.querySelector(
            `.${state.styles['flat-sticker']}[data-sticker-id="${highlightedSticker}"]`
        ) as HTMLElement;
        if (sticker) {
            sticker.classList.add(state.styles.highlighted);
        }

        // Highlight adjacent stickers subtly
        applyAdjacentClass(state, highlightedSticker, 'adjacent-highlight');
    }
}

/**
 * Remove previous selections and apply the `selected` class to the given
 * sticker.  Updates the state bag's spatial-anchor fields (`currentSelected`,
 * `selectedFace`, `selectedPosition`) so selection survives model updates.
 */
export function updateSelected(state: FlatViewInternalData, selectedSticker?: StickerId): void {
    // Remove previous selections
    state.container
        ?.querySelectorAll(`.${state.styles['flat-sticker']}.${state.styles.selected}`)
        .forEach(el => {
            el.classList.remove(state.styles.selected);
        });

    // Remove previous adjacent selections
    state.container
        ?.querySelectorAll(`.${state.styles['flat-sticker']}.${state.styles.adjacent}`)
        .forEach(el => {
            el.classList.remove(state.styles.adjacent);
        });

    // For navigation purposes, keep track of face:pos format
    if (selectedSticker && state.container) {
        const stickerElement = state.container.querySelector(
            `.${state.styles['flat-sticker']}[data-sticker-id="${selectedSticker}"]`
        ) as HTMLElement;
        if (stickerElement) {
            state.currentSelected = selectedSticker;
            stickerElement.classList.add(state.styles.selected);

            if (state.model) {
                const stickerObj = CubeStateUtils.getStickerById(
                    state.model.getCurrentState(),
                    selectedSticker
                );
                if (stickerObj) {
                    state.selectedFace = stickerObj.currentFace;
                    state.selectedPosition = stickerObj.facePosition;
                }
            }

            // Mark adjacent stickers subtly
            applyAdjacentClass(state, selectedSticker, 'adjacent');
        }
    } else {
        state.currentSelected = undefined;
        state.selectedFace = undefined;
        state.selectedPosition = undefined;
    }
}

/**
 * Apply a CSS class to surface-adjacent stickers that lie on a different face.
 */
export function applyAdjacentClass(
    state: FlatViewInternalData,
    stickerId: StickerId,
    className: string
): void {
    if (!state.model || !state.container) return;

    const cubeState = state.model.getCurrentState();
    const sourceSticker = CubeStateUtils.getStickerById(cubeState, stickerId);
    if (!sourceSticker) return;

    const sourceFace = sourceSticker.currentFace;
    const directions = [NavDirection.Up, NavDirection.Down, NavDirection.Left, NavDirection.Right];

    for (const dir of directions) {
        const adjId = getAdjacentStickerOnSurface(cubeState, stickerId, dir);
        if (!adjId) continue;

        const adjSticker = CubeStateUtils.getStickerById(cubeState, adjId);
        if (!adjSticker || adjSticker.currentFace === sourceFace) continue;

        const adjEl = state.container.querySelector(
            `.${state.styles['flat-sticker']}[data-sticker-id="${adjId}"]`
        ) as HTMLElement | null;
        if (adjEl) {
            adjEl.classList.add(state.styles[className]);
        }
    }
}

/**
 * Restore selection after a model update by looking up the sticker at the
 * previously-selected face + position (spatial anchor).
 */
export function restoreSelection(state: FlatViewInternalData): void {
    if (state.selectedFace == null || state.selectedPosition == null || !state.model) return;
    const sticker = CubeStateUtils.getStickerAt(
        state.model.getCurrentState(),
        state.selectedFace,
        state.selectedPosition
    );
    if (sticker) {
        updateSelected(state, sticker.id);
    }
}
