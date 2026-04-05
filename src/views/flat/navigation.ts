// Navigation utilities for Flat T-shaped cube view.
import { Face, ReadOnlyCubeModel, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

/**
 * Get the adjacent position when moving from a sticker position in the Flat view.
 * Handles movement within the T-shaped layout (U on top, F/R/L/B in middle, D on bottom).
 *
 * @internal This function is exported for testing purposes only and should not be used outside this module.
 */
export function getAdjacentPos(
    currentFace: Face,
    currentPos: number,
    key: string,
    cubeSize: number = 3
): { newFace: Face; newPos: number } | undefined {
    // Define the T-shaped layout positions.
    const layout: (Face | null)[][] = [
        [null, Face.U, null, null],
        [Face.L, Face.F, Face.R, Face.B],
        [null, Face.D, null, null],
    ];

    // Find current face position in layout.
    let currentRow = -1,
        currentCol = -1;
    for (let row = 0; row < layout.length; row++) {
        for (let col = 0; col < layout[row].length; col++) {
            if (layout[row][col] === currentFace) {
                currentRow = row;
                currentCol = col;
                break;
            }
        }
        if (currentRow !== -1) break;
    }

    if (currentRow === -1)
        // Face not found in layout.
        return undefined;

    const stickerRow = Math.floor(currentPos / cubeSize);
    const stickerCol = currentPos % cubeSize;

    let newFace = currentFace;
    let newPos = currentPos;

    switch (key) {
        case 'ArrowUp':
            if (stickerRow === 0) {
                // Try to move to face above.
                if (currentRow > 0 && layout[currentRow - 1][currentCol]) {
                    newFace = layout[currentRow - 1][currentCol]!;
                    // Bottom row of new face.
                    newPos = (cubeSize - 1) * cubeSize + stickerCol;
                }
            } else {
                newPos = (stickerRow - 1) * cubeSize + stickerCol;
            }
            break;
        case 'ArrowDown':
            if (stickerRow === cubeSize - 1) {
                // Try to move to face below.
                if (currentRow < layout.length - 1 && layout[currentRow + 1][currentCol]) {
                    newFace = layout[currentRow + 1][currentCol]!;
                    // Top row of new face.
                    newPos = 0 * cubeSize + stickerCol;
                }
            } else {
                newPos = (stickerRow + 1) * cubeSize + stickerCol;
            }
            break;
        case 'ArrowLeft':
            if (stickerCol === 0) {
                // Try to move to face to the left.
                if (currentCol > 0 && layout[currentRow][currentCol - 1]) {
                    newFace = layout[currentRow][currentCol - 1]!;
                    // Rightmost column of new face.
                    newPos = stickerRow * cubeSize + (cubeSize - 1);
                }
            } else {
                newPos = stickerRow * cubeSize + (stickerCol - 1);
            }
            break;
        case 'ArrowRight':
            if (stickerCol === cubeSize - 1) {
                // Try to move to face to the right.
                if (
                    currentCol < layout[currentRow].length - 1 &&
                    layout[currentRow][currentCol + 1]
                ) {
                    newFace = layout[currentRow][currentCol + 1]!;
                    // Leftmost column of new face.
                    newPos = stickerRow * cubeSize + 0;
                }
            } else {
                newPos = stickerRow * cubeSize + (stickerCol + 1);
            }
            break;
        default:
            // Ignore other keys.
            return undefined;
    }

    return { newFace, newPos };
}

/**
 * Check if the key event corresponds to navigation keys this view handles.
 *
 * @internal This function is exported for testing purposes only and should not be used outside this module.
 */
export function isNavigationKey(event: KeyboardEvent): boolean {
    const handledKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    return handledKeys.includes(event.key);
}

/**
 * Handle navigation based on arrow key presses.
 * If preview is true, just check preconditions without emitting events.
 * Returns the new sticker ID if navigation would succeed, null otherwise.
 *
 * @internal This function is exported for testing purposes only and should not be used outside this module.
 */
export function navigate(
    event: KeyboardEvent,
    preview: boolean = false,
    currentSelected: StickerId | undefined,
    model: ReadOnlyCubeModel | null,
    onSelected?: (id: StickerId) => void
): boolean {
    // Preconditions: must have a currently selected sticker.
    if (!currentSelected || !model) return false;

    // Get current cube state and selected sticker details.
    const state = model.getCurrentState();
    const currentSticker = CubeStateUtils.getStickerById(state, currentSelected);
    if (!currentSticker) return false;

    // Get the adjacent position based on the key pressed.
    const result = getAdjacentPos(
        currentSticker.currentFace as Face,
        currentSticker.facePosition,
        event.key,
        state.cubeSize
    );
    if (!result) return false;

    // Get the actual sticker object at the new position.
    const newSticker = CubeStateUtils.getStickerAt(state, result.newFace, result.newPos);
    if (!newSticker) return false;

    // Somehow navigated to the same sticker, no change.
    if (currentSticker?.id === newSticker?.id) return false;

    // If not a preview, notify the caller about the new selection.
    if (!preview) {
        onSelected?.(newSticker.id);
    }

    // Navigation successful.
    return true;
}
