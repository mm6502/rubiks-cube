import { describe, expect, it } from 'vitest';

import { LayoutMode } from '@/cube/types/view';

import {
    CANCEL_ZONE_Z_INDEX,
    DRAG_DECISION_Z_INDEX,
    DRAG_LABEL_Z_INDEX,
    PARALLEL_GUIDE_Z_INDEX,
} from './drag-decision-overlay';
import { computeDragLabelPosition } from './drag-label-positioning';

// ── Helpers ─────────────────────────────────────────────────────────────────

function position(overrides: Partial<Parameters<typeof computeDragLabelPosition>[0]> = {}) {
    return computeDragLabelPosition({
        layoutMode: LayoutMode.Floating,
        clientX: 400,
        clientY: 300,
        labelWidth: 64,
        labelHeight: 40,
        ...overrides,
    });
}

// ── Placement ───────────────────────────────────────────────────────────────

describe('computeDragLabelPosition placement', () => {
    it('anchors the label in viewport coordinates, not to a panel', () => {
        // A label drawn inside a panel is clipped by whatever clips that panel, and
        // disappears the moment a gesture is made against a screen edge.
        const result = position();

        expect(result.position).toBe('fixed');
    });

    it('offsets the label clear of the cursor by default', () => {
        const result = position({ clientX: 400, clientY: 300 });

        expect(result.x).toBe(414);
        expect(result.y).toBe(314);
    });

    it('centres the label above the pointer in tabbed layout', () => {
        const result = position({ layoutMode: LayoutMode.Tabbed, clientX: 400, clientY: 300 });

        expect(result.x).toBe(368);
        expect(result.y).toBe(210);
    });

    it('lifts the label above the finger for touch pointers', () => {
        // Otherwise the finger covers the very thing the user is meant to read.
        const result = position({ activePointerType: 'touch', clientX: 400, clientY: 300 });

        expect(result.x).toBe(368);
        expect(result.y).toBe(224);
    });

    it('clamps to the window without inverting the bounds', () => {
        // A label wider than the viewport cannot fit; without the `max` guard the
        // clamp bounds cross and produce a negative offset.
        const result = position({ clientX: 1990, clientY: 1990 });

        expect(result.x).toBeGreaterThanOrEqual(0);
        expect(result.y).toBeGreaterThanOrEqual(0);
    });
});

// ── Stacking ────────────────────────────────────────────────────────────────

describe('gesture feedback stacking order', () => {
    it('puts the move label above every guide layer', () => {
        // The regression: the label and the decision arms both carried z-index 10000,
        // and a tie is broken by document order — and the label is appended FIRST in
        // every view. So the arms painted over the label, drawing a dashed line
        // through the notation the user was reading. The label is the conclusion of
        // the gesture; the arms and rails are intermediate hints about it.
        const { zIndex } = position();
        const label = Number(zIndex);

        expect(label).toBeGreaterThan(DRAG_DECISION_Z_INDEX);
        expect(label).toBeGreaterThan(PARALLEL_GUIDE_Z_INDEX);
        expect(label).toBeGreaterThan(CANCEL_ZONE_Z_INDEX);
        expect(label).toBe(DRAG_LABEL_Z_INDEX);
    });

    it('keeps the full layer order free of ties', () => {
        // Every one of these is `position: fixed` on the body, so an equal value is
        // decided by append order — which is an accident of the call site, not a
        // design. Distinct values make the intended order the only reading.
        const levels = [
            CANCEL_ZONE_Z_INDEX,
            PARALLEL_GUIDE_Z_INDEX,
            DRAG_DECISION_Z_INDEX,
            DRAG_LABEL_Z_INDEX,
        ];

        expect(new Set(levels).size).toBe(levels.length);
        expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    });

    it('does not collide with the app-level touch tooltip', () => {
        // `main.css` uses 10000 for `.touch-tooltip`, and `about-modal` uses 10001 for
        // its backdrop. Sharing a level with either would make the winner depend on
        // append order across unrelated components.
        expect(DRAG_LABEL_Z_INDEX).not.toBe(10000);
    });
});
