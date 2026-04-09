import { Axis, Position3D, QuarterTurn, Vector2, Vector3 } from '@/cube/types';

/**
 * Numerical epsilon used for approximate equality checks to be tolerant of
 * floating point noise when mapping centered coordinates to integer indexes.
 */
const EPSILON = 1e-6;

/**
 * Check if two numbers are approximately equal within a small epsilon
 * @param a First number
 * @param b Second number
 * @param epsilon Tolerance for equality
 * @returns True if numbers are approximately equal
 */
export function approximatelyEqual(a: number, b: number, epsilon = EPSILON): boolean {
    return Math.abs(a - b) <= epsilon;
}

/**
 * Return true when a value is (approximately) at the extreme coordinate
 * representing a face (e.g., centered coordinate magnitude equals maxCoord).
 */
export function isExtreme(value: number, maxCoord: number, epsilon = EPSILON): boolean {
    return approximatelyEqual(Math.abs(value), maxCoord, epsilon);
}

/**
 * Normalize a coordinate so values whose absolute magnitude is below the
 * epsilon are treated as exact zero to avoid floating point artifacts.
 */
export function normalizeComponent(value: number): number {
    return Math.abs(value) < EPSILON ? 0 : value;
}

/**
 * Round to nearest integer when within epsilon of an integer; otherwise
 * return the original value (useful when converting centered floats back to
 * integer coordinates while tolerating tiny numerical errors).
 */
export function roundToNearest(value: number, epsilon = EPSILON): number {
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) <= epsilon) {
        return rounded;
    }
    return value;
}

/**
 * Rotate a Position3D (Cube integer coordinates) around the principal axis
 * by a quarter-turn (90/180/270).
 * Angle is interpreted modulo 360 and must be a QuarterTurn value.
 */
export function rotatePosition3D(vector: Position3D, axis: Axis, angle: QuarterTurn): Vector3 {
    const normalizedAngle = mod(angle, 360) as QuarterTurn;
    switch (axis) {
        case Axis.X:
            return rotatePosition3DAroundX(vector, normalizedAngle);
        case Axis.Y:
            return rotatePosition3DAroundY(vector, normalizedAngle);
        case Axis.Z:
            return rotatePosition3DAroundZ(vector, normalizedAngle);
        default:
            throw new Error(`Unsupported axis: ${axis}`);
    }
}

/**
 * Rotate a Position3D around the X axis by a quarter-turn angle.
 */
function rotatePosition3DAroundX(vector: Position3D, angle: QuarterTurn): Vector3 {
    const { x, y, z } = vector;
    if (angle === 90) {
        return { x, y: -z, z: y };
    }
    if (angle === 180) {
        return { x, y: -y, z: -z };
    }
    if (angle === 270 || angle === -90) {
        return { x, y: z, z: -y };
    }
    return { x, y, z };
}

/**
 * Rotate a Position3D around the Y axis by a quarter-turn angle.
 */
function rotatePosition3DAroundY(vector: Position3D, angle: QuarterTurn): Vector3 {
    const { x, y, z } = vector;
    if (angle === 90) {
        return { x: z, y, z: -x };
    }
    if (angle === 180) {
        return { x: -x, y, z: -z };
    }
    if (angle === 270 || angle === -90) {
        return { x: -z, y, z: x };
    }
    return { x, y, z };
}

/**
 * Rotate a Position3D around the Z axis by a quarter-turn angle.
 */
function rotatePosition3DAroundZ(vector: Position3D, angle: QuarterTurn): Vector3 {
    const { x, y, z } = vector;
    if (angle === 90) {
        return { x: -y, y: x, z };
    }
    if (angle === 180) {
        return { x: -x, y: -y, z };
    }
    if (angle === 270 || angle === -90) {
        return { x: y, y: -x, z };
    }
    return { x, y, z };
}

/**
 * Get the component of a vector along the specified axis.
 * @internal
 */
export function getAxisComponent(vector: Vector3, axis: Axis): number {
    switch (axis) {
        case Axis.X:
            return vector.x;
        case Axis.Y:
            return vector.y;
        case Axis.Z:
            return vector.z;
        default:
            throw new Error(`Unsupported axis: ${axis}`);
    }
}

/**
 * Convert integer cube-space position to centered coordinates with origin at
 * the geometric cube center.
 */
export function toCentered(position: Position3D, cubeSize: number): Vector3 {
    const center = (cubeSize - 1) / 2;
    return {
        x: position.x - center,
        y: position.y - center,
        z: position.z - center,
    } satisfies Vector3;
}

/**
 * Convert centered coordinates back to integer cube-space coordinates. This
 * uses rounding that tolerates small floating point errors near integers.
 */
export function toActual(centered: Vector3, cubeSize: number): Position3D {
    const center = (cubeSize - 1) / 2;
    return {
        x: roundToNearest(centered.x + center),
        y: roundToNearest(centered.y + center),
        z: roundToNearest(centered.z + center),
    } satisfies Position3D;
}

/**
 * Compare two vectors component-wise using approximately-equal semantics.
 */
export function vectorsEqual3(a: Vector3, b: Vector3): boolean {
    return (
        approximatelyEqual(a.x, b.x) && approximatelyEqual(a.y, b.y) && approximatelyEqual(a.z, b.z)
    );
}

/**
 * Safe modulus that always returns a non-negative remainder for orientation
 * arithmetic.
 */
export function mod(value: number, base: number): number {
    return ((value % base) + base) % base;
}

/**
 * Compare two numeric values and return -1, 0, or 1 for sorting purposes.
 */
export function compareValues(a: number, b: number): number {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
}

/**
 * Calculate the Euclidean distance between two 3D vectors.
 * @param a First vector
 * @param b Second vector
 * @returns Distance between vectors.
 */
export function distance3(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate the Euclidean distance between two 2D vectors.
 * @param a First vector
 * @param b Second vector
 * @returns Distance between vectors.
 */
export function distance2(a: Vector2, b: Vector2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Dot product of two 2D vectors.
 */
export function dot2(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y;
}

/**
 * Negates all components of a 2D vector.
 */
export function negate2(v: Vector2): Vector2 {
    return { x: -v.x, y: -v.y };
}

/**
 * Normalize a 2D vector to unit length.
 * Returns undefined when the vector length is below a tiny threshold.
 */
export function normalize2(v: Vector2): Vector2 | undefined {
    const length = Math.hypot(v.x, v.y);
    if (length < 1e-5) return undefined;
    return { x: v.x / length, y: v.y / length };
}

/**
 * Clamp a numeric value between a minimum and maximum.
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Finds the equivalent angle of the target that is closest to the current angle.
 * Handles angle equivalence (360° = 0°) and prevents long-term accumulation by
 * considering normalized versions. Works for any rotation value without limits.
 * @param current The current rotation angle in degrees
 * @param target The target rotation angle in degrees
 * @returns The equivalent angle closest to current
 */
/**
 * Dot product of two 3D vectors.
 */
export function dot3(a: Vector3, b: Vector3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Cross product of two 3D vectors.
 */
export function cross3(a: Vector3, b: Vector3): Vector3 {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}

/**
 * Component-wise subtraction of two 3D vectors.
 */
export function subtract3(a: Vector3, b: Vector3): Vector3 {
    return {
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z,
    };
}

/**
 * Negates all components of a 3D vector.
 *
 * Uses `|| 0` to collapse -0 to +0 and keep later comparisons stable.
 */
export function negate3(vector: Vector3): Vector3 {
    return {
        x: -vector.x || 0,
        y: -vector.y || 0,
        z: -vector.z || 0,
    };
}

export function findClosestEquivalentAngle(current: number, target: number): number {
    // Mathematically find the closest equivalent of target to current
    // This works for any rotation value without needing arbitrary limits

    // Find how many full rotations separate current from target
    const rotations = Math.round((current - target) / 360);
    const closest = target + rotations * 360;

    // Also consider the normalized version to prevent long-term accumulation
    const normalized = (((closest % 360) + 540) % 360) - 180;

    // Pick whichever is actually closer to current
    const closestDiff = Math.abs(current - closest);
    const normalizedDiff = Math.abs(current - normalized);

    if (normalizedDiff < closestDiff) {
        return normalized;
    } else if (normalizedDiff === closestDiff) {
        // Tiebreaker: prefer the more normalized value
        return Math.abs(normalized) < Math.abs(closest) ? normalized : closest;
    }

    return closest;
}
