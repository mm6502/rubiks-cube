import { Axis } from '@/cube/types';

import {
    ALL_FACES,
    CircularSvgParameters,
    FACE_RING_AXES,
    axisCentres,
    axisCircleId,
    circleIntersections,
    equilateralApexHeight,
    faceEllipseGeometry,
    labelGeometry,
    labelOrdinal,
    ringLayerFor,
    ringRadius,
    stickerId,
    stickerPosition,
} from './svg-generator/geometry';
import { labelContent } from './svg-generator/labels';
import REFERENCE_SVG_TEXT from './view.svg?raw';

/**
 * Verification that the generator's geometry reproduces the committed 3x3
 * reference asset. This is the plan's central safety net: it establishes the
 * generator is faithful before a size with no reference depends on it.
 *
 * Comparisons are structural, not byte-wise — float formatting and attribute
 * order legitimately differ. One tolerance constant governs every coordinate
 * comparison, set tighter than the runtime's own `isPointOnCircle` tolerance
 * (2 units) so the generator and this test can never agree on a displacement the
 * view would misresolve.
 */
const COORD_TOLERANCE = 0.5;

/**
 * Parameters extracted from the reference asset.
 *
 * `ellipseOffsetNear` / `ellipseOffsetFar` are measured from the reference as
 * the ellipse centre's outward displacement from the sticker-grid centroid,
 * expressed as a fraction of the grid's mean half-span. The two values differ
 * because the near-polarity faces (U, R, F) use a larger offset than the far
 * ones (D, L, B) — that is a visual choice the geometry spec declines to
 * derive, so it is carried as a parameter rather than a formula.
 */
const REFERENCE_PARAMS: CircularSvgParameters = {
    triangleSide: 100,
    innerRadius: 70,
    ringStep: 15,
    stickerRadius: 7,
    viewBox: '20 0 360 350',
    centreX: 200,
    centreY: 219,
    // The reference asset hand-rounds the apex to 87 above the baseline, where
    // the exact equilateral height is 86.6025.
    apexHeight: 87,
    ellipseOffsetNear: 0.4225,
    ellipseOffsetFar: 0.2871,
    ellipseMargin: 2.9286,
    ellipseAspect: 1.0177,
    labelWidth: 20,
    labelHeight: 16,
};

function attr(tag: string, name: string): string | undefined {
    return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
}

/** Parse `<circle>` elements into an id-keyed attribute bag. */
function parseCircles(svg: string, predicate: (tag: string) => boolean) {
    const result = new Map<string, { cx: number; cy: number; r: number; tag: string }>();
    for (const match of svg.matchAll(/<circle[^>]*\/>/g)) {
        const tag = match[0];
        if (!predicate(tag)) continue;
        const id = attr(tag, 'id');
        if (!id) continue;
        result.set(id, {
            cx: parseFloat(attr(tag, 'cx') ?? '0'),
            cy: parseFloat(attr(tag, 'cy') ?? '0'),
            r: parseFloat(attr(tag, 'r') ?? '0'),
            tag,
        });
    }
    return result;
}

const referenceAxisCircles = parseCircles(REFERENCE_SVG_TEXT, tag => tag.includes('data-axis='));
const referenceStickers = parseCircles(REFERENCE_SVG_TEXT, tag => tag.includes('class="sticker"'));

describe('circular svg generator — geometry fidelity against the 3x3 reference', () => {
    describe('axis centres', () => {
        it('matches the reference triangle', () => {
            const centres = axisCentres(REFERENCE_PARAMS);
            expect(centres[Axis.X]).toEqual({ x: 250, y: 219 });
            expect(centres[Axis.Z]).toEqual({ x: 150, y: 219 });
            expect(centres[Axis.Y]).toEqual({ x: 200, y: 132 });
        });

        it('carries the exact equilateral height as a derivable value', () => {
            // The parameter enables reproducing the hand-rounded reference; the
            // equilateral height stays available for a size that wants it.
            expect(equilateralApexHeight(REFERENCE_PARAMS)).toBeCloseTo(86.6025, 4);
        });
    });

    describe('ring radii', () => {
        it('matches every reference axis circle', () => {
            for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
                for (let layer = 0; layer < 3; layer++) {
                    const id = axisCircleId(axis, layer);
                    const reference = referenceAxisCircles.get(id);
                    expect(reference).toBeDefined();
                    expect(ringRadius(axis, layer, 3, REFERENCE_PARAMS)).toBeCloseTo(
                        reference!.r,
                        5
                    );
                }
            }
        });

        it('grows outward for Z and inward for X and Y', () => {
            expect(ringRadius(Axis.Z, 0, 3, REFERENCE_PARAMS)).toBe(70);
            expect(ringRadius(Axis.Z, 2, 3, REFERENCE_PARAMS)).toBe(100);
            expect(ringRadius(Axis.X, 0, 3, REFERENCE_PARAMS)).toBe(100);
            expect(ringRadius(Axis.X, 2, 3, REFERENCE_PARAMS)).toBe(70);
            expect(ringRadius(Axis.Y, 0, 3, REFERENCE_PARAMS)).toBe(100);
            expect(ringRadius(Axis.Y, 2, 3, REFERENCE_PARAMS)).toBe(70);
        });
    });

    describe('sticker positions', () => {
        it('reproduces all 54 reference stickers within tolerance', () => {
            let compared = 0;
            for (const face of ALL_FACES) {
                for (let position = 0; position < 9; position++) {
                    const reference = referenceStickers.get(stickerId(face, position));
                    expect(reference).toBeDefined();

                    const computed = stickerPosition(face, position, 3, REFERENCE_PARAMS);
                    expect(Math.abs(computed.x - reference!.cx)).toBeLessThanOrEqual(
                        COORD_TOLERANCE
                    );
                    expect(Math.abs(computed.y - reference!.cy)).toBeLessThanOrEqual(
                        COORD_TOLERANCE
                    );
                    compared++;
                }
            }
            expect(compared).toBe(54);
        });

        it('fails loudly if the selection polarity is inverted', () => {
            // Guards the rule the generator's correctness rests on. Computing
            // the opposite intersection point must NOT reproduce the reference,
            // so a polarity regression cannot pass unnoticed.
            const centres = axisCentres(REFERENCE_PARAMS);
            let mismatches = 0;

            for (const face of ALL_FACES) {
                for (let position = 0; position < 9; position++) {
                    const [axisA, axisB] = FACE_RING_AXES[face];
                    const circleA = {
                        ...centres[axisA],
                        r: ringRadius(
                            axisA,
                            ringLayerFor(face, position, axisA, 3),
                            3,
                            REFERENCE_PARAMS
                        ),
                    };
                    const circleB = {
                        ...centres[axisB],
                        r: ringRadius(
                            axisB,
                            ringLayerFor(face, position, axisB, 3),
                            3,
                            REFERENCE_PARAMS
                        ),
                    };

                    const chosen = stickerPosition(face, position, 3, REFERENCE_PARAMS);
                    const reference = referenceStickers.get(stickerId(face, position))!;

                    // Pick the intersection point that is NOT the chosen one.
                    const other = circleIntersections(circleA, circleB).find(
                        p => Math.hypot(p.x - chosen.x, p.y - chosen.y) > 1e-6
                    )!;

                    const wrongDistance = Math.hypot(
                        other.x - reference.cx,
                        other.y - reference.cy
                    );
                    if (wrongDistance > COORD_TOLERANCE) mismatches++;
                }
            }

            // Every one of the 54 stickers must reject the opposite branch.
            expect(mismatches).toBe(54);
        });
    });

    describe('face ellipses', () => {
        it('derives rotation within 0.5 degrees of the reference', () => {
            for (const face of ALL_FACES) {
                const tag = new RegExp(`<ellipse[^>]*data-face="${face}"[^>]*/>`).exec(
                    REFERENCE_SVG_TEXT
                )?.[0];
                expect(tag).toBeDefined();

                const referenceRotation = attr(tag!, 'transform')
                    ? parseFloat(/rotate\(([-\d.]+)/.exec(attr(tag!, 'transform')!)![1])
                    : 0;

                const computed = faceEllipseGeometry(face, 3, REFERENCE_PARAMS);
                expect(Math.abs((computed.rotation ?? 0) - referenceRotation)).toBeLessThan(0.5);
            }
        });
    });

    describe('notation labels', () => {
        it('places each ring label on its own ring, away from the centroid', () => {
            for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
                for (let layer = 0; layer < 3; layer++) {
                    const geometry = labelGeometry(axis, layer, 3, REFERENCE_PARAMS);
                    // Label ids are ordered by descending ring radius, which is
                    // the reverse of layer index on Z.
                    const ordinal = labelOrdinal(axis, layer, 3, REFERENCE_PARAMS);
                    const id = `data-label-id="${axis.toLowerCase()}-${ordinal}"`;
                    const tag = new RegExp(`<g ${id}[^>]*>`).exec(REFERENCE_SVG_TEXT)?.[0];
                    expect(tag).toBeDefined();

                    const translate = /translate\(([-\d.]+), ?([-\d.]+)\)/.exec(tag!)!;
                    const referenceX = parseFloat(translate[1]);
                    const referenceY = parseFloat(translate[2]);

                    expect(Math.abs(geometry.x - referenceX)).toBeLessThanOrEqual(COORD_TOLERANCE);
                    expect(Math.abs(geometry.y - referenceY)).toBeLessThanOrEqual(COORD_TOLERANCE);
                }
            }
        });

        it('produces base letters and glyphs matching the reference', () => {
            for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
                for (let layer = 0; layer < 3; layer++) {
                    const content = labelContent(axis, layer, 3);
                    const ordinal = labelOrdinal(axis, layer, 3, REFERENCE_PARAMS);
                    const tag = new RegExp(
                        `data-label-id="${axis.toLowerCase()}-${ordinal}"[^>]*>\\s*<rect[^>]*/>\\s*<text[^>]*>([^<]*)</text>`
                    ).exec(REFERENCE_SVG_TEXT);
                    expect(tag).toBeDefined();
                    expect(content.text).toBe(tag![1]);
                }
            }
        });

        it('reproduces every reference tooltip', () => {
            for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
                for (let layer = 0; layer < 3; layer++) {
                    const content = labelContent(axis, layer, 3);
                    const ordinal = labelOrdinal(axis, layer, 3, REFERENCE_PARAMS);
                    const tag = new RegExp(
                        `data-label-id="${axis.toLowerCase()}-${ordinal}"[^>]*>[\\s\\S]*?<title>([^<]*)</title>`
                    ).exec(REFERENCE_SVG_TEXT);
                    expect(tag).toBeDefined();
                    expect(content.title).toBe(tag![1]);
                }
            }
        });

        it('omits slice notation at N=2 where no middle layer exists', () => {
            const bases = [Axis.X, Axis.Y, Axis.Z].flatMap(axis =>
                [0, 1].map(layer => labelContent(axis, layer, 2).base)
            );
            expect(bases).not.toContain('M');
            expect(bases).not.toContain('E');
            expect(bases).not.toContain('S');
        });
    });

    describe('size variation', () => {
        it('produces N^2 stickers per face at every supported size', () => {
            for (const size of [2, 3, 4, 5]) {
                for (const face of ALL_FACES) {
                    for (let position = 0; position < size * size; position++) {
                        expect(() =>
                            stickerPosition(face, position, size, REFERENCE_PARAMS)
                        ).not.toThrow();
                    }
                }
            }
        });

        it('puts every sticker at the intersection of exactly two rings', () => {
            for (const size of [2, 3, 4, 5]) {
                const centres = axisCentres(REFERENCE_PARAMS);
                for (const face of ALL_FACES) {
                    for (let position = 0; position < size * size; position++) {
                        const point = stickerPosition(face, position, size, REFERENCE_PARAMS);
                        let onRings = 0;
                        for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
                            for (let layer = 0; layer < size; layer++) {
                                const centre = centres[axis];
                                const radius = ringRadius(axis, layer, size, REFERENCE_PARAMS);
                                const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
                                if (Math.abs(distance - radius) <= 0.5) onRings++;
                            }
                        }
                        expect(onRings).toBe(2);
                    }
                }
            }
        });
    });
});
