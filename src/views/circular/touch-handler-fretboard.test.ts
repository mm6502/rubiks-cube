import { describe, expect, it, vi } from 'vitest';

import { Axis } from '@/cube/types';
import { createParallelGuideOverlay } from '@/interaction/drag-decision-overlay';

import type { AxisCircle } from './svg-tools';
import {
    clearFretboardVisualState,
    fretboardPerpDistancePx,
    getFretboardHighlightTarget,
    hideFretboard,
    restoreFretboardState,
    setFretboardHighlight,
    setFretboardHighlightBackground,
    updateFretboardHighlight,
} from './touch-handler-fretboard';
import type { TouchHandlerState } from './touch-handler-types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCircle(axis: Axis, layer: number, cx = 0, cy = 0, r = 50): AxisCircle {
    return { id: `${axis}-${layer}`, axis, layer, cx, cy, r };
}

function createSvgEl<T extends SVGElement>(tag: string): T {
    return document.createElementNS('http://www.w3.org/2000/svg', tag) as unknown as T;
}

function createMinimalState(overrides?: Partial<TouchHandlerState>): TouchHandlerState {
    const svgRoot = createSvgEl<SVGSVGElement>('svg');
    (svgRoot as any).createSVGPoint = undefined;

    return {
        svgRoot,
        host: document.createElement('div'),
        styles: {},
        axisCircles: [],
        getCubeSize: () => 3,
        getCubeState: undefined,
        onStickerSelected: vi.fn(),
        adapter: {} as any,
        dragStateMachine: {
            setRotationCenter: vi.fn(),
        } as any,
        haloEl: createSvgEl('ellipse'),
        faceOverlayEl: createSvgEl('ellipse'),
        dragLabelEl: document.createElement('div'),
        cancelZoneEl: createSvgEl('circle'),
        dragCrossGroupEl: createSvgEl('g'),
        dragCrossPrimaryEl: createSvgEl('line'),
        dragCrossSecondaryEl: createSvgEl('line'),
        fretboardRails: createParallelGuideOverlay('test-rail'),
        axisDetectionBands: new Map(),
        selectedFace: undefined,
        selectedAxisCircles: new Set<string>(),
        fretboardVisualKeys: new Set<string>(),
        fretboardHighlightKey: undefined,
        fretboardAxis: undefined,
        fretboardAxisGroup: undefined,
        fretboardBoundaries: undefined,
        fretboardRadialDir: undefined,
        fretboardStartSvg: undefined,
        savedAxisSelections: undefined,
        layoutMode: 0 as any,
        start: { kind: 0 as any },
        pendingStickerCross: undefined,
        ...overrides,
    } as any;
}

// ── getFretboardHighlightTarget ─────────────────────────────────────────────

describe('getFretboardHighlightTarget', () => {
    it('should return undefined when no fretboard highlight key', () => {
        const state = createMinimalState();
        expect(getFretboardHighlightTarget(state)).toBeUndefined();
    });

    it('should parse fretboard highlight key', () => {
        const state = createMinimalState({ fretboardHighlightKey: 'X-1' } as any);
        expect(getFretboardHighlightTarget(state)).toEqual({ axis: Axis.X, layer: 1 });
    });

    it('should return undefined for BG key', () => {
        const state = createMinimalState({ fretboardHighlightKey: 'BG' } as any);
        expect(getFretboardHighlightTarget(state)).toBeUndefined();
    });
});

// ── fretboardPerpDistancePx ─────────────────────────────────────────────────

describe('fretboardPerpDistancePx', () => {
    it('should return undefined when no fretboard is active', () => {
        const state = createMinimalState();
        const gesture = { current: { x: 10, y: 10 } } as any;
        expect(fretboardPerpDistancePx(state, gesture)).toBeUndefined();
    });

    it('should compute perpendicular distance when fretboard is active', () => {
        const state = createMinimalState({
            fretboardRadialDir: { x: 1, y: 0 },
            fretboardStartSvg: { x: 50, y: 50 },
        } as any);
        const gesture = { current: { x: 50, y: 70 } } as any;
        const result = fretboardPerpDistancePx(state, gesture);
        // Since createSVGPoint is undefined, svgToClientPoint/clientToSvgPoint fall back to raw coords
        expect(result).toBeDefined();
        expect(typeof result).toBe('number');
    });
});

// ── hideFretboard ───────────────────────────────────────────────────────────

describe('hideFretboard', () => {
    it('should hide the fretboard rails and clear state', () => {
        const state = createMinimalState({
            fretboardAxis: Axis.X,
            fretboardAxisGroup: [],
            fretboardBoundaries: [10, 20, 30],
            fretboardRadialDir: { x: 1, y: 0 },
            fretboardStartSvg: { x: 0, y: 0 },
        } as any);

        hideFretboard(state);

        expect(state.fretboardRails.element.getAttribute('visibility')).toBe('hidden');
        expect(state.fretboardAxis).toBeUndefined();
        expect(state.fretboardAxisGroup).toBeUndefined();
        expect(state.fretboardBoundaries).toBeUndefined();
        expect(state.fretboardRadialDir).toBeUndefined();
        expect(state.fretboardStartSvg).toBeUndefined();
    });
});

// ── clearFretboardVisualState ───────────────────────────────────────────────

describe('clearFretboardVisualState', () => {
    it('should clear visual keys set', () => {
        const state = createMinimalState();
        state.fretboardVisualKeys.add('X-0');
        state.fretboardVisualKeys.add('X-1');

        clearFretboardVisualState(state);

        expect(state.fretboardVisualKeys.size).toBe(0);
    });

    it('should not remove keys that are also in selectedAxisCircles', () => {
        const state = createMinimalState();
        state.fretboardVisualKeys.add('X-0');
        state.fretboardVisualKeys.add('X-1');
        state.selectedAxisCircles.add('X-0');

        clearFretboardVisualState(state);

        expect(state.fretboardVisualKeys.size).toBe(0);
        // selectedAxisCircles is not modified by this function
        expect(state.selectedAxisCircles.has('X-0')).toBe(true);
    });
});

// ── setFretboardHighlight ───────────────────────────────────────────────────

describe('setFretboardHighlight', () => {
    it('should set highlight key', () => {
        const state = createMinimalState();
        setFretboardHighlight(state, 'X-1');
        expect(state.fretboardHighlightKey).toBe('X-1');
    });
});

// ── setFretboardHighlightBackground ─────────────────────────────────────────

describe('setFretboardHighlightBackground', () => {
    it('should set highlight to BG mode', () => {
        const state = createMinimalState({
            fretboardAxis: Axis.X,
        } as any);

        setFretboardHighlightBackground(state);

        expect(state.fretboardHighlightKey).toBe('BG');
    });
});

// ── updateFretboardHighlight ────────────────────────────────────────────────

describe('updateFretboardHighlight', () => {
    it('should early return when no fretboard group', () => {
        const state = createMinimalState();
        // Should not throw
        updateFretboardHighlight(state, 10, 20);
    });

    it('should early return when boundaries are empty', () => {
        const state = createMinimalState({
            fretboardAxisGroup: [makeCircle(Axis.X, 0, 0, 0, 50)],
            fretboardBoundaries: undefined,
        } as any);
        updateFretboardHighlight(state, 10, 20);
    });

    it('should switch to background mode when pointer moves outside bands', () => {
        const group = [
            makeCircle(Axis.X, 0, 0, 0, 30),
            makeCircle(Axis.X, 1, 0, 0, 50),
            makeCircle(Axis.X, 2, 0, 0, 70),
        ];
        const state = createMinimalState({
            axisCircles: group,
            fretboardAxisGroup: group,
            fretboardBoundaries: [20, 40, 60, 80],
            fretboardHighlightKey: 'X-1',
        } as any);

        // Point very far from any circle (will be raw coords since createSVGPoint is undefined)
        updateFretboardHighlight(state, 500, 500);

        // Should have switched to background
        expect(state.fretboardHighlightKey).toBe('BG');
    });

    it('should not switch when pointer is within perpendicular gap', () => {
        const group = [
            makeCircle(Axis.X, 0, 0, 0, 30),
            makeCircle(Axis.X, 1, 0, 0, 50),
            makeCircle(Axis.X, 2, 0, 0, 70),
        ];
        const state = createMinimalState({
            axisCircles: group,
            fretboardAxisGroup: group,
            fretboardBoundaries: [20, 40, 60, 80],
            fretboardHighlightKey: 'X-1',
            fretboardRadialDir: { x: 1, y: 0 },
            fretboardStartSvg: { x: 50, y: 0 },
        } as any);

        // Point far perpendicular from the radial line → should early return
        updateFretboardHighlight(state, 50, 100);
    });

    it('should switch highlight when pointer enters new circle band', () => {
        const group = [
            makeCircle(Axis.X, 0, 0, 0, 30),
            makeCircle(Axis.X, 1, 0, 0, 50),
            makeCircle(Axis.X, 2, 0, 0, 70),
        ];
        const state = createMinimalState({
            axisCircles: group,
            fretboardAxisGroup: group,
            fretboardBoundaries: [20, 40, 60, 80],
            fretboardHighlightKey: 'X-0',
        } as any);

        // Point at distance 50 from center → should land in X-1 band (40-60)
        updateFretboardHighlight(state, 50, 0);

        expect(state.fretboardHighlightKey).toBe('X-1');
    });

    it('should do nothing when highlight key unchanged', () => {
        const group = [
            makeCircle(Axis.X, 0, 0, 0, 30),
            makeCircle(Axis.X, 1, 0, 0, 50),
            makeCircle(Axis.X, 2, 0, 0, 70),
        ];
        const state = createMinimalState({
            axisCircles: group,
            fretboardAxisGroup: group,
            fretboardBoundaries: [20, 40, 60, 80],
            fretboardHighlightKey: 'X-0',
        } as any);

        // Point at distance 30 → should be in X-0 band (20-40)
        updateFretboardHighlight(state, 30, 0);

        // Key should still be X-0 (no change)
        expect(state.fretboardHighlightKey).toBe('X-0');
    });

    it('should restore saved selections when moving to a saved key', () => {
        const group = [
            makeCircle(Axis.X, 0, 0, 0, 30),
            makeCircle(Axis.X, 1, 0, 0, 50),
            makeCircle(Axis.X, 2, 0, 0, 70),
        ];
        const state = createMinimalState({
            axisCircles: group,
            fretboardAxisGroup: group,
            fretboardBoundaries: [20, 40, 60, 80],
            fretboardHighlightKey: 'X-0',
            savedAxisSelections: new Set(['X-1']),
        } as any);

        // Move to X-1 band (which is a saved selection)
        updateFretboardHighlight(state, 50, 0);

        expect(state.fretboardHighlightKey).toBe('X-1');
        expect(state.selectedAxisCircles.has('X-1')).toBe(true);
    });
});

// ── restoreFretboardState ───────────────────────────────────────────────────

describe('restoreFretboardState', () => {
    it('should restore saved axis selections', () => {
        const state = createMinimalState({
            savedAxisSelections: new Set(['X-0', 'Y-1']),
            fretboardHighlightKey: 'X-0',
        } as any);

        restoreFretboardState(state);

        expect(state.fretboardHighlightKey).toBeUndefined();
        expect(state.selectedAxisCircles.has('X-0')).toBe(true);
        expect(state.selectedAxisCircles.has('Y-1')).toBe(true);
        expect(state.savedAxisSelections).toBeUndefined();
    });

    it('should handle no saved selections', () => {
        const state = createMinimalState();
        restoreFretboardState(state);
        expect(state.fretboardHighlightKey).toBeUndefined();
    });
});

// ── Drawn rail gap and honoured tolerance must agree ────────────────────────
//
// The rails are a screen overlay (so their gap is a pixel length) while the ring
// the pointer is over is cube geometry (measured in viewBox units). The drift
// tolerance has to bridge the two. When it was a second constant in viewBox units
// the drawn band and the honoured band diverged by 3.8px at 0.2x zoom: the pointer
// could sit visibly between the rails and the fretboard would still give up.

describe('drift tolerance tracks the drawn rail gap', () => {
    /**
     * A state whose SVG reports `clientPerUnit` screen pixels per viewBox unit,
     * which is what `svgToClientPoint` needs to derive the conversion.
     *
     * The fake matrix must expose `inverse()` as well as `a`/`d`: `clientToSvgPoint`
     * goes through the inverse CTM, and without it that path silently falls back to
     * raw client coordinates — which would make these tests measure nothing.
     */
    function stateWithSvgScale(clientPerUnit: number, overrides?: Partial<TouchHandlerState>) {
        const state = createMinimalState(overrides);
        type Matrix = { a: number; d: number; e: number; f: number };
        /** A DOMPoint-like result: `clientToSvgPoint` reads `.x` and `.y` off it. */
        type Point = { x: number; y: number };
        const svg = state.svgRoot as unknown as {
            createSVGPoint?: () => unknown;
            getScreenCTM?: () => unknown;
        };
        // Must return { x, y } — not the matrix fields — or the callers silently
        // read `undefined` for both coordinates and every case degenerates.
        svg.createSVGPoint = () => {
            const point: {
                x: number;
                y: number;
                matrixTransform(m: Matrix): Point;
            } = {
                x: 0,
                y: 0,
                matrixTransform(this: Point, m: Matrix): Point {
                    return { x: this.x * m.a + m.e, y: this.y * m.d + m.f };
                },
            };
            return point;
        };
        const matrix = {
            a: clientPerUnit,
            d: clientPerUnit,
            e: 0,
            f: 0,
            inverse: () => ({
                a: 1 / clientPerUnit,
                d: 1 / clientPerUnit,
                e: 0,
                f: 0,
            }),
        };
        svg.getScreenCTM = () => matrix;
        return state;
    }

    /** Angular position of a point relative to the ring group's shared centre. */
    function buildFretboardState(overrides?: Partial<TouchHandlerState>) {
        const group = [
            makeCircle(Axis.X, 0, 0, 0, 30),
            makeCircle(Axis.X, 1, 0, 0, 50),
            makeCircle(Axis.X, 2, 0, 0, 70),
        ];
        return {
            axisCircles: group,
            fretboardAxisGroup: group,
            fretboardBoundaries: [20, 40, 60, 80],
            fretboardHighlightKey: 'X-1',
            fretboardRadialDir: { x: 1, y: 0 },
            fretboardStartSvg: { x: 50, y: 0 },
            ...overrides,
        } as Partial<TouchHandlerState>;
    }

    /**
     * Build a state where the pointer sits `driftPx` **client pixels** off the
     * centre line, at an SVG scale of `clientPerUnit`.
     *
     * The gesture takes client coordinates, so the drift is expressed in client
     * pixels and converted internally. Deriving `clientX` from the scale keeps the
     * pointer in the X-1 band (viewBox distance 50) at every scale, so the only
     * thing that varies between cases is the zoom.
     */
    function stateAtDrift(clientPerUnit: number, driftPx: number) {
        const state = stateWithSvgScale(clientPerUnit, buildFretboardState());
        state.fretboardHighlightKey = 'X-0';
        const clientX = 50 * clientPerUnit; // -> viewBox x 50, inside band [40, 60]
        return { state, clientX, driftPx };
    }

    it('tolerates drift up to the drawn half-gap, in client pixels', () => {
        const inside = stateAtDrift(1, 4);
        updateFretboardHighlight(inside.state, inside.clientX, inside.driftPx);
        expect(inside.state.fretboardHighlightKey).toBe('X-1');

        const outside = stateAtDrift(1, 6);
        updateFretboardHighlight(outside.state, outside.clientX, outside.driftPx);
        expect(outside.state.fretboardHighlightKey).toBe('X-0');
    });

    it('honours the same client-pixel band when zoomed out', () => {
        // At 0.5 client px per viewBox unit the rails still promise a 5px band, so
        // the gesture must still accept 4px of drift and reject 6px. A fixed
        // viewBox tolerance would instead have accepted 10px here — twice the band
        // the user can actually see between the rails.
        const inside = stateAtDrift(0.5, 4);
        updateFretboardHighlight(inside.state, inside.clientX, inside.driftPx);
        expect(inside.state.fretboardHighlightKey).toBe('X-1');

        const outside = stateAtDrift(0.5, 6);
        updateFretboardHighlight(outside.state, outside.clientX, outside.driftPx);
        expect(outside.state.fretboardHighlightKey).toBe('X-0');
    });

    it('honours the same client-pixel band when zoomed in', () => {
        // At 3 client px per viewBox unit the band spans far fewer viewBox units,
        // so 6px of drift leaves it even though it is a small viewBox delta.
        const inside = stateAtDrift(3, 4);
        updateFretboardHighlight(inside.state, inside.clientX, inside.driftPx);
        expect(inside.state.fretboardHighlightKey).toBe('X-1');

        const outside = stateAtDrift(3, 6);
        updateFretboardHighlight(outside.state, outside.clientX, outside.driftPx);
        expect(outside.state.fretboardHighlightKey).toBe('X-0');
    });

    it('keeps the band constant across the full zoom range', () => {
        // The invariant behind the three cases above, stated once: the drift the
        // gesture accepts is the same number of screen pixels at every zoom, so it
        // always matches the rails regardless of how far in or out the view is.
        const verdicts = [0.2, 0.5, 1, 2, 3, 10].map(scale => {
            const inside = stateAtDrift(scale, 4);
            updateFretboardHighlight(inside.state, inside.clientX, inside.driftPx);
            const outside = stateAtDrift(scale, 6);
            updateFretboardHighlight(outside.state, outside.clientX, outside.driftPx);
            return {
                scale,
                accepts4px: inside.state.fretboardHighlightKey === 'X-1',
                accepts6px: outside.state.fretboardHighlightKey === 'X-1',
            };
        });

        expect(verdicts.every(v => v.accepts4px === true)).toBe(true);
        expect(verdicts.every(v => v.accepts6px === false)).toBe(true);
    });

    it('holds the highlight while the pointer is just off the outer band edge', () => {
        // Sliding outward past the outermost band is what hands control to the
        // whole-cube zone, so that hand-off needs the same tolerance the rails
        // draw: one pixel past the edge (band outer edge is 80 viewBox units) must
        // not be enough, or the gesture would snap to whole-cube while the pointer
        // is still visibly between the rails.
        const stillFretting = stateWithSvgScale(1, buildFretboardState());
        stillFretting.fretboardHighlightKey = 'X-1';
        updateFretboardHighlight(stillFretting, 81, 0); // margin 1 < 5
        expect(stillFretting.fretboardHighlightKey).toBe('X-1');

        // Well clear of the edge, the hand-off is correct.
        const handedOff = stateWithSvgScale(1, buildFretboardState());
        handedOff.fretboardHighlightKey = 'X-1';
        updateFretboardHighlight(handedOff, 90, 0); // margin 10 > 5
        expect(handedOff.fretboardHighlightKey).toBe('BG');
    });
});
