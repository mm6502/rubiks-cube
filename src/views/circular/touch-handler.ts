import { Axis, Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
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

        const dragCrossGroupEl = document.createElementNS(SVG_NS, 'g');
        dragCrossGroupEl.classList.add(styles['circular-drag-cross'] ?? 'circular-drag-cross');
        dragCrossGroupEl.setAttribute('visibility', 'hidden');
        dragCrossGroupEl.setAttribute('pointer-events', 'none');

        const dragCrossPrimaryEl = document.createElementNS(SVG_NS, 'line');
        dragCrossPrimaryEl.classList.add(
            styles['circular-drag-cross-arm'] ?? 'circular-drag-cross-arm'
        );
        const dragCrossSecondaryEl = document.createElementNS(SVG_NS, 'line');
        dragCrossSecondaryEl.classList.add(
            styles['circular-drag-cross-arm'] ?? 'circular-drag-cross-arm'
        );
        dragCrossGroupEl.appendChild(dragCrossPrimaryEl);
        dragCrossGroupEl.appendChild(dragCrossSecondaryEl);

        const fretboardGroupEl = document.createElementNS(SVG_NS, 'g');
        fretboardGroupEl.setAttribute('visibility', 'hidden');
        fretboardGroupEl.setAttribute('pointer-events', 'none');

        const fretboardLine1El = document.createElementNS(SVG_NS, 'line');
        fretboardLine1El.classList.add(
            styles['circular-fretboard-line'] ?? 'circular-fretboard-line'
        );
        const fretboardLine2El = document.createElementNS(SVG_NS, 'line');
        fretboardLine2El.classList.add(
            styles['circular-fretboard-line'] ?? 'circular-fretboard-line'
        );
        fretboardGroupEl.appendChild(fretboardLine1El);
        fretboardGroupEl.appendChild(fretboardLine2El);

        const axisDetectionBands = new Map<
            Axis,
            { bandEl: SVGPathElement; clipEl: SVGClipPathElement }
        >();
        const uid = Math.random().toString(36).slice(2, 8);
        for (const axis of [Axis.X, Axis.Y, Axis.Z] as Axis[]) {
            const bandEl = document.createElementNS(SVG_NS, 'path');
            bandEl.classList.add(styles['circular-debug-band'] ?? 'circular-debug-band');
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
            dragCrossGroupEl,
            dragCrossPrimaryEl,
            dragCrossSecondaryEl,
            fretboardGroupEl,
            fretboardLine1El,
            fretboardLine2El,
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
        state.svgRoot.appendChild(state.dragCrossGroupEl);
        state.svgRoot.appendChild(state.fretboardGroupEl);
        state.host.appendChild(state.dragLabelEl);
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
        state.dragCrossGroupEl.remove();
        state.fretboardGroupEl.remove();
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
