import { Application } from '@/application';
import { Face } from '@/cube/types';
import type { CubeState, ReadOnlyCubeModel, StickerId } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { normalize2 } from '@/cube/utils/math';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { computeDragLabelPosition } from '@/interaction/drag-label-positioning';
import { DragStateMachine } from '@/interaction/drag-state-machine';
import { inferMoveFromDrag, inferMoveFromFaceRotation, toFar } from '@/interaction/move-inference';
import {
    CANCEL_ZONE_RADIUS_BASE_PX,
    CANCEL_ZONE_TABBED_MULTIPLIER,
    DragDirection,
    DragGesture,
    HitKind,
    InteractionContext,
    Point2D,
    ViewInteractionAdapter,
} from '@/interaction/types';
import { EventName, MoveRequestedEvent } from '@/types';
import { ViewRotation } from '@/types/geometry';

import * as navigation from './navigation';
import { buildFaceScreenBasis } from './interaction-adapter';
import type { BasicViewInternalData } from './types';

type StickerHit = {
    stickerElement: HTMLElement;
    face: Face;
    row: number;
    col: number;
    stickerId?: string;
};

const DRAG_THRESHOLD_PX = 4;
const FAR_DRAG_THRESHOLD_PX = 60;
const DRAG_CROSS_ARM_LENGTH_FLOATING = 34;
const DRAG_CROSS_ARM_LENGTH_TABBED = 64;
const SVG_NS = 'http://www.w3.org/2000/svg';

export type BasicTouchHandlerOptions = {
    /** The outer container element (host for abs-positioned overlays). */
    host: HTMLElement;
    /** CSS module class map from basic-view.module.css. */
    styles: Record<string, string>;
    /** Current cube edge size. */
    getCubeSize: () => number;
    /** Access to current view state (orientation vectors etc.). */
    getState: () => BasicViewInternalData;
    /** Called when a sticker tap changes selection. */
    onStickerSelected: (stickerId?: string) => void;
    /**
     * Called after a background drag changes the view orientation.
     * Should re-run rendering.updateRotation + rendering.updateFaceLabels.
     */
    onViewRotated: (
        direction: 'horizontal' | 'vertical',
        rotation: ViewRotation,
        steps: number
    ) => void;
    /** View identifier used in MOVE_REQUESTED events. */
    viewId: string;
    /** Adapter for direction remapping. */
    adapter: ViewInteractionAdapter;
    /**
     * Optional accessor for the cube model.
     * When provided, touch-handler uses CubeStateUtils for sticker lookup
     * instead of relying on DOM attributes like data-basic-pos.
     */
    getModel?: () => ReadOnlyCubeModel | null;
};

/**
 * Pointer/touch interaction handler for the Basic (CSS 3D) cube view.
 *
 * Three interaction modes:
 *  - **Background drag**: discrete view rotation (Ctrl-Arrow equivalent).
 *  - **Sticker drag**: layer move inferred via move-inference.
 *  - **Halo drag** (selected face ring): face rotation.
 *
 * Tapping a sticker selects its face (shows halo ring); tapping again or
 * tapping the background deselects.
 *
 * Setting `faceDirectMode = true` skips the pre-selection step: dragging any
 * sticker immediately rotates its face.
 */
export class BasicTouchHandler {
    private readonly host: HTMLElement;
    private readonly styles: Record<string, string>;
    private readonly getCubeSize: () => number;
    private readonly getState: () => BasicViewInternalData;
    private readonly onStickerSelected: (stickerId?: string) => void;
    private readonly onViewRotated: (
        direction: 'horizontal' | 'vertical',
        rotation: ViewRotation,
        steps: number
    ) => void;
    private readonly viewId: string;
    private readonly adapter: ViewInteractionAdapter;
    private readonly getModel: (() => ReadOnlyCubeModel | null) | undefined;

    private layoutMode: LayoutMode = 'floating';
    private faceDirectMode = false;

    private readonly dragStateMachine: DragStateMachine;
    private selectedFace: Face | undefined;
    private directModeTempFace: Face | undefined;
    private previousSelectedFace: Face | undefined;

    private activePointerId: number | undefined;
    private activePointerType: string | undefined;
    private activePointerOrigin: { x: number; y: number } | undefined;
    private activePointerAllowsDrag = false;
    /** Which kind of gesture started: halo, sticker, background, or none */
    private activeGestureKind: HitKind = HitKind.NONE;
    private startHit: StickerHit | undefined;
    private suppressNextClick = false;

    private haloHitTargetEl: HTMLDivElement;
    private haloCancelZoneEl: HTMLDivElement;
    private dragLabelEl: HTMLDivElement;
    private haloFaceCenter: { x: number; y: number; size: number } | undefined;

    private pendingStickerCross:
        | {
              basis: { upDir: Point2D; rightDir: Point2D };
              upMove: string;
              downMove: string;
              rightMove: string;
              leftMove: string;
          }
        | undefined;
    private dragDecisionSvgEl: SVGSVGElement;
    private dragDecisionPrimaryEl: SVGLineElement;
    private dragDecisionSecondaryEl: SVGLineElement;

    private activeCommitDistancePx = CANCEL_ZONE_RADIUS_BASE_PX;

    private readonly onPointerDownBound: (e: PointerEvent) => void;
    private readonly onPointerMoveBound: (e: PointerEvent) => void;
    private readonly onPointerUpBound: (e: PointerEvent) => void;
    private readonly onPointerCancelBound: (e: PointerEvent) => void;
    private readonly onPointerLeaveBound: (e: PointerEvent) => void;
    private readonly onClickCaptureBound: (e: MouseEvent) => void;

    constructor(options: BasicTouchHandlerOptions) {
        this.host = options.host;
        this.styles = options.styles;
        this.getCubeSize = options.getCubeSize;
        this.getState = options.getState;
        this.onStickerSelected = options.onStickerSelected;
        this.onViewRotated = options.onViewRotated;
        this.viewId = options.viewId;
        this.adapter = options.adapter;
        this.getModel = options.getModel;

        // Full-face invisible hit target (enables starting a drag anywhere on the face)
        this.haloHitTargetEl = document.createElement('div');
        this.haloHitTargetEl.className = this.styles['basic-halo-hit-target'] ?? '';
        this.haloHitTargetEl.style.display = 'none';
        this.haloHitTargetEl.setAttribute('aria-hidden', 'true');

        // Dashed cancellation zone shown at the drag origin
        this.haloCancelZoneEl = document.createElement('div');
        this.haloCancelZoneEl.className = this.styles['basic-halo-cancel-zone'] ?? '';
        this.haloCancelZoneEl.style.display = 'none';
        this.haloCancelZoneEl.setAttribute('aria-hidden', 'true');

        // Floating label showing the predicted move notation during drag
        this.dragLabelEl = document.createElement('div');
        this.dragLabelEl.className = this.styles['basic-drag-label'] ?? '';
        this.dragLabelEl.style.display = 'none';
        this.dragLabelEl.setAttribute('aria-hidden', 'true');

        // SVG overlay for drag decision cross / line indicator.
        this.dragDecisionSvgEl = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
        this.dragDecisionSvgEl.style.cssText =
            'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:20;';
        this.dragDecisionSvgEl.setAttribute('aria-hidden', 'true');
        this.dragDecisionSvgEl.setAttribute('visibility', 'hidden');
        this.dragDecisionPrimaryEl = document.createElementNS(SVG_NS, 'line') as SVGLineElement;
        this.dragDecisionPrimaryEl.classList.add(
            this.styles['basic-drag-decision-arm'] ?? 'basic-drag-decision-arm'
        );
        this.dragDecisionSecondaryEl = document.createElementNS(SVG_NS, 'line') as SVGLineElement;
        this.dragDecisionSecondaryEl.classList.add(
            this.styles['basic-drag-decision-arm'] ?? 'basic-drag-decision-arm'
        );
        this.dragDecisionSecondaryEl.setAttribute('visibility', 'hidden');
        this.dragDecisionSvgEl.appendChild(this.dragDecisionPrimaryEl);
        this.dragDecisionSvgEl.appendChild(this.dragDecisionSecondaryEl);

        this.dragStateMachine = new DragStateMachine(
            {
                onDragStart: () => {
                    this.suppressNextClick = true;
                },
                onDragUpdate: gesture => this.updateFromGesture(gesture),
                onDragEnd: gesture => this.finalizeGesture(gesture),
            },
            {
                dragThresholdPx: DRAG_THRESHOLD_PX,
                farDragThresholdPx: FAR_DRAG_THRESHOLD_PX,
            }
        );

        this.onPointerDownBound = this.onPointerDown.bind(this);
        this.onPointerMoveBound = this.onPointerMove.bind(this);
        this.onPointerUpBound = this.onPointerUp.bind(this);
        this.onPointerCancelBound = this.onPointerCancel.bind(this);
        this.onPointerLeaveBound = this.onPointerLeave.bind(this);
        this.onClickCaptureBound = this.onClickCapture.bind(this);
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    attach(): void {
        this.host.style.touchAction = 'none';

        this.host.appendChild(this.haloHitTargetEl);
        this.host.appendChild(this.haloCancelZoneEl);
        this.host.appendChild(this.dragLabelEl);
        this.host.appendChild(this.dragDecisionSvgEl);

        this.host.addEventListener('pointerdown', this.onPointerDownBound);
        this.host.addEventListener('pointerleave', this.onPointerLeaveBound);
        document.addEventListener('pointermove', this.onPointerMoveBound);
        document.addEventListener('pointerup', this.onPointerUpBound);
        document.addEventListener('pointercancel', this.onPointerCancelBound);
        this.host.addEventListener('click', this.onClickCaptureBound, { capture: true });
    }

    destroy(): void {
        this.host.removeEventListener('pointerdown', this.onPointerDownBound);
        this.host.removeEventListener('pointerleave', this.onPointerLeaveBound);
        document.removeEventListener('pointermove', this.onPointerMoveBound);
        document.removeEventListener('pointerup', this.onPointerUpBound);
        document.removeEventListener('pointercancel', this.onPointerCancelBound);
        this.host.removeEventListener('click', this.onClickCaptureBound, { capture: true });

        this.dragStateMachine.onPointerCancel({ pointerId: this.activePointerId ?? -1 });

        this.host.style.touchAction = '';

        this.restoreTempFaceState();
        this.clearFaceSurfaceHaloStyling();
        this.haloHitTargetEl.remove();
        this.haloCancelZoneEl.remove();
        this.dragLabelEl.remove();
        this.dragDecisionSvgEl.remove();
    }

    resize(): void {
        this.updateHaloPosition();
    }

    setLayoutMode(mode: LayoutMode): void {
        this.layoutMode = mode;
    }

    // -------------------------------------------------------------------------
    // Face direct mode
    // -------------------------------------------------------------------------

    setFaceDirectMode(enabled: boolean): void {
        this.faceDirectMode = enabled;
    }

    isFaceDirectMode(): boolean {
        return this.faceDirectMode;
    }

    getSelectedFace(): Face | undefined {
        return this.selectedFace;
    }

    /**
     * Programmatically select or deselect a face (for keyboard-driven face selection).
     */
    selectFace(face: Face | undefined): void {
        this.selectedFace = face;
        this.applyFaceSelectionStyling();
        this.updateHaloPosition();
    }

    // -------------------------------------------------------------------------
    // Pointer event handlers
    // -------------------------------------------------------------------------

    /**
     * Pointer-down handler — determines gesture kind (halo, sticker, background)
     * based on hit target and starts the drag state machine with the appropriate
     * rotation centre.
     */
    private onPointerDown(event: PointerEvent): void {
        if (this.activePointerId !== undefined) return;

        if (event.cancelable) event.preventDefault();

        this.activePointerId = event.pointerId;
        this.activePointerType = event.pointerType;
        this.activePointerOrigin = { x: event.clientX, y: event.clientY };
        this.activePointerAllowsDrag = false;
        this.activeGestureKind = HitKind.NONE;
        this.startHit = undefined;

        const isHaloTarget = this.isHaloHitTargetAtPoint(event.clientX, event.clientY);

        if (isHaloTarget && this.selectedFace) {
            // Start a face-rotation drag from the halo ring / hit target
            this.activeGestureKind = HitKind.HALO;
            this.activePointerAllowsDrag = true;
            this.activeCommitDistancePx = this.cancelZoneRadiusPx();
            this.showCancellationZoneAtOrigin(event.clientX, event.clientY);
            this.dragStateMachine.onPointerDown(event, {
                rotationCenter: getElementCenter(this.haloHitTargetEl),
            });
            this.setupStickerFaceDirectLine(this.selectedFace!, event.clientX, event.clientY);
        } else {
            const hit = this.getStickerHitFromPoint(event.clientX, event.clientY);

            if (hit) {
                if (this.faceDirectMode) {
                    // Face mode: behave as if the start face was selected,
                    // but only for this one gesture.
                    this.directModeTempFace = hit.face;
                    this.previousSelectedFace = this.selectedFace;
                    this.selectedFace = hit.face;
                    this.applyFaceSelectionStyling();
                    this.updateHaloPosition();

                    this.activeGestureKind = HitKind.HALO;
                    this.activePointerAllowsDrag = true;
                    this.activeCommitDistancePx = this.cancelZoneRadiusPx();
                    this.showCancellationZoneAtOrigin(event.clientX, event.clientY);
                    this.dragStateMachine.onPointerDown(event, {
                        rotationCenter: getElementCenter(this.haloHitTargetEl),
                    });
                    this.setupStickerFaceDirectLine(hit.face, event.clientX, event.clientY);
                } else {
                    // Face direct mode: any sticker drag immediately triggers face rotation.
                    // Normal mode: sticker on selected face ignores hits that fall inside
                    // the face area (only the halo ring can start a face rotation gesture);
                    // stickers on other faces start layer-move drags.
                    const isSameFaceInNormalMode =
                        !this.faceDirectMode && hit.face === this.selectedFace;

                    if (isSameFaceInNormalMode) {
                        // Inner-face area: do nothing — face rotation is ring-only in normal mode.
                        this.activePointerAllowsDrag = false;
                    } else {
                        this.startHit = hit;
                        this.activeGestureKind = HitKind.STICKER;
                        this.activePointerAllowsDrag = true;
                        this.activeCommitDistancePx = this.cancelZoneRadiusPx();
                        this.showCancellationZoneAtOrigin(event.clientX, event.clientY);
                        this.dragStateMachine.onPointerDown(event);
                        this.setupStickerDragCross(hit, event.clientX, event.clientY);
                    }
                }
            } else {
                // Only treat as a background (view-rotation) gesture if the pointer
                // is actually outside the cube element. Clicks on face gaps/padding
                // (between stickers) must not trigger a whole-cube rotation.
                const elAtPoint = document.elementFromPoint(event.clientX, event.clientY);
                const cubeEl = this.getState().cubeElement;
                const isOverCube =
                    elAtPoint !== null &&
                    cubeEl !== null &&
                    (cubeEl === elAtPoint || cubeEl.contains(elAtPoint));

                if (!isOverCube) {
                    // Background drag → discrete view rotation
                    this.activeGestureKind = HitKind.BACKGROUND;
                    this.activePointerAllowsDrag = true;
                    this.activeCommitDistancePx = this.cancelZoneRadiusPx();
                    this.showCancellationZoneAtOrigin(event.clientX, event.clientY);
                    this.dragStateMachine.onPointerDown(event);
                    this.setupBackgroundDragLine(event.clientX, event.clientY);
                }
                // else: on cube but not on a sticker (gap / padding) → no gesture
            }
        }

        if (this.activePointerAllowsDrag) {
            this.host.setPointerCapture?.(event.pointerId);
            this.host.style.cursor = 'grabbing';
        } else {
            this.hideCancellationZone();
        }
    }

    /**
     * Pointer-move handler — forwards to the drag state machine when a drag
     * is active, or updates the hover cursor when no pointer is captured.
     */
    private onPointerMove(event: PointerEvent): void {
        if (this.activePointerId === undefined) {
            this.updateHoverCursor(event.clientX, event.clientY);
        }

        if (
            this.activePointerId === event.pointerId &&
            this.activePointerAllowsDrag &&
            event.cancelable
        ) {
            event.preventDefault();
        }

        if (!this.activePointerAllowsDrag) return;
        if (this.activePointerId !== event.pointerId) return;

        this.dragStateMachine.onPointerMove(event);
    }

    /**
     * Pointer-leave handler — resets the grab cursor when the pointer exits
     * the host without an active drag.
     */
    private onPointerLeave(_event: PointerEvent): void {
        if (this.activePointerId === undefined) {
            this.host.style.cursor = '';
        }
    }

    /**
     * Pointer-up handler — finishes the gesture via the drag state machine
     * and handles taps (pointer-up without drag) as sticker/face selection.
     */
    private onPointerUp(event: PointerEvent): void {
        if (this.activePointerId !== event.pointerId) return;

        if (this.activePointerAllowsDrag && event.cancelable) event.preventDefault();

        if (this.activePointerAllowsDrag) {
            const upResult = this.dragStateMachine.onPointerUp(event);

            if (upResult.wasTap) {
                const hit = this.getStickerHitFromPoint(event.clientX, event.clientY);
                this.handleTap(hit);
            }
        } else if (this.wasTapWithoutDrag(event.clientX, event.clientY)) {
            const hit = this.getStickerHitFromPoint(event.clientX, event.clientY);
            this.handleTap(hit);
        }

        this.resetActivePointer();
    }

    /**
     * Pointer-cancel handler — aborts any active gesture and resets state.
     */
    private onPointerCancel(event: PointerEvent): void {
        if (this.activePointerId !== event.pointerId) return;

        if (this.activePointerAllowsDrag) {
            this.dragStateMachine.onPointerCancel(event);
        }

        this.hideDragLabel();
        this.resetActivePointer();
    }

    /**
     * Click-capture handler — suppresses the `click` event that would
     * otherwise fire after a drag gesture completes, preventing unintended
     * tap actions.
     */
    private onClickCapture(event: MouseEvent): void {
        if (!this.suppressNextClick) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.suppressNextClick = false;
    }

    /**
     * Reset all active-pointer state after a gesture finishes or cancels.
     * Releases pointer capture, hides overlays, and restores the cursor.
     */
    private resetActivePointer(): void {
        if (this.activePointerId !== undefined) {
            this.host.releasePointerCapture?.(this.activePointerId);
        }
        this.activePointerId = undefined;
        this.activePointerType = undefined;
        this.activePointerOrigin = undefined;
        this.activePointerAllowsDrag = false;
        this.activeGestureKind = HitKind.NONE;
        this.startHit = undefined;
        this.hideCancellationZone();
        this.hideDragDecision();
        this.restoreTempFaceState();
        this.host.style.cursor = '';
    }

    /**
     * Restore the previously selected face after a face-direct-mode gesture
     * completes or cancels.  Face-direct mode temporarily swaps the selected
     * face for a single drag; this undoes that swap.
     */
    private restoreTempFaceState(): void {
        if (this.directModeTempFace === undefined) {
            return;
        }

        this.selectedFace = this.previousSelectedFace;
        this.directModeTempFace = undefined;
        this.previousSelectedFace = undefined;
        this.applyFaceSelectionStyling();
        this.updateHaloPosition();
    }

    /**
     * Update the cursor based on pointer position during idle hover
     * (no active pointer). Shows grab cursor over stickers and outside
     * the cube, default cursor inside the cube.
     */
    private updateHoverCursor(clientX: number, clientY: number): void {
        const hit = this.getStickerHitFromPoint(clientX, clientY);
        if (hit) {
            this.host.style.cursor = 'grab';
            return;
        }

        const elAtPoint = document.elementFromPoint(clientX, clientY);
        const cubeEl = this.getState().cubeElement;
        const isOverCube =
            elAtPoint !== null &&
            cubeEl !== null &&
            (cubeEl === elAtPoint || cubeEl.contains(elAtPoint));

        this.host.style.cursor = isOverCube ? '' : 'grab';
    }

    // -------------------------------------------------------------------------
    // Tap handling
    // -------------------------------------------------------------------------

    /**
     * Handle a tap (pointer-up without drag) on a sticker or the background.
     * Toggles face selection: tapping the same face deselects it, tapping a
     * different face selects it, tapping the background deselects all.
     */
    private handleTap(hit: StickerHit | undefined): void {
        if (!hit) {
            // Tapped background — deselect
            this.selectedFace = undefined;
            this.applyFaceSelectionStyling();
            this.updateHaloPosition();
            return;
        }

        if (this.selectedFace === hit.face) {
            this.selectedFace = undefined;
        } else {
            this.selectedFace = hit.face;
        }

        this.onStickerSelected(hit.stickerId);
        this.applyFaceSelectionStyling();
        this.updateHaloPosition();
    }

    // -------------------------------------------------------------------------
    // Gesture inference
    // -------------------------------------------------------------------------

    /**
     * Drag-update callback from the drag state machine.
     * For background drags, shows a directional label (↑↓←→);
     * for halo/sticker drags, infers the WCA move notation and shows it.
     */
    private updateFromGesture(gesture: DragGesture): void {
        if (this.activeGestureKind === HitKind.BACKGROUND) {
            const backgroundLabel = this.getBackgroundDragPreviewLabel(gesture);
            if (!backgroundLabel) {
                this.hideDragLabel();
                return;
            }

            this.showDragLabel(backgroundLabel, gesture.current.x, gesture.current.y);
            return;
        }

        const moveNotation = this.inferMoveNotationForGesture(gesture);
        if (!moveNotation) {
            this.hideDragLabel();
            return;
        }
        this.showDragLabel(moveNotation, gesture.current.x, gesture.current.y);
    }

    /**
     * Drag-end callback from the drag state machine.
     * For background drags, performs a discrete view rotation step.
     * For halo/sticker drags, infers the final move notation and emits
     * a MOVE_REQUESTED event.
     */
    private finalizeGesture(gesture: DragGesture): void {
        this.hideDragLabel();

        if (this.activeGestureKind === HitKind.BACKGROUND) {
            this.finalizeBackgroundGesture(gesture);
            return;
        }

        const moveNotation = this.inferMoveNotationForGesture(gesture);
        if (!moveNotation) return;

        const payload: MoveRequestedEvent = {
            moveNotation,
            viewId: this.viewId,
            tentative: false,
        };
        Application.eventBus.emit(EventName.MOVE_REQUESTED, payload);
    }

    /**
     * Route gesture to the appropriate move-inference helper.
     * Returns undefined if the gesture hasn't exceeded the commit distance
     * or the gesture kind doesn't map to a supported move.
     */
    private inferMoveNotationForGesture(gesture: DragGesture): string | undefined {
        if (gesture.distancePx < this.activeCommitDistancePx) return undefined;

        if (this.activeGestureKind === HitKind.HALO && this.selectedFace) {
            return this.inferHaloRotation(gesture);
        }

        if (this.activeGestureKind === HitKind.STICKER && this.startHit) {
            return this.inferStickerLayerMove(gesture);
        }

        return undefined;
    }

    /**
     * Infer a face-rotation move from a halo drag gesture.
     *
     * Uses cross-product for near-center drags (more precise for small
     * angular displacements) and angular displacement for edge drags.
     */
    private inferHaloRotation(gesture: DragGesture): string | undefined {
        const center = this.haloFaceCenter;
        const startDistFromCenter = center
            ? Math.hypot(gesture.start.x - center.x, gesture.start.y - center.y)
            : Infinity;
        const nearCenterThreshold = center ? center.size / 4 : 0;
        const isNearCenter = startDistFromCenter < nearCenterThreshold;

        let clockwise: boolean;
        if (isNearCenter && center) {
            const armX = gesture.current.x - center.x;
            const armY = gesture.current.y - center.y;
            const cross = gesture.deltaX * armY - gesture.deltaY * armX;
            clockwise = cross < 0;
        } else {
            const angular = gesture.angularDisplacementRad;
            if (angular === undefined || Math.abs(angular) < 0.1) return undefined;
            clockwise = angular > 0;
        }

        const baseNotation =
            this.adapter.inferFaceRotationNotation?.(
                this.selectedFace!,
                clockwise,
                this.createInteractionContext()
            ) ?? inferMoveFromFaceRotation(this.selectedFace!, clockwise);

        return gesture.distancePx > this.dragStateMachine.farDragThresholdPx
            ? toFar(baseNotation)
            : baseNotation;
    }

    /**
     * Infer a layer-move notation from a sticker drag gesture.
     *
     * When a pre-computed drag cross is available, resolves the dominant
     * axis (up/down vs left/right) from the gesture delta projected onto
     * the face's screen-space basis. Falls back to adapter-based direction
     * remapping when the screen basis was degenerate.
     */
    private inferStickerLayerMove(gesture: DragGesture): string | undefined {
        if (this.pendingStickerCross) {
            const { basis, upMove, downMove, rightMove, leftMove } = this.pendingStickerCross;
            const dUp = gesture.deltaX * basis.upDir.x + gesture.deltaY * basis.upDir.y;
            const dRight = gesture.deltaX * basis.rightDir.x + gesture.deltaY * basis.rightDir.y;
            const baseMove =
                Math.abs(dUp) >= Math.abs(dRight)
                    ? dUp > 0
                        ? upMove
                        : downMove
                    : dRight > 0
                      ? rightMove
                      : leftMove;
            return gesture.distancePx > this.dragStateMachine.farDragThresholdPx
                ? toFar(baseMove)
                : baseMove;
        }

        // Fallback: adapter-based direction remapping (used if screen basis was degenerate)
        const hit = this.startHit!;
        const context = this.createInteractionContext();
        const mappedDirection =
            this.adapter.mapDragDirection?.(gesture.direction, hit.face, context) ??
            gesture.direction;

        return inferMoveFromDrag({
            face: hit.face,
            row: hit.row,
            col: hit.col,
            direction: mappedDirection,
            cubeSize: context.cubeSize,
            distancePx: gesture.distancePx,
            farDragThresholdPx: this.dragStateMachine.farDragThresholdPx,
        });
    }

    /**
     * Background drag: perform one discrete 90° view rotation step.
     *
     * Natural "grab and pull" UX (matching the view rotation commands):
     *   drag RIGHT → left face comes forward  → rotateViewRight
     *   drag LEFT  → right face comes forward → rotateViewLeft
     *   drag DOWN  → front goes down           → rotateViewDown
     *   drag UP    → front goes up             → rotateViewUp
     */
    private finalizeBackgroundGesture(gesture: DragGesture): void {
        if (gesture.distancePx < this.activeCommitDistancePx) return;

        const state = this.getState();
        const steps = gesture.distancePx > this.dragStateMachine.farDragThresholdPx ? 2 : 1;

        for (let i = 0; i < steps; i++) {
            switch (gesture.direction) {
                case DragDirection.RIGHT:
                    navigation.rotateViewRight(state);
                    break;
                case DragDirection.LEFT:
                    navigation.rotateViewLeft(state);
                    break;
                case DragDirection.DOWN:
                    navigation.rotateViewDown(state);
                    break;
                case DragDirection.UP:
                    navigation.rotateViewUp(state);
                    break;
            }
        }

        const rotation =
            gesture.direction === DragDirection.RIGHT
                ? ViewRotation.Right
                : gesture.direction === DragDirection.LEFT
                  ? ViewRotation.Left
                  : gesture.direction === DragDirection.DOWN
                    ? ViewRotation.Down
                    : ViewRotation.Up;

        this.onViewRotated(
            gesture.direction === DragDirection.UP || gesture.direction === DragDirection.DOWN
                ? 'vertical'
                : 'horizontal',
            rotation,
            steps
        );
    }

    private getBackgroundDragPreviewLabel(gesture: DragGesture): string | undefined {
        if (gesture.distancePx < this.activeCommitDistancePx) return undefined;

        const suffix = gesture.distancePx > this.dragStateMachine.farDragThresholdPx ? '2' : '';

        switch (gesture.direction) {
            case DragDirection.RIGHT:
                return `→${suffix}`;
            case DragDirection.LEFT:
                return `←${suffix}`;
            case DragDirection.DOWN:
                return `↓${suffix}`;
            case DragDirection.UP:
                return `↑${suffix}`;
            default:
                return undefined;
        }
    }

    // -------------------------------------------------------------------------
    // Halo overlay positioning & styling
    // -------------------------------------------------------------------------

    private updateHaloPosition(): void {
        this.clearFaceSurfaceHaloStyling();

        if (!this.selectedFace) {
            this.haloHitTargetEl.style.display = 'none';
            this.haloFaceCenter = undefined;
            return;
        }

        // Find the face <div> that has data-basic-face matching the selected face.
        // The face div also carries the '.face' CSS Module class.
        const faceEl = this.host.querySelector(
            `[data-basic-face="${this.selectedFace}"].${this.styles['face']}`
        ) as HTMLElement | null;

        if (!faceEl) {
            this.haloHitTargetEl.style.display = 'none';
            this.haloFaceCenter = undefined;
            return;
        }

        const hostRect = this.host.getBoundingClientRect();
        const faceRect = faceEl.getBoundingClientRect();
        // Use the element's own layout dimensions (not the 3D-projected screen rect)
        // so the ring width is consistent across all faces regardless of foreshortening.
        const faceSize = Math.min(faceEl.offsetWidth, faceEl.offsetHeight);
        // Screen-space size is needed for gesture hit-testing thresholds.
        const faceSizeOnScreen = Math.min(faceRect.width, faceRect.height);

        const visualDiameter = Math.max(0, faceSize - 2);
        const innerRadius = Math.max(0, faceSize / 6);
        const visualRadius = visualDiameter / 2;
        const ringWidth = Math.max(0, visualRadius - innerRadius);

        const centerX = faceRect.left + faceRect.width / 2;
        const centerY = faceRect.top + faceRect.height / 2;

        this.haloFaceCenter = { x: centerX, y: centerY, size: faceSizeOnScreen };

        const faceSelectedSurfaceClass = this.styles['face-selected-surface'] ?? '';
        if (faceSelectedSurfaceClass) {
            faceEl.classList.add(faceSelectedSurfaceClass);
        }
        faceEl.style.setProperty('--basic-face-halo-ring-width', `${ringWidth}px`);

        this.haloHitTargetEl.style.left = `${faceRect.left - hostRect.left}px`;
        this.haloHitTargetEl.style.top = `${faceRect.top - hostRect.top}px`;
        this.haloHitTargetEl.style.width = `${faceRect.width}px`;
        this.haloHitTargetEl.style.height = `${faceRect.height}px`;
        this.haloHitTargetEl.style.display = 'block';
    }

    private clearFaceSurfaceHaloStyling(): void {
        const faceClass = this.styles['face'] ?? '';
        if (!faceClass) return;

        const faceSelectedSurfaceClass = this.styles['face-selected-surface'] ?? '';
        const faces = this.host.querySelectorAll(`.${faceClass}`);
        faces.forEach(node => {
            const faceEl = node as HTMLElement;
            faceEl.style.removeProperty('--basic-face-halo-ring-width');
            if (faceSelectedSurfaceClass) {
                faceEl.classList.remove(faceSelectedSurfaceClass);
            }
        });
    }

    private applyFaceSelectionStyling(): void {
        // Some views (e.g. Basic 2) lack the 'face-selected' CSS class.
        // Skip DOM manipulation when the class name is empty to avoid
        // DOMTokenList.remove('') throwing SyntaxError.
        const faceSelected = this.styles['face-selected'];
        if (!faceSelected) return;

        const stickers = this.host.querySelectorAll(`.${this.styles['sticker']}`);

        stickers.forEach(node => {
            const el = node as HTMLElement;
            const face = el.getAttribute('data-basic-face') as Face | null;
            if (face && this.selectedFace && face === this.selectedFace) {
                el.classList.add(faceSelected);
            } else {
                el.classList.remove(faceSelected);
            }
        });
    }

    // -------------------------------------------------------------------------
    // Hit detection
    // -------------------------------------------------------------------------

    private getStickerHitFromPoint(clientX: number, clientY: number): StickerHit | undefined {
        const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
        if (!element) return undefined;

        const stickerClass = this.getState().stickerClass || 'sticker';
        const stickerEl = element.closest(`.${stickerClass}`) as HTMLElement | null;
        if (!stickerEl || !this.host.contains(stickerEl)) return undefined;

        const face = stickerEl.getAttribute('data-basic-face') as Face | null;
        if (!face) return undefined;

        const posText = stickerEl.getAttribute('data-basic-pos');
        let row: number;
        let col: number;

        if (posText !== null) {
            // Fast path: Basic view with grid positions
            const pos = Number(posText);
            if (!Number.isFinite(pos)) return undefined;
            const cubeSize = this.getCubeSize();
            row = Math.floor(pos / cubeSize);
            col = pos % cubeSize;
        } else {
            // Fallback: use CubeStateUtils for views without grid positions (Basic 2)
            const stickerId = stickerEl.getAttribute('data-sticker-id') as StickerId | null;
            if (!stickerId) return undefined;
            const model = this.getModel?.();
            if (!model) return undefined;
            const sticker = CubeStateUtils.getStickerById(model.getCurrentState(), stickerId);
            if (!sticker || !Number.isFinite(sticker.facePosition)) return undefined;
            const cubeSize = this.getCubeSize();
            row = Math.floor(sticker.facePosition / cubeSize);
            col = sticker.facePosition % cubeSize;
        }

        return {
            stickerElement: stickerEl,
            face,
            row,
            col,
            stickerId: stickerEl.getAttribute('data-sticker-id') ?? undefined,
        };
    }

    private isHaloHitTargetAtPoint(clientX: number, clientY: number): boolean {
        if (!this.selectedFace || this.haloHitTargetEl.style.display === 'none') return false;
        const r = this.haloHitTargetEl.getBoundingClientRect();
        return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    }

    // -------------------------------------------------------------------------
    // Drag label
    // -------------------------------------------------------------------------

    /**
     * Show the floating drag label at the given client position.
     * In tabbed mode uses fixed positioning (viewport-relative);
     * in floating mode uses local positioning (host-relative) with
     * an offset for touch pointers.
     */
    private showDragLabel(label: string, clientX: number, clientY: number): void {
        const hostRect = this.host.getBoundingClientRect();
        this.dragLabelEl.textContent = label;
        this.dragLabelEl.style.display = 'block';

        const labelWidth = this.dragLabelEl.offsetWidth || 40;
        const labelHeight = this.dragLabelEl.offsetHeight || 22;

        const result = computeDragLabelPosition({
            layoutMode: this.layoutMode,
            clientX,
            clientY,
            hostRect,
            labelWidth,
            labelHeight,
            activePointerType: this.activePointerType,
        });

        this.dragLabelEl.style.position = result.position;
        this.dragLabelEl.style.zIndex = result.zIndex;
        this.dragLabelEl.style.left = `${result.x}px`;
        this.dragLabelEl.style.top = `${result.y}px`;
    }

    /** Hide the drag label and reset any layout-mode-specific styling. */
    private hideDragLabel(): void {
        this.dragLabelEl.style.display = 'none';
        this.dragLabelEl.style.position = '';
        this.dragLabelEl.style.zIndex = '';
    }

    // -------------------------------------------------------------------------
    // Cancellation zone
    // -------------------------------------------------------------------------

    /**
     * Show the dashed cancellation zone circle centred at the pointer-down
     * origin.  Dragging back inside this zone cancels the gesture.
     */
    private showCancellationZoneAtOrigin(clientX: number, clientY: number): void {
        const hostRect = this.host.getBoundingClientRect();
        const radius = this.cancelZoneRadiusPx();
        const diameter = radius * 2;

        this.haloCancelZoneEl.style.left = `${clientX - hostRect.left - radius}px`;
        this.haloCancelZoneEl.style.top = `${clientY - hostRect.top - radius}px`;
        this.haloCancelZoneEl.style.width = `${diameter}px`;
        this.haloCancelZoneEl.style.height = `${diameter}px`;
        this.haloCancelZoneEl.style.display = 'block';
    }

    /** Hide the cancellation zone overlay. */
    private hideCancellationZone(): void {
        this.haloCancelZoneEl.style.display = 'none';
    }

    /**
     * Return the cancellation zone radius in pixels, scaled up for
     * tabbed layout to account for the larger clickable area.
     */
    private cancelZoneRadiusPx(): number {
        return this.layoutMode === LayoutMode.Tabbed
            ? CANCEL_ZONE_RADIUS_BASE_PX * CANCEL_ZONE_TABBED_MULTIPLIER
            : CANCEL_ZONE_RADIUS_BASE_PX;
    }

    /**
     * Returns the screen-space up and right unit vectors for a face by reading
     * the actual 2D projected positions of DOM sticker elements.  This correctly
     * reflects the full CSS 3D transform (including tilt/pitch) and works for
     * all six faces.  Falls back to the model-vector projection when the DOM
     * elements are unavailable or degenerate (e.g. in jsdom tests).
     */
    private getFaceScreenBasisFromDOM(
        face: Face,
        cubeSize: number
    ): { upDir: Point2D; rightDir: Point2D } | undefined {
        let s00 = this.host.querySelector(
            `[data-basic-face="${face}"][data-basic-pos="0"]`
        ) as HTMLElement | null;
        let s01 = this.host.querySelector(
            `[data-basic-face="${face}"][data-basic-pos="1"]`
        ) as HTMLElement | null;
        let s10 = this.host.querySelector(
            `[data-basic-face="${face}"][data-basic-pos="${cubeSize}"]`
        ) as HTMLElement | null;

        // Fallback: use CubeStateUtils for views without data-basic-pos (Basic 2)
        if ((!s00 || !s01 || !s10) && this.getModel) {
            const model = this.getModel();
            if (model) {
                const state = model.getCurrentState();
                if (!s00) s00 = this.resolveBasisElement(state, face, 0);
                if (!s01) s01 = this.resolveBasisElement(state, face, 1);
                if (!s10) s10 = this.resolveBasisElement(state, face, cubeSize);
            }
        }

        /* c8 ignore if */
        if (!s00 || !s01 || !s10) return undefined;

        const r00 = s00.getBoundingClientRect();
        const r01 = s01.getBoundingClientRect();
        const r10 = s10.getBoundingClientRect();
        const c00 = { x: r00.left + r00.width / 2, y: r00.top + r00.height / 2 };
        const c01 = { x: r01.left + r01.width / 2, y: r01.top + r01.height / 2 };
        const c10 = { x: r10.left + r10.width / 2, y: r10.top + r10.height / 2 };

        const rightRaw = { x: c01.x - c00.x, y: c01.y - c00.y };
        // c10 is the row-below neighbour in DOM grid order → screen-down → negate for screen-up
        const upRaw = { x: c00.x - c10.x, y: c00.y - c10.y };

        const rightDir = normalize2(rightRaw);
        const upDir = normalize2(upRaw);
        /* c8 ignore if */
        if (!rightDir || !upDir) return undefined;

        return { upDir, rightDir };
    }

    /**
     * Resolve a single DOM element for getFaceScreenBasisFromDOM fallback.
     * Uses CubeStateUtils to find the sticker at a given face/position
     * and reads its DOM screen position from the data-sticker-id element.
     */
    private resolveBasisElement(
        cubeState: CubeState,
        face: Face,
        position: number
    ): HTMLElement | null {
        const sticker = CubeStateUtils.getStickerAt(cubeState, face, position);
        if (!sticker) return null;
        return this.host.querySelector(`[data-sticker-id="${sticker.id}"]`) as HTMLElement | null;
    }

    /**
     * At pointer-down on a sticker (normal mode), pre-computes all 4 possible
     * moves and caches the face screen-space basis in `pendingStickerCross`.
     * Shows a dashed cross whose arms represent zone boundaries.
     */
    private setupStickerDragCross(sticker: StickerHit, clientX: number, clientY: number): void {
        const cubeSize = this.getCubeSize();
        const { face, row, col } = sticker;

        // Use DOM-position-derived basis (accounts for full CSS 3D tilt/pitch);
        // fall back to model-vector projection if DOM is unavailable (tests/edge cases).
        const state = this.getState();
        const screenBasis =
            this.getFaceScreenBasisFromDOM(face, cubeSize) ??
            buildFaceScreenBasis(face, state.viewRight, state.viewUp);
        /* c8 ignore if */
        if (!screenBasis) {
            this.hideDragDecision();
            return;
        }
        this.pendingStickerCross = {
            basis: screenBasis,
            upMove: inferMoveFromDrag({ face, row, col, direction: DragDirection.UP, cubeSize }),
            downMove: inferMoveFromDrag({
                face,
                row,
                col,
                direction: DragDirection.DOWN,
                cubeSize,
            }),
            rightMove: inferMoveFromDrag({
                face,
                row,
                col,
                direction: DragDirection.RIGHT,
                cubeSize,
            }),
            leftMove: inferMoveFromDrag({
                face,
                row,
                col,
                direction: DragDirection.LEFT,
                cubeSize,
            }),
        };

        this.showDragDecisionCross(screenBasis, clientX, clientY);
    }

    /**
     * At pointer-down on a sticker in face-direct mode (or on the halo ring),
     * shows a single line indicating the CW/CCW rotation boundary (radial from face center).
     */
    private setupStickerFaceDirectLine(_face: Face, clientX: number, clientY: number): void {
        const center = this.haloFaceCenter;
        /* c8 ignore if */
        if (!center) {
            this.hideDragDecision();
            return;
        }
        const dx = clientX - center.x;
        const dy = clientY - center.y;
        const mag = Math.hypot(dx, dy);
        /* c8 ignore if */
        if (mag < 1) {
            this.hideDragDecision();
            return;
        }
        this.showDragDecisionLine({ x: dx / mag, y: dy / mag }, clientX, clientY);
    }

    /**
     * At pointer-down on the background, shows a single line radiating from the
     * host center through the touch point — indicating the view-rotation zone.
     */
    private setupBackgroundDragLine(clientX: number, clientY: number): void {
        // Background always allows all 4 screen-aligned directions → show axis-aligned cross.
        this.showDragDecisionCross(
            { upDir: { x: 0, y: -1 }, rightDir: { x: 1, y: 0 } },
            clientX,
            clientY
        );
    }

    private showDragDecisionCross(
        basis: { upDir: Point2D; rightDir: Point2D },
        clientX: number,
        clientY: number
    ): void {
        const hostRect = this.host.getBoundingClientRect();
        const cx = clientX - hostRect.left;
        const cy = clientY - hostRect.top;
        const armLength =
            this.layoutMode === LayoutMode.Tabbed
                ? DRAG_CROSS_ARM_LENGTH_TABBED
                : DRAG_CROSS_ARM_LENGTH_FLOATING;

        // Arms are the zone boundaries — bisectors between adjacent drag directions.
        const arm1Dir =
            normalize2({
                x: basis.upDir.x + basis.rightDir.x,
                y: basis.upDir.y + basis.rightDir.y,
            }) ?? basis.upDir;
        const arm2Dir =
            normalize2({
                x: basis.upDir.x - basis.rightDir.x,
                y: basis.upDir.y - basis.rightDir.y,
            }) ?? basis.rightDir;

        setSvgLineFromCenter(this.dragDecisionPrimaryEl, { x: cx, y: cy }, arm1Dir, armLength);
        setSvgLineFromCenter(this.dragDecisionSecondaryEl, { x: cx, y: cy }, arm2Dir, armLength);
        this.dragDecisionSecondaryEl.removeAttribute('visibility');
        this.dragDecisionSvgEl.removeAttribute('visibility');
    }

    /**
     * Show a single radial line from the face center through the touch point,
     * indicating the CW/CCW rotation boundary for halo/face-direct drags.
     */
    private showDragDecisionLine(dir: Point2D, clientX: number, clientY: number): void {
        const hostRect = this.host.getBoundingClientRect();
        const cx = clientX - hostRect.left;
        const cy = clientY - hostRect.top;
        const armLength =
            this.layoutMode === LayoutMode.Tabbed
                ? DRAG_CROSS_ARM_LENGTH_TABBED
                : DRAG_CROSS_ARM_LENGTH_FLOATING;

        setSvgLineFromCenter(this.dragDecisionPrimaryEl, { x: cx, y: cy }, dir, armLength);
        this.dragDecisionSecondaryEl.setAttribute('visibility', 'hidden');
        this.dragDecisionSvgEl.removeAttribute('visibility');
    }

    /** Hide the drag decision overlay and clear `pendingStickerCross`. */
    private hideDragDecision(): void {
        this.pendingStickerCross = undefined;
        this.dragDecisionSvgEl.setAttribute('visibility', 'hidden');
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** Build an InteractionContext snapshot for move-inference functions. */
    private createInteractionContext(): InteractionContext {
        return {
            cubeSize: this.getCubeSize(),
            selectedFace: this.selectedFace,
        };
    }

    /**
     * Determine if the pointer-up qualifies as a tap (movement stayed within
     * the drag threshold).  Used when `activePointerAllowsDrag` is false but
     * we still need to check for a tap.
     */
    private wasTapWithoutDrag(clientX: number, clientY: number): boolean {
        /* c8 ignore if */
        if (!this.activePointerOrigin) return false;
        const dx = clientX - this.activePointerOrigin.x;
        const dy = clientY - this.activePointerOrigin.y;
        return Math.hypot(dx, dy) < DRAG_THRESHOLD_PX;
    }
}

// -------------------------------------------------------------------------
// Module-level helpers
// -------------------------------------------------------------------------

function getElementCenter(element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function setSvgLineFromCenter(
    line: SVGLineElement,
    center: Point2D,
    dir: Point2D,
    armLength: number
): void {
    line.setAttribute('x1', String(center.x - dir.x * armLength));
    line.setAttribute('y1', String(center.y - dir.y * armLength));
    line.setAttribute('x2', String(center.x + dir.x * armLength));
    line.setAttribute('y2', String(center.y + dir.y * armLength));
}
