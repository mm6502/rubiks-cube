// constants.ts
// Global constants for Basic view transformations

/**
 * Base viewing angles for Basic cube view.
 * These angles define the comfortable 3D perspective for viewing the cube.
 * They remain constant while manual rotations (Ctrl+Arrow) rotate the cube
 * in its own coordinate space.
 */
export const BASIC_VIEW_ANGLES = {
    /** Base X-axis rotation for normal view */
    BASE_X: -25,

    /** Base X-axis rotation for pitched view */
    PITCHED_BASE_X: 25,

    /** Base Y-axis rotation for normal view */
    BASE_Y: -35,

    /** Base Y-axis rotation for tilted view */
    TILTED_BASE_Y: 35,

    /** Base Z-axis rotation */
    BASE_Z: 0,
} as const;

/**
 * Scale factors for computing cube face size from available container space.
 * A smaller scale leaves more room around the cube for background drag interactions.
 */
export const BASIC_VIEW_SCALE = {
    /** Scale used in Tabbed layout mode — more breathing room for drag. */
    TABBED: 0.5,
    /** Scale used in all other layout modes (leaves room for ghost stickers). */
    DEFAULT: 0.55,
    /** CSS transform scale applied on mouse hover (desktop/floating only). */
    HOVER: 1.05,
} as const;
