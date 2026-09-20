import { StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

import type { BasicViewInternalData } from './types';

/**
 * Applies a hover highlight to the given sticker, clearing any previous one.
 *
 * Records the highlight on `state` so it can be re-derived after a rebuild — see
 * {@link reapplyHighlightMarkup}. Passing `undefined` clears both the markup and
 * the recorded value, so a rebuild with no highlight stays clean.
 */
export function updateHighlight(
    state: BasicViewInternalData,
    highlightedSticker?: StickerId
): void {
    state.currentHighlight = highlightedSticker;

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
 * Re-apply the hover highlight for the sticker that was highlighted before a
 * rebuild.
 *
 * The highlight is the same class of derived DOM state as the selection: it is
 * written into cubie elements, and a rebuild replaces every one of them. Both
 * are therefore re-derived at the same boundary, so the DOM cannot come back
 * disagreeing with the app after a resize or a model update.
 *
 * Safe when nothing is highlighted — it applies nothing rather than inventing a
 * highlight.
 *
 * @param state The view state carrying `currentHighlight` and the DOM container
 */
export function reapplyHighlightMarkup(state: BasicViewInternalData): void {
    const highlighted = state.currentHighlight;
    if (!highlighted || !state.container) return;

    const stickerClass = state.stickerClass || state.styles.sticker;
    const highlightClass = state.highlightedClass || state.styles.highlighted;

    const stickerElement = state.container.querySelector(
        `.${stickerClass}[data-sticker-id="${highlighted}"]`
    ) as HTMLElement | null;

    stickerElement?.classList.add(highlightClass);
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
 * Clear the selection: remove its markup and drop the stored anchor.
 *
 * This is the **supported clear path**, and it is not a one-way door — see
 * {@link updateSelected} for how a selection is re-established. It exists as a
 * named operation because "nothing selected" used to be reachable only by
 * passing `undefined` to `updateSelected`, which made a supported state look
 * like an accident of an optional parameter.
 *
 * Not exported: `updateSelected(state)` with no sticker is the public form, and
 * this is the body it delegates to. Exposing both would give callers two ways to
 * ask for one thing with no way to tell which is canonical.
 *
 * @param state The view state carrying the selection and the DOM container
 */
function clearSelection(state: BasicViewInternalData): void {
    const allStickers = state.container?.querySelectorAll(`.${state.styles.sticker}`);
    allStickers?.forEach((sticker: Element) => sticker.classList.remove(state.styles.selected));

    state.currentSelected = undefined;
    state.selectedCubiePosition = undefined;
    state.selectedFace = undefined;
}

/**
 * Applies a keyboard/click selection to the given sticker, clearing any
 * previous selection and updating the state.
 *
 * Omitting `selectedSticker` clears the selection — the same outcome as calling
 * {@link clearSelection}. That is a supported state, not a terminal one: the
 * next call with a real sticker id re-establishes a selection, which is what
 * every production caller does (`navigation.ts` passes `onSelected?.(id)`).
 *
 * The parameter stays optional rather than being narrowed to a required
 * `StickerId` so that clearing remains expressible. Narrowing it would satisfy
 * "a cleared selection cannot be reached" by making "a cleared selection cannot
 * be requested", which removes a capability instead of constraining it; the
 * tests that clear deliberately are the evidence that the capability is real.
 *
 * @param state The view state carrying the selection and the DOM container
 * @param selectedSticker The sticker to select, or omitted to clear
 */
export function updateSelected(state: BasicViewInternalData, selectedSticker?: StickerId): void {
    if (!selectedSticker) {
        clearSelection(state);
        return;
    }

    const allStickers = state.container?.querySelectorAll(`.${state.styles.sticker}`);
    allStickers?.forEach((sticker: Element) => sticker.classList.remove(state.styles.selected));

    state.currentSelected = selectedSticker;

    if (state.model) {
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

    if (state.container) {
        const stickerElement = state.container.querySelector(
            `.${state.styles.sticker}[data-sticker-id="${selectedSticker}"]`
        ) as HTMLElement;
        if (stickerElement) {
            stickerElement.classList.add(state.styles.selected);
        }
    }
}
