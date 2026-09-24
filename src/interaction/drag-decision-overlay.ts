/**
 * The drag-decision indicator: the dashed cross or single line a view shows at
 * the pointer while a gesture is in progress, so the user can see which way it
 * is resolving before committing.
 *
 * Two layers live here, and the split matters:
 *
 * - **Geometry** — {@link computeCrossArms} and {@link placeLine} — is pure and
 *   coordinate-space-agnostic, so every view shares it. The Basic and Flat views
 *   work in host pixels; the Circular view works in its SVG's viewBox units.
 *   They disagree about *where* the numbers come from, never about the shape, so
 *   only the shape is shared.
 * - **The overlay** — {@link createDragDecisionOverlay} — is the pixel-space
 *   convenience wrapper the Basic and Flat views both use verbatim. The Circular
 *   view keeps its own container (its arms live inside the cube's existing SVG
 *   as a `<g>`, not a separate absolutely-positioned `<svg>`), but draws them
 *   with the same two geometry functions, so the three views cannot drift.
 */
import { normalize2 } from '@/cube/utils/math';
import type { Point2D } from '@/types/geometry';

/** A face's screen-space orientation: which way is "up" and "right" on it. */
export type FaceScreenBasis = {
    upDir: Point2D;
    rightDir: Point2D;
};

/** Cross arm length for the Floating layout (px from the origin). */
export const DRAG_CROSS_ARM_LENGTH_FLOATING = 34;
/** Cross arm length for the Tabbed layout, whose panel is narrower. */
export const DRAG_CROSS_ARM_LENGTH_TABBED = 64;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The two arm directions of the decision cross.
 *
 * The arms are the *boundaries* between the four drag zones, not the axes
 * themselves: they are the bisectors between the face's up and right directions,
 * so a drag that has just crossed an arm is about to change which move is
 * inferred. When a bisector is degenerate (up and right anti-parallel, which a
 * real face never is) the corresponding input direction is used, so the caller
 * always gets a drawable arm rather than a NaN.
 */
export function computeCrossArms(basis: FaceScreenBasis): { arm1: Point2D; arm2: Point2D } {
    const arm1 =
        normalize2({
            x: basis.upDir.x + basis.rightDir.x,
            y: basis.upDir.y + basis.rightDir.y,
        }) ?? basis.upDir;
    const arm2 =
        normalize2({
            x: basis.upDir.x - basis.rightDir.x,
            y: basis.upDir.y - basis.rightDir.y,
        }) ?? basis.rightDir;
    return { arm1, arm2 };
}

/**
 * Position an SVG `<line>` symmetrically about `center` along `dir`, extending
 * `arm` units in each direction.
 *
 * Deliberately in whatever coordinate space the caller passes: the Basic and
 * Flat views hand it host pixels, the Circular view hands it viewBox units. The
 * operation is the same in both, which is why it is one function.
 */
export function placeLine(line: SVGLineElement, center: Point2D, dir: Point2D, arm: number): void {
    line.setAttribute('x1', String(center.x - dir.x * arm));
    line.setAttribute('y1', String(center.y - dir.y * arm));
    line.setAttribute('x2', String(center.x + dir.x * arm));
    line.setAttribute('y2', String(center.y + dir.y * arm));
}

/**
 * Derive a face's screen-space basis from three of its stickers.
 *
 * Three points are enough: the top-left, its right-hand neighbour, and the
 * sticker directly below it. Measuring them rather than deriving the basis from
 * the view's orientation vectors is deliberate — it reads the pose the browser
 * actually painted, so it stays correct through whatever transforms a view
 * applies (the Basic view's 3D tilt and pitch, the Flat view's 90° layout
 * rotation) without either view restating that math.
 *
 * Returns `undefined` when any probe is missing or the projected span collapses
 * (a face seen exactly edge-on, or degenerate rects as in a bare jsdom), so
 * callers can hide the indicator rather than draw a NaN arm.
 *
 * @param topLeft - Sticker at grid (0, 0).
 * @param rightOfTopLeft - Sticker at grid (0, 1).
 * @param belowTopLeft - Sticker at grid (1, 0).
 */
export function computeFaceScreenBasis(
    topLeft: HTMLElement,
    rightOfTopLeft: HTMLElement,
    belowTopLeft: HTMLElement
): FaceScreenBasis | undefined {
    const center = (el: HTMLElement): Point2D => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    const c00 = center(topLeft);
    const c01 = center(rightOfTopLeft);
    const c10 = center(belowTopLeft);

    // Screen Y grows downward, so "row below" points screen-down; the face's up
    // direction is that vector negated.
    const rightDir = normalize2({ x: c01.x - c00.x, y: c01.y - c00.y });
    const upDir = normalize2({ x: c00.x - c10.x, y: c00.y - c10.y });
    if (!rightDir || !upDir) return undefined;

    return { upDir, rightDir };
}

/**
 * Create a viewport-anchored SVG holding `lineCount` lines, initially hidden.
 *
 * `position: fixed` at the viewport origin and sized to the viewport, appended to
 * `document.body` rather than to any view. That is what keeps the lines
 * unclipped and at a constant apparent size: inside a view's own subtree they are
 * cut off by whatever clips that subtree and, in the Circular view, scaled with
 * the SVG's zoom.
 *
 * Because the SVG has no `viewBox` and sits at the viewport origin, one user unit
 * is one CSS pixel and viewport coordinates map 1:1 — so any length passed in is
 * a screen length, and no host-rect arithmetic is needed.
 *
 * @param lineCount - How many lines to create.
 * @param className - The CSS-module class for the lines.
 * @param zIndex - Stacking order. Both overlays default to living on the body, so
 *   the order they are appended in would otherwise decide which paints on top.
 */
function createViewportLineLayer(
    lineCount: number,
    className: string,
    zIndex: number
): { element: SVGSVGElement; lines: SVGLineElement[] } {
    const element = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    element.style.cssText = `position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;overflow:visible;z-index:${zIndex};`;
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('visibility', 'hidden');

    const lines: SVGLineElement[] = [];
    for (let i = 0; i < lineCount; i += 1) {
        const line = document.createElementNS(SVG_NS, 'line') as SVGLineElement;
        line.classList.add(className);
        if (i > 0) line.setAttribute('visibility', 'hidden');
        element.appendChild(line);
        lines.push(line);
    }

    return { element, lines };
}

/**
 * A pair of parallel guide rails drawn at the pointer, both running along a
 * screen direction and offset either side of it.
 *
 * This is the Circular view's "fretboard". It lives here rather than in that view
 * for the same reason the decision cross does: it has to be a fixed viewport
 * layer, and the *only* part that is view-specific is the CSS class.
 */
export type ParallelGuideOverlay = {
    /** The overlay's root element. Callers append it to `document.body`. */
    readonly element: SVGSVGElement;
    /** Show both rails, `halfGap` screen pixels either side of the pointer. */
    show(dir: Point2D, clientX: number, clientY: number, halfGap: number, arm: number): void;
    /** Hide the rails. */
    hide(): void;
    /** Detach the element. */
    remove(): void;
};

/**
 * Create the parallel-guide overlay — the two rails a fretboard drag shows.
 *
 * `dir` is the direction the rails run, in screen space; the offset is taken
 * perpendicular to it, so the caller never has to build a perpendicular itself
 * (and the two rails cannot accidentally be drawn non-parallel).
 *
 * Deliberately drawn *below* the decision indicator: the rails say "you are
 * tracking this band", the arms say "this is the move you are about to commit",
 * and the latter is the one that must never be obscured.
 *
 * @param className - The CSS-module class for the rails.
 * @param zIndex - Stacking order; must be below the decision overlay's.
 */
export function createParallelGuideOverlay(className: string, zIndex = 9999): ParallelGuideOverlay {
    const { element, lines } = createViewportLineLayer(2, className, zIndex);
    const [rail1, rail2] = lines;

    return {
        element,
        show(dir, clientX, clientY, halfGap, arm) {
            const perp = { x: -dir.y, y: dir.x };
            placeLine(
                rail1,
                { x: clientX + perp.x * halfGap, y: clientY + perp.y * halfGap },
                dir,
                arm
            );
            placeLine(
                rail2,
                { x: clientX - perp.x * halfGap, y: clientY - perp.y * halfGap },
                dir,
                arm
            );
            element.removeAttribute('visibility');
        },
        hide() {
            element.setAttribute('visibility', 'hidden');
        },
        remove() {
            element.remove();
        },
    };
}

/**
 * A view's drag-decision indicator: a fixed, viewport-sized SVG holding two
 * lines, with the operations the handlers need.
 */
export type DragDecisionOverlay = {
    /**
     * The overlay's root element.
     *
     * Callers append this to `document.body` (not to their own view), because the
     * whole point is that no view's subtree can clip it.
     */
    readonly element: SVGSVGElement;
    /** Show the two-armed cross at a viewport position. */
    showCross(basis: FaceScreenBasis, clientX: number, clientY: number): void;
    /** Show a single radial line along a screen direction. */
    showLine(dir: Point2D, clientX: number, clientY: number): void;
    /** Hide the indicator. */
    hide(): void;
    /** Detach the element. */
    remove(): void;
};

/**
 * Create the overlay.
 *
 * The root is `position: fixed` at the viewport origin and sized to the viewport,
 * and it is appended to `document.body` rather than to any view. That is what
 * keeps the arms unclipped and at a constant apparent size: inside a view's own
 * subtree the indicator was cut off by whatever clips that subtree (the Basic
 * cube's 3D transform, a panel with `overflow: hidden`) and, in the Circular
 * view, scaled with the SVG's zoom — measured there at 14px for an arm that is
 * 70px at 1x.
 *
 * Because the SVG has no `viewBox` and sits at the viewport origin, one user unit
 * is one CSS pixel and viewport coordinates map 1:1 — so the arm length is a
 * screen length, and no host-rect arithmetic is needed.
 *
 * @param armClassName - The CSS-module class for the arms. Passed in because the
 *   views own their own stylesheets; the geometry below is what is shared.
 * @param getArmLength - Current arm length in screen pixels.
 */
export function createDragDecisionOverlay(
    armClassName: string,
    getArmLength: () => number
): DragDecisionOverlay {
    const { element, lines } = createViewportLineLayer(2, armClassName, 10000);
    const [primary, secondary] = lines;

    return {
        element,
        showCross(basis, clientX, clientY) {
            const { arm1, arm2 } = computeCrossArms(basis);
            const center = { x: clientX, y: clientY };
            const armLength = getArmLength();
            placeLine(primary, center, arm1, armLength);
            placeLine(secondary, center, arm2, armLength);
            secondary.removeAttribute('visibility');
            element.removeAttribute('visibility');
        },
        showLine(dir, clientX, clientY) {
            placeLine(primary, { x: clientX, y: clientY }, dir, getArmLength());
            secondary.setAttribute('visibility', 'hidden');
            element.removeAttribute('visibility');
        },
        hide() {
            element.setAttribute('visibility', 'hidden');
        },
        remove() {
            element.remove();
        },
    };
}
