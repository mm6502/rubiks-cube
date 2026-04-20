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

/**
 * Convert a point from client (screen) coordinates to SVG user-space coordinates.
 *
 * Uses the SVG element's current transformation matrix (CTM) to map the
 * client-space position into the coordinate system used by SVG child elements.
 * Falls back to returning the raw client coordinates when `createSVGPoint` or
 * the inverse CTM is unavailable (e.g. detached SVG elements).
 */
export function clientToSvgPoint(
    svgRoot: SVGSVGElement,
    clientX: number,
    clientY: number
): Vector2 {
    if (!svgRoot.createSVGPoint) {
        return { x: clientX, y: clientY };
    }

    const point = svgRoot.createSVGPoint();
    point.x = clientX;
    point.y = clientY;

    const inverse = svgRoot.getScreenCTM()?.inverse();
    if (!inverse) {
        return { x: clientX, y: clientY };
    }

    const transformed = point.matrixTransform(inverse);
    return { x: transformed.x, y: transformed.y };
}

/**
 * Convert a point from SVG user-space coordinates to client (screen) coordinates.
 *
 * Uses the SVG element's current transformation matrix (CTM) to map an SVG-space
 * position into the client coordinate system used by pointer events and layout.
 * Falls back to `fallback` when `createSVGPoint` or the CTM is unavailable.
 */
export function svgToClientPoint(
    svgRoot: SVGSVGElement,
    svgX: number,
    svgY: number,
    fallback: Vector2
): Vector2 {
    if (!svgRoot.createSVGPoint) {
        return fallback;
    }

    const point = svgRoot.createSVGPoint();
    point.x = svgX;
    point.y = svgY;

    const ctm = svgRoot.getScreenCTM();
    if (!ctm) {
        return fallback;
    }

    const transformed = point.matrixTransform(ctm);
    return { x: transformed.x, y: transformed.y };
}
