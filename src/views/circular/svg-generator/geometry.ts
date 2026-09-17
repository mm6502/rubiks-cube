import { Axis, Face } from '@/cube/types';
import { facePositionTo3D } from '@/cube/utils/sticker-position';

/**
 * Geometry for the Circular view SVG.
 *
 * Every rule here was derived from the committed 3x3 reference asset and
 * verified against it (54 sticker positions, 9 ring radii, 6 face ellipses,
 * 9 notation labels). See `scripts/circular-svg/README.md` for the derivation
 * notes and the parameter table.
 */

/** The five scalars from the geometry spec, plus derived layout constants. */
export interface CircularSvgParameters {
    /** Distance between any two axis centres. */
    triangleSide: number;
    /** Radius of the innermost ring (layer 0). */
    innerRadius: number;
    /** Radius increment between consecutive rings. */
    ringStep: number;
    /** Visual radius of a sticker circle. */
    stickerRadius: number;
    /** ViewBox attribute value. */
    viewBox: string;
    /** X coordinate of the triangle's base midpoint. */
    centreX: number;
    /** Y coordinate of the base line on which the Z and X centres sit. */
    centreY: number;
    /**
     * Height of the triangle apex above the baseline.
     *
     * The equilateral value is `triangleSide * sqrt(3) / 2`, but the reference
     * asset hand-rounds it (87 rather than 86.6025 for a side of 100). Carrying
     * it as a parameter lets a generated asset reproduce the committed one
     * exactly, and leaves the apex available for the same kind of visual tuning
     * as the other geometry values.
     */
    apexHeight: number;
    /**
     * Outward offset of the face-ellipse centre from the sticker-grid centroid,
     * as a fraction of the sticker-grid span. Two values because the layout is
     * not symmetric: the three faces nearest their third axis centre carry a
     * larger offset than the three opposite ones. Derived from the reference
     * asset; tuned per size if a size needs it.
     */
    ellipseOffsetNear: number;
    ellipseOffsetFar: number;
    /**
     * Face-ellipse margin, as a multiple of the sticker radius, added to each
     * semi-axis beyond the sticker grid it encloses.
     *
     * The reference asset hardcodes 46x40 for 3x3, which happens to clear its
     * grid. Larger sizes need the ellipse to grow with the grid, so the
     * semi-axes are derived from the grid span plus this margin — 3x3 comes out
     * at the reference's 46x40 without hardcoding it.
     */
    ellipseMargin: number;
    /**
     * Ratio of the minor to major semi-axis.
     *
     * The reference's 40/46 — the ellipse is slightly flattened along the face's
     * radial direction.
     */
    ellipseAspect: number;
    /** Label box dimensions. */
    labelWidth: number;
    labelHeight: number;
    /**
     * Clearance between a face label's box and its face ellipse.
     *
     * The reference asset's labels touch their ellipse (measured gap 0.00 at
     * 3x3), so this is a hairline clearance covering the ellipse's own 1.5-wide
     * stroke rather than a visual gap.
     */
    faceLabelGap: number;
}

/** Ring axes for each face: the two axes whose rings intersect at its stickers. */
export const FACE_RING_AXES: Record<Face, [Axis, Axis]> = {
    [Face.F]: [Axis.X, Axis.Y],
    [Face.B]: [Axis.X, Axis.Y],
    [Face.L]: [Axis.Y, Axis.Z],
    [Face.R]: [Axis.Y, Axis.Z],
    [Face.U]: [Axis.X, Axis.Z],
    [Face.D]: [Axis.X, Axis.Z],
};

/** The axis a face sits on (the one whose rings it does NOT lie on). */
export const FACE_AXIS: Record<Face, Axis> = {
    [Face.F]: Axis.Z,
    [Face.B]: Axis.Z,
    [Face.L]: Axis.X,
    [Face.R]: Axis.X,
    [Face.U]: Axis.Y,
    [Face.D]: Axis.Y,
};

/**
 * Whether the face's region lies on the near side of its third axis centre.
 *
 * A ring pair has two intersection points; the correct one for a face is the
 * point nearest that face's own third-axis centre for the three "near" faces,
 * and the farther one for the opposite three. The polarity is fixed by the
 * triangle layout and was verified against all 54 reference stickers.
 */
export const FACE_IS_NEAR_THIRD: Record<Face, boolean> = {
    [Face.F]: true,
    [Face.B]: false,
    [Face.R]: true,
    [Face.L]: false,
    [Face.U]: true,
    [Face.D]: false,
};

export const ALL_FACES: Face[] = [Face.U, Face.D, Face.L, Face.R, Face.F, Face.B];

export interface Point2D {
    x: number;
    y: number;
}

/**
 * Axis centre coordinates. The three centres form an equilateral triangle with
 * Z and X on a horizontal baseline and Y at the apex.
 */
export function axisCentres(params: CircularSvgParameters): Record<Axis, Point2D> {
    const { triangleSide: d, centreX: cx, centreY: cy, apexHeight } = params;
    return {
        [Axis.Z]: { x: cx - d / 2, y: cy },
        [Axis.X]: { x: cx + d / 2, y: cy },
        [Axis.Y]: { x: cx, y: cy - apexHeight },
    };
}

/** The apex height that makes the triangle exactly equilateral. */
export function equilateralApexHeight(params: CircularSvgParameters): number {
    return (params.triangleSide * Math.sqrt(3)) / 2;
}

/** The centroid of the three axis centres. */
export function triangleCentroid(params: CircularSvgParameters): Point2D {
    const centres = axisCentres(params);
    return {
        x: (centres[Axis.X].x + centres[Axis.Y].x + centres[Axis.Z].x) / 3,
        y: (centres[Axis.X].y + centres[Axis.Y].y + centres[Axis.Z].y) / 3,
    };
}

/** Outer ring radius for a cube of the given size. */
export function outerRadius(cubeSize: number, params: CircularSvgParameters): number {
    return params.innerRadius + (cubeSize - 1) * params.ringStep;
}

/**
 * Radius of a given axis ring.
 *
 * The direction is not uniform: Z grows outward with layer index, while X and Y
 * shrink. This asymmetry is a design choice in the reference asset and is
 * preserved here.
 */
export function ringRadius(
    axis: Axis,
    layerIndex: number,
    cubeSize: number,
    params: CircularSvgParameters
): number {
    return axis === Axis.Z
        ? params.innerRadius + layerIndex * params.ringStep
        : outerRadius(cubeSize, params) - layerIndex * params.ringStep;
}

/** The two intersection points of two circles, or an empty array if they miss. */
export function circleIntersections(
    c1: Point2D & { r: number },
    c2: Point2D & { r: number }
): Point2D[] {
    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    const d = Math.hypot(dx, dy);
    if (d === 0 || d > c1.r + c2.r || d < Math.abs(c1.r - c2.r)) return [];

    const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
    const hSquared = c1.r * c1.r - a * a;
    if (hSquared < 0) return [];

    const h = Math.sqrt(hSquared);
    const xm = c1.x + (a * dx) / d;
    const ym = c1.y + (a * dy) / d;
    return [
        { x: xm + (h * dy) / d, y: ym - (h * dx) / d },
        { x: xm - (h * dy) / d, y: ym + (h * dx) / d },
    ];
}

/** Ring layer index for a face-position sticker along one of its ring axes. */
export function ringLayerFor(
    face: Face,
    facePosition: number,
    axis: Axis,
    cubeSize: number
): number {
    const position = facePositionTo3D(facePosition, face, cubeSize);
    // Position3D keys are lowercase while Axis values are uppercase.
    return position[axis.toLowerCase() as 'x' | 'y' | 'z'];
}

/** SVG coordinates of the sticker at the given face position. */
export function stickerPosition(
    face: Face,
    facePosition: number,
    cubeSize: number,
    params: CircularSvgParameters
): Point2D {
    const centres = axisCentres(params);
    const [axisA, axisB] = FACE_RING_AXES[face];

    const circleA = {
        ...centres[axisA],
        r: ringRadius(axisA, ringLayerFor(face, facePosition, axisA, cubeSize), cubeSize, params),
    };
    const circleB = {
        ...centres[axisB],
        r: ringRadius(axisB, ringLayerFor(face, facePosition, axisB, cubeSize), cubeSize, params),
    };

    const points = circleIntersections(circleA, circleB);
    if (points.length !== 2) {
        throw new Error(
            `Rings for ${face}${facePosition} do not intersect — parameters are invalid for size ${cubeSize}`
        );
    }

    const thirdCentre = centres[FACE_AXIS[face]];
    const [first, second] = points;
    const firstDistance = Math.hypot(first.x - thirdCentre.x, first.y - thirdCentre.y);
    const secondDistance = Math.hypot(second.x - thirdCentre.x, second.y - thirdCentre.y);

    const wantNear = FACE_IS_NEAR_THIRD[face];
    return firstDistance < secondDistance === wantNear ? first : second;
}

/** All sticker positions for one face, indexed by face position. */
export function faceStickerPositions(
    face: Face,
    cubeSize: number,
    params: CircularSvgParameters
): Point2D[] {
    return Array.from({ length: cubeSize * cubeSize }, (_, facePosition) =>
        stickerPosition(face, facePosition, cubeSize, params)
    );
}

export interface FaceEllipseGeometry {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    /** Rotation in degrees, or null when the ellipse is axis-aligned. */
    rotation: number | null;
}

/**
 * Centroid of a face's sticker grid.
 *
 * This is the point ghosts are placed *away* from, and the point the face
 * ellipse is centred on, so both callers share one definition.
 */
export function faceCentroid(face: Face, cubeSize: number, params: CircularSvgParameters): Point2D {
    const positions = faceStickerPositions(face, cubeSize, params);
    return {
        x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
        y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length,
    };
}

/**
 * Face-ellipse geometry, derived from the sticker grid.
 *
 * Rotation is perpendicular to the face's outward direction (from the triangle
 * centroid through the sticker-grid centroid); verified to within 0.3 degrees
 * of the reference asset for all six faces. The centre is the sticker-grid
 * centroid pushed outward by a per-polarity offset.
 *
 * The semi-axes enclose the grid plus a margin, measured in the ellipse's own
 * rotated frame. Deriving them from the grid rather than hardcoding a pair is
 * what keeps the ellipse enclosing the stickers as N grows — the reference's
 * fixed 46x40 fits 3x3 but clips 4x4 and above. At 3x3 these parameters
 * reproduce that 46x40 exactly.
 */
export function faceEllipseGeometry(
    face: Face,
    cubeSize: number,
    params: CircularSvgParameters
): FaceEllipseGeometry {
    const positions = faceStickerPositions(face, cubeSize, params);
    const centroid = faceCentroid(face, cubeSize, params);

    const triangle = triangleCentroid(params);
    const outward = normalise({ x: centroid.x - triangle.x, y: centroid.y - triangle.y });

    const rotationDegrees = (Math.atan2(outward.y, outward.x) * 180) / Math.PI + 90;
    const rotation = round(normaliseRotation(rotationDegrees));

    const span = stickerGridSpan(positions, centroid, rotation);
    const margin = params.stickerRadius * params.ellipseMargin;

    const offset =
        (FACE_IS_NEAR_THIRD[face] ? params.ellipseOffsetNear : params.ellipseOffsetFar) * span.mean;

    return {
        cx: round(centroid.x + outward.x * offset),
        cy: round(centroid.y + outward.y * offset),
        rx: round(span.major + margin),
        ry: round((span.minor + margin) * params.ellipseAspect),
        rotation,
    };
}

/**
 * Half-extents of the sticker grid, measured in the ellipse's rotated frame.
 *
 * Projecting onto the ellipse's own axes matters: the grid is a rotated square,
 * so its screen-space bounding box is larger than its extent along each of the
 * face's own directions.
 */
function stickerGridSpan(
    positions: Point2D[],
    centroid: Point2D,
    rotationDegrees: number
): { major: number; minor: number; mean: number } {
    const theta = (rotationDegrees * Math.PI) / 180;
    const axisX = { x: Math.cos(theta), y: Math.sin(theta) };
    const axisY = { x: -Math.sin(theta), y: Math.cos(theta) };

    const project = (p: Point2D, axis: Point2D) =>
        (p.x - centroid.x) * axis.x + (p.y - centroid.y) * axis.y;

    const xs = positions.map(p => project(p, axisX));
    const ys = positions.map(p => project(p, axisY));

    const halfX = (Math.max(...xs) - Math.min(...xs)) / 2;
    const halfY = (Math.max(...ys) - Math.min(...ys)) / 2;

    return {
        major: Math.max(halfX, halfY),
        minor: Math.min(halfX, halfY),
        mean: (halfX + halfY) / 2,
    };
}

export interface LabelGeometry {
    axis: Axis;
    layerIndex: number;
    /** Top-left corner of the label box. */
    x: number;
    y: number;
}

/**
 * Notation-label positions, one per axis ring.
 *
 * Each label sits on its ring at the point farthest from the triangle centroid,
 * so labels fan outward toward the periphery rather than overlapping the rings.
 */
export function labelGeometry(
    axis: Axis,
    layerIndex: number,
    cubeSize: number,
    params: CircularSvgParameters
): LabelGeometry {
    const centre = axisCentres(params)[axis];
    const triangle = triangleCentroid(params);
    const outward = normalise({ x: centre.x - triangle.x, y: centre.y - triangle.y });
    const radius = ringRadius(axis, layerIndex, cubeSize, params);

    const labelCentre = {
        x: centre.x + outward.x * radius,
        y: centre.y + outward.y * radius,
    };

    return {
        axis,
        layerIndex,
        x: round(labelCentre.x - params.labelWidth / 2),
        y: round(labelCentre.y - params.labelHeight / 2),
    };
}

/**
 * Ordinal used in a label's `data-label-id`, ordered by descending ring radius.
 *
 * The reference asset numbers labels outward-in, so on Z (whose radius grows
 * with layer index) the ordinal runs opposite to the layer index, while on X and
 * Y it matches. Deriving it as "how many rings have a larger radius" covers all
 * three axes uniformly. This value is authoring metadata — no runtime code reads
 * it — but matching it keeps a generated asset diffable against the reference.
 */
export function labelOrdinal(
    axis: Axis,
    layerIndex: number,
    cubeSize: number,
    params: CircularSvgParameters
): number {
    const radius = ringRadius(axis, layerIndex, cubeSize, params);
    let ordinal = 0;
    for (let layer = 0; layer < cubeSize; layer++) {
        if (ringRadius(axis, layer, cubeSize, params) > radius) ordinal++;
    }
    return ordinal;
}

/** Every label for a cube of the given size, grouped by axis in emission order. */
export function allLabels(cubeSize: number, params: CircularSvgParameters): LabelGeometry[] {
    const labels: LabelGeometry[] = [];
    for (const axis of [Axis.Z, Axis.Y, Axis.X]) {
        for (let layerIndex = 0; layerIndex < cubeSize; layerIndex++) {
            labels.push(labelGeometry(axis, layerIndex, cubeSize, params));
        }
    }
    return labels;
}

/**
 * The layer indices that carry a notation label for this cube size.
 *
 * Every ring gets a label, but the *notation* differs: at the extremes the
 * label is a face letter, and inner layers are slice moves. Callers use this to
 * decide which face-letter labels the view's dead-zone interaction depends on.
 */
export function hasMiddleLayers(cubeSize: number): boolean {
    return cubeSize > 2;
}

function normalise(vector: Point2D): Point2D {
    const length = Math.hypot(vector.x, vector.y);
    if (length === 0) return { x: 0, y: 0 };
    return { x: vector.x / length, y: vector.y / length };
}

/** Normalise a rotation into (-90, 90] degrees, since an ellipse is symmetric. */
function normaliseRotation(degrees: number): number {
    let value = ((degrees % 180) + 180) % 180;
    if (value > 90) value -= 180;
    return value;
}

/**
 * Round to two decimals for stable serialisation.
 *
 * Rounding here rather than at emission keeps the geometry module's output and
 * the emitted markup identical, so comparisons never fail on formatting alone.
 */
export function round(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Axis circle id, e.g. `Z-layer-2`. */
export function axisCircleId(axis: Axis, layerIndex: number): string {
    return `${axis}-layer-${layerIndex}`;
}

/** Sticker id, e.g. `sticker-U-4`. */
export function stickerId(face: Face, facePosition: number): string {
    return `sticker-${face}-${facePosition}`;
}
