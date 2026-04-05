/**
 * Simple 3D vector representation used for positions and normals.
 */
export type Vector3 = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
};

/**
 * Simple 3D vector representation used for positions and normals.
 */
export type Position3D = Vector3;

/**
 * Simple 2D vector representation used for positions and normals.
 */
export type Vector2 = {
    readonly x: number;
    readonly y: number;
};

/**
 * Basic 2D point representation in client/screen coordinates.
 */
export type Point2D = Vector2;

/**
 * Simple 2D vector representation used for positions and normals.
 */
export type Position2D = Vector2;

/**
 * Simple 2D size representation.
 */
export type Size2D = {
    readonly width: number;
    readonly height: number;
};
