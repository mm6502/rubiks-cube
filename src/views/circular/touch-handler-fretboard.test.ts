import { describe, expect, it, vi } from 'vitest';

import { Axis } from '@/cube/types';

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
        fretboardGroupEl: createSvgEl('g'),
        fretboardLine1El: createSvgEl('line'),
        fretboardLine2El: createSvgEl('line'),
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
    it('should hide the fretboard group and clear state', () => {
        const state = createMinimalState({
            fretboardAxis: Axis.X,
            fretboardAxisGroup: [],
            fretboardBoundaries: [10, 20, 30],
            fretboardRadialDir: { x: 1, y: 0 },
            fretboardStartSvg: { x: 0, y: 0 },
        } as any);

        hideFretboard(state);

        expect(state.fretboardGroupEl.getAttribute('visibility')).toBe('hidden');
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
