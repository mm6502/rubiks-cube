import { Axis, Face, Vector2 } from '@/cube/types';

/**
 * SVG axis intersection coordinates for each sticker.
 * Circle layer numbers ARE the cube coordinates.
 * One axis will be null - we fill it in based on which face the sticker should map to.
 *
 * Strategy: Use the non-null coordinates to determine cube position,
 * then the null axis tells us which face this sticker belongs to:
 * - X=null → face is either L (x=0) or R (x=2)
 * - Y=null → face is either D (y=0) or U (y=2)
 * - Z=null → face is either F (z=0) or B (z=2)
 */
export type SVGAxisCoords = Record<Axis, number | null>;

/**
 * Axis circle metadata parsed from SVG
 */
export type AxisCircle = {
    id: string;
    axis: Axis;
    layer: number;
    cx: number;
    cy: number;
    r: number;
};

/**
 * Get center coordinates of an SVG element
 */
export function getCenterOfElement(svgElement: SVGElement): Vector2 {
    const cx = parseFloat(svgElement.getAttribute('cx') || '0');
    const cy = parseFloat(svgElement.getAttribute('cy') || '0');
    return { x: cx, y: cy };
}

/**
 * Check if a point lies on a circle within tolerance
 */
export function isPointOnCircle(position: Vector2, circle: AxisCircle, tolerance = 2): boolean {
    const dist = Math.sqrt((position.x - circle.cx) ** 2 + (position.y - circle.cy) ** 2);
    return Math.abs(dist - circle.r) <= tolerance;
}

/**
 * Find which layer of circle a point lies on for any axis
 * Returns the layer number or null if none found
 */
export function getAxisCirclesAtPoint(
    position: Vector2,
    axisCircles: AxisCircle[]
): AxisCircle[] | null {
    let foundCircles: AxisCircle[] = [];

    for (const circle of axisCircles) {
        if (isPointOnCircle(position, circle)) {
            foundCircles.push(circle);
        }
    }

    return foundCircles;
}

/**
 * Get axis circles for a given SVG element
 */
export function getAxisCirclesForElement(svgElement: SVGElement, axisCircles: AxisCircle[]) {
    const position = getCenterOfElement(svgElement);
    return getAxisCirclesAtPoint(position, axisCircles);
}

/**
 * Get all stickers on a specific face
 */
export function getStickersForFace(svgRoot: SVGSVGElement, face: Face): SVGCircleElement[] {
    return Array.from(
        svgRoot.querySelectorAll<SVGCircleElement>(`circle.sticker[data-face="${face}"]`)
    );
}
