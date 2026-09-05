import { Branded } from '@/global';

/**
 * A sticker navigation direction (arrow key → direction).
 * Nominally distinct from ViewRotation via branding.
 */
export const NavDirection = {
    Up: 'up' as NavDirection,
    Down: 'down' as NavDirection,
    Left: 'left' as NavDirection,
    Right: 'right' as NavDirection,
} as const;
export type NavDirection = Branded<string, 'NavDirection'>;

/**
 * A view rotation direction.
 * Nominally distinct from NavDirection via branding.
 */
export const ViewRotation = {
    Up: 'up' as ViewRotation,
    Down: 'down' as ViewRotation,
    Left: 'left' as ViewRotation,
    Right: 'right' as ViewRotation,
} as const;
export type ViewRotation = Branded<string, 'ViewRotation'>;

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
