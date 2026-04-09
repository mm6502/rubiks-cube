import { Face, ReadOnlyCubeModel, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

import { inferMoveFromDrag, inferMoveFromFaceRotation } from './move-inference';
import { DragDirection } from './types';

/**
 * Input parameters for keyboard-based move inference.
 */
export type KeyboardMoveInput = {
    stickerId: StickerId;
    selectedFace: Face | undefined;
    faceDirectMode: boolean;
    direction: DragDirection;
    doubleTurn: boolean;
    model: ReadOnlyCubeModel;
    remapDirection?: (direction: DragDirection, face: Face) => DragDirection;
};

/**
 * Check if a keyboard event is a keyboard move key (Ctrl+Arrow, optionally +Shift for 180°).
 */
export function isKeyboardMoveKey(event: KeyboardEvent): boolean {
    if (!event.ctrlKey) return false;
    if (event.altKey || event.metaKey) return false;
    return (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight'
    );
}

/**
 * Check if a keyboard event is a face-select toggle key (Space or Backquote).
 */
export function isFaceSelectKey(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return false;
    return event.key === ' ' || event.key === 'Backquote' || event.key === '`';
}

/**
 * Map an arrow key event to a DragDirection.
 */
export function mapArrowToDirection(event: KeyboardEvent): DragDirection | undefined {
    switch (event.key) {
        case 'ArrowUp':
            return DragDirection.UP;
        case 'ArrowDown':
            return DragDirection.DOWN;
        case 'ArrowLeft':
            return DragDirection.LEFT;
        case 'ArrowRight':
            return DragDirection.RIGHT;
        default:
            return undefined;
    }
}

/**
 * Convert a move notation to its 180° variant.
 * Strips trailing prime ('), appends '2'.
 * E.g. "F" → "F2", "F'" → "F2", "M" → "M2".
 */
export function toDoubleTurn(notation: string): string {
    return notation.replace(/'$/, '') + '2';
}

/**
 * Infer a cube move from keyboard input.
 *
 * When a face is effectively selected (explicit selection or face-direct mode),
 * the move is a face rotation (CW for up/right, CCW for down/left).
 *
 * When no face is selected, the sticker's position determines the layer,
 * and the arrow direction determines the move via drag inference.
 */
export function inferKeyboardMove(input: KeyboardMoveInput): string | undefined {
    const { stickerId, selectedFace, faceDirectMode, direction, doubleTurn, model } = input;

    const state = model.getCurrentState();
    const sticker = CubeStateUtils.getStickerById(state, stickerId);
    if (!sticker) return undefined;

    const effectiveFace =
        selectedFace ?? (faceDirectMode ? (sticker.currentFace as Face) : undefined);

    if (effectiveFace) {
        const remapped = input.remapDirection
            ? input.remapDirection(direction, effectiveFace)
            : direction;
        const isClockwise = remapped === DragDirection.DOWN || remapped === DragDirection.RIGHT;
        const notation = inferMoveFromFaceRotation(effectiveFace, isClockwise);
        return doubleTurn ? toDoubleTurn(notation) : notation;
    }

    // No face selected — infer layer move from sticker position + direction.
    const face = sticker.currentFace as Face;
    const cubeSize = state.cubeSize;
    const row = Math.floor(sticker.facePosition / cubeSize);
    const col = sticker.facePosition % cubeSize;

    const remapped = input.remapDirection ? input.remapDirection(direction, face) : direction;

    const notation = inferMoveFromDrag({ face, row, col, direction: remapped, cubeSize });
    return doubleTurn ? toDoubleTurn(notation) : notation;
}
