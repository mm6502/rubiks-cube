// Navigation utilities for Flat T-shaped cube view.
import { Face, ReadOnlyCubeModel, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { getAdjacentStickerOnSurface } from '@/cube/utils/surface-walking';
import { mapArrowToDirection } from '@/interaction/keyboard-moves';
import { NavDirection } from '@/types';

/**
 * Remap a NavDirection for the +90° visual rotation used on mobile.
 * Press ArrowUp on screen → logical Left, etc.
 */
function remapNavDirectionForRotation(dir: NavDirection): NavDirection {
    switch (dir) {
        case NavDirection.Up:
            return NavDirection.Left;
        case NavDirection.Right:
            return NavDirection.Up;
        case NavDirection.Down:
            return NavDirection.Right;
        case NavDirection.Left:
            return NavDirection.Down;
        default:
            return dir;
    }
}

function mapKeyToNavDirection(event: KeyboardEvent): NavDirection | undefined {
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return undefined;
    return mapArrowToDirection(event) as NavDirection | undefined;
}

/** Find a face's row and column in the T-shaped layout grid. */
function findFaceInLayout(
    layout: (Face | null)[][],
    face: Face
): { row: number; col: number } | undefined {
    for (let row = 0; row < layout.length; row++) {
        for (let col = 0; col < layout[row].length; col++) {
            if (layout[row][col] === face) {
                return { row, col };
            }
        }
    }
    return undefined;
}

/** Resolve upward movement: cross face boundary or stay within the same face. */
function resolveUp(
    layout: (Face | null)[][],
    row: number,
    col: number,
    currentFace: Face,
    stickerRow: number,
    stickerCol: number,
    cubeSize: number
): { newFace: Face; newPos: number } {
    if (stickerRow === 0) {
        if (row > 0 && layout[row - 1][col]) {
            return {
                newFace: layout[row - 1][col]!,
                newPos: (cubeSize - 1) * cubeSize + stickerCol,
            };
        }
    } else {
        return { newFace: currentFace, newPos: (stickerRow - 1) * cubeSize + stickerCol };
    }
    return { newFace: currentFace, newPos: stickerRow * cubeSize + stickerCol };
}

/** Resolve downward movement: cross face boundary or stay within the same face. */
function resolveDown(
    layout: (Face | null)[][],
    row: number,
    col: number,
    currentFace: Face,
    stickerRow: number,
    stickerCol: number,
    cubeSize: number
): { newFace: Face; newPos: number } {
    if (stickerRow === cubeSize - 1) {
        if (row < layout.length - 1 && layout[row + 1][col]) {
            return { newFace: layout[row + 1][col]!, newPos: stickerCol };
        }
    } else {
        return { newFace: currentFace, newPos: (stickerRow + 1) * cubeSize + stickerCol };
    }
    return { newFace: currentFace, newPos: stickerRow * cubeSize + stickerCol };
}

/** Resolve leftward movement: cross face boundary or stay within the same face. */
function resolveLeft(
    layout: (Face | null)[][],
    row: number,
    col: number,
    currentFace: Face,
    stickerRow: number,
    stickerCol: number,
    cubeSize: number
): { newFace: Face; newPos: number } {
    if (stickerCol === 0) {
        if (col > 0 && layout[row][col - 1]) {
            return {
                newFace: layout[row][col - 1]!,
                newPos: stickerRow * cubeSize + (cubeSize - 1),
            };
        }
    } else {
        return { newFace: currentFace, newPos: stickerRow * cubeSize + (stickerCol - 1) };
    }
    return { newFace: currentFace, newPos: stickerRow * cubeSize + stickerCol };
}

/** Resolve rightward movement: cross face boundary or stay within the same face. */
function resolveRight(
    layout: (Face | null)[][],
    row: number,
    col: number,
    currentFace: Face,
    stickerRow: number,
    stickerCol: number,
    cubeSize: number
): { newFace: Face; newPos: number } {
    if (stickerCol === cubeSize - 1) {
        if (col < layout[row].length - 1 && layout[row][col + 1]) {
            return { newFace: layout[row][col + 1]!, newPos: stickerRow * cubeSize };
        }
    } else {
        return { newFace: currentFace, newPos: stickerRow * cubeSize + (stickerCol + 1) };
    }
    return { newFace: currentFace, newPos: stickerRow * cubeSize + stickerCol };
}

/**
 * Get the adjacent position when moving from a sticker position in the Flat view.
 * Handles movement within the T-shaped layout (U on top, F/R/L/B in middle, D on bottom).
 *
 * @internal This function is exported for testing purposes only and should not be used outside this module.
 */
export function getAdjacentPos(
    currentFace: Face,
    currentPos: number,
    dir: NavDirection,
    cubeSize: number = 3
): { newFace: Face; newPos: number } | undefined {
    const layout: (Face | null)[][] = [
        [null, Face.U, null, null],
        [Face.L, Face.F, Face.R, Face.B],
        [null, Face.D, null, null],
    ];

    const position = findFaceInLayout(layout, currentFace);
    if (!position) {
        return undefined;
    }

    const stickerRow = Math.floor(currentPos / cubeSize);
    const stickerCol = currentPos % cubeSize;

    switch (dir) {
        case NavDirection.Up:
            return resolveUp(
                layout,
                position.row,
                position.col,
                currentFace,
                stickerRow,
                stickerCol,
                cubeSize
            );
        case NavDirection.Down:
            return resolveDown(
                layout,
                position.row,
                position.col,
                currentFace,
                stickerRow,
                stickerCol,
                cubeSize
            );
        case NavDirection.Left:
            return resolveLeft(
                layout,
                position.row,
                position.col,
                currentFace,
                stickerRow,
                stickerCol,
                cubeSize
            );
        case NavDirection.Right:
            return resolveRight(
                layout,
                position.row,
                position.col,
                currentFace,
                stickerRow,
                stickerCol,
                cubeSize
            );
        default:
            return undefined;
    }
}

/**
 * Check if the key event corresponds to navigation keys this view handles.
 *
 * @internal This function is exported for testing purposes only and should not be used outside this module.
 */
export function isNavigationKey(event: KeyboardEvent): boolean {
    return mapKeyToNavDirection(event) !== undefined;
}

/**
 * Handle navigation based on arrow key presses.
 * If preview is true, just check preconditions without emitting events.
 * Returns the new sticker ID if navigation would succeed, null otherwise.
 *
 * @param cubeWalk - When true, walks across real cube surfaces; when false,
 *   walks within the T-shaped layout (stops at layout edges).
 * @param isRotated - When true, remaps arrow key directions to account for
 *   the +90° visual rotation used in portrait/mobile mode.
 *
 * @internal This function is exported for testing purposes only and should not be used outside this module.
 */
export function navigate(
    event: KeyboardEvent,
    preview: boolean = false,
    currentSelected: StickerId | undefined,
    model: ReadOnlyCubeModel | null,
    cubeWalk: boolean = true,
    isRotated: boolean = false,
    onSelected?: (id: StickerId) => void
): boolean {
    // Preconditions: must have a currently selected sticker.
    if (!currentSelected || !model) return false;

    // Get current cube state and selected sticker details.
    const state = model.getCurrentState();
    const currentSticker = CubeStateUtils.getStickerById(state, currentSelected);
    if (!currentSticker) return false;

    // Get the adjacent position based on the key pressed.
    let dir = mapKeyToNavDirection(event);
    if (!dir) return false;

    if (isRotated) dir = remapNavDirectionForRotation(dir);

    let newStickerId: StickerId | undefined;

    if (cubeWalk) {
        // Surface walk: follow real cube topology via FACE_BASIS vectors.
        newStickerId = getAdjacentStickerOnSurface(state, currentSelected, dir);
    } else {
        // Planar walk: follow the T-shaped layout (stops at layout edges).
        const result = getAdjacentPos(
            currentSticker.currentFace as Face,
            currentSticker.facePosition,
            dir,
            state.cubeSize
        );
        if (!result) return false;
        const newSticker = CubeStateUtils.getStickerAt(state, result.newFace, result.newPos);
        newStickerId = newSticker?.id;
    }

    if (!newStickerId) return false;

    // Navigated to the same sticker — no change.
    if (currentSticker.id === newStickerId) return false;

    // If not a preview, notify the caller about the new selection.
    if (!preview) {
        onSelected?.(newStickerId);
    }

    // Navigation successful.
    return true;
}
