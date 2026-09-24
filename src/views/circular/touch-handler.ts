// fallow-ignore-file unused-type
import { Axis, Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import {
    DRAG_CROSS_ARM_LENGTH_FLOATING,
    DRAG_CROSS_ARM_LENGTH_TABBED,
    createDragDecisionOverlay,
    createParallelGuideOverlay,
} from '@/interaction/drag-decision-overlay';
import { DragStateMachine } from '@/interaction/drag-state-machine';
import { HitKind } from '@/interaction/types';

import { restoreFretboardState } from './touch-handler-fretboard';
import { createCircularInteractionAdapter } from './touch-handler-geometry';
import {
    getInteractionStart,
    handlePointerDown,
    handleTap,
    onDragEnd,
    onDragUpdate,
} from './touch-handler-interaction';
import {
    clearAxisSelections,
    hideAxisPreviewAll,
    hideCancelZone,
    hideDetectionBand,
    hideDragDecisionCross,
    hideDragLabel,
    hideHalo,
    restoreTempFaceState,
    showHaloForFace,
    updateDetectionBandClip,
} from './touch-handler-overlays';
import type { CircularTouchHandlerOptions, TouchHandlerState } from './touch-handler-types';
import { DRAG_THRESHOLD_PX, FAR_DRAG_THRESHOLD_PX, SVG_NS } from './touch-handler-types';

export { type TouchHandlerState } from './touch-handler-types';

/**
 * Thin façade that owns `TouchHandlerState` and exposes the public
 * pointer-event API consumed by the circular view.
 *
 * All interaction logic (hit detection, move inference, fretboard,
 * visual overlays) is delegated to the extracted module functions in
 * `touch-handler-interaction`, `touch-handler-fretboard`, and
 * `touch-handler-overlays`.
 */
export class CircularTouchHandler {
    private readonly state: TouchHandlerState;

    /**
     * Create all SVG / HTML overlay elements and initialise the
     * internal `TouchHandlerState` from the given options.
     */
    constructor(options: CircularTouchHandlerOptions) {
        const svgRoot = options.svgRoot;
        const styles = options.styles;

        const haloEl = document.createElementNS(SVG_NS, 'ellipse');
        haloEl.classList.add(styles['circular-halo']);
        haloEl.setAttribute('visibility', 'hidden');
        haloEl.setAttribute('pointer-events', 'none');

        const faceOverlayEl = document.createElementNS(SVG_NS, 'ellipse');
        faceOverlayEl.classList.add(styles['circular-face-overlay'] ?? 'circular-face-overlay');
        faceOverlayEl.setAttribute('pointer-events', 'none');

        const dragLabelEl = document.createElement('div');
        dragLabelEl.className = styles['circular-drag-label'] ?? 'circular-drag-label';
        dragLabelEl.style.display = 'none';
        dragLabelEl.setAttribute('aria-hidden', 'true');

        const cancelZoneEl = document.createElementNS(SVG_NS, 'circle');
        cancelZoneEl.classList.add(styles['circular-cancel-zone'] ?? 'circular-cancel-zone');
        cancelZoneEl.setAttribute('visibility', 'hidden');
        cancelZoneEl.setAttribute('pointer-events', 'none');
        cancelZoneEl.setAttribute('aria-hidden', 'true');

        const dragDecision = createDragDecisionOverlay(
            styles['circular-drag-cross-arm'] ?? 'circular-drag-cross-arm',
            () =>
                this.state.layoutMode === LayoutMode.Tabbed
                    ? DRAG_CROSS_ARM_LENGTH_TABBED
                    : DRAG_CROSS_ARM_LENGTH_FLOATING
        );

        const fretboardRails = createParallelGuideOverlay(
            styles['circular-fretboard-line'] ?? 'circular-fretboard-line'
        );

        const axisDetectionBands = new Map<
            Axis,
            { bandEl: SVGPathElement; clipEl: SVGClipPathElement }
        >();
        const uid = Math.random().toString(36).slice(2, 8);
        for (const axis of [Axis.X, Axis.Y, Axis.Z] as Axis[]) {
            const bandEl = document.createElementNS(SVG_NS, 'path');
            bandEl.classList.add(styles['circular-detection-band'] ?? 'circular-detection-band');
            bandEl.setAttribute('visibility', 'hidden');
            bandEl.setAttribute('pointer-events', 'none');
            bandEl.setAttribute('aria-hidden', 'true');

            const clipEl = document.createElementNS(SVG_NS, 'clipPath');
            clipEl.id = `detection-band-clip-${axis}-${uid}`;

            axisDetectionBands.set(axis, { bandEl, clipEl });
        }

        const dragStateMachine = new DragStateMachine(
            {
                onDragUpdate: gesture => onDragUpdate(this.state, gesture),
                onDragEnd: gesture => onDragEnd(this.state, gesture),
            },
            {
                dragThresholdPx: DRAG_THRESHOLD_PX,
                farDragThresholdPx: FAR_DRAG_THRESHOLD_PX,
            }
        );

        this.state = {
            svgRoot,
            host: options.host,
            styles,
            axisCircles: options.axisCircles,
            getCubeSize: options.getCubeSize,
            getCubeState: options.getCubeState,
            onStickerSelected: options.onStickerSelected,
            adapter: options.adapter ?? createCircularInteractionAdapter(options.axisCircles),
            dragStateMachine,

            haloEl,
            faceOverlayEl,
            dragLabelEl,
            cancelZoneEl,
            dragDecision,
            fretboardRails,
            axisDetectionBands,

            selectedFace: undefined,
            selectedAxisCircles: new Set<string>(),
            activePointerId: undefined,
            start: { kind: HitKind.NONE },
            pendingStickerCross: undefined,
            layoutMode: LayoutMode.Floating,
            faceDirectMode: false,
            directModeTempFace: undefined,
            previousSelectedFace: undefined,
            previewAxisKeys: undefined,

            savedAxisSelections: undefined,
            fretboardHighlightKey: undefined,
            fretboardVisualKeys: new Set<string>(),
            fretboardAxisGroup: undefined,
            fretboardBoundaries: undefined,
            fretboardAxis: undefined,
            fretboardRadialDir: undefined,
            fretboardStartSvg: undefined,
        };
    }

    /** Append overlay elements into the SVG and host DOM so they become visible. */
    attach(): void {
        const { state } = this;
        const defs =
            state.svgRoot.querySelector('defs') ??
            state.svgRoot.insertBefore(
                document.createElementNS(SVG_NS, 'defs'),
                state.svgRoot.firstChild
            );
        for (const [axis, { bandEl, clipEl }] of state.axisDetectionBands) {
            defs.appendChild(clipEl);
            updateDetectionBandClip(state, axis, clipEl);
            bandEl.setAttribute('clip-path', `url(#${clipEl.id})`);
            state.svgRoot.appendChild(bandEl);
        }
        state.svgRoot.appendChild(state.haloEl);
        state.svgRoot.appendChild(state.faceOverlayEl);
        state.svgRoot.appendChild(state.cancelZoneEl);

        // The label, the decision indicator and the fretboard rails all follow the
        // pointer, so they live in fixed layers on the body rather than inside the
        // SVG. Inside the SVG they were clipped by its viewBox and shrank with its
        // zoom (measured: an arm 70px at 1x renders 14px at 0.2x, and the rails'
        // gap fell to about 1px), both of which made the feedback useless exactly
        // when the view was zoomed out or the gesture was made near an edge.
        //
        // Order matters: the rails go in first so the decision indicator paints on
        // top. The rails say which band is being tracked, the arms say what is
        // about to be committed, and the latter must never be obscured.
        document.body.appendChild(state.dragLabelEl);
        document.body.appendChild(state.fretboardRails.element);
        document.body.appendChild(state.dragDecision.element);
    }

    /** Return whether face-direct mode is active. */
    getFaceDirectMode(): boolean {
        return this.state.faceDirectMode;
    }

    /** Enable or disable face-direct mode (tap-and-drag rotates face immediately). */
    setFaceDirectMode(enabled: boolean): void {
        this.state.faceDirectMode = enabled;
    }

    /** Return the currently selected face, or `undefined` if none. */
    getSelectedFace(): Face | undefined {
        return this.state.selectedFace;
    }

    /** Programmatically select or deselect a face (for keyboard-driven selection). */
    selectFace(face: Face | undefined): void {
        this.state.selectedFace = face;
        if (face) {
            showHaloForFace(this.state, face);
        } else {
            hideHalo(this.state);
        }
    }

    /** Update the layout mode, which affects commit thresholds and label positioning. */
    setLayoutMode(mode: LayoutMode): void {
        this.state.layoutMode = mode;
    }

    /** Cancel any active gesture, clear selections, and remove all overlay elements from the DOM. */
    destroy(): void {
        const { state } = this;
        state.dragStateMachine.onPointerCancel({ pointerId: state.activePointerId ?? -1 });
        state.activePointerId = undefined;
        state.start = { kind: HitKind.NONE };
        clearAxisSelections(state);
        state.haloEl.remove();
        state.faceOverlayEl.remove();
        state.cancelZoneEl.remove();
        state.dragDecision.remove();
        state.fretboardRails.remove();
        state.dragLabelEl.remove();
        for (const { bandEl, clipEl } of state.axisDetectionBands.values()) {
            bandEl.remove();
            clipEl.remove();
        }
    }

    /** Dispatch a pointer-down event to the interaction subsystem. */
    onPointerDown(event: PointerEvent, target: EventTarget | null): void {
        handlePointerDown(this.state, event, target);
    }

    /** Forward pointer-move to the drag state machine for threshold / direction tracking. */
    onPointerMove(event: PointerEvent): void {
        this.state.dragStateMachine.onPointerMove(event);
    }

    /** Complete the gesture: commit or cancel moves, restore state, and clean up overlays. */
    onPointerUp(event: PointerEvent, target: EventTarget | null): void {
        const { state } = this;
        const upResult = state.dragStateMachine.onPointerUp(event);

        restoreTempFaceState(state);
        restoreFretboardState(state);

        if (upResult.wasTap) {
            const hit = getInteractionStart(state, target, event.clientX, event.clientY);
            handleTap(state, hit);
        }

        state.activePointerId = undefined;
        state.start = { kind: HitKind.NONE };
        hideDragLabel(state);
        hideCancelZone(state);
        hideDragDecisionCross(state);
        hideDetectionBand(state);
        hideAxisPreviewAll(state);
    }

    /** Abort the active gesture, restore state, and clean up all overlays. */
    onPointerCancel(event: PointerEvent): void {
        const { state } = this;
        state.dragStateMachine.onPointerCancel(event);
        restoreTempFaceState(state);
        restoreFretboardState(state);
        state.activePointerId = undefined;
        state.start = { kind: HitKind.NONE };
        hideDragLabel(state);
        hideCancelZone(state);
        hideDragDecisionCross(state);
        hideDetectionBand(state);
        hideAxisPreviewAll(state);
    }
}
