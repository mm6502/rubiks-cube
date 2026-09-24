/**
 * Screen-space gesture feedback: the indicators a view shows at the pointer while
 * a drag is in progress, so the user can see what is about to be committed before
 * they let go.
 *
 * Two concerns live here, and the split matters:
 *
 * - **Geometry** — {@link computeCrossArms}, {@link placeLine} and
 *   {@link computeFaceScreenBasis} — is pure and coordinate-space-agnostic, so
 *   every view shares it. The Basic and Flat views work in host pixels; the
 *   Circular view works in its SVG's viewBox units. They disagree about *where*
 *   the numbers come from, never about the shape, so only the shape is shared.
 * - **The viewport layers** — {@link createCancelZoneOverlay},
 *   {@link createParallelGuideOverlay} and {@link createDragDecisionOverlay} —
 *   are fixed, viewport-sized SVGs on `document.body`, with one user unit equal
 *   to one CSS pixel.
 *
 * They all live on the body for the same reason: a view's own subtree is not a
 * neutral canvas. It clips at whatever boundary it declares (`overflow: hidden`,
 * or a root `<svg>`'s element box) and scales with whatever transform it applies,
 * so feedback drawn there was cut off and shrunk exactly when the view was zoomed
 * out or the gesture was made near a panel edge. Measured in the Circular view
 * before these layers: a cross arm drawn 70px at 1x rendered 14px at 0.2x, and a
 * cancel-zone ring for a gesture in the empty border around the zoomed-out canvas
 * fell entirely outside the canvas box and was clipped away.
 *
 * The layers stack in a defined order — see the `*_Z_INDEX` constants — so the
 * more specific a hint is, the closer to the user it paints.
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
 * Stacking order for the gesture-feedback layers.
 *
 * All of them are `position: fixed` on the body, so the order they happen to be
 * appended in would otherwise decide which paints on top. These make the
 * intended order explicit and assertable: the threshold ring is context, the
 * rails show the band being tracked, and the decision arms show what is about to
 * be committed — so each layer must outrank the one it is clarifying.
 */
export const CANCEL_ZONE_Z_INDEX = 9989;
/** Rails: the band a fretboard drag is tracking. Above the threshold ring. */
export const PARALLEL_GUIDE_Z_INDEX = 9999;
/** Decision arms: what the gesture will commit. Above everything else. */
export const DRAG_DECISION_Z_INDEX = 10000;

/**
 * Create the viewport-anchored frame all gesture-feedback layers are drawn in.
 *
 * `position: fixed` at the viewport origin and sized to the viewport, appended to
 * `document.body` rather than to any view. That is what keeps the contents
 * unclipped and at a constant apparent size: inside a view's own subtree they are
 * cut off by whatever clips that subtree and, in the Circular view, scaled with
 * the SVG's zoom.
 *
 * Because the SVG has no `viewBox` and sits at the viewport origin, one user unit
 * is one CSS pixel and viewport coordinates map 1:1 — so any length passed in is
 * a screen length, and no host-rect arithmetic is needed.
 *
 * Deliberately creates nothing but the frame. What goes inside it, and whether
 * each child starts visible, is the caller's business: a shared creator that
 * decided child visibility for its callers once silently cost the fretboard its
 * second rail. The root starts hidden, so showing the layer is always an explicit
 * act by whoever knows what the layer means.
 */
function createViewportRoot(zIndex: number): SVGSVGElement {
    const element = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    element.style.cssText = `position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;overflow:visible;z-index:${zIndex};`;
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('visibility', 'hidden');
    return element;
}

/**
 * A viewport-anchored SVG holding `lineCount` lines, all visible.
 *
 * The root starts hidden and every line inside it is created visible, so showing
 * the layer shows all of its lines. A caller that wants some of them hidden by
 * default (the decision cross, whose second arm is optional) hides them itself —
 * per-line visibility is a property of what the layer *means*, not of how many
 * lines it has. Encoding "hide all but the first" here instead was a real bug: it
 * silently cost the fretboard its second rail, because that caller only ever
 * un-hides the root.
 *
 * @param lineCount - How many lines to create.
 * @param className - The CSS-module class for the lines.
 * @param zIndex - Stacking order; see the `*_Z_INDEX` constants.
 */
function createViewportLineLayer(
    lineCount: number,
    className: string,
    zIndex: number
): { element: SVGSVGElement; lines: SVGLineElement[] } {
    const element = createViewportRoot(zIndex);

    const lines: SVGLineElement[] = [];
    for (let i = 0; i < lineCount; i += 1) {
        const line = document.createElementNS(SVG_NS, 'line') as SVGLineElement;
        line.classList.add(className);
        element.appendChild(line);
        lines.push(line);
    }

    return { element, lines };
}

/**
 * The circular commit-threshold indicator shown at pointer-down: the ring the
 * gesture must escape before a move is inferred instead of cancelled.
 *
 * Drawn on a viewport layer rather than inside the view's SVG, for two reasons
 * that both come from the same root cause — that a caller's SVG is not a neutral
 * canvas:
 *
 * - **Clipping.** A root `<svg>` clips to its own element box. In the Circular
 *   view that box is the *canvas*, which shrinks with the zoom and can be a small
 *   rectangle centred in a much larger panel — so a gesture started in the empty
 *   space around it drew its ring entirely outside the canvas and showed nothing
 *   at all. Diverging from the other feedback layers, which are unclipped, also
 *   looked arbitrary: the cross and rails survived a corner gesture while the
 *   ring vanished.
 * - **Stroke scaling.** A stroke width in user units is multiplied by the zoom, so
 *   one CSS declaration rendered a hairline at 0.2x (measured: 0.35px) and a heavy
 *   blob at 9.5x (measured: 16.7px). Here the width is pixels.
 *
 * The radius is a screen length by construction, so it needs no conversion: it is
 * exactly the commit threshold in pixels, which is the quantity the ring is
 * depicting.
 */
export type CancelZoneOverlay = {
    /** The overlay's root element. Callers append it to `document.body`. */
    readonly element: SVGSVGElement;
    /** Show the ring centred on a viewport point, with a radius in screen pixels. */
    show(clientX: number, clientY: number, radiusPx: number): void;
    /** Hide the ring. */
    hide(): void;
    /** Detach the element. */
    remove(): void;
};

/**
 * Create the commit-threshold ring.
 *
 * @param circleClassName - The CSS-module class for the ring.
 * @param zIndex - Stacking order; must be below the guide and decision layers.
 */
export function createCancelZoneOverlay(
    circleClassName: string,
    zIndex = CANCEL_ZONE_Z_INDEX
): CancelZoneOverlay {
    const element = createViewportRoot(zIndex);
    const circle = document.createElementNS(SVG_NS, 'circle') as SVGCircleElement;
    circle.classList.add(circleClassName);
    element.appendChild(circle);

    return {
        element,
        show(clientX, clientY, radiusPx) {
            circle.setAttribute('cx', String(clientX));
            circle.setAttribute('cy', String(clientY));
            circle.setAttribute('r', String(radiusPx));
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
export function createParallelGuideOverlay(
    className: string,
    zIndex = PARALLEL_GUIDE_Z_INDEX
): ParallelGuideOverlay {
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
    const { element, lines } = createViewportLineLayer(2, armClassName, DRAG_DECISION_Z_INDEX);
    const [primary, secondary] = lines;

    // The second arm is optional: this indicator is sometimes a two-armed cross
    // (a sticker's four drag zones) and sometimes a single radial line (a halo or
    // face-ellipse rotation). Both methods below therefore set its visibility
    // explicitly — `showCross` un-hides it, `showLine` hides it — so there is no
    // third state to establish up front, and the layer creator stays free of a
    // rule that would otherwise be wrong for its other caller.
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
