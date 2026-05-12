import { Axis, Face, Position3D, QuarterTurn, Vector3 } from '@/cube/types';
import { FACE_BASIS } from '@/cube/utils/face-utils';
import { cross3, dot3, negate3, rotatePosition3D, subtract3, toCentered } from '@/cube/utils/math';
import { facePositionTo3D } from '@/cube/utils/sticker-position';

import { DragDirection, MoveInferenceInput } from './types';

/** Threshold distance in pixels for inferring a 180° move from a drag gesture. */
const DEFAULT_FAR_DRAG_THRESHOLD_PX = 60;

export type WholeCubeNotationPolicy = (deltaX: number, deltaY: number) => string | undefined;

/**
 * Infer a layer move from drag direction and sticker location.
 */
export function inferMoveFromDrag(input: MoveInferenceInput): string {
    const { face, row, col, direction, cubeSize, distancePx = 0 } = input;

    validateInput(face, row, col, cubeSize);

    const facePosition = row * cubeSize + col;
    const stickerPosition = facePositionTo3D(facePosition, face, cubeSize);
    const basis = FACE_BASIS[face];

    const dragVector = directionToVector(direction, basis);
    const axisVector = cross3(basis.normal, dragVector);
    const axis = axisFromVector(axisVector);
    const layerIndex = getLayerIndex(stickerPosition, axis);

    const centered = toCentered(stickerPosition, cubeSize);
    const desiredAngle = inferQuarterTurnAngle(
        centered,
        axis,
        dragVector,
        distancePx >= (input.farDragThresholdPx ?? DEFAULT_FAR_DRAG_THRESHOLD_PX)
    );
    return buildMoveNotation(axis, layerIndex, desiredAngle, cubeSize);
}

/**
 * Infer a selected-face rotation move.
 */
export function inferMoveFromFaceRotation(face: Face, isClockwise: boolean): string {
    return isClockwise ? face : `${face}'`;
}

/**
 * Convert a 90° move notation to the directional 180° equivalent,
 * preserving CW/CCW direction. E.g. "R" → "R2", "R'" → "R2'".
 */
export function toFar(notation: string): string {
    return notation.endsWith("'") ? notation.slice(0, -1) + "2'" : notation + '2';
}

/**
 * Map axis+layer into base notation (without prime modifier).
 */
export function axisLayerToMoveBase(axis: Axis, layerIndex: number, cubeSize: number): string {
    const last = cubeSize - 1;

    if (axis === Axis.X) {
        if (layerIndex === 0) return Face.L;
        if (layerIndex === last) return Face.R;
        if (cubeSize === 3 && layerIndex === 1) return 'M';
        return `${layerIndex + 1}M`;
    }

    if (axis === Axis.Y) {
        if (layerIndex === 0) return Face.D;
        if (layerIndex === last) return Face.U;
        if (cubeSize === 3 && layerIndex === 1) return 'E';
        return `${layerIndex + 1}E`;
    }

    if (layerIndex === 0) return Face.F;
    if (layerIndex === last) return Face.B;
    if (cubeSize === 3 && layerIndex === 1) return 'S';
    return `${layerIndex + 1}S`;
}

/**
 * Build notation from axis/layer and explicit clockwise/counter-clockwise choice.
 */
export function axisLayerToNotation(
    axis: Axis,
    layerIndex: number,
    isClockwise: boolean,
    cubeSize: number
): string {
    const base = axisLayerToMoveBase(axis, layerIndex, cubeSize);
    return isClockwise ? base : `${base}'`;
}

/**
 * Default whole-cube move policy for drag gestures.
 */
export function defaultWholeCubeNotationPolicy(deltaX: number, deltaY: number): string {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > 0 && Math.abs(absX - absY) / distance < 0.25) {
        return deltaX * deltaY < 0 ? 'z' : "z'";
    }

    if (absX >= absY) {
        return deltaX >= 0 ? 'y' : "y'";
    }

    return deltaY >= 0 ? "x'" : 'x';
}

/**
 * Infer whole-cube notation using a pluggable policy hook.
 */
export function inferWholeCubeMove(
    deltaX: number,
    deltaY: number,
    policy: WholeCubeNotationPolicy = defaultWholeCubeNotationPolicy
): string | undefined {
    return policy(deltaX, deltaY);
}

function validateInput(face: Face, row: number, col: number, cubeSize: number): void {
    if (!Object.values(Face).includes(face)) {
        throw new Error(`Unsupported face: ${String(face)}`);
    }
    if (!Number.isInteger(cubeSize) || cubeSize < 2) {
        throw new Error(`Invalid cube size: ${cubeSize}`);
    }
    if (!Number.isInteger(row) || row < 0 || row >= cubeSize) {
        throw new Error(`Invalid row index: ${row}`);
    }
    if (!Number.isInteger(col) || col < 0 || col >= cubeSize) {
        throw new Error(`Invalid column index: ${col}`);
    }
}

function directionToVector(
    direction: DragDirection,
    basis: { up: Vector3; right: Vector3 }
): Vector3 {
    switch (direction) {
        case DragDirection.UP:
            return basis.up;
        case DragDirection.DOWN:
            return negate3(basis.up);
        case DragDirection.RIGHT:
            return basis.right;
        case DragDirection.LEFT:
            return negate3(basis.right);
        default:
            throw new Error(`Unsupported drag direction: ${String(direction)}`);
    }
}

function inferQuarterTurnAngle(
    position: Vector3,
    axis: Axis,
    dragVector: Vector3,
    isFar: boolean
): QuarterTurn {
    const plus = rotatePosition3D(position, axis, QuarterTurn.QUARTER);
    const minus = rotatePosition3D(position, axis, QuarterTurn.QUARTER_NEG);

    const plusDisplacement = subtract3(plus, position);
    const minusDisplacement = subtract3(minus, position);

    const plusScore = dot3(plusDisplacement, dragVector);
    const minusScore = dot3(minusDisplacement, dragVector);

    if (isFar) {
        return plusScore >= minusScore ? QuarterTurn.HALF : QuarterTurn.HALF_NEG;
    }

    return plusScore >= minusScore ? QuarterTurn.QUARTER : QuarterTurn.QUARTER_NEG;
}

function buildMoveNotation(
    axis: Axis,
    layerIndex: number,
    angle: QuarterTurn,
    cubeSize: number
): string {
    const moveBase = axisLayerToMoveBase(axis, layerIndex, cubeSize);

    if (angle === QuarterTurn.HALF || angle === QuarterTurn.HALF_NEG) {
        // Determine whether this physical rotation is in the "natural" (non-prime)
        // direction of the move. For QUARTER-positive bases (U, R, B), +180 is the
        // natural double; for QUARTER-negative bases (D, L, F, M, E, S), -180 is.
        const defaultAngle = getDefaultAngle(moveBase);
        const isNaturalDirection = angle > 0 === defaultAngle > 0;
        return isNaturalDirection ? `${moveBase}2` : `${moveBase}2'`;
    }

    const defaultAngle = getDefaultAngle(moveBase);

    if (angle === defaultAngle) {
        return moveBase;
    }
    if (angle === -defaultAngle) {
        return `${moveBase}'`;
    }

    throw new Error(`Unsupported quarter-turn angle ${angle} for move base ${moveBase}`);
}

function getDefaultAngle(moveBase: string): QuarterTurn {
    if (moveBase === Face.R || moveBase === Face.U || moveBase === Face.B) {
        return QuarterTurn.QUARTER;
    }
    if (moveBase === Face.L || moveBase === Face.D || moveBase === Face.F) {
        return QuarterTurn.QUARTER_NEG;
    }

    // Slice directions follow L/D/F semantics per move-notation conventions:
    // M follows L (-90), E follows D (-90), S follows F (-90).
    return QuarterTurn.QUARTER_NEG;
}

function getLayerIndex(position: Position3D, axis: Axis): number {
    if (axis === Axis.X) return position.x;
    if (axis === Axis.Y) return position.y;
    return position.z;
}

function axisFromVector(vector: Vector3): Axis {
    if (vector.x !== 0) return Axis.X;
    if (vector.y !== 0) return Axis.Y;
    if (vector.z !== 0) return Axis.Z;
    throw new Error('Could not determine rotation axis from drag vector');
}
