/** Face identifiers for the six sides of the cube */
export const Face = {
    U: 'U', // Up
    D: 'D', // Down
    F: 'F', // Front
    B: 'B', // Back
    L: 'L', // Left
    R: 'R', // Right
} as const;

export type Face = (typeof Face)[keyof typeof Face];

/** Coordinate axes in 3D space */
export const Axis = {
    X: 'X',
    Y: 'Y',
    Z: 'Z',
} as const;

export type Axis = (typeof Axis)[keyof typeof Axis];

/**
 * Quarter turn angles in degrees.
 */
export type QuarterTurn = 90 | -90 | 180 | 270;

/** Standard Rubik's cube colors */
export const Color = {
    WHITE: 'white',
    YELLOW: 'yellow',
    RED: 'red',
    ORANGE: 'orange',
    BLUE: 'blue',
    GREEN: 'green',
} as const;

export type Color = (typeof Color)[keyof typeof Color];

/** Hex color codes corresponding to cube colors */
export const ColorMap: Record<Color, string> = {
    [Color.WHITE]: '#ffffff',
    [Color.YELLOW]: '#ffd500',
    [Color.RED]: '#c41e3a',
    [Color.ORANGE]: '#ff5800',
    [Color.BLUE]: '#0051ba',
    [Color.GREEN]: '#009b48',
} as const;

/**
 * Resolve a cube color token to a CSS color string.
 *
 * Supports canonical values from `Color`, legacy uppercase variants
 * persisted by older app versions, and raw CSS color strings.
 */
export function resolveCubeColor(color: string | undefined): string {
    if (!color) {
        return ColorMap[Color.WHITE];
    }

    const normalized = color.trim().toLowerCase();
    if (!normalized) {
        return ColorMap[Color.WHITE];
    }

    const mapped = ColorMap[normalized as Color];
    if (mapped) {
        return mapped;
    }

    // Keep raw CSS color strings (hex/rgb/hsl/color keywords) functional.
    return normalized;
}

/**
 * Standard face colors for a solved cube, colors are aliases to the ColorMap.
 */
export const FACE_COLORS: Record<Face, Color> = {
    [Face.U]: Color.WHITE,
    [Face.D]: Color.YELLOW,
    [Face.F]: Color.RED,
    [Face.B]: Color.ORANGE,
    [Face.L]: Color.GREEN,
    [Face.R]: Color.BLUE,
};
