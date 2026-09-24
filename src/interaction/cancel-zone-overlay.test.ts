import { describe, expect, it } from 'vitest';

import {
    CANCEL_ZONE_Z_INDEX,
    DRAG_DECISION_Z_INDEX,
    PARALLEL_GUIDE_Z_INDEX,
    createCancelZoneOverlay,
    createDragDecisionOverlay,
    createParallelGuideOverlay,
} from './drag-decision-overlay';

// ── Helpers ─────────────────────────────────────────────────────────────────

function circleOf(element: SVGSVGElement): SVGCircleElement {
    const circle = element.querySelector('circle');
    if (!circle) throw new Error('overlay has no circle');
    return circle as SVGCircleElement;
}

// ── createCancelZoneOverlay ─────────────────────────────────────────────────

describe('createCancelZoneOverlay', () => {
    it('anchors the layer to the viewport rather than to a view', () => {
        // The regression: inside the Circular view's SVG the ring was clipped to the
        // canvas box (a root <svg> clips to its own element box). That box shrinks
        // with the zoom and can be a small rectangle centred in a much larger panel,
        // so a gesture in the empty space around it drew its ring where nothing could
        // be seen — while the cross and rails, already on the body, survived the very
        // same gesture. A fixed viewport layer is what makes the feedback consistent.
        const overlay = createCancelZoneOverlay('test-ring');
        const { style } = overlay.element;

        expect(style.position).toBe('fixed');
        expect(style.left).toBe('0px');
        expect(style.top).toBe('0px');
        expect(style.width).toBe('100vw');
        expect(style.height).toBe('100vh');
        expect(style.overflow).toBe('visible');
        expect(style.pointerEvents).toBe('none');
    });

    it('starts hidden so a later show is what makes it visible', () => {
        const overlay = createCancelZoneOverlay('test-ring');
        expect(overlay.element.getAttribute('visibility')).toBe('hidden');
    });

    it('is inert to the accessibility tree', () => {
        const overlay = createCancelZoneOverlay('test-ring');
        expect(overlay.element.getAttribute('aria-hidden')).toBe('true');
    });

    it('opens at the origin with no radius until it is shown', () => {
        const overlay = createCancelZoneOverlay('test-ring');
        const circle = circleOf(overlay.element);

        expect(circle.getAttribute('cx')).toBeNull();
        expect(circle.getAttribute('cy')).toBeNull();
        expect(circle.getAttribute('r')).toBeNull();
    });

    it('places the ring exactly on the given viewport point', () => {
        const overlay = createCancelZoneOverlay('test-ring');

        overlay.show(137, 246, 16);

        const circle = circleOf(overlay.element);
        expect(circle.getAttribute('cx')).toBe('137');
        expect(circle.getAttribute('cy')).toBe('246');
        expect(overlay.element.getAttribute('visibility')).not.toBe('hidden');
    });

    it('takes the radius as a screen length and applies no other scaling', () => {
        // The second half of the bug: the radius used to be computed in SVG user
        // units by projecting the threshold through the view's CTM. That is
        // self-consistent only while the zoom is 1 — the ring stayed the right size
        // on screen, but the STROKE did not, because a stroke width in user units is
        // multiplied by the zoom (measured: 0.35px at 0.2x, 16.7px at 9.5x). With the
        // ring on a viewport layer the value passes through untouched, so the number
        // the caller supplies is the number the browser uses.
        const overlay = createCancelZoneOverlay('test-ring');

        overlay.show(0, 0, 16);
        expect(circleOf(overlay.element).getAttribute('r')).toBe('16');

        overlay.show(0, 0, 20.8);
        expect(circleOf(overlay.element).getAttribute('r')).toBe('20.8');
    });

    it('follows the pointer on a later gesture', () => {
        const overlay = createCancelZoneOverlay('test-ring');

        overlay.show(10, 20, 16);
        overlay.show(300, 400, 32);

        const circle = circleOf(overlay.element);
        expect(circle.getAttribute('cx')).toBe('300');
        expect(circle.getAttribute('cy')).toBe('400');
        expect(circle.getAttribute('r')).toBe('32');
    });

    it('hides by toggling the layer, so a re-show brings the ring back', () => {
        // `hide` sets the root's visibility rather than the circle's, so the circle's
        // geometry survives a hide/show cycle. Both halves are asserted because a
        // hide that blanked the geometry would look identical in a single-shot test.
        const overlay = createCancelZoneOverlay('test-ring');

        overlay.show(50, 60, 16);
        overlay.hide();
        expect(overlay.element.getAttribute('visibility')).toBe('hidden');

        overlay.show(50, 60, 16);
        expect(overlay.element.getAttribute('visibility')).not.toBe('hidden');
        expect(circleOf(overlay.element).getAttribute('r')).toBe('16');
    });

    it('detaches its element from the DOM', () => {
        const overlay = createCancelZoneOverlay('test-ring');
        document.body.appendChild(overlay.element);
        expect(document.body.contains(overlay.element)).toBe(true);

        overlay.remove();
        expect(document.body.contains(overlay.element)).toBe(false);
    });
});

// ── Layer stacking ──────────────────────────────────────────────────────────

describe('gesture-feedback layer order', () => {
    it('paints each hint above the one it clarifies', () => {
        // All three layers are `position: fixed` on the body, so document order alone
        // would decide what covers what, and appending order is an accident of the
        // call site. The three hints nest in meaning: the threshold ring says how far
        // to move before anything commits, the rails say which band is being tracked,
        // and the arms say what is about to be committed. The most specific must win.
        const ring = createCancelZoneOverlay('test-ring');
        const rails = createParallelGuideOverlay('test-rail');
        const arms = createDragDecisionOverlay('test-arm', () => 30);

        const z = (el: SVGSVGElement) => Number(el.style.zIndex);
        expect(z(ring.element)).toBeLessThan(z(rails.element));
        expect(z(rails.element)).toBeLessThan(z(arms.element));
        expect(CANCEL_ZONE_Z_INDEX).toBeLessThan(PARALLEL_GUIDE_Z_INDEX);
        expect(PARALLEL_GUIDE_Z_INDEX).toBeLessThan(DRAG_DECISION_Z_INDEX);
    });

    it('keeps the declared order even if the layers are appended out of order', () => {
        // The constants, not the append order, are the contract.
        const arms = createDragDecisionOverlay('test-arm', () => 30);
        const ring = createCancelZoneOverlay('test-ring');

        expect(Number(arms.element.style.zIndex)).toBeGreaterThan(
            Number(ring.element.style.zIndex)
        );
    });
});
