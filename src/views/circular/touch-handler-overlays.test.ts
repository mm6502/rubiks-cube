import { describe, expect, it, vi } from 'vitest';

import { Axis, Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';

import type { AxisCircle } from './svg-tools';
import {
    clearAxisSelections,
    getAxisCircleElementByKey,
    getCommitThresholdPx,
    getFaceCenterClient,
    hideCancelZone,
    hideDetectionBand,
    hideDragDecisionCross,
    hideHalo,
    isHaloElement,
    restoreTempFaceState,
    setAxisSelectedClass,
    setupFaceEllipseGuideLine,
    setupHaloGuideLine,
    setupStickerDragCross,
    showCancelZone,
    showDetectionBand,
    showDetectionBandForCircle,
    showDragDecisionCross,
    showDragDecisionLine,
    showHaloForFace,
    updateDetectionBandClip,
} from './touch-handler-overlays';
import type { TouchHandlerState } from './touch-handler-types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createSvgEl<T extends SVGElement>(tag: string): T {
    return document.createElementNS('http://www.w3.org/2000/svg', tag) as unknown as T;
}

function makeCircle(axis: Axis, layer: number, cx = 0, cy = 0, r = 50): AxisCircle {
    return { id: `${axis}-${layer}`, axis, layer, cx, cy, r };
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
        layoutMode: LayoutMode.Floating,
        start: { kind: 0 } as any,
        pendingStickerCross: undefined,
        faceDirectMode: false,
        directModeTempFace: undefined,
        previousSelectedFace: undefined,
        previewAxisKeys: undefined,
        activePointerId: undefined,
        // Fretboard state (needed for type completeness)
        savedAxisSelections: undefined,
        fretboardHighlightKey: undefined,
        fretboardVisualKeys: new Set<string>(),
        fretboardAxis: undefined,
        fretboardAxisGroup: undefined,
        fretboardBoundaries: undefined,
        fretboardRadialDir: undefined,
        fretboardStartSvg: undefined,
        ...overrides,
    } as any;
}

function addToBody(el: Element): void {
    document.body.appendChild(el);
}

// ── Drag-decision cross ─────────────────────────────────────────────────────

describe('setupStickerDragCross', () => {
    it('should pre-compute four move notations and show the drag cross', () => {
        const state = createMinimalState({
            axisCircles: [makeCircle(Axis.X, 0, 100, 100, 30), makeCircle(Axis.Y, 0, 100, 100, 40)],
        });
        addToBody(state.svgRoot);

        const sticker = { face: Face.U, row: 0, col: 0 };
        setupStickerDragCross(state, sticker, 50, 50);

        expect(state.pendingStickerCross).toBeDefined();
        expect(state.pendingStickerCross!.upMove).toBeTypeOf('string');
        expect(state.pendingStickerCross!.downMove).toBeTypeOf('string');
        expect(state.pendingStickerCross!.rightMove).toBeTypeOf('string');
        expect(state.pendingStickerCross!.leftMove).toBeTypeOf('string');
        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('visible');
    });

    it('should fall back to face-screen basis when crossing basis is null', () => {
        const state = createMinimalState({ axisCircles: [] });
        addToBody(state.svgRoot);

        const sticker = { face: Face.U, row: 0, col: 0 };
        setupStickerDragCross(state, sticker, 50, 50);

        expect(state.pendingStickerCross).toBeDefined();
        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('visible');
    });
});

describe('showDragDecisionCross', () => {
    it('should position both cross arms and make the group visible', () => {
        const state = createMinimalState();
        addToBody(state.svgRoot);

        const basis = { upDir: { x: 0, y: -1 }, rightDir: { x: 1, y: 0 } };
        showDragDecisionCross(state, basis, 100, 100);

        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('visible');
        expect(state.dragCrossSecondaryEl.getAttribute('visibility')).toBeNull(); // removed
    });

    it('should use tabbed arm length in tabbed layout', () => {
        const state = createMinimalState({ layoutMode: LayoutMode.Tabbed });
        addToBody(state.svgRoot);

        const basis = { upDir: { x: 0, y: -1 }, rightDir: { x: 1, y: 0 } };
        showDragDecisionCross(state, basis, 100, 100);

        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('visible');
    });
});

describe('showDragDecisionLine', () => {
    it('should show a single-arm line and hide the secondary arm', () => {
        const state = createMinimalState();
        addToBody(state.svgRoot);

        showDragDecisionLine(state, { x: 0, y: -1 }, 100, 100);

        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('visible');
        expect(state.dragCrossSecondaryEl.getAttribute('visibility')).toBe('hidden');
    });
});

describe('hideDragDecisionCross', () => {
    it('should clear pending sticker cross and hide the group', () => {
        const state = createMinimalState({
            pendingStickerCross: {
                basis: { upDir: { x: 0, y: -1 }, rightDir: { x: 1, y: 0 } },
                upMove: 'U',
                downMove: "U'",
                rightMove: 'R',
                leftMove: "R'",
            },
        });

        hideDragDecisionCross(state);

        expect(state.pendingStickerCross).toBeUndefined();
        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('hidden');
    });
});

// ── Halo guide line ─────────────────────────────────────────────────────────

describe('setupHaloGuideLine', () => {
    it('should hide drag cross when no selected face', () => {
        const state = createMinimalState({ selectedFace: undefined });

        setupHaloGuideLine(state, 50, 50);

        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('hidden');
    });

    it('should hide drag cross when face ellipse not found', () => {
        const state = createMinimalState({ selectedFace: Face.U });

        setupHaloGuideLine(state, 50, 50);

        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('hidden');
    });

    it('should show guide line when ellipse and radial dir are valid', () => {
        const state = createMinimalState({ selectedFace: Face.U });
        addToBody(state.svgRoot);

        const ellipse = createSvgEl<SVGEllipseElement>('ellipse');
        ellipse.setAttribute('id', 'U-face-ellipse');
        ellipse.setAttribute('cx', '100');
        ellipse.setAttribute('cy', '100');
        ellipse.setAttribute('rx', '50');
        ellipse.setAttribute('ry', '50');
        state.svgRoot.appendChild(ellipse);

        setupHaloGuideLine(state, 150, 100);

        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('visible');
    });

    it('should hide drag cross when radial direction is zero', () => {
        const state = createMinimalState({ selectedFace: Face.U });
        addToBody(state.svgRoot);

        const ellipse = createSvgEl<SVGEllipseElement>('ellipse');
        ellipse.setAttribute('id', 'U-face-ellipse');
        ellipse.setAttribute('cx', '50');
        ellipse.setAttribute('cy', '50');
        ellipse.setAttribute('rx', '50');
        ellipse.setAttribute('ry', '50');
        state.svgRoot.appendChild(ellipse);

        // Touch point at ellipse centre → normalize2 returns undefined
        setupHaloGuideLine(state, 50, 50);

        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('hidden');
    });
});

describe('setupFaceEllipseGuideLine', () => {
    it('should hide drag cross when ellipse not found', () => {
        const state = createMinimalState();

        setupFaceEllipseGuideLine(state, Face.F, 50, 50);

        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('hidden');
    });

    it('should show guide line when ellipse and radial dir are valid', () => {
        const state = createMinimalState();
        addToBody(state.svgRoot);

        const ellipse = createSvgEl<SVGEllipseElement>('ellipse');
        ellipse.setAttribute('id', 'F-face-ellipse');
        ellipse.setAttribute('cx', '100');
        ellipse.setAttribute('cy', '100');
        ellipse.setAttribute('rx', '50');
        ellipse.setAttribute('ry', '50');
        state.svgRoot.appendChild(ellipse);

        setupFaceEllipseGuideLine(state, Face.F, 150, 100);

        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('visible');
    });

    it('should hide drag cross when radial direction is zero', () => {
        const state = createMinimalState();
        addToBody(state.svgRoot);

        const ellipse = createSvgEl<SVGEllipseElement>('ellipse');
        ellipse.setAttribute('id', 'F-face-ellipse');
        ellipse.setAttribute('cx', '50');
        ellipse.setAttribute('cy', '50');
        ellipse.setAttribute('rx', '50');
        ellipse.setAttribute('ry', '50');
        state.svgRoot.appendChild(ellipse);

        setupFaceEllipseGuideLine(state, Face.F, 50, 50);

        expect(state.dragCrossGroupEl.getAttribute('visibility')).toBe('hidden');
    });
});

// ── Halo (face selection ring) ──────────────────────────────────────────────

describe('showHaloForFace', () => {
    it('should position halo and overlay from face ellipse', () => {
        const state = createMinimalState();
        addToBody(state.svgRoot);

        const ellipse = createSvgEl<SVGEllipseElement>('ellipse');
        ellipse.setAttribute('id', 'R-face-ellipse');
        ellipse.setAttribute('cx', '150');
        ellipse.setAttribute('cy', '200');
        ellipse.setAttribute('rx', '60');
        ellipse.setAttribute('ry', '40');
        state.svgRoot.appendChild(ellipse);

        showHaloForFace(state, Face.R);

        expect(state.haloEl.getAttribute('cx')).toBe('150');
        expect(state.haloEl.getAttribute('cy')).toBe('200');
        expect(state.haloEl.getAttribute('rx')).toBe('60');
        expect(state.haloEl.getAttribute('ry')).toBe('40');
        expect(state.haloEl.getAttribute('visibility')).toBe('visible');
        expect(state.faceOverlayEl.getAttribute('pointer-events')).toBe('all');
    });

    it('should copy transform attribute when present', () => {
        const state = createMinimalState();
        addToBody(state.svgRoot);

        const ellipse = createSvgEl<SVGEllipseElement>('ellipse');
        ellipse.setAttribute('id', 'R-face-ellipse');
        ellipse.setAttribute('cx', '150');
        ellipse.setAttribute('cy', '200');
        ellipse.setAttribute('rx', '60');
        ellipse.setAttribute('ry', '40');
        ellipse.setAttribute('transform', 'rotate(45 150 200)');
        state.svgRoot.appendChild(ellipse);

        showHaloForFace(state, Face.R);

        expect(state.haloEl.getAttribute('transform')).toBe('rotate(45 150 200)');
        expect(state.faceOverlayEl.getAttribute('transform')).toBe('rotate(45 150 200)');
    });

    it('should not fail when face ellipse is missing', () => {
        const state = createMinimalState();

        // Should not throw — missing ellipse is a no-op
        expect(() => showHaloForFace(state, Face.D)).not.toThrow();
    });
});

describe('hideHalo', () => {
    it('should hide halo and disable face overlay pointer events', () => {
        const state = createMinimalState();

        hideHalo(state);

        expect(state.haloEl.getAttribute('visibility')).toBe('hidden');
        expect(state.faceOverlayEl.getAttribute('pointer-events')).toBe('none');
    });
});

describe('restoreTempFaceState', () => {
    it('should do nothing when no direct-mode temp face', () => {
        const state = createMinimalState({
            directModeTempFace: undefined,
            selectedFace: Face.U,
        });

        restoreTempFaceState(state);

        expect(state.selectedFace).toBe(Face.U);
    });

    it('should restore previous selected face when it exists', () => {
        const state = createMinimalState({
            directModeTempFace: Face.R,
            selectedFace: Face.R,
            previousSelectedFace: Face.U,
        });

        restoreTempFaceState(state);

        expect(state.selectedFace).toBe(Face.U);
        expect(state.directModeTempFace).toBeUndefined();
        expect(state.previousSelectedFace).toBeUndefined();
    });

    it('should hide halo when no previous selected face', () => {
        const state = createMinimalState({
            directModeTempFace: Face.R,
            selectedFace: Face.R,
            previousSelectedFace: undefined,
        });

        restoreTempFaceState(state);

        expect(state.selectedFace).toBeUndefined();
        expect(state.haloEl.getAttribute('visibility')).toBe('hidden');
    });
});

describe('isHaloElement', () => {
    it('should return true for haloEl', () => {
        const state = createMinimalState();
        expect(isHaloElement(state, state.haloEl)).toBe(true);
    });

    it('should return true for faceOverlayEl', () => {
        const state = createMinimalState();
        expect(isHaloElement(state, state.faceOverlayEl)).toBe(true);
    });

    it('should return false for other elements', () => {
        const state = createMinimalState();
        const other = createSvgEl('circle');
        expect(isHaloElement(state, other)).toBe(false);
    });

    it('should return false for null', () => {
        const state = createMinimalState();
        expect(isHaloElement(state, null)).toBe(false);
    });
});

describe('getFaceCenterClient', () => {
    it('should return undefined when face is undefined', () => {
        const state = createMinimalState();
        expect(getFaceCenterClient(state, undefined)).toBeUndefined();
    });

    it('should return undefined when face ellipse not found', () => {
        const state = createMinimalState();
        expect(getFaceCenterClient(state, Face.U)).toBeUndefined();
    });

    it('should return client coordinates when ellipse is found', () => {
        const state = createMinimalState();
        addToBody(state.svgRoot);

        const ellipse = createSvgEl<SVGEllipseElement>('ellipse');
        ellipse.setAttribute('id', 'U-face-ellipse');
        ellipse.setAttribute('cx', '100');
        ellipse.setAttribute('cy', '200');
        state.svgRoot.appendChild(ellipse);

        const result = getFaceCenterClient(state, Face.U);
        expect(result).toBeDefined();
        expect(typeof result!.x).toBe('number');
        expect(typeof result!.y).toBe('number');
    });
});

// ── Cancel zone ─────────────────────────────────────────────────────────────

describe('showCancelZone', () => {
    it('should position and show the cancel zone circle', () => {
        const state = createMinimalState();
        addToBody(state.svgRoot);

        showCancelZone(state, 100, 100);

        expect(state.cancelZoneEl.getAttribute('visibility')).toBe('visible');
        expect(state.cancelZoneEl.getAttribute('cx')).toBeDefined();
        expect(state.cancelZoneEl.getAttribute('cy')).toBeDefined();
        expect(state.cancelZoneEl.getAttribute('r')).toBeDefined();
    });
});

describe('hideCancelZone', () => {
    it('should hide the cancel zone', () => {
        const state = createMinimalState();

        hideCancelZone(state);

        expect(state.cancelZoneEl.getAttribute('visibility')).toBe('hidden');
    });
});

describe('getCommitThresholdPx', () => {
    it('should return floating threshold by default', () => {
        const state = createMinimalState({ layoutMode: LayoutMode.Floating });
        expect(getCommitThresholdPx(state)).toBeGreaterThan(0);
    });

    it('should return tabbed threshold in tabbed layout', () => {
        const state = createMinimalState({ layoutMode: LayoutMode.Tabbed });
        const tabbedThreshold = getCommitThresholdPx(state);
        expect(tabbedThreshold).toBeGreaterThan(0);

        // Tabbed should be larger than floating
        const floatingState = createMinimalState({ layoutMode: LayoutMode.Floating });
        expect(tabbedThreshold).toBeGreaterThan(getCommitThresholdPx(floatingState));
    });
});

// ── Detection bands ─────────────────────────────────────────────────────────

describe('showDetectionBand', () => {
    it('should return early when axis has no detection band entry', () => {
        const state = createMinimalState({ axisDetectionBands: new Map() });

        // Should not throw
        showDetectionBand(state, 0, 0, 10, 20, Axis.X);
    });

    it('should render the band and show only the target axis', () => {
        const bandEl = createSvgEl<SVGPathElement>('path');
        const clipEl = createSvgEl<SVGClipPathElement>('clipPath');
        const bands = new Map<Axis, { bandEl: SVGPathElement; clipEl: SVGClipPathElement }>();
        bands.set(Axis.X, { bandEl, clipEl });
        bands.set(Axis.Y, {
            bandEl: createSvgEl<SVGPathElement>('path'),
            clipEl: createSvgEl<SVGClipPathElement>('clipPath'),
        });

        const state = createMinimalState({ axisDetectionBands: bands });
        addToBody(state.svgRoot);

        showDetectionBand(state, 100, 100, 30, 50, Axis.X);

        expect(bandEl.getAttribute('d')).toBeTruthy();
        expect(bandEl.getAttribute('visibility')).toBe('visible');
        // Y band should be hidden
        expect(bands.get(Axis.Y)!.bandEl.getAttribute('visibility')).toBe('hidden');
    });
});

describe('hideDetectionBand', () => {
    it('should hide all detection bands', () => {
        const bandEl1 = createSvgEl<SVGPathElement>('path');
        const bandEl2 = createSvgEl<SVGPathElement>('path');
        const bands = new Map<Axis, { bandEl: SVGPathElement; clipEl: SVGClipPathElement }>();
        bands.set(Axis.X, { bandEl: bandEl1, clipEl: createSvgEl<SVGClipPathElement>('clipPath') });
        bands.set(Axis.Y, { bandEl: bandEl2, clipEl: createSvgEl<SVGClipPathElement>('clipPath') });

        const state = createMinimalState({ axisDetectionBands: bands });

        hideDetectionBand(state);

        expect(bandEl1.getAttribute('visibility')).toBe('hidden');
        expect(bandEl2.getAttribute('visibility')).toBe('hidden');
    });
});

describe('showDetectionBandForCircle', () => {
    it('should return early when axis has no circles', () => {
        const state = createMinimalState({ axisCircles: [] });

        showDetectionBandForCircle(state, { axis: Axis.X, layer: 0, cx: 0, cy: 0, r: 10 });

        // Should not throw
    });

    it('should return early when layer not found in group', () => {
        const state = createMinimalState({
            axisCircles: [makeCircle(Axis.X, 0, 100, 100, 30), makeCircle(Axis.X, 1, 100, 100, 50)],
        });

        showDetectionBandForCircle(state, { axis: Axis.X, layer: 5, cx: 0, cy: 0, r: 10 });

        // Should not throw
    });

    it('should show detection band for valid circle', () => {
        const bandEl = createSvgEl<SVGPathElement>('path');
        const clipEl = createSvgEl<SVGClipPathElement>('clipPath');
        const bands = new Map<Axis, { bandEl: SVGPathElement; clipEl: SVGClipPathElement }>();
        bands.set(Axis.X, { bandEl, clipEl });

        const state = createMinimalState({
            axisCircles: [makeCircle(Axis.X, 0, 100, 100, 30), makeCircle(Axis.X, 1, 100, 100, 50)],
            axisDetectionBands: bands,
        });
        addToBody(state.svgRoot);

        showDetectionBandForCircle(state, { axis: Axis.X, layer: 0, cx: 100, cy: 100, r: 30 });

        expect(bandEl.getAttribute('d')).toBeTruthy();
    });
});

describe('updateDetectionBandClip', () => {
    it('should create fallback clip path when no LBD triangle points', () => {
        const state = createMinimalState();
        const clipEl = createSvgEl<SVGClipPathElement>('clipPath');
        addToBody(state.svgRoot);

        updateDetectionBandClip(state, Axis.X, clipEl);

        expect(clipEl.firstChild).toBeTruthy();
    });

    it('should create per-axis clip path when LBD triangle points exist', () => {
        const state = createMinimalState();
        addToBody(state.svgRoot);

        // Create face label groups needed for getLbdTrianglePoints
        const makeLabelGroup = (id: string, x: number, y: number) => {
            const g = createSvgEl<SVGGElement>('g');
            g.setAttribute('id', id);
            const rect = createSvgEl<SVGRectElement>('rect');
            rect.setAttribute('width', '40');
            rect.setAttribute('height', '20');
            g.appendChild(rect);
            g.setAttribute('transform', `translate(${x}, ${y})`);
            state.svgRoot.appendChild(g);
        };
        makeLabelGroup('L-label', 50, 200);
        makeLabelGroup('B-label', 150, 200);
        makeLabelGroup('D-label', 100, 50);

        const clipEl = createSvgEl<SVGClipPathElement>('clipPath');

        updateDetectionBandClip(state, Axis.X, clipEl);

        expect(clipEl.firstChild).toBeTruthy();
        expect(clipEl.firstChild!.nodeName).toBe('path');
    });
});

// ── Axis circle previews ────────────────────────────────────────────────────

describe('getAxisCircleElementByKey', () => {
    it('should return undefined for unparseable key', () => {
        const state = createMinimalState();
        expect(getAxisCircleElementByKey(state, 'invalid')).toBeUndefined();
    });

    it('should return undefined when axis circle not found', () => {
        const state = createMinimalState({ axisCircles: [makeCircle(Axis.X, 0)] });
        expect(getAxisCircleElementByKey(state, 'Y-0')).toBeUndefined();
    });

    it('should return SVG element when found', () => {
        const svgCircle = createSvgEl<SVGCircleElement>('circle');
        svgCircle.setAttribute('id', 'X-0');
        const state = createMinimalState({
            axisCircles: [makeCircle(Axis.X, 0)],
        });
        state.svgRoot.appendChild(svgCircle);

        const result = getAxisCircleElementByKey(state, 'X-0');
        expect(result).toBe(svgCircle);
    });
});

describe('setAxisSelectedClass', () => {
    it('should return early when element not found', () => {
        const state = createMinimalState({ axisCircles: [makeCircle(Axis.X, 0)] });

        // Should not throw
        setAxisSelectedClass(state, 'X-0', true);
    });

    it('should add selected class when selected is true', () => {
        const svgCircle = createSvgEl<SVGCircleElement>('circle');
        svgCircle.setAttribute('id', 'X-0');
        const state = createMinimalState({
            axisCircles: [makeCircle(Axis.X, 0)],
        });
        state.svgRoot.appendChild(svgCircle);

        setAxisSelectedClass(state, 'X-0', true, svgCircle);

        expect(svgCircle.classList.contains('circular-axis-selected')).toBe(true);
    });

    it('should remove selected class when selected is false', () => {
        const svgCircle = createSvgEl<SVGCircleElement>('circle');
        svgCircle.classList.add('circular-axis-selected');
        const state = createMinimalState();

        setAxisSelectedClass(state, 'X-0', false, svgCircle);

        expect(svgCircle.classList.contains('circular-axis-selected')).toBe(false);
    });

    it('should use custom class name from styles', () => {
        const svgCircle = createSvgEl<SVGCircleElement>('circle');
        const state = createMinimalState({
            styles: { 'circular-axis-selected': 'custom-selected' },
        });

        setAxisSelectedClass(state, 'X-0', true, svgCircle);

        expect(svgCircle.classList.contains('custom-selected')).toBe(true);
    });
});

describe('clearAxisSelections', () => {
    it('should clear all selected axis circles', () => {
        const circle1 = createSvgEl<SVGCircleElement>('circle');
        circle1.classList.add('circular-axis-selected');
        const circle2 = createSvgEl<SVGCircleElement>('circle');
        circle2.classList.add('circular-axis-selected');

        // We need elements in the SVG for getElementById to work
        const state = createMinimalState({
            selectedAxisCircles: new Set(['X-0', 'Y-1']),
        });

        clearAxisSelections(state);

        expect(state.selectedAxisCircles.size).toBe(0);
    });
});
