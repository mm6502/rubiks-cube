import { describe, expect, it } from 'vitest';

import { createDragDecisionOverlay, createParallelGuideOverlay } from './drag-decision-overlay';

// ── Helpers ─────────────────────────────────────────────────────────────────

type LineGeom = { x1: number; y1: number; x2: number; y2: number };

function lineGeom(line: SVGLineElement): LineGeom {
    return {
        x1: Number(line.getAttribute('x1')),
        y1: Number(line.getAttribute('y1')),
        x2: Number(line.getAttribute('x2')),
        y2: Number(line.getAttribute('y2')),
    };
}

function length(g: LineGeom): number {
    return Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
}

function midpoint(g: LineGeom): { x: number; y: number } {
    return { x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2 };
}

function linesOf(element: SVGSVGElement): SVGLineElement[] {
    return Array.from(element.querySelectorAll('line'));
}

// ── createParallelGuideOverlay ──────────────────────────────────────────────

describe('createParallelGuideOverlay', () => {
    it('anchors the layer to the viewport rather than to a view', () => {
        // The whole point of the overlay: nothing in a view's subtree may clip it,
        // and it must not inherit that subtree's scale. `position: fixed` at the
        // viewport origin is what delivers both.
        const overlay = createParallelGuideOverlay('test-rail');
        const { style } = overlay.element;

        expect(style.position).toBe('fixed');
        expect(style.left).toBe('0px');
        expect(style.top).toBe('0px');
        expect(style.width).toBe('100vw');
        expect(style.height).toBe('100vh');
        expect(style.pointerEvents).toBe('none');
        expect(style.overflow).toBe('visible');
    });

    it('starts hidden so a later show is what makes it visible', () => {
        const overlay = createParallelGuideOverlay('test-rail');
        expect(overlay.element.getAttribute('visibility')).toBe('hidden');
    });

    it('is inert to the accessibility tree', () => {
        const overlay = createParallelGuideOverlay('test-rail');
        expect(overlay.element.getAttribute('aria-hidden')).toBe('true');
    });

    it('paints below the decision indicator', () => {
        // Both overlays sit on the body, so document order decides the painting
        // order. If the rails tied with or beat the arms, the more important
        // signal — what the gesture will commit — could be hidden behind them.
        const rails = createParallelGuideOverlay('test-rail');
        const decision = createDragDecisionOverlay('test-arm', () => 30);

        expect(Number(rails.element.style.zIndex)).toBeLessThan(
            Number(decision.element.style.zIndex)
        );
    });

    it('draws two rails, both as long as the requested arm', () => {
        const overlay = createParallelGuideOverlay('test-rail');
        overlay.show({ x: 0, y: -1 }, 200, 300, 5, 42);

        const lines = linesOf(overlay.element);
        expect(lines).toHaveLength(2);
        for (const line of lines) {
            expect(length(lineGeom(line))).toBeCloseTo(84, 6);
        }
    });

    it('offsets the rails perpendicular to the direction they run', () => {
        // Direction is straight up the screen; the rails must therefore be
        // displaced horizontally, one each side.
        const overlay = createParallelGuideOverlay('test-rail');
        overlay.show({ x: 0, y: -1 }, 200, 300, 5, 40);

        const [rail1, rail2] = linesOf(overlay.element);
        expect(midpoint(lineGeom(rail1))).toEqual({ x: 205, y: 300 });
        expect(midpoint(lineGeom(rail2))).toEqual({ x: 195, y: 300 });
    });

    it('offsets perpendicular along a diagonal direction too', () => {
        // The axis-aligned cases above cannot tell a correct perpendicular from
        // the mirrored one: at 0° and 90° the two differ only by a sign that the
        // symmetric assertions cancel out. A diagonal direction does not, so this
        // is the case that actually pins the rotation.
        const overlay = createParallelGuideOverlay('test-rail');
        const d = Math.SQRT1_2; // 1/√2, so the direction is a unit vector
        overlay.show({ x: d, y: d }, 200, 300, 5, 40);

        const [rail1, rail2] = linesOf(overlay.element);
        const offset = 5 * d;
        expect(midpoint(lineGeom(rail1)).x).toBeCloseTo(200 - offset, 6);
        expect(midpoint(lineGeom(rail1)).y).toBeCloseTo(300 + offset, 6);
        expect(midpoint(lineGeom(rail2)).x).toBeCloseTo(200 + offset, 6);
        expect(midpoint(lineGeom(rail2)).y).toBeCloseTo(300 - offset, 6);
    });

    it('runs both rails along the given direction, not across it', () => {
        // A rail drawn along the perpendicular would look like a rung rather than
        // a track, and would still have the right length and the right midpoint —
        // so only the endpoint displacement distinguishes them.
        const overlay = createParallelGuideOverlay('test-rail');
        const d = Math.SQRT1_2;
        overlay.show({ x: d, y: d }, 200, 300, 5, 40);

        const [rail1] = linesOf(overlay.element);
        const g = lineGeom(rail1);
        const run = { x: g.x2 - g.x1, y: g.y2 - g.y1 };

        expect(run.x).toBeCloseTo(2 * 40 * d, 6);
        expect(run.y).toBeCloseTo(2 * 40 * d, 6);
    });

    it('centres the pair exactly on the pointer', () => {
        // Guards against the offset being applied to only one rail, which would
        // shift the whole gesture line off the finger that is making it.
        const overlay = createParallelGuideOverlay('test-rail');
        overlay.show({ x: 1, y: 0 }, 200, 300, 7, 40);

        const [rail1, rail2] = linesOf(overlay.element);
        const a = midpoint(lineGeom(rail1));
        const b = midpoint(lineGeom(rail2));

        expect((a.x + b.x) / 2).toBeCloseTo(200, 6);
        expect((a.y + b.y) / 2).toBeCloseTo(300, 6);
    });

    it('renders the gap as a screen distance, independent of any scale', () => {
        // The regression this overlay exists for: drawn in SVG units the gap was
        // divided by the zoom, so at 0.2x a 5-unit gap became about 1px and the
        // guide the user was tracking disappeared. Screen coordinates have no
        // scale to divide by, so the same numbers must come back for the same
        // request however the view is zoomed.
        const overlay = createParallelGuideOverlay('test-rail');

        const gapAt = (halfGap: number): number => {
            overlay.show({ x: 0, y: -1 }, 200, 300, halfGap, 40);
            const [rail1, rail2] = linesOf(overlay.element);
            const a = midpoint(lineGeom(rail1));
            const b = midpoint(lineGeom(rail2));
            return Math.hypot(a.x - b.x, a.y - b.y);
        };

        expect(gapAt(5)).toBeCloseTo(10, 6);
        expect(gapAt(5)).toBeCloseTo(10, 6);
    });

    it('follows the pointer instead of staying where it was first drawn', () => {
        const overlay = createParallelGuideOverlay('test-rail');
        overlay.show({ x: 0, y: -1 }, 200, 300, 5, 40);
        overlay.show({ x: 0, y: -1 }, 260, 340, 5, 40);

        const [rail1, rail2] = linesOf(overlay.element);
        const a = midpoint(lineGeom(rail1));
        const b = midpoint(lineGeom(rail2));

        expect((a.x + b.x) / 2).toBeCloseTo(260, 6);
        expect((a.y + b.y) / 2).toBeCloseTo(340, 6);
    });

    it('hides both rails together again', () => {
        const overlay = createParallelGuideOverlay('test-rail');
        overlay.show({ x: 0, y: -1 }, 200, 300, 5, 40);
        expect(overlay.element.getAttribute('visibility')).not.toBe('hidden');

        overlay.hide();
        expect(overlay.element.getAttribute('visibility')).toBe('hidden');
    });

    it('detaches its element from the DOM', () => {
        const overlay = createParallelGuideOverlay('test-rail');
        document.body.appendChild(overlay.element);
        expect(document.body.contains(overlay.element)).toBe(true);

        overlay.remove();
        expect(document.body.contains(overlay.element)).toBe(false);
    });
});

// ── createDragDecisionOverlay ───────────────────────────────────────────────

describe('createDragDecisionOverlay', () => {
    it('anchors the layer to the viewport', () => {
        const overlay = createDragDecisionOverlay('test-arm', () => 30);
        expect(overlay.element.style.position).toBe('fixed');
        expect(overlay.element.style.width).toBe('100vw');
        expect(overlay.element.style.height).toBe('100vh');
    });

    it('uses the supplied arm length for both cross arms', () => {
        const overlay = createDragDecisionOverlay('test-arm', () => 30);
        overlay.showCross({ upDir: { x: 0, y: -1 }, rightDir: { x: 1, y: 0 } }, 100, 100);

        const lines = linesOf(overlay.element);
        expect(lines).toHaveLength(2);
        for (const line of lines) {
            expect(length(lineGeom(line))).toBeCloseTo(60, 6);
        }
        for (const line of lines) {
            expect(line.getAttribute('visibility')).not.toBe('hidden');
        }
    });

    it('shows one line for a single-direction gesture and hides the other', () => {
        const overlay = createDragDecisionOverlay('test-arm', () => 30);
        overlay.showLine({ x: 0, y: -1 }, 100, 100);

        const [primary, secondary] = linesOf(overlay.element);
        expect(length(lineGeom(primary))).toBeCloseTo(60, 6);
        expect(secondary.getAttribute('visibility')).toBe('hidden');
    });

    it('re-hides the second arm when switching from a cross to a line', () => {
        // A cross followed by a line must not leave the second arm painted from
        // the previous gesture.
        const overlay = createDragDecisionOverlay('test-arm', () => 30);
        overlay.showCross({ upDir: { x: 0, y: -1 }, rightDir: { x: 1, y: 0 } }, 100, 100);
        overlay.showLine({ x: 0, y: -1 }, 100, 100);

        expect(linesOf(overlay.element)[1].getAttribute('visibility')).toBe('hidden');
    });

    it('hides and detaches the layer', () => {
        const overlay = createDragDecisionOverlay('test-arm', () => 30);
        document.body.appendChild(overlay.element);

        overlay.hide();
        expect(overlay.element.getAttribute('visibility')).toBe('hidden');

        overlay.remove();
        expect(document.body.contains(overlay.element)).toBe(false);
    });

    it('keeps the arm length a screen length at any zoom', () => {
        // Same invariant as the rails: the arm is measured in viewport pixels, so
        // the overlay must never be given a viewBox — a viewBox is what would
        // reintroduce a scale factor between the numbers and the pixels.
        const overlay = createDragDecisionOverlay('test-arm', () => 30);
        expect(overlay.element.getAttribute('viewBox')).toBeNull();

        overlay.showLine({ x: 0, y: -1 }, 100, 100);
        expect(length(lineGeom(linesOf(overlay.element)[0]))).toBeCloseTo(60, 6);
    });
});
