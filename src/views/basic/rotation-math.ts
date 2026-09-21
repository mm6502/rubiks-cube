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
// and R is always a 90° rotation about one of the six signed world axes (±X, ±Y,
// ±Z) — never a fixed axis, which is why the animation's axis has to be derived
// from state on every rotation rather than hard-coded. Over all 24 × 24 pairs all
// six are reachable; the four single-step gestures alone reach only ±X and ±Y,
// because none of them rolls about the view normal.
//
// This module is deliberately free of DOM and of the view's state object: the
// vectors in, a rotation out. That makes the claim above testable exhaustively
// over all 24 reachable orientations × 4 rotations instead of spot-checked.
import { Axis, type Vector3 } from '@/cube/types';
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
 * The 3×3 matrix the app's `matrix3d(...)` string produces.
 *
 * This is the single most error-prone thing in the module, so it is spelled out.
 * `rendering.ts` writes
 *
 *   matrix3d(vR.x, vU.x, vF.x, 0,  vR.y, vU.y, vF.y, 0,  vR.z, vU.z, vF.z, 0,  0,0,0,1)
 *
 * CSS accepts those sixteen arguments **column by column**, so the first four form the
 * first column. That means the matrix is
 *
 *        ⎡ vR.x  vR.y  vR.z ⎤
 *   M =  ⎢ vU.x  vU.y  vU.z ⎥
 *        ⎣ vF.x  vF.y  vF.z ⎦
 *
 * — the orientation vectors are its ROWS.
 *
 * The trap: "the arguments are column-major" is true of the storage order, and it is
 * easy to slide from that to "the vectors are the columns", which is the *transpose* of
 * the real matrix. Since the three vectors form an orthonormal set, that transpose is
 * also the inverse, so every construction built on it stays internally consistent and
 * still describes the opposite rotation. That is exactly how the original bug shipped:
 * the animation rendered the inverse of the intended turn and the settled bake then
 * snapped to the right one, producing a half-turn flip at the end of every rotation.
 * Confirmed against the DOM's own transform parser — see
 * `scripts/scratch-debug/probe-need.mjs` and the "reproduces the matrix3d string" test.
 */
const cssMatrix = (o: Orientation): number[][] => [
    [o.viewRight.x, o.viewRight.y, o.viewRight.z],
    [o.viewUp.x, o.viewUp.y, o.viewUp.z],
    [o.viewForward.x, o.viewForward.y, o.viewForward.z],
];

/**
 * The inverse of {@link cssMatrix}: an orientation's vectors are the matrix's rows, so
 * they are read back out one row at a time.
 */
const orientationFromCssMatrix = (m: number[][]): Orientation => ({
    viewRight: { x: m[0][0], y: m[0][1], z: m[0][2] },
    viewUp: { x: m[1][0], y: m[1][1], z: m[1][2] },
    viewForward: { x: m[2][0], y: m[2][1], z: m[2][2] },
});

const multiply = (a: number[][], b: number[][]): number[][] =>
    a.map(row => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));

const transpose = (m: number[][]): number[][] => [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
];

/**
 * The model→CSS flip, `A = diag(1, −1, −1)`.
 *
 * CSS negates model Y and Z (`screen_y = −model_y`, `screen_z = −model_z`), so the
 * basis that reaches the screen is `M · A`. `A` is its own inverse.
 */
const CSS_FLIP: number[][] = [
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
];

/**
 * Compute `M' · Mᵀ` for two orientations, where `M` is the matrix the app's
 * `matrix3d(...)` string produces (its rows are the orientation vectors).
 *
 * Because a transform is composed as `tilt · S · M`, the rotation the animation slot
 * must supply is `S = M' · Mᵀ` — the target basis times the inverse of the one already
 * on screen. Since `M` is orthogonal, `Mᵀ` is that inverse.
 */
export function relativeRotation(prev: Orientation, next: Orientation): number[][] {
    const a = cssMatrix(next);
    const b = cssMatrix(prev);
    // Mᵀ's rows are M's columns, so element [i][j] is the dot of a's row i with b's
    // row j.
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
 *   a half turn is the same either way). The axis is recovered from the diagonal,
 *   which gives |nᵢ| only, with the relative signs taken from the off-diagonal
 *   products `R[i][j] = 2·nᵢ·nⱼ`; a single overall sign flip is a no-op because
 *   `n` and `−n` are the same half turn.
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
        let x = Math.sqrt(Math.max(0, (r[0][0] + 1) / 2));
        let y = Math.sqrt(Math.max(0, (r[1][1] + 1) / 2));
        let z = Math.sqrt(Math.max(0, (r[2][2] + 1) / 2));

        // The diagonal only gives magnitudes. A single overall sign flip is a
        // no-op (n and −n are the same 180° rotation), but a MIXED sign — e.g.
        // (1,−1,0)/√2 versus (1,1,0)/√2 — is a genuinely different axis, and that
        // relative sign has to come from the off-diagonal products, where
        // R[i][j] = 2·nᵢ·nⱼ at θ = 180°. Anchor x ≥ 0 (an arbitrary but stable
        // choice of the two equivalent signs) and read y, z relative to it; if x
        // is ~0, anchor y instead and read z relative to that.
        if (x > 1e-6) {
            if (r[0][1] + r[1][0] < 0) y = -y;
            if (r[0][2] + r[2][0] < 0) z = -z;
        } else if (y > 1e-6) {
            if (r[1][2] + r[2][1] < 0) z = -z;
        }
        // else x = y = 0 — only z survives, and n = −n is the same rotation.

        const axis = snapAxis({ x, y, z });
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
 * A turn of one layer, signed about the **positive** unit axis.
 *
 * Kept separate from {@link AxisAngle} because the two carry the sign differently:
 * a rotation of −Y by +90 and one of +Y by −90 are the same matrix, so `AxisAngle`
 * folds the sign into a negated axis and reports a principal angle in [0, 180]. The
 * notation convention needs the opposite spelling — which *one* of `E`/`E'` was
 * meant — so the sign has to survive as a sign rather than as an axis.
 */
export type LayerTurn = {
    /** The cube axis the layer turns about. */
    axis: Axis;
    /** Degrees, clockwise-positive about the positive axis: +90, −90, or 180. */
    angle: number;
};

/**
 * The layer turn that turns the cube the **same way as a view rotation** does.
 *
 * A view rotation replaces the orientation basis `M` with `M'`. The cube is rendered
 * as `M · A`, so on screen that turn is `(M'·A)·(M·A)ᵀ`, and the layer turn that
 * produces the same visible motion about the cube's own axes is that same rotation
 * expressed in model space, i.e. conjugated back by `A` on both sides:
 *
 *   Q = A · Mᵀ · M' · A
 *
 * (derived by requiring `Q·p` and the view turn to move a point `p` identically once
 * projected to the screen; equivalently `Q = (M·A)ᵀ · (M'·A)`, which is the form
 * computed below).
 *
 * This is deliberately *not* "the drag a user would make on the face that happens to
 * be showing". A view rotation is a motion of the whole cube, and the requirement is
 * that `Ctrl+Arrow` turn a layer the same way the matching view rotation turns the
 * cube — so a screen-right press and a screen-right view turn must agree in **sense**, at
 * every orientation, whatever face the selection sits on. Reading the turn off the
 * face instead makes the meaning of the key depend on which face is under the cursor:
 * measured at the orientation reached by `Alt+Right, Alt+Down`, that spelling turned
 * `S` (screen-down) where the view turn required `M`.
 *
 * Anchored against the four shipped base-orientation behaviours (`Ctrl+Right` → `E`,
 * `Ctrl+Left` → `E'`, `Ctrl+Up` → `M'`, `Ctrl+Down` → `M`) and against the layer and
 * prime choices the existing top-row/bottom-row tests pin down.
 */
export function sliceRotationForViewTurn(current: Orientation, turned: Orientation): LayerTurn {
    const screen = multiply(cssMatrix(current), CSS_FLIP);
    const screenTurned = multiply(cssMatrix(turned), CSS_FLIP);
    const { axis, angle } = axisAngleFromMatrix(multiply(transpose(screen), screenTurned));

    const name = axis.x !== 0 ? Axis.X : axis.y !== 0 ? Axis.Y : Axis.Z;
    const unit = axis.x !== 0 ? axis.x : axis.y !== 0 ? axis.y : axis.z;

    // `axisAngleFromMatrix` reports the principal angle in [0, 180] and puts the sign
    // in the axis, so a turn about −Y by +90 arrives as axis −Y, angle 90. Multiplying
    // the principal angle by the axis component recovers the signed turn.
    const principal = Math.round(angle / 90) * 90;
    if (principal === 180) return { axis: name, angle: 180 };
    return { axis: name, angle: principal * unit };
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
