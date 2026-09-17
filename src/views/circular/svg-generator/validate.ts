import { Axis } from '@/cube/types';

import {
    ALL_FACES,
    CircularSvgParameters,
    axisCentres,
    axisCircleId,
    faceEllipseGeometry,
    outerRadius,
    ringRadius,
    stickerId,
    stickerPosition,
} from './geometry';
import { GhostSpec } from './ghosts';

/**
 * Pre-write validation.
 *
 * The generator refuses to emit an SVG that is geometrically illegal or that the
 * view cannot consume. Two things are worth stating plainly, because they are
 * the reason this module exists at all:
 *
 * 1. The geometric invariants (I1-I5) constrain ring intersections, sticker
 *    clearance, and sticker radius *only*. They say nothing about face ellipses,
 *    mask holes, the ghost layer, or the element contract the runtime resolves —
 *    so a clean invariant run is not evidence an SVG is loadable.
 * 2. A violation is a generator failure to fix, never a threshold to relax.
 *
 * The element contract mirrors what `src/views/circular/*` actually queries at
 * runtime. It is asserted against the serialised markup, so it catches a
 * generator-side omission rather than re-deriving the same values.
 */

export interface ValidationIssue {
    /** Which group the failure belongs to. */
    group: 'invariants' | 'conformance' | 'ellipse' | 'ghost';
    message: string;
}

export interface ValidationInput {
    cubeSize: number;
    params: CircularSvgParameters;
    /** Serialised SVG markup. */
    svg: string;
    /** Ghosts that were generated, if any. */
    ghosts?: GhostSpec[];
}

/** Tolerance matching the runtime's own `isPointOnCircle` default. */
const RUNTIME_TOLERANCE = 2;

/**
 * Validate a generated SVG. Returns every issue found rather than stopping at
 * the first, so one run reports the full picture.
 */
export function validate(input: ValidationInput): ValidationIssue[] {
    return [
        ...validateInvariants(input.cubeSize, input.params),
        ...validateConformance(input),
        ...validateEllipses(input.cubeSize, input.params),
        ...validateGhosts(input),
    ];
}

/**
 * I2, I4, I5 and I3 from the geometry spec.
 *
 * I2 gives the algebraic window both constraints share:
 *   `(N-1) * Δr < d < 2 * r_min`
 * I5 bounds the sticker against the gap between rings.
 * I3 and I4 have no closed form, so they are checked numerically.
 */
export function validateInvariants(
    cubeSize: number,
    params: CircularSvgParameters
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const { triangleSide: d, innerRadius: rMin, ringStep, stickerRadius } = params;

    // I2b — outer rings must still intersect.
    if ((cubeSize - 1) * ringStep >= d) {
        issues.push({
            group: 'invariants',
            message: `I2 violated: (N-1)*ringStep = ${(cubeSize - 1) * ringStep} must be < triangleSide = ${d}`,
        });
    }

    // I2a — inner rings must intersect.
    if (d >= 2 * rMin) {
        issues.push({
            group: 'invariants',
            message: `I2 violated: triangleSide = ${d} must be < 2*innerRadius = ${2 * rMin}`,
        });
    }

    // I5 — a sticker must fit within a ring gap.
    if (2 * stickerRadius >= ringStep) {
        issues.push({
            group: 'invariants',
            message: `I5 violated: 2*stickerRadius = ${2 * stickerRadius} must be < ringStep = ${ringStep}`,
        });
    }

    // The numerical checks below presuppose the algebraic ones held.
    if (issues.length > 0) return issues;

    // I4 — adjacent stickers on a face must not overlap.
    const clearance = minimumStickerClearance(cubeSize, params);
    if (clearance <= 2 * stickerRadius) {
        issues.push({
            group: 'invariants',
            message: `I4 violated: minimum sticker clearance ${clearance.toFixed(3)} must exceed 2*stickerRadius = ${2 * stickerRadius}`,
        });
    }

    // I3 — no sticker may resolve to more than its own two rings.
    for (const face of ALL_FACES) {
        for (let position = 0; position < cubeSize * cubeSize; position++) {
            const point = stickerPosition(face, position, cubeSize, params);
            const rings = countRingsAtPoint(point, cubeSize, params);
            if (rings !== 2) {
                issues.push({
                    group: 'invariants',
                    message: `I3 violated: ${stickerId(face, position)} lies on ${rings} rings, expected exactly 2`,
                });
            }
        }
    }

    return issues;
}

/** Smallest distance between any two sticker centres on the same face. */
export function minimumStickerClearance(cubeSize: number, params: CircularSvgParameters): number {
    let minimum = Number.POSITIVE_INFINITY;

    for (const face of ALL_FACES) {
        const positions = Array.from({ length: cubeSize * cubeSize }, (_, i) =>
            stickerPosition(face, i, cubeSize, params)
        );
        for (let a = 0; a < positions.length; a++) {
            for (let b = a + 1; b < positions.length; b++) {
                const distance = Math.hypot(
                    positions[a].x - positions[b].x,
                    positions[a].y - positions[b].y
                );
                minimum = Math.min(minimum, distance);
            }
        }
    }

    return minimum;
}

/** How many axis rings a point resolves to, within the runtime's tolerance. */
function countRingsAtPoint(
    point: { x: number; y: number },
    cubeSize: number,
    params: CircularSvgParameters
): number {
    const centres = axisCentres(params);
    let count = 0;

    for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
        for (let layer = 0; layer < cubeSize; layer++) {
            const centre = centres[axis];
            const radius = ringRadius(axis, layer, cubeSize, params);
            const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
            if (Math.abs(distance - radius) <= RUNTIME_TOLERANCE) count++;
        }
    }

    return count;
}

/**
 * The element contract the Circular view resolves at runtime.
 *
 * Each assertion exists because some module queries it — this is not a
 * stylistic checklist. Missing any of them means the view loads the asset and
 * then fails, or silently loses behaviour.
 */
export function validateConformance(input: ValidationInput): ValidationIssue[] {
    const { cubeSize, svg } = input;
    const issues: ValidationIssue[] = [];
    const fail = (message: string) => issues.push({ group: 'conformance', message });

    if (!svg.includes(`data-cube-size="${cubeSize}"`)) {
        fail(`root is missing data-cube-size="${cubeSize}" — initialization throws without it`);
    }

    // Axis circles: parseAxisCircles throws when none carry data-axis.
    const axisCircles = svg.match(/<circle[^>]*data-axis="[XYZ]"[^>]*\/>/g) ?? [];
    if (axisCircles.length !== cubeSize * 3) {
        fail(`expected ${cubeSize * 3} axis circles, found ${axisCircles.length}`);
    }
    for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
        for (let layer = 0; layer < cubeSize; layer++) {
            if (!svg.includes(`id="${axisCircleId(axis, layer)}"`)) {
                fail(`missing axis circle id "${axisCircleId(axis, layer)}"`);
            }
        }
    }

    // Sticker circles: the sticker lookup map is built from circle.sticker.
    const stickers = svg.match(/<circle[^>]*class="sticker"[^>]*\/>/g) ?? [];
    if (stickers.length !== cubeSize * cubeSize * 6) {
        fail(`expected ${cubeSize * cubeSize * 6} sticker circles, found ${stickers.length}`);
    }
    for (const face of ALL_FACES) {
        for (let position = 0; position < cubeSize * cubeSize; position++) {
            const id = stickerId(face, position);
            if (!svg.includes(`id="${id}"`)) fail(`missing sticker id "${id}"`);
        }
    }

    // Face ellipses: the halo and overlay copy geometry from these by id.
    for (const face of ALL_FACES) {
        if (!svg.includes(`id="${face}-face-ellipse"`)) {
            fail(`missing face ellipse id "${face}-face-ellipse"`);
        }
    }

    // Face labels: the dead-zone triangle is derived from exactly these three,
    // and label tilt handles all six.
    for (const face of ALL_FACES) {
        if (!svg.includes(`id="face-label-${face}"`)) {
            fail(`missing id "face-label-${face}"`);
        }
    }
    for (const face of ['L', 'B', 'D']) {
        if (!svg.includes(`id="face-label-${face}"`)) {
            fail(`missing id "face-label-${face}" — the interaction dead-zone needs it`);
        }
    }

    // Ghost layer: rendering and animation query these exact class names.
    if (!svg.includes('class="ghost-sticker-wrapper"')) {
        fail('missing .ghost-sticker-wrapper — ghost visibility toggle queries it');
    }
    const ghostCircles = svg.match(/<circle class="ghost-sticker"[^>]*\/>/g) ?? [];
    if (ghostCircles.length === 0) {
        fail('missing circle.ghost-sticker elements');
    }

    // Label mask: one hole per axis label, else labels are painted over.
    const maskHoles = svg.match(/<rect id="mask-[xyz]-\d+"[^>]*\/>/g) ?? [];
    if (maskHoles.length !== cubeSize * 3) {
        fail(`expected ${cubeSize * 3} label-mask holes, found ${maskHoles.length}`);
    }

    return issues;
}

/** Face ellipses must exist, be non-degenerate, and stay inside the viewBox. */
export function validateEllipses(
    cubeSize: number,
    params: CircularSvgParameters
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const [viewX, viewY, viewWidth, viewHeight] = params.viewBox.split(/\s+/).map(Number);

    for (const face of ALL_FACES) {
        const ellipse = faceEllipseGeometry(face, cubeSize, params);

        if (!(ellipse.rx > 0) || !(ellipse.ry > 0)) {
            issues.push({
                group: 'ellipse',
                message: `face ${face} ellipse has non-positive semi-axes (${ellipse.rx}, ${ellipse.ry})`,
            });
            continue;
        }

        // The ellipse's extent along its rotated major axis must stay on canvas.
        const reach = Math.max(ellipse.rx, ellipse.ry);
        const insideX = ellipse.cx - reach >= viewX && ellipse.cx + reach <= viewX + viewWidth;
        const insideY = ellipse.cy - reach >= viewY && ellipse.cy + reach <= viewY + viewHeight;

        if (!insideX || !insideY) {
            issues.push({
                group: 'ellipse',
                message: `face ${face} ellipse at (${ellipse.cx}, ${ellipse.cy}) r=${reach} extends outside viewBox "${params.viewBox}"`,
            });
        }
    }

    return issues;
}

/**
 * Ghost-layer checks beyond the structural rule.
 *
 * The structural rule (multiplicity, axis, source, ring tag) is asserted by the
 * ghost module's own tests against the reference. Here the checks are the ones
 * that can only fail for a *different* size: a ghost must reference a real
 * sticker, must sit on a ring that exists, and must not land on top of its own
 * target.
 */
export function validateGhosts(input: ValidationInput): ValidationIssue[] {
    const { cubeSize, params, ghosts } = input;
    const issues: ValidationIssue[] = [];
    if (!ghosts || ghosts.length === 0) return issues;

    const centres = axisCentres(params);
    const expectedCount = countExpectedGhosts(cubeSize);

    if (ghosts.length !== expectedCount) {
        issues.push({
            group: 'ghost',
            message: `expected ${expectedCount} ghosts for size ${cubeSize}, generated ${ghosts.length}`,
        });
    }

    for (const ghost of ghosts) {
        const radius = params.innerRadius + ghost.rank * params.ringStep;

        if (ghost.rank < 0 || ghost.rank >= cubeSize) {
            issues.push({
                group: 'ghost',
                message: `${ghost.target} -> ${ghost.source} has out-of-range ring rank ${ghost.rank}`,
            });
        }

        const centre = centres[ghost.axis];
        const distance = Math.hypot(ghost.x - centre.x, ghost.y - centre.y);
        if (Math.abs(distance - radius) > 0.5) {
            issues.push({
                group: 'ghost',
                message: `${ghost.target} -> ${ghost.source} is off its own ring (distance ${distance.toFixed(2)}, radius ${radius})`,
            });
        }

        if (distance > outerRadius(cubeSize, params) + params.stickerRadius) {
            issues.push({
                group: 'ghost',
                message: `${ghost.target} -> ${ghost.source} lies beyond the outermost ring`,
            });
        }

        // A ghost that lands exactly on its target would be invisible.
        const target = stickerPosition(
            ghost.face,
            Number(ghost.target.split('-')[2]),
            cubeSize,
            params
        );
        const separation = Math.hypot(ghost.x - target.x, ghost.y - target.y);
        if (separation < params.stickerRadius * 0.5) {
            issues.push({
                group: 'ghost',
                message: `${ghost.target} -> ${ghost.source} overlaps its target (separation ${separation.toFixed(2)})`,
            });
        }
    }

    return issues;
}

/**
 * Expected ghost count for a size, from cubie classes.
 *
 * Every sticker with two grid edges (a corner) contributes 2 ghosts, one edge
 * contributes 1, and a face centre contributes 0.
 */
export function countExpectedGhosts(cubeSize: number): number {
    if (cubeSize < 2) return 0;

    const perFace = cubeSize * cubeSize;
    let corners = 0;
    let edges = 0;

    for (let position = 0; position < perFace; position++) {
        const row = Math.floor(position / cubeSize);
        const col = position % cubeSize;
        const edgeRows = row === 0 || row === cubeSize - 1;
        const edgeCols = col === 0 || col === cubeSize - 1;

        if (edgeRows && edgeCols) corners++;
        else if (edgeRows || edgeCols) edges++;
    }

    return ALL_FACES.length * (corners * 2 + edges * 1);
}

/** Format issues into a single readable report. */
export function formatIssues(issues: ValidationIssue[]): string {
    return issues.map(issue => `  [${issue.group}] ${issue.message}`).join('\n');
}

/** Convenience predicate for callers that only need pass/fail. */
export function isValid(input: ValidationInput): boolean {
    return validate(input).length === 0;
}
