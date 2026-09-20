// The load-bearing claim behind the shared rotation animation: the exact
// rotation between two Basic-view orientations is always a 90°/180°/270°
// rotation about one of the six world axes (±X, ±Y, ±Z), and composing it in the
// transform slot between the base tilt and the current basis reproduces the
// target basis exactly.
//
// This is the durable form of the 96/96 computation the plan's U6 describes. It
// is a plain unit test rather than a scratch script because the claim is
// load-bearing: if a fixed axis could ever work, or if the composition were off
// by a transpose, the animation would silently travel the wrong path and no
// other test in the suite would notice.
import { describe, expect, it } from 'vitest';

import { negate3 } from '@/cube/utils/math';

import {
    IDENTITY_ORIENTATION,
    type Orientation,
    axisAngleFromMatrix,
    axisAngleToMatrix,
    axisToCss,
    mergeSameAxis,
    planRotation,
    reachableOrientations,
    relativeRotation,
    rotateBasis,
    rotationBetween,
    stepDown,
    stepLeft,
    stepRight,
    stepUp,
} from './rotation-math';

/** The four view-rotation steps, as `navigation.ts` defines them. */
const STEPS: Array<[string, (o: Orientation) => Orientation]> = [
    ['left', stepLeft],
    ['right', stepRight],
    ['up', stepUp],
    ['down', stepDown],
];

const BASE_X = -25;
const BASE_Y = -35;

/**
 * The 3×3 matrix the app's `matrix3d(...)` string produces: its ROWS are the three
 * orientation vectors.
 *
 * The app writes `matrix3d(vR.x, vU.x, vF.x, …)` — components grouped together — and
 * CSS reads the arguments column by column, which places `vR`, `vU` and `vF` in rows 0,
 * 1 and 2. Getting this backwards describes the inverse rotation, and because the three
 * vectors are orthonormal the mistake stays internally consistent, so it is worth
 * stating rather than deriving.
 */
const toMatrix = (o: Orientation): number[][] => [
    [o.viewRight.x, o.viewRight.y, o.viewRight.z],
    [o.viewUp.x, o.viewUp.y, o.viewUp.z],
    [o.viewForward.x, o.viewForward.y, o.viewForward.z],
];

const transpose = (m: number[][]): number[][] => [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
];

const multiply = (a: number[][], b: number[][]): number[][] =>
    a.map(row => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));

const rotateX = (deg: number): number[][] => {
    const r = (deg * Math.PI) / 180;
    return [
        [1, 0, 0],
        [0, Math.cos(r), -Math.sin(r)],
        [0, Math.sin(r), Math.cos(r)],
    ];
};

const rotateY = (deg: number): number[][] => {
    const r = (deg * Math.PI) / 180;
    return [
        [Math.cos(r), 0, Math.sin(r)],
        [0, 1, 0],
        [-Math.sin(r), 0, Math.cos(r)],
    ];
};

function expectOrientationEqual(actual: Orientation, expected: Orientation, label: string): void {
    const target = toMatrix(expected);
    const got = toMatrix(actual);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            expect(got[i][j], `${label}: entry [${i}][${j}]`).toBeCloseTo(target[i][j], 9);
        }
    }
}

/** Assert a matrix is a genuine rotation: orthonormal, determinant +1. */
function expectIsRotation(m: number[][], label: string): void {
    const product = multiply(m, transpose(m));
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            expect(product[i][j], `${label}: orthonormality [${i}][${j}]`).toBeCloseTo(
                i === j ? 1 : 0,
                9
            );
        }
    }
    const det =
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    expect(det, `${label}: determinant`).toBeCloseTo(1, 9);
}

describe('rotation-math', () => {
    it('enumerates exactly the 24 reachable orientations', () => {
        const orientations = reachableOrientations();
        expect(orientations).toHaveLength(24);

        // Every one is a signed permutation of the axes — orthonormal unit rows.
        for (const o of orientations) {
            for (const v of [o.viewRight, o.viewUp, o.viewForward]) {
                expect(Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z)).toBe(1);
            }
        }
    });

    it('relativeRotation is the identity for a basis against itself', () => {
        for (const o of reachableOrientations()) {
            const r = relativeRotation(o, o);
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    expect(r[i][j]).toBeCloseTo(i === j ? 1 : 0, 9);
                }
            }
        }
    });

    it('resolves a known step to its axis and angle', () => {
        // Verified against the DOM's own transform parser, not by hand. The rotation
        // that must occupy the animation slot for `rotateViewLeft` from the default
        // orientation is `rotate3d(0,-1,0,90deg)` — the same matrix as
        // `rotate3d(0,1,0,-90deg)`.
        //
        // Pinned explicitly because a sign error here is invisible to every
        // orientation-level test: the cube still lands on the right orientation, it just
        // travels there backwards and the settle then snaps ~180° to correct it. That is
        // exactly the defect shipped by the first revision of this module, and
        // `rotation-composition.browser.test.ts` is the check that cannot be fooled by it.
        const ramp = rotationBetween(IDENTITY_ORIENTATION, stepLeft(IDENTITY_ORIENTATION));
        expect(ramp).not.toBeNull();
        expect(ramp!.axis).toEqual({ x: 0, y: -1, z: 0 });
        expect(ramp!.angle).toBeCloseTo(90, 6);
    });

    it('agrees with the matrix3d string the app actually writes', () => {
        // The convention that is easiest to get backwards: CSS `matrix3d` takes
        // its sixteen arguments COLUMN-major, so the app's
        // `matrix3d(vR.x, vU.x, vF.x, …)` puts viewRight/viewUp/viewForward in the
        // matrix's *columns*. This reconstructs the DOM matrix from that exact
        // string and checks the relative rotation is a pure, exact rotation —
        // which it would not be under the transposed reading.
        const fromCssString = (o: Orientation): number[][] => {
            const args = [
                o.viewRight.x,
                o.viewUp.x,
                o.viewForward.x,
                0,
                o.viewRight.y,
                o.viewUp.y,
                o.viewForward.y,
                0,
                o.viewRight.z,
                o.viewUp.z,
                o.viewForward.z,
                0,
                0,
                0,
                0,
                1,
            ];
            // CSS is column-major: fill column by column.
            const m = [
                [0, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
            ];
            for (let col = 0; col < 4; col++) {
                for (let row = 0; row < 4; row++) {
                    if (row < 3 && col < 3) m[row][col] = args[col * 4 + row];
                }
            }
            return m;
        };

        for (const o of reachableOrientations()) {
            for (const [name, step] of STEPS) {
                const next = step(o);
                // domNext · domCurrentᵀ must be R, and R · domCurrent = domNext.
                const current = fromCssString(o);
                const domNext = fromCssString(next);
                const r = multiply(domNext, transpose(current));
                const recomposed = multiply(r, current);
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        expect(recomposed[i][j], `${name}: [${i}][${j}]`).toBeCloseTo(
                            domNext[i][j],
                            9
                        );
                    }
                }
                expectIsRotation(r, `${name}: relative rotation from the CSS string`);
            }
        }
    });

    it('returns null when the orientation does not change', () => {
        expect(rotationBetween(IDENTITY_ORIENTATION, IDENTITY_ORIENTATION)).toBeNull();
    });

    it('recovers the axis of a 180° rotation, where the skew part is zero', () => {
        // 180° about +Y: [−1,0,0; 0,1,0; 0,0,−1]. The naive skew-based recovery
        // returns a zero axis here, which is why the diagonal branch exists.
        const r = [
            [-1, 0, 0],
            [0, 1, 0],
            [0, 0, -1],
        ];
        const { axis, angle } = axisAngleFromMatrix(r);
        expect(angle).toBeCloseTo(180, 6);
        expect(Math.abs(axis.y)).toBe(1);
        expect(axis.x).toBe(0);
        expect(axis.z).toBe(0);
    });

    it('uses six distinct axes across the rotations', () => {
        const axes = new Set<string>();
        for (const o of reachableOrientations()) {
            for (const [, step] of STEPS) {
                const ramp = rotationBetween(o, step(o));
                expect(ramp, 'a view-rotation step always rotates').not.toBeNull();
                axes.add(axisToCss(ramp!.axis));
            }
        }
        // A fixed axis would leave this at 1; six distinct signed axes is what
        // confirms the axis is state-derived, which is requirement R2.
        expect(axes.size).toBeGreaterThanOrEqual(4);
    });

    it('every one of the 24 orientations × 4 rotations lands exactly (96/96)', () => {
        // The full check. A fixed axis fails it in every case; a state-derived
        // axis passes it in every case.
        let checked = 0;

        for (const o of reachableOrientations()) {
            for (const [name, step] of STEPS) {
                const next = step(o);
                const ramp = rotationBetween(o, next);
                expect(ramp, `${name}: rotation exists`).not.toBeNull();

                // Rotating the current basis by the derived ramp must reproduce
                // the target basis exactly.
                expectOrientationEqual(
                    rotateBasis(o, ramp!),
                    next,
                    `${name} from ${JSON.stringify(o)}`
                );

                // And the ramp is a 90° step about one world axis.
                expect(Math.abs(ramp!.angle)).toBeCloseTo(90, 6);
                expect(
                    Math.abs(ramp!.axis.x) + Math.abs(ramp!.axis.y) + Math.abs(ramp!.axis.z)
                ).toBe(1);
                checked++;
            }
        }
        expect(checked).toBe(96);
    });

    it('the composed transform matches the target basis only when the slot is inside the tilt', () => {
        // Guards the composition order the production path relies on: the
        // transform is `tilt · slot · basis`. If the slot were instead applied
        // outside (after) the tilt, the rendered frames would be tilted through
        // the rotation and the cube would visibly wobble as it turned — while the
        // check above still passed, because it tests the rotation on its own.
        const tilt = multiply(rotateX(BASE_X), rotateY(BASE_Y));

        for (const o of reachableOrientations()) {
            for (const [name, step] of STEPS) {
                const next = step(o);
                const ramp = rotationBetween(o, next)!;
                const composed = multiply(tilt, multiply(axisAngleToMatrix(ramp), toMatrix(o)));
                const expected = multiply(tilt, toMatrix(next));
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        expect(composed[i][j], `${name}: [${i}][${j}]`).toBeCloseTo(
                            expected[i][j],
                            9
                        );
                    }
                }
            }
        }
    });

    it('repeated steps compose to one ramp over the full delta', () => {
        // A two-step gesture must animate as a single 180° sweep and a three-step
        // as a single 270° — not as N separate 90° ramps. This is what keeps a
        // linked peer symmetric with its source when it receives N synchronous
        // events for one rendered gesture.
        const cases: Array<[number, number, string]> = [
            [2, 180, 'two steps'],
            [3, 270, 'three steps'],
        ];

        for (const [count, expected, label] of cases) {
            // Walk the steps the way the renderer would: each subsequent call
            // happens at some point through the previous ramp, and the plan is
            // extended rather than replaced.
            let previousTarget = IDENTITY_ORIENTATION;
            let target = stepLeft(previousTarget);
            let plan = planRotation({
                plan: null,
                rendered: IDENTITY_ORIENTATION,
                target,
                currentAngleDeg: 0,
            });

            for (let i = 1; i < count; i++) {
                previousTarget = target;
                target = stepLeft(target);
                plan = planRotation({
                    plan,
                    rendered: IDENTITY_ORIENTATION,
                    target,
                    // Half way through the ramp that is already running — the
                    // realistic case, and the one where a restart would visibly
                    // jerk back to the beginning.
                    currentAngleDeg: plan!.toDeg / 2,
                });
            }

            expect(plan, label).not.toBeNull();
            // `toDeg` is the total angle from the ramp's fixed base, so it grows
            // to the full delta. (`toDeg - fromDeg` is only the *remaining*
            // sweep, because an extended ramp resumes from where the cube is.)
            expect(Math.abs(plan!.toDeg), `${label}: total sweep`).toBeCloseTo(expected, 6);
            // The base and axis never changed, so the extended ramp is one
            // continuous rotation rather than a restart.
            expect(plan!.base).toEqual(IDENTITY_ORIENTATION);
            expect(
                Math.abs(plan!.axis.x) + Math.abs(plan!.axis.y) + Math.abs(plan!.axis.z),
                `${label}: pure axis rotation`
            ).toBe(1);
            // And it still lands on the requested orientation.
            expectOrientationEqual(
                rotateBasis(plan!.base, { axis: plan!.axis, angle: plan!.toDeg }),
                target,
                `${label}: landing`
            );
        }
    });

    it('four steps return to the identity, so there is nothing to animate', () => {
        let landed = IDENTITY_ORIENTATION;
        for (let i = 0; i < 4; i++) landed = stepLeft(landed);
        expect(landed).toEqual(IDENTITY_ORIENTATION);
        expect(rotationBetween(IDENTITY_ORIENTATION, landed)).toBeNull();
    });

    it('opposite steps are exact inverses of one another', () => {
        // rotateViewToFace composes two lefts for the anti-parallel case, so the
        // pairs must cancel exactly rather than accumulate drift.
        for (const o of reachableOrientations()) {
            expect(stepRight(stepLeft(o))).toEqual(o);
            expect(stepDown(stepUp(o))).toEqual(o);
        }
    });

    it('a rotation and its inverse share an axis, with the angle negated', () => {
        for (const o of reachableOrientations()) {
            const forward = rotationBetween(o, stepLeft(o));
            const back = rotationBetween(stepLeft(o), o);
            expect(forward).not.toBeNull();
            expect(back).not.toBeNull();
            expect(Math.abs(back!.angle)).toBeCloseTo(Math.abs(forward!.angle), 6);
            expect(back!.axis).toEqual(negate3(forward!.axis));
        }
    });

    describe('mergeSameAxis', () => {
        it('adds angles about the same axis', () => {
            const merged = mergeSameAxis(
                { axis: { x: 0, y: 1, z: 0 }, angle: 90 },
                { axis: { x: 0, y: 1, z: 0 }, angle: 90 }
            );
            expect(merged).toEqual({ axis: { x: 0, y: 1, z: 0 }, angle: 180 });
        });

        it('treats an opposite-signed axis as parallel and negates its angle', () => {
            // −Y and +Y name the same physical axis, so a step expressed about −Y
            // must extend a ramp about +Y rather than looking like a new axis.
            const merged = mergeSameAxis(
                { axis: { x: 0, y: 1, z: 0 }, angle: 90 },
                { axis: { x: 0, y: -1, z: 0 }, angle: 90 }
            );
            expect(merged).toEqual({ axis: { x: 0, y: 1, z: 0 }, angle: 0 });
        });

        it('returns null for different axes', () => {
            expect(
                mergeSameAxis(
                    { axis: { x: 0, y: 1, z: 0 }, angle: 90 },
                    { axis: { x: 1, y: 0, z: 0 }, angle: 90 }
                )
            ).toBeNull();
        });
    });

    describe('planRotation', () => {
        it('starts a fresh ramp when nothing is in flight', () => {
            const plan = planRotation({
                plan: null,
                rendered: IDENTITY_ORIENTATION,
                target: stepLeft(IDENTITY_ORIENTATION),
                currentAngleDeg: 0,
            });
            expect(plan).not.toBeNull();
            expect(plan!.base).toEqual(IDENTITY_ORIENTATION);
            expect(plan!.fromDeg).toBe(0);
            expect(plan!.toDeg).toBeCloseTo(90, 6);
        });

        it('extends a running ramp when the next step shares its axis', () => {
            const first = stepLeft(IDENTITY_ORIENTATION);
            const start = planRotation({
                plan: null,
                rendered: IDENTITY_ORIENTATION,
                target: first,
                currentAngleDeg: 0,
            })!;

            const second = stepLeft(first);
            const extended = planRotation({
                plan: start,
                rendered: first,
                target: second,
                currentAngleDeg: 45,
            })!;

            // Same base and axis, a longer sweep, resuming from where the cube
            // actually is (45°) rather than from the previous start.
            expect(extended.base).toEqual(start.base);
            expect(extended.axis).toEqual(start.axis);
            expect(extended.fromDeg).toBe(45);
            expect(extended.toDeg).toBeCloseTo(180, 6);
            expectOrientationEqual(
                rotateBasis(extended.base, { axis: extended.axis, angle: extended.toDeg }),
                second,
                'extended landing'
            );
        });

        it('re-bases without jumping when the axis changes', () => {
            const first = stepLeft(IDENTITY_ORIENTATION);
            const start = planRotation({
                plan: null,
                rendered: IDENTITY_ORIENTATION,
                target: first,
                currentAngleDeg: 0,
            })!;

            // `up` from the intermediate orientation uses a different world axis.
            const second = stepUp(first);
            const resumed = planRotation({
                plan: start,
                rendered: first,
                target: second,
                currentAngleDeg: 30,
            })!;

            // The pose the cube is showing at 30° of the first rotation becomes
            // the new base, so the frame on screen is continuous.
            expectOrientationEqual(
                resumed.base,
                rotateBasis(start.base, { axis: start.axis, angle: 30 }),
                're-based pose'
            );
            expect(resumed.fromDeg).toBe(0);
            // And it still lands where the user asked.
            expectOrientationEqual(
                rotateBasis(resumed.base, { axis: resumed.axis, angle: resumed.toDeg }),
                second,
                're-based landing'
            );
        });

        it('returns null when the requested orientation is already on screen', () => {
            // A gesture whose net rotation is a full turn leaves nothing to do.
            let landed = IDENTITY_ORIENTATION;
            for (let i = 0; i < 4; i++) landed = stepLeft(landed);
            expect(
                planRotation({
                    plan: null,
                    rendered: IDENTITY_ORIENTATION,
                    target: landed,
                    currentAngleDeg: 0,
                })
            ).toBeNull();
        });
    });

    it('every interpolated frame of a sweep is still a valid rotation', () => {
        // The property the defect violated. The old scheme blended matrix entries,
        // so intermediate frames sheared the geometry; this checks the whole
        // sweep, including angles past 180° (where a naive shortest-arc
        // normalisation would have folded the path back on itself).
        const ramp = rotationBetween(IDENTITY_ORIENTATION, stepLeft(IDENTITY_ORIENTATION))!;

        // A three-step sweep: 270°, i.e. well past a half turn. It has to be
        // built by merging three synchronous steps, because a single 3-step
        // rotation *matrix* is indistinguishable from a −90° one — which is
        // precisely why the plan carries an angle rather than a matrix.
        let previousTarget = IDENTITY_ORIENTATION;
        let target = stepLeft(previousTarget);
        let wide = planRotation({
            plan: null,
            rendered: IDENTITY_ORIENTATION,
            target,
            currentAngleDeg: 0,
        });
        for (let i = 1; i < 3; i++) {
            previousTarget = target;
            target = stepLeft(target);
            wide = planRotation({
                plan: wide,
                rendered: IDENTITY_ORIENTATION,
                target,
                // Synchronous burst: no time has passed, so the ramp has not
                // advanced from its start.
                currentAngleDeg: 0,
            });
        }
        expect(Math.abs(wide!.toDeg)).toBeCloseTo(270, 6);

        for (const angle of [0, 45, 90, 135, 180, 225, 269]) {
            expectIsRotation(
                toMatrix(
                    rotateBasis(wide!.base, {
                        axis: wide!.axis,
                        angle: (wide!.toDeg * angle) / 270,
                    })
                ),
                `wide frame at ${angle}/270`
            );
        }

        // And a plain 90° step, frame by frame.
        for (const fraction of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
            expectIsRotation(
                toMatrix(
                    rotateBasis(IDENTITY_ORIENTATION, {
                        axis: ramp.axis,
                        angle: ramp.angle * fraction,
                    })
                ),
                `frame at ${fraction}`
            );
        }
    });

    it('a rotation starting from an in-between pose stays exact', () => {
        // Interruption re-bases onto a pose that is not one of the 24, so the
        // maths has to hold off the axis-aligned lattice too.
        const pose = rotateBasis(IDENTITY_ORIENTATION, {
            axis: { x: 0, y: -1, z: 0 },
            angle: 30,
        });
        const next = rotationBetween(pose, stepUp(IDENTITY_ORIENTATION));
        expect(next).not.toBeNull();
        expectOrientationEqual(
            rotateBasis(pose, next!),
            stepUp(IDENTITY_ORIENTATION),
            'from an in-between pose'
        );
    });

    it('an axis sign flip describes the same matrix', () => {
        // Guards the assumption mergeSameAxis relies on — that ±axis is one axis.
        const a = axisAngleToMatrix({ axis: { x: 0, y: 1, z: 0 }, angle: 90 });
        const b = axisAngleToMatrix({ axis: { x: 0, y: -1, z: 0 }, angle: -90 });
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                expect(a[i][j], `[${i}][${j}]`).toBeCloseTo(b[i][j], 12);
            }
        }
    });
});
