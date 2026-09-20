// Exact rotation maths for the Basic view's orientation basis.
//
// The view stores its orientation as three orthonormal model-space vectors —
// `viewRight`, `viewUp`, `viewForward` — and renders them into a CSS `matrix3d`
// whose rows are M = [viewRight; viewUp; viewForward]:
//
//   matrix3d(vR.x, vU.x, vF.x, 0,
//            vR.y, vU.y, vF.y, 0,
//            vR.z, vU.z, vF.z, 0,
//            0, 0, 0, 1)
//
// A view rotation replaces M with M' (a different set of the same axis-aligned
// vectors). Because M is orthogonal, the exact rotation taking the cube from M
// to M' is
//
//   R = M' · Mᵀ
//
// and R is always a 90° rotation about one of the six world axes (±X, ±Y, ±Z) —
// never a fixed axis, which is why the animation's axis has to be derived from
// state on every rotation rather than hard-coded.
//
// This module is deliberately free of DOM and of the view's state object: the
// vectors in, a rotation out. That makes the claim above testable exhaustively
// over all 24 reachable orientations × 4 rotations instead of spot-checked.
import type { Vector3 } from '@/cube/types';
import { negate3 } from '@/cube/utils/math';

/** A rotation: a unit axis rounded to exact components, and a signed angle. */
export type AxisAngle = {
    /** Unit rotation axis, rounded to exact −1/0/1 components. */
    axis: Vector3;
    /** Rotation angle in degrees. */
    angle: number;
};

/** An orientation of the view, as the three vectors the view stores. */
export type Orientation = {
    viewRight: Vector3;
    viewUp: Vector3;
    viewForward: Vector3;
};

export const IDENTITY_ORIENTATION: Orientation = {
    viewRight: { x: 1, y: 0, z: 0 },
    viewUp: { x: 0, y: 1, z: 0 },
    viewForward: { x: 0, y: 0, z: 1 },
};

/**
 * The CSS matrix for an orientation: `viewRight`, `viewUp`, `viewForward` as its
 * columns, matching what the `matrix3d(...)` string in `rendering.ts` builds.
 */
const cssMatrix = (o: Orientation): number[][] => [
    [o.viewRight.x, o.viewUp.x, o.viewForward.x],
    [o.viewRight.y, o.viewUp.y, o.viewForward.y],
    [o.viewRight.z, o.viewUp.z, o.viewForward.z],
];

/** The inverse of {@link cssMatrix}: read the columns back out. */
const orientationFromCssMatrix = (m: number[][]): Orientation => ({
    viewRight: { x: m[0][0], y: m[1][0], z: m[2][0] },
    viewUp: { x: m[0][1], y: m[1][1], z: m[2][1] },
    viewForward: { x: m[0][2], y: m[1][2], z: m[2][2] },
});

const multiply = (a: number[][], b: number[][]): number[][] =>
    a.map(row => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));

/**
 * Compute M' · Mᵀ for two orientations, where M is the CSS matrix whose columns
 * are (viewRight, viewUp, viewForward).
 */
export function relativeRotation(prev: Orientation, next: Orientation): number[][] {
    const a = cssMatrix(next);
    const b = cssMatrix(prev);
    // Element [i][j] is row i of M' dotted with row j of M (which are the columns
    // of Mᵀ).
    return a.map(rowA =>
        [0, 1, 2].map(col => rowA[0] * b[col][0] + rowA[1] * b[col][1] + rowA[2] * b[col][2])
    );
}

/**
 * Snap floating-point noise in an axis component to its exact value, without
 * collapsing a genuinely non-axis-aligned axis.
 *
 * A rotation between two of the 24 axis-aligned orientations always has an axis
 * of exactly ±X/±Y/±Z, but it arrives as values like 6.1e-17 or 0.9999999999.
 * Rounding the axis *as a whole* — an obvious-looking shortcut — silently maps a
 * general axis such as (0.707, 0.707, 0) to (1, 1, 0), which is not a unit vector
 * and describes a different rotation. That case is reachable: interrupting a turn
 * bakes the in-between pose and re-bases onto it, and the next ramp starts from
 * there.
 *
 * So only components already within rounding distance of 0/±1 are snapped;
 * anything else is left exactly as computed.
 */
const snapComponent = (c: number): number => {
    if (Math.abs(c) < 1e-9) return 0;
    if (Math.abs(c - 1) < 1e-9) return 1;
    if (Math.abs(c + 1) < 1e-9) return -1;
    return c;
};

const snapAxis = (v: Vector3): Vector3 => ({
    x: snapComponent(v.x),
    y: snapComponent(v.y),
    z: snapComponent(v.z),
});

/**
 * Extract the axis and angle of a rotation matrix.
 *
 * The sign convention matters. A rotation about `n` by −θ is the *same matrix*
 * as a rotation about −n by +θ, so a matrix alone cannot say which way a turn
 * travelled — but the caller must, or an interrupted turn unwinds the wrong way.
 * The convention here mirrors the standard axis-angle form
 *
 *   R = I + sin θ·[n]× + (1 − cos θ)·[n]×²
 *
 * by reading the axis from the skew-symmetric part (which carries `sign sin θ`)
 * and taking the angle as `atan2(|skew|/2, (trace − 1)/2)`, i.e. the principal
 * angle in [0, 180]. The signed information therefore lives in the axis, whose
 * components come out as exact −1/0/1 values for every rotation between two of
 * the 24 axis-aligned orientations.
 *
 * Two cases the naive trace-and-skew recovery gets wrong are handled:
 *
 * - **180°.** The skew part is identically zero, so the axis cannot be read from
 *   it and `atan2(0, −1)` says nothing about direction (there is none to say —
 *   a half turn is the same either way). The axis is recovered from the diagonal
 *   instead.
 * - **0°.** The matrix is the identity and there is nothing to animate; a zero
 *   angle is reported with an arbitrary axis, which callers skip.
 *
 * @param r - A 3×3 rotation matrix in row-major order.
 * @returns The axis (unit) and angle in degrees.
 */
export function axisAngleFromMatrix(r: number[][]): AxisAngle {
    const trace = r[0][0] + r[1][1] + r[2][2];
    const cosAngle = Math.max(-1, Math.min(1, (trace - 1) / 2));

    const skew: Vector3 = {
        x: r[2][1] - r[1][2],
        y: r[0][2] - r[2][0],
        z: r[1][0] - r[0][1],
    };
    const sinScale = Math.hypot(skew.x, skew.y, skew.z) / 2;
    const angle = (Math.atan2(sinScale, cosAngle) * 180) / Math.PI;

    // Identity (0°) — nothing to animate.
    if (sinScale < 1e-9 && cosAngle > 0) return { axis: { x: 0, y: 1, z: 0 }, angle: 0 };

    // 180°: the skew part vanishes, so recover the axis from the diagonal.
    if (sinScale < 1e-9) {
        const x = Math.sqrt(Math.max(0, (r[0][0] + 1) / 2));
        const y = Math.sqrt(Math.max(0, (r[1][1] + 1) / 2));
        const z = Math.sqrt(Math.max(0, (r[2][2] + 1) / 2));
        // Fix the sign from a non-zero off-diagonal entry so the choice is
        // stable rather than an arbitrary pick between n and −n.
        const sign = r[0][1] + r[1][0] + r[2][0] + r[0][2] < 0 ? -1 : 1;
        const axis = snapAxis({ x: sign * x, y: sign * y, z: sign * z });
        // A numerically degenerate input could snap to all zeros; fall back to +Y
        // rather than emitting `rotate3d(0,0,0, …)`.
        if (axis.x === 0 && axis.y === 0 && axis.z === 0)
            return { axis: { x: 0, y: 1, z: 0 }, angle: 180 };
        return { axis, angle: 180 };
    }

    return {
        axis: snapAxis({
            x: skew.x / (sinScale * 2),
            y: skew.y / (sinScale * 2),
            z: skew.z / (sinScale * 2),
        }),
        angle,
    };
}

/**
 * Format an axis as the comma-separated triple `rotate3d` takes.
 *
 * Components are trimmed to 12 decimals so a snapped axis reads as `0,1,0`
 * rather than `6.123233995736766e-17,1,0`, while an axis that is genuinely not
 * axis-aligned keeps far more precision than a pixel can show.
 */
export function axisToCss(axis: Vector3): string {
    const trim = (n: number): string => String(Number(n.toFixed(12)));
    return `${trim(axis.x)},${trim(axis.y)},${trim(axis.z)}`;
}

/**
 * The rotation matrix (row-major) of an axis-angle pair, via Rodrigues' formula.
 */
export function axisAngleToMatrix({ axis, angle }: AxisAngle): number[][] {
    const r = (angle * Math.PI) / 180;
    const { x, y, z } = axis;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const t = 1 - c;
    return [
        [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
        [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
        [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
    ];
}

/**
 * Apply a rotation to an orientation, in the slot the animated transform uses.
 *
 * The transform is composed as `baseTilt · S · M`, so `S` multiplies the basis
 * from the left. Keeping this placement is what makes an interpolated frame a
 * genuine rotation of the cube rather than a component-wise blend of two
 * matrices — the defect this work removes.
 *
 * Components are deliberately **not** rounded: this reads the exact pose the
 * cube is showing part-way through an animation, which is in general not one of
 * the 24 axis-aligned orientations.
 */
export function rotateBasis(basis: Orientation, rotation: AxisAngle): Orientation {
    return orientationFromCssMatrix(multiply(axisAngleToMatrix(rotation), cssMatrix(basis)));
}

/**
 * The rotation taking one orientation to another.
 *
 * @returns `null` when the two are the same, i.e. there is nothing to animate.
 */
export function rotationBetween(prev: Orientation, next: Orientation): AxisAngle | null {
    const { axis, angle } = axisAngleFromMatrix(relativeRotation(prev, next));
    if (angle < 1e-6) return null;
    return { axis, angle };
}

/**
 * Add a further rotation to one that is already about the same axis.
 *
 * This is what keeps a rapid gesture continuous. Three things depend on it:
 *
 * 1. **A matrix cannot express more than a half turn.** A 270° sweep and a −90°
 *    sweep are the same matrix, so re-deriving the target angle from a matrix
 *    while a gesture is still in flight would quietly shorten a three-step input
 *    to a single step the wrong way round. The *intended* angle is carried as a
 *    number and never re-derived from a matrix.
 * 2. **The steps of one gesture share an axis.** A rapid left-left-left burst is
 *    90° about ±Y three times over; merging gives one 270° sweep, which is the
 *    continuous turn a far-drag is meant to read as, rather than three restarts.
 * 3. **A linked peer receives N events for one gesture.** The peer's N
 *    synchronous calls have to coalesce into the same single sweep the source
 *    renders, or the two views drift apart on screen.
 *
 * The axis is compared up to sign, because −Y and +Y name the same physical
 * axis; a flipped sign flips the angle it is expressed with.
 *
 * @returns The merged rotation, or `null` when the axes differ — two different
 *   axes cannot collapse into one `rotate3d`, so the caller must re-base instead.
 */
export function mergeSameAxis(prev: AxisAngle, next: AxisAngle): AxisAngle | null {
    const parallel = (sign: number): boolean =>
        Math.abs(prev.axis.x - sign * next.axis.x) < 1e-9 &&
        Math.abs(prev.axis.y - sign * next.axis.y) < 1e-9 &&
        Math.abs(prev.axis.z - sign * next.axis.z) < 1e-9;

    if (parallel(1)) return { axis: prev.axis, angle: prev.angle + next.angle };
    if (parallel(-1)) return { axis: prev.axis, angle: prev.angle - next.angle };
    return null;
}

/**
 * How a rotation is presented to the renderer.
 *
 * The composed transform is
 *
 *   `rotateX(baseX) rotateY(baseY) rotate3d(axis, <angle>) matrix3d(base)`
 *
 * so `base` is the basis *underneath* the animated slot, and `axis`/`angle` are
 * the slot's own contents. Invariant: rotating `base` by `toDeg` about `axis`
 * lands exactly on the requested orientation. While a ramp is running `base`
 * stays fixed, so every frame is `base` rotated part-way — never a blend.
 */
export type RotationPlan = {
    /** The basis baked into the matrix below the animated slot. */
    base: Orientation;
    /** The orientation this ramp is heading for. */
    target: Orientation;
    /** The slot's rotation axis. */
    axis: Vector3;
    /** The slot's angle at the start of the ramp, in degrees. */
    fromDeg: number;
    /** The slot's angle at the end of the ramp, in degrees. */
    toDeg: number;
};

/**
 * Derive the plan that animates from what is on screen to a new orientation.
 *
 * Handles the three situations a rotation can arrive in:
 *
 * - **Nothing in flight.** A fresh ramp, from the currently rendered basis to
 *   the requested orientation.
 * - **Something in flight, same axis.** The ramp is *extended*: `toDeg` grows and
 *   the start becomes the angle the cube is currently at, so the sweep continues
 *   from where it is instead of restarting. This is what turns a multi-step
 *   gesture into one continuous turn.
 * - **Something in flight, different axis.** The pose on screen is baked into a
 *   new `base` and a fresh ramp starts from it. Nothing jumps, because the baked
 *   pose *is* what is on screen; the turn simply changes direction on a new axis.
 *   (Two rotations about different axes cannot share one `rotate3d`, so they
 *   cannot be merged.)
 *
 * @param args.plan - The plan currently running, if any.
 * @param args.rendered - The orientation the cube is showing when no plan is
 *   running, i.e. the basis currently rendered.
 * @param args.target - The newly requested orientation.
 * @param args.currentAngleDeg - Where the running ramp is right now. Only read
 *   when `plan` is present; the caller obtains it from the animation itself.
 * @returns The plan to render, or `null` when there is nothing to animate
 *   because the requested orientation is the one already on screen.
 */
export function planRotation(args: {
    plan: RotationPlan | null;
    rendered: Orientation;
    target: Orientation;
    currentAngleDeg: number;
}): RotationPlan | null {
    // What the rotation has to travel from: the running ramp's goal, or what is
    // rendered when nothing is in flight.
    const from = args.plan ? args.plan.target : args.rendered;
    const step = rotationBetween(from, args.target);
    if (!step) return args.plan;

    if (args.plan) {
        const merged = mergeSameAxis({ axis: args.plan.axis, angle: args.plan.toDeg }, step);
        if (merged) {
            // Resuming from the current angle keeps the motion continuous: that
            // angle already lies on the extended path, so nothing has to jump.
            return {
                base: args.plan.base,
                target: args.target,
                axis: args.plan.axis,
                fromDeg: args.currentAngleDeg,
                toDeg: merged.angle,
            };
        }

        // Different axis: bake the pose on screen and start again from there.
        const shown = rotateBasis(args.plan.base, {
            axis: args.plan.axis,
            angle: args.currentAngleDeg,
        });
        const fresh = rotationBetween(shown, args.target);
        // `fresh` is null only when the pose already equals the target, which can
        // happen if the interrupted ramp had in fact reached it.
        if (!fresh) return null;
        return {
            base: shown,
            target: args.target,
            axis: fresh.axis,
            fromDeg: 0,
            toDeg: fresh.angle,
        };
    }

    return {
        base: args.rendered,
        target: args.target,
        axis: step.axis,
        fromDeg: 0,
        toDeg: step.angle,
    };
}

/** Mirrors `rotateViewLeft` in `navigation.ts`. */
export function stepLeft(o: Orientation): Orientation {
    return {
        viewForward: { ...o.viewRight },
        viewRight: negate3(o.viewForward),
        viewUp: { ...o.viewUp },
    };
}

/** Mirrors `rotateViewRight` in `navigation.ts`. */
export function stepRight(o: Orientation): Orientation {
    return {
        viewForward: negate3(o.viewRight),
        viewRight: { ...o.viewForward },
        viewUp: { ...o.viewUp },
    };
}

/** Mirrors `rotateViewUp` in `navigation.ts`. */
export function stepUp(o: Orientation): Orientation {
    return {
        viewForward: { ...o.viewUp },
        viewUp: negate3(o.viewForward),
        viewRight: { ...o.viewRight },
    };
}

/** Mirrors `rotateViewDown` in `navigation.ts`. */
export function stepDown(o: Orientation): Orientation {
    return {
        viewForward: negate3(o.viewUp),
        viewUp: { ...o.viewForward },
        viewRight: { ...o.viewRight },
    };
}

/** Every orientation reachable from the identity by the four steps. */
export function reachableOrientations(): Orientation[] {
    const key = (o: Orientation): string =>
        [o.viewRight, o.viewUp, o.viewForward].map(v => `${v.x},${v.y},${v.z}`).join('|');

    const seen = new Map<string, Orientation>([[key(IDENTITY_ORIENTATION), IDENTITY_ORIENTATION]]);
    const queue: Orientation[] = [IDENTITY_ORIENTATION];
    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const step of [stepLeft, stepRight, stepUp, stepDown]) {
            const next = step(current);
            if (!seen.has(key(next))) {
                seen.set(key(next), next);
                queue.push(next);
            }
        }
    }
    return [...seen.values()];
}
