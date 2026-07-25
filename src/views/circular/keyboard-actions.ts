import { Application } from '@/application';
import { Face, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import {
    inferKeyboardMove,
    isFaceSelectKey,
    isKeyboardMoveKey,
    mapArrowToDirection,
} from '@/interaction/keyboard-moves';
import { EventName, MoveRequestedEvent } from '@/types';

import { isNavigationKey, navigate } from './keyboard-cube-walking';
import { CircularCubeViewInternalData } from './types';

/**
 * Handle a key press for the circular view, with a preview mode for keydown pre-checking.
 * @param event - The keyboard event to handle.
 * @param preview - If true, only check if the event would be handled without actually performing the action.
 * @param state - The internal state of the circular view.
 * @param updateSelected - Callback to update the selected sticker.
 * @param flashFaceLabelTilt - Callback to flash the face label tilt.
 * @returns true if the event was handled, false otherwise.
 */
export function handleKeyPress(
    event: KeyboardEvent,
    preview: boolean,
    state: CircularCubeViewInternalData,
    updateSelected: (id?: StickerId) => void,
    flashFaceLabelTilt: () => void
): boolean {
    // Face selection toggle (Space or Backtick).
    if (isFaceSelectKey(event)) {
        if (!preview) {
            handleFaceSelectKey(state);
            flashFaceLabelTilt();
        }
        return state.currentSelected !== undefined;
    }

    // Keyboard move (Ctrl+Arrow, optionally +Shift for 180°).
    if (isKeyboardMoveKey(event)) {
        if (!preview) {
            handleKeyboardMove(event, state);
            flashFaceLabelTilt();
        }
        return state.currentSelected !== undefined;
    }

    // Plain arrow keys — sticker navigation.
    if (!isNavigationKey(event)) return false;

    const handled = navigate(event, preview, state, /* c8 ignore next */ id => updateSelected(id));
    if (handled && !preview) flashFaceLabelTilt();
    return handled;
}

function handleFaceSelectKey(state: CircularCubeViewInternalData): void {
    if (!state.currentSelected || !state.model || !state.touchHandler) return;

    const sticker = CubeStateUtils.getStickerById(
        state.model.getCurrentState(),
        state.currentSelected
    );
    if (!sticker) return;

    const face = sticker.currentFace as Face;
    const current = state.touchHandler.getSelectedFace();
    state.touchHandler.selectFace(current === face ? undefined : face);
}

function handleKeyboardMove(event: KeyboardEvent, state: CircularCubeViewInternalData): void {
    if (!state.currentSelected || !state.model || !state.touchHandler) return;

    const direction = mapArrowToDirection(event);
    if (!direction) return;

    const notation = inferKeyboardMove({
        stickerId: state.currentSelected,
        selectedFace: state.touchHandler.getSelectedFace(),
        faceDirectMode: state.touchHandler.getFaceDirectMode(),
        direction,
        doubleTurn: event.shiftKey,
        model: state.model,
    });
    if (!notation) return;

    const payload: MoveRequestedEvent = {
        moveNotation: notation,
        viewId: 'circular',
        tentative: false,
    };
    Application.eventBus.emit(EventName.MOVE_REQUESTED, payload);
}
