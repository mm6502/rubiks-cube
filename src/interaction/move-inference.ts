import { Axis, Face, Position3D, QuarterTurn, Vector3 } from '@/cube/types';
import { rotatePosition3D, toCentered } from '@/cube/utils/math';
import { facePositionTo3D } from '@/cube/utils/sticker-position';

import { DragDirection, MoveInferenceInput } from './types';

const FACE_BASIS: Record<Face, { normal: Vector3; up: Vector3; right: Vector3 }> = {
    [Face.F]: {
        normal: { x: 0, y: 0, z: -1 },
        up: { x: 0, y: 1, z: 0 },
        right: { x: 1, y: 0, z: 0 },
    },
    [Face.B]: {
        normal: { x: 0, y: 0, z: 1 },
        up: { x: 0, y: 1, z: 0 },
        right: { x: -1, y: 0, z: 0 },
    },
    [Face.U]: {
        normal: { x: 0, y: 1, z: 0 },
        up: { x: 0, y: 0, z: 1 },
        right: { x: 1, y: 0, z: 0 },
    },
    [Face.D]: {
        normal: { x: 0, y: -1, z: 0 },
        up: { x: 0, y: 0, z: -1 },
        right: { x: 1, y: 0, z: 0 },
    },
    [Face.L]: {
        normal: { x: -1, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        right: { x: 0, y: 0, z: -1 },
    },
    [Face.R]: {
        normal: { x: 1, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        right: { x: 0, y: 0, z: 1 },
    },
};

/** Threshold distance in pixels for inferring a 180° move from a drag gesture. */
const DEFAULT_FAR_DRAG_THRESHOLD_PX = 50;

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
    const axisVector = cross(basis.normal, dragVector);
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
            return negate(basis.up);
        case DragDirection.RIGHT:
            return basis.right;
        case DragDirection.LEFT:
            return negate(basis.right);
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
    if (isFar) {
        // For far drags, always return 180 degrees (direction doesn't matter for 180)
        return 180;
    }

    const plus = rotatePosition3D(position, axis, 90);
    const minus = rotatePosition3D(position, axis, -90);

    const plusDisplacement = subtract(plus, position);
    const minusDisplacement = subtract(minus, position);

    const plusScore = dot(plusDisplacement, dragVector);
    const minusScore = dot(minusDisplacement, dragVector);

    return plusScore >= minusScore ? 90 : -90;
}

function buildMoveNotation(
    axis: Axis,
    layerIndex: number,
    angle: QuarterTurn,
    cubeSize: number
): string {
    const moveBase = axisLayerToMoveBase(axis, layerIndex, cubeSize);

    if (angle === 180) {
        return `${moveBase}2`;
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

function getDefaultAngle(moveBase: string): 90 | -90 {
    if (moveBase === Face.R || moveBase === Face.U || moveBase === Face.B) {
        return 90;
    }
    if (moveBase === Face.L || moveBase === Face.D || moveBase === Face.F) {
        return -90;
    }

    // Slice directions follow L/D/F semantics per move-notation conventions:
    // M follows L (-90), E follows D (-90), S follows F (-90).
    return -90;
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

function cross(a: Vector3, b: Vector3): Vector3 {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}

function dot(a: Vector3, b: Vector3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function subtract(a: Vector3, b: Vector3): Vector3 {
    return {
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z,
    };
}

function negate(vector: Vector3): Vector3 {
    return {
        x: -vector.x,
        y: -vector.y,
        z: -vector.z,
    };
}
