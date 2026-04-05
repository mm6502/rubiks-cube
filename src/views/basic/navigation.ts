import { Application } from '@/application';
import { Axis, Face, ReadOnlyCubeModel, ReadonlyCubie, StickerId, Vector3 } from '@/cube/types';
import { findClosestEquivalentAngle, mod, rotatePosition3D } from '@/cube/utils/math';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { LogLevel, logger } from '@/diagnostics/logger';
import { EventName } from '@/types';

import type { BasicViewInternalData } from './basic-view';
import { BASIC_VIEW_ANGLES } from './constants';

// ---------------------------------------------------------------------------
// Orientation
// ---------------------------------------------------------------------------

/** Cube view orientation for Basic view */
export type Orientation = 'front' | 'back';

/** Orientation constants for type safety */
export const Orientation = {
    Front: 'front' as Orientation,
    Back: 'back' as Orientation,
} as const;

// ---------------------------------------------------------------------------
// NavigationDelta
// ---------------------------------------------------------------------------

/** Navigation delta for keyboard movement */
export type NavigationDelta = -3 | -1 | 1 | 3;

/** Navigation delta constants for type safety */
export const NavigationDelta = {
    Up: -3 as NavigationDelta,
    Down: 3 as NavigationDelta,
    Left: -1 as NavigationDelta,
    Right: 1 as NavigationDelta,
} as const;

// ---------------------------------------------------------------------------
// Cube sticker-grid navigation
// ---------------------------------------------------------------------------

/**
 * Get the adjacent position when moving from a sticker position.
 * Handles both within-face movement and cross-face transitions.
 */
export function getAdjacentPos(
    model: ReadOnlyCubeModel,
    currentFace: Face,
    currentPos: number,
    delta: NavigationDelta,
    _orientation: Orientation = Orientation.Front,
    _yRotation: number = 0,
    _xRotation: number = 0
): { newFace: Face; newPos: number } {
    const state = model.getCurrentState();
    const cubeSize = state.cubeSize;
    const row = Math.floor(currentPos / cubeSize);
    const col = currentPos % cubeSize;

    let newFace = currentFace;
    let newRow = row;
    let newCol = col;

    if (delta === NavigationDelta.Up) {
        if (row === 0) {
            if (currentFace === Face.F) {
                newFace = Face.U;
                newRow = cubeSize - 1;
                newCol = col;
            } else if (currentFace === Face.U) {
                newFace = Face.B;
                newRow = cubeSize - 1;
                newCol = col;
            } else if (currentFace === Face.B) {
                newFace = Face.U;
                newRow = 0;
                newCol = col;
            } else if (currentFace === Face.D) {
                newFace = Face.B;
                newRow = cubeSize - 1;
                newCol = col;
            } else if (currentFace === Face.R) {
                newFace = Face.U;
                newRow = col;
                newCol = cubeSize - 1;
            } else if (currentFace === Face.L) {
                newFace = Face.U;
                newRow = col;
                newCol = 0;
            }
        } else {
            newRow = row - 1;
        }
    } else if (delta === NavigationDelta.Down) {
        if (row === cubeSize - 1) {
            if (currentFace === Face.F) {
                newFace = Face.D;
                newRow = 0;
                newCol = col;
            } else if (currentFace === Face.D) {
                newFace = Face.B;
                newRow = 0;
                newCol = col;
            } else if (currentFace === Face.B) {
                newFace = Face.D;
                newRow = 0;
                newCol = col;
            } else if (currentFace === Face.U) {
                newFace = Face.F;
                newRow = 0;
                newCol = col;
            } else if (currentFace === Face.R) {
                newFace = Face.D;
                newRow = cubeSize - 1 - col;
                newCol = cubeSize - 1;
            } else if (currentFace === Face.L) {
                newFace = Face.D;
                newRow = col;
                newCol = 0;
            }
        } else {
            newRow = row + 1;
        }
    } else if (delta === NavigationDelta.Left) {
        if (col === 0) {
            if (currentFace === Face.F) {
                newFace = Face.L;
                newRow = row;
                newCol = cubeSize - 1;
            } else if (currentFace === Face.L) {
                newFace = Face.B;
                newRow = row;
                newCol = cubeSize - 1;
            } else if (currentFace === Face.B) {
                newFace = Face.R;
                newRow = row;
                newCol = cubeSize - 1;
            } else if (currentFace === Face.R) {
                newFace = Face.F;
                newRow = row;
                newCol = cubeSize - 1;
            } else if (currentFace === Face.U) {
                newFace = Face.L;
                newRow = 0;
                newCol = cubeSize - 1 - row;
            } else if (currentFace === Face.D) {
                newFace = Face.L;
                newRow = cubeSize - 1;
                newCol = row;
            }
        } else {
            newCol = col - 1;
        }
    } else if (delta === NavigationDelta.Right) {
        if (col === cubeSize - 1) {
            if (currentFace === Face.F) {
                newFace = Face.R;
                newRow = row;
                newCol = 0;
            } else if (currentFace === Face.R) {
                newFace = Face.B;
                newRow = row;
                newCol = 0;
            } else if (currentFace === Face.B) {
                newFace = Face.L;
                newRow = row;
                newCol = 0;
            } else if (currentFace === Face.L) {
                newFace = Face.F;
                newRow = row;
                newCol = 0;
            } else if (currentFace === Face.U) {
                newFace = Face.R;
                newRow = 0;
                newCol = row;
            } else if (currentFace === Face.D) {
                newFace = Face.R;
                newRow = cubeSize - 1;
                newCol = cubeSize - 1 - row;
            }
        } else {
            newCol = col + 1;
        }
    }

    return { newFace, newPos: newRow * cubeSize + newCol };
}

/**
 * Rotate a navigation delta based on horizontal (Y-axis) rotation.
 * rotationSteps: 0=0°, 1=90°, 2=180°, 3=270°
 */
export function rotateDeltaClockwise(
    delta: NavigationDelta,
    rotationSteps: number
): NavigationDelta {
    const deltaMap = {
        [NavigationDelta.Right]: 0,
        [NavigationDelta.Down]: 1,
        [NavigationDelta.Left]: 2,
        [NavigationDelta.Up]: 3,
    } as const;
    const inverseMap: Record<number, NavigationDelta> = {
        0: NavigationDelta.Right,
        1: NavigationDelta.Down,
        2: NavigationDelta.Left,
        3: NavigationDelta.Up,
    };
    const currentIndex = deltaMap[delta];
    if (currentIndex === undefined) return delta;
    return inverseMap[mod(currentIndex + rotationSteps, 4)];
}

/**
 * Rotate a navigation delta based on vertical (X-axis) rotation.
 * Each rotation step = 45 degrees.
 */
export function rotateVerticalDelta(
    delta: NavigationDelta,
    rotationSteps: number
): NavigationDelta {
    const halfRotations = (rotationSteps % 8) / 4;
    if (halfRotations === 0) return delta;
    if (halfRotations === 1) {
        if (delta === NavigationDelta.Up) return NavigationDelta.Down;
        if (delta === NavigationDelta.Down) return NavigationDelta.Up;
    }
    return delta;
}

// ---------------------------------------------------------------------------
// Key mapping
// ---------------------------------------------------------------------------

/**
 * Returns true when the keyboard event is a bare arrow key (no modifiers).
 */
export function isNavigationKey(event: KeyboardEvent): boolean {
    return mapKeyToDelta(event) !== undefined;
}

function mapKeyToDelta(event: KeyboardEvent): NavigationDelta | undefined {
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return undefined;

    switch (event.key) {
        case 'ArrowUp':
            return NavigationDelta.Up;
        case 'ArrowDown':
            return NavigationDelta.Down;
        case 'ArrowLeft':
            return NavigationDelta.Left;
        case 'ArrowRight':
            return NavigationDelta.Right;
        default:
            return undefined;
    }
}

// ---------------------------------------------------------------------------
// Sticker navigation
// ---------------------------------------------------------------------------

/**
 * Moves the keyboard selection in the direction indicated by the arrow key.
 *
 * @param preview - When true, checks feasibility without emitting events.
 * @returns true if navigation succeeded (or would succeed in preview mode).
 */
export function navigate(
    event: KeyboardEvent,
    preview: boolean,
    state: BasicViewInternalData,
    onSelected?: (id: StickerId) => void
): boolean {
    const delta = mapKeyToDelta(event);
    if (!delta) return false;

    if (!state.currentSelected || !state.model) return false;

    const cubeState = state.model.getCurrentState();
    const currentSticker = CubeStateUtils.getStickerById(
        cubeState,
        state.currentSelected as StickerId
    );
    if (!currentSticker) return false;

    const cubie = CubeStateUtils.getCubieById(cubeState, currentSticker.cubieId) as ReadonlyCubie;
    if (!cubie) return false;

    const stickerFace = currentSticker.currentFace;
    const pos = currentSticker.facePosition;

    const { newFace, newPos } = getAdjacentPos(
        state.model,
        stickerFace,
        pos,
        delta,
        state.variant === 'back' ? Orientation.Back : Orientation.Front,
        state.yRotation,
        state.xRotation
    );

    let newSticker = undefined;

    if (newFace === stickerFace) {
        newSticker = CubeStateUtils.getStickerAt(cubeState, newFace, newPos);
    } else {
        for (const [stickerId] of cubie.stickers) {
            const candidateSticker = CubeStateUtils.getStickerById(cubeState, stickerId);
            if (candidateSticker && candidateSticker.currentFace === newFace) {
                newSticker = candidateSticker;
                break;
            }
        }
    }

    if (!newSticker) {
        newSticker = CubeStateUtils.getStickerAt(cubeState, newFace, newPos);
    }

    if (!newSticker) return false;
    if (newSticker.id === currentSticker.id) return false;

    // Handle over-the-horizon transitions that require a view rotation
    if (stickerFace === Face.U && delta === NavigationDelta.Up && newFace === Face.B) {
        state.yRotation -= 180;
    } else if (stickerFace === Face.D && delta === NavigationDelta.Down && newFace === Face.B) {
        state.yRotation += 180;
    }

    if (!preview) {
        onSelected?.(newSticker.id);
    }

    return true;
}

// ---------------------------------------------------------------------------
// View rotation helpers (pure state mutations — callers handle re-rendering)
// ---------------------------------------------------------------------------

function getTransformedUpVector(state: BasicViewInternalData): Vector3 {
    let vec: Vector3 = { x: 0, y: 1, z: 0 };

    const baseX = state.isPitched ? BASIC_VIEW_ANGLES.PITCHED_BASE_X : BASIC_VIEW_ANGLES.BASE_X;
    const baseY = state.isTilted ? BASIC_VIEW_ANGLES.TILTED_BASE_Y : BASIC_VIEW_ANGLES.BASE_Y;
    const baseZ = BASIC_VIEW_ANGLES.BASE_Z;

    vec = rotatePosition3D(vec, Axis.X, (Math.round(baseX / 90) * 90) as any);
    vec = rotatePosition3D(vec, Axis.Y, (Math.round(baseY / 90) * 90) as any);
    vec = rotatePosition3D(vec, Axis.Z, (Math.round(baseZ / 90) * 90) as any);

    const yRot = Math.round(state.yRotation / 90) * 90;
    const xRot = Math.round(state.xRotation / 90) * 90;
    const zRot = Math.round(state.zRotation / 90) * 90;

    if (xRot !== 0) vec = rotatePosition3D(vec, Axis.X, xRot as any);
    if (yRot !== 0) vec = rotatePosition3D(vec, Axis.Y, yRot as any);
    if (zRot !== 0) vec = rotatePosition3D(vec, Axis.Z, zRot as any);

    return vec;
}

function getTransformedRightVector(state: BasicViewInternalData): Vector3 {
    let vec: Vector3 = { x: 1, y: 0, z: 0 };

    const baseX = state.isPitched ? BASIC_VIEW_ANGLES.PITCHED_BASE_X : BASIC_VIEW_ANGLES.BASE_X;
    const baseY = state.isTilted ? BASIC_VIEW_ANGLES.TILTED_BASE_Y : BASIC_VIEW_ANGLES.BASE_Y;
    const baseZ = BASIC_VIEW_ANGLES.BASE_Z;

    vec = rotatePosition3D(vec, Axis.X, (Math.round(baseX / 90) * 90) as any);
    vec = rotatePosition3D(vec, Axis.Y, (Math.round(baseY / 90) * 90) as any);
    vec = rotatePosition3D(vec, Axis.Z, (Math.round(baseZ / 90) * 90) as any);

    const yRot = Math.round(state.yRotation / 90) * 90;
    const xRot = Math.round(state.xRotation / 90) * 90;
    const zRot = Math.round(state.zRotation / 90) * 90;

    if (xRot !== 0) vec = rotatePosition3D(vec, Axis.X, xRot as any);
    if (yRot !== 0) vec = rotatePosition3D(vec, Axis.Y, yRot as any);
    if (zRot !== 0) vec = rotatePosition3D(vec, Axis.Z, zRot as any);

    return vec;
}

function getLeftRightAxis(state: BasicViewInternalData): 'Y' | 'Z' {
    const normX = mod(state.xRotation, 360);
    const normY = mod(state.yRotation, 360);
    const isXTilted = Math.abs((normX % 180) - 90) < 1;
    const isYSideways = Math.abs((normY % 180) - 90) < 1;
    if (isXTilted && !isYSideways) return 'Z';
    return 'Y';
}

function getUpDownAxis(state: BasicViewInternalData): 'X' | 'Z' {
    const normX = mod(state.xRotation, 360);
    const normY = mod(state.yRotation, 360);
    const isYSideways = Math.abs((normY % 180) - 90) < 1;
    const isXTilted = Math.abs((normX % 180) - 90) < 1;
    if (isYSideways && !isXTilted) return 'Z';
    return 'X';
}

// ---------------------------------------------------------------------------
// View rotation actions — mutate state; caller is responsible for re-render
// ---------------------------------------------------------------------------

export function rotateViewLeft(state: BasicViewInternalData): void {
    const upVec = getTransformedUpVector(state);
    const targetTilt = upVec.y >= 0;

    if (state.isTilted !== targetTilt) {
        state.isTilted = targetTilt;
    } else {
        const axis = getLeftRightAxis(state);
        if (axis === 'Z') {
            state.zRotation += 90;
        } else {
            state.yRotation += 90;
        }
    }

    logState(state, 'left');
}

export function rotateViewRight(state: BasicViewInternalData): void {
    const upVec = getTransformedUpVector(state);
    const targetTilt = upVec.y < 0;

    if (state.isTilted !== targetTilt) {
        state.isTilted = targetTilt;
    } else {
        const axis = getLeftRightAxis(state);
        if (axis === 'Z') {
            state.zRotation -= 90;
        } else {
            state.yRotation -= 90;
        }
    }

    logState(state, 'right');
}

export function rotateViewUp(state: BasicViewInternalData): void {
    const rightVec = getTransformedRightVector(state);
    const targetPitch = rightVec.x >= 0;

    if (state.isPitched !== targetPitch) {
        state.isPitched = targetPitch;
    } else {
        const axis = getUpDownAxis(state);
        if (axis === 'Z') {
            state.zRotation -= 90;
        } else {
            state.xRotation += 90;
        }
    }

    logState(state, 'up');
}

export function rotateViewDown(state: BasicViewInternalData): void {
    const rightVec = getTransformedRightVector(state);
    const targetPitch = rightVec.x < 0;

    if (state.isPitched !== targetPitch) {
        state.isPitched = targetPitch;
    } else {
        const axis = getUpDownAxis(state);
        if (axis === 'Z') {
            state.zRotation += 90;
        } else {
            state.xRotation -= 90;
        }
    }

    logState(state, 'down');
}

/**
 * Resets all view rotations to the default orientation.  Also resets tilt and
 * pitch flags.  Uses findClosestEquivalentAngle to avoid violent animation
 * spins when angles have accumulated to large values.
 */
export function resetView(state: BasicViewInternalData): void {
    const targetY = state.variant === 'back' ? 180 : 0;

    state.xRotation = findClosestEquivalentAngle(state.xRotation, 0);
    state.yRotation = findClosestEquivalentAngle(state.yRotation, targetY);
    state.zRotation = findClosestEquivalentAngle(state.zRotation, 0);
    state.isTilted = false;
    state.isPitched = false;

    logState(state, 'reset');
}

/**
 * Emits whole-cube rotation moves to align the model to the current view
 * orientation, then resets the view rotations to zero.
 */
export function alignCubeToView(state: BasicViewInternalData): void {
    const stepsX = Math.round(state.xRotation / 90);
    const stepsY = Math.round(state.yRotation / 90);
    const stepsZ = Math.round(state.zRotation / 90);

    const xMove = stepsX > 0 ? 'x' : "x'";
    for (let i = 0; i < Math.abs(stepsX); i++) {
        Application.eventBus.emit(EventName.MOVE_REQUESTED, {
            moveNotation: xMove,
            viewId: state.viewType,
            tentative: false,
        });
    }

    const yMove = stepsY > 0 ? "y'" : 'y';
    for (let i = 0; i < Math.abs(stepsY); i++) {
        Application.eventBus.emit(EventName.MOVE_REQUESTED, {
            moveNotation: yMove,
            viewId: state.viewType,
            tentative: false,
        });
    }

    const zMove = stepsZ > 0 ? 'z' : "z'";
    for (let i = 0; i < Math.abs(stepsZ); i++) {
        Application.eventBus.emit(EventName.MOVE_REQUESTED, {
            moveNotation: zMove,
            viewId: state.viewType,
            tentative: false,
        });
    }

    state.xRotation = 0;
    state.yRotation = 0;
    state.zRotation = 0;

    logState(state, 'alignCubeToView');
}

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

function logState(state: BasicViewInternalData, action?: string): void {
    const scope = logger.groupScoped('BasicCubeNavigation View Orientation', LogLevel.DEBUG);
    if (!scope) return;

    try {
        scope.debug(`After action: ${action}`);
        scope.debug(`Rotations X,Y,Z: ${state.xRotation}, ${state.yRotation}, ${state.zRotation}`);
        scope.debug(`isTilted: ${state.isTilted}, isPitched: ${state.isPitched}`);
        const upVec = getTransformedUpVector(state);
        scope.debug(`Transformed Up Vector: x=${upVec.x}, y=${upVec.y}, z=${upVec.z}`);
        const rightVec = getTransformedRightVector(state);
        scope.debug(`Transformed Right Vector: x=${rightVec.x}, y=${rightVec.y}, z=${rightVec.z}`);
    } finally {
        scope.groupEnd();
    }
}
