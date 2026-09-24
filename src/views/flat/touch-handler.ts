import { Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import {
    DRAG_CROSS_ARM_LENGTH_FLOATING,
    DRAG_CROSS_ARM_LENGTH_TABBED,
    createDragDecisionOverlay,
} from '@/interaction/drag-decision-overlay';
import { DragStateMachine } from '@/interaction/drag-state-machine';
import {
    CANCEL_ZONE_RADIUS_BASE_PX,
    DragDirection,
    DragGesture,
    ViewInteractionAdapter,
} from '@/interaction/types';

import {
    findFaceElement,
    getStickerHitFromPoint,
    isHaloHitTargetAtPoint,
    wasTapWithoutDrag,
} from './touch-handler-hit-testing';
import {
    finalizeGesture,
    handleTap,
    inferMoveNotationForGesture,
    updateFromGesture,
} from './touch-handler-interaction';
import {
    applyFaceSelectionStyling,
    cancelZoneRadiusPx,
    createOverlayElement,
    hideCancellationZone,
    hideDragDecision,
    hideDragLabel,
    showCancellationZoneAtOrigin,
    showDragLabel,
    showHaloGuideLine,
    showStickerDragCross,
    showWholeCubeDragCross,
    updateHaloPosition,
} from './touch-handler-overlays';
import {
    DRAG_THRESHOLD_PX,
    FAR_DRAG_THRESHOLD_PX,
    FlatTouchHandlerOptions,
    FlatTouchHandlerState,
    StickerHit,
} from './touch-handler-types';

/**
 * Flat-view pointer interaction handler.
 * Supports tap-to-select face, drag-to-infer move, and drag label feedback.
 */
export class FlatTouchHandler {
    /** Mutable runtime state shared across all handler methods. */
    private s: FlatTouchHandlerState;

    /** Stable reference for adding and removing the pointerdown listener. */
    private onPointerDownBound: (event: PointerEvent) => void;
    /** Stable reference for adding and removing the pointermove listener. */
    private onPointerMoveBound: (event: PointerEvent) => void;
    /** Stable reference for adding and removing the pointerup listener. */
    private onPointerUpBound: (event: PointerEvent) => void;
    /** Stable reference for adding and removing the pointercancel listener. */
    private onPointerCancelBound: (event: PointerEvent) => void;
    /** Stable reference for adding and removing the capture-phase click listener. */
    private onClickCaptureBound: (event: MouseEvent) => void;

    constructor(options: FlatTouchHandlerOptions) {
        const adapter = options.adapter ?? createFlatInteractionAdapter(options.getIsRotated);

        const haloHitTargetEl = createOverlayElement(options.styles, 'flat-halo-hit-target');
        const haloCancelZoneEl = createOverlayElement(options.styles, 'flat-halo-cancel-zone');
        const dragLabelEl = createOverlayElement(options.styles, 'flat-drag-label');

        // The drag-decision cross / line, built from the same shared overlay the
        // Basic view uses — so "the Flat view shows the same indicator" is a
        // property of one implementation rather than of two copies staying in step.
        // The arm length is read lazily: the overlay only asks for it when it is
        // shown, by which time `this.s` exists.
        const dragDecision = createDragDecisionOverlay(
            options.styles['flat-drag-decision-arm'] ?? 'flat-drag-decision-arm',
            () =>
                this.s.layoutMode === LayoutMode.Tabbed
                    ? DRAG_CROSS_ARM_LENGTH_TABBED
                    : DRAG_CROSS_ARM_LENGTH_FLOATING
        );

        const dragStateMachine = new DragStateMachine(
            {
                onDragStart: () => {
                    this.s.suppressNextClick = true;
                },
                onDragUpdate: gesture => this.updateFromGesture(gesture),
                onDragEnd: gesture => this.finalizeGesture(gesture),
            },
            {
                dragThresholdPx: DRAG_THRESHOLD_PX,
                farDragThresholdPx: FAR_DRAG_THRESHOLD_PX,
            }
        );

        this.s = {
            host: options.host,
            styles: options.styles,
            getCubeSize: options.getCubeSize,
            getIsRotated: options.getIsRotated,
            onStickerSelected: options.onStickerSelected,
            adapter,
            dragStateMachine,
            layoutMode: LayoutMode.Floating,
            selectedFace: undefined,
            activePointerId: undefined,
            activePointerType: undefined,
            activePointerOrigin: undefined,
            activePointerAllowsDrag: false,
            startHit: undefined,
            selectedFaceGesture: false,
            backgroundGesture: false,
            suppressNextClick: false,
            activeCommitDistancePx: CANCEL_ZONE_RADIUS_BASE_PX,
            faceDirectMode: false,
            directModeTempFace: undefined,
            previousSelectedFace: undefined,
            haloHitTargetEl,
            haloCancelZoneEl,
            dragLabelEl,
            dragDecision,
            haloFaceCenter: undefined,
            previousTouchAction: options.host.style.touchAction,
        };

        this.onPointerDownBound = this.onPointerDown.bind(this);
        this.onPointerMoveBound = this.onPointerMove.bind(this);
        this.onPointerUpBound = this.onPointerUp.bind(this);
        this.onPointerCancelBound = this.onPointerCancel.bind(this);
        this.onClickCaptureBound = this.onClickCapture.bind(this);
    }

    /** Appends overlay elements to the host and registers all pointer event listeners. */
    attach(): void {
        this.s.host.style.touchAction = 'none';

        // The halo hit target and cancel zone mark places inside the panel, so
        // they belong to it. The label and the decision indicator follow the
        // pointer instead and are viewport-anchored, so a gesture made against a
        // screen edge still shows them in full rather than clipped by the panel.
        this.s.host.appendChild(this.s.haloHitTargetEl);
        this.s.host.appendChild(this.s.haloCancelZoneEl);
        document.body.appendChild(this.s.dragLabelEl);
        document.body.appendChild(this.s.dragDecision.element);

        this.s.host.addEventListener('pointerdown', this.onPointerDownBound);
        document.addEventListener('pointermove', this.onPointerMoveBound);
        document.addEventListener('pointerup', this.onPointerUpBound);
        document.addEventListener('pointercancel', this.onPointerCancelBound);
        this.s.host.addEventListener('click', this.onClickCaptureBound, { capture: true });
    }

    /** Recalculates and repositions the halo hit-target after the host element is resized. */
    resize(): void {
        this.updateHaloPosition();
    }

    /** Updates the layout mode so drag-direction mapping can account for orientation. */
    setLayoutMode(mode: LayoutMode): void {
        this.s.layoutMode = mode;
    }

    /** Returns whether face-direct mode is currently active. */
    isFaceDirectMode(): boolean {
        return this.s.faceDirectMode;
    }

    /** Enables or disables face-direct mode (dragging from any sticker selects that face first). */
    setFaceDirectMode(enabled: boolean): void {
        this.s.faceDirectMode = enabled;
    }

    /** Returns the currently selected face, or undefined if none is selected. */
    getSelectedFace(): Face | undefined {
        return this.s.selectedFace;
    }

    /** Programmatically selects a face and updates halo position and styling. */
    selectFace(face: Face | undefined): void {
        this.s.selectedFace = face;
        this.applyFaceSelectionStyling();
        this.updateHaloPosition();
    }

    /**
     * Rolls back the temporary face selection applied during a face-direct-mode drag.
     * No-op when no temporary face is active.
     */
    private restoreTempFaceState(): void {
        if (this.s.directModeTempFace === undefined) {
            return;
        }

        this.s.selectedFace = this.s.previousSelectedFace;
        this.s.directModeTempFace = undefined;
        this.s.previousSelectedFace = undefined;
        this.applyFaceSelectionStyling();
        this.updateHaloPosition();
    }

    /** Removes all event listeners, releases overlay elements, and restores prior touch-action. */
    destroy(): void {
        this.s.host.removeEventListener('pointerdown', this.onPointerDownBound);
        document.removeEventListener('pointermove', this.onPointerMoveBound);
        document.removeEventListener('pointerup', this.onPointerUpBound);
        document.removeEventListener('pointercancel', this.onPointerCancelBound);
        this.s.host.removeEventListener('click', this.onClickCaptureBound, { capture: true });

        this.s.dragStateMachine.onPointerCancel({ pointerId: this.s.activePointerId ?? -1 });

        this.s.host.style.touchAction = this.s.previousTouchAction;

        this.s.haloHitTargetEl.remove();
        this.s.haloCancelZoneEl.remove();
        this.s.dragLabelEl.remove();
        this.s.dragDecision.remove();
    }

    /**
     * Handles the start of a pointer interaction.
     * Records the active pointer, determines whether a drag can begin,
     * shows the cancellation zone, and delegates to the drag state machine.
     */
    private onPointerDown(event: PointerEvent): void {
        /* c8 ignore if — guard for multiple simultaneous pointers */
        if (this.s.activePointerId !== undefined) {
            return;
        }

        if (event.cancelable) {
            event.preventDefault();
        }

        this.s.activePointerId = event.pointerId;
        this.s.activePointerType = event.pointerType;
        this.s.activePointerOrigin = { x: event.clientX, y: event.clientY };
        this.s.activePointerAllowsDrag = false;
        this.s.selectedFaceGesture = false;
        this.s.backgroundGesture = false;
        this.s.startHit = this.getStickerHitFromPoint(event.clientX, event.clientY);

        // Whether the pointer went down on a sticker at all, before any of the
        // branches below clear `startHit`. This distinguishes a true background
        // drag (empty space or the legend) from a drag on the selected face's
        // own sticker — the latter is deliberately ignored, not rotated.
        const hadStickerHit = Boolean(this.s.startHit);

        const isHaloDragStart = this.isHaloHitTargetAtPoint(event.clientX, event.clientY);

        if (this.s.faceDirectMode && this.s.startHit && !isHaloDragStart) {
            this.s.directModeTempFace = this.s.startHit.face;
            this.s.previousSelectedFace = this.s.selectedFace;
            this.s.selectedFace = this.s.startHit.face;
            this.applyFaceSelectionStyling();
            this.updateHaloPosition();
            this.s.startHit = undefined;
        }

        if (
            this.s.selectedFace &&
            this.s.startHit?.face === this.s.selectedFace &&
            !isHaloDragStart
        ) {
            this.s.startHit = undefined;
        }

        const canStartDrag = Boolean(
            (isHaloDragStart && this.s.selectedFace) ||
            (this.s.directModeTempFace && this.s.selectedFace) ||
            this.s.startHit
        );
        this.s.activePointerAllowsDrag = canStartDrag;

        if (!canStartDrag) {
            if (hadStickerHit) {
                // The pointer went down on the selected face's own sticker (not
                // the halo). That is not a drag at all — neither a layer move
                // nor a whole-cube rotation — so end the interaction exactly as
                // before.
                this.restoreTempFaceState();
                this.hideCancellationZone();
                return;
            }

            // The pointer is on neither a sticker nor the halo: the empty
            // background (or the legend). A drag from here is a whole-cube
            // rotation, so it may begin.
            this.s.backgroundGesture = true;
            this.s.activePointerAllowsDrag = true;
        }

        this.s.activeCommitDistancePx = this.cancelZoneRadiusPx();
        this.showCancellationZoneAtOrigin(event.clientX, event.clientY);

        if ((isHaloDragStart || this.s.directModeTempFace) && this.s.selectedFace) {
            this.s.selectedFaceGesture = true;
            this.s.dragStateMachine.onPointerDown(event, {
                rotationCenter: getElementCenter(this.s.haloHitTargetEl),
            });
            showHaloGuideLine(this.s, event.clientX, event.clientY);
        } else if (this.s.startHit) {
            const faceElement = this.findFaceElement(this.s.startHit.stickerElement);
            const rotationCenter =
                faceElement && this.s.startHit.face === this.s.selectedFace
                    ? getElementCenter(faceElement)
                    : undefined;

            this.s.dragStateMachine.onPointerDown(event, { rotationCenter });
            showStickerDragCross(
                this.s,
                this.s.startHit.face,
                this.s.getCubeSize(),
                event.clientX,
                event.clientY
            );
        } else {
            // Background drag: whole-cube rotation, so the decision cross is the
            // axis-aligned four-zone shape read from screen direction alone.
            this.s.dragStateMachine.onPointerDown(event);
            showWholeCubeDragCross(this.s, event.clientX, event.clientY);
        }

        this.s.host.setPointerCapture?.(event.pointerId);
        this.s.host.style.cursor = 'grabbing';
    }

    /**
     * Forwards pointer movement to the drag state machine while the active pointer is tracked.
     * Suppresses default browser scroll/pan when a drag is in progress.
     */
    private onPointerMove(event: PointerEvent): void {
        if (
            this.s.activePointerId === event.pointerId &&
            this.s.activePointerAllowsDrag &&
            event.cancelable
        ) {
            event.preventDefault();
        }

        /* c8 ignore if — guard when move arrives without prior down */
        if (!this.s.activePointerAllowsDrag) {
            return;
        }

        this.s.dragStateMachine.onPointerMove(event);
    }

    /**
     * Finalizes the current pointer interaction.
     * Delegates to the drag state machine and handles tap recognition when no drag occurred.
     * Resets all active-pointer state afterwards.
     */
    private onPointerUp(event: PointerEvent): void {
        /* c8 ignore if — guard for wrong pointer id */
        if (this.s.activePointerId !== event.pointerId) {
            return;
        }

        if (this.s.activePointerAllowsDrag && event.cancelable) {
            event.preventDefault();
        }

        if (this.s.activePointerAllowsDrag) {
            const upResult = this.s.dragStateMachine.onPointerUp(event);

            if (upResult.wasTap) {
                const hit = this.getStickerHitFromPoint(event.clientX, event.clientY);
                this.handleTap(hit);
            }
        } else if (this.wasTapWithoutDrag(event.clientX, event.clientY)) {
            const hit = this.getStickerHitFromPoint(event.clientX, event.clientY);
            this.handleTap(hit);
        }

        this.s.activePointerId = undefined;
        this.s.activePointerType = undefined;
        this.s.activePointerOrigin = undefined;
        this.s.activePointerAllowsDrag = false;
        this.s.selectedFaceGesture = false;
        this.s.backgroundGesture = false;
        this.s.startHit = undefined;
        this.hideCancellationZone();
        hideDragDecision(this.s);
        this.restoreTempFaceState();
        this.s.host.releasePointerCapture?.(event.pointerId);
        this.s.host.style.cursor = '';
    }

    /**
     * Handles pointer cancellation (e.g. the pointer was captured by another element).
     * Cancels the drag state machine and resets all active-pointer state.
     */
    private onPointerCancel(event: PointerEvent): void {
        /* c8 ignore if — guard for wrong pointer id */
        if (this.s.activePointerId !== event.pointerId) {
            return;
        }

        if (this.s.activePointerAllowsDrag) {
            this.s.dragStateMachine.onPointerCancel(event);
        }

        this.s.activePointerId = undefined;
        this.s.activePointerType = undefined;
        this.s.activePointerOrigin = undefined;
        this.s.activePointerAllowsDrag = false;
        this.s.selectedFaceGesture = false;
        this.s.backgroundGesture = false;
        this.s.startHit = undefined;
        this.hideDragLabel();
        this.hideCancellationZone();
        hideDragDecision(this.s);
        this.restoreTempFaceState();
        this.s.host.style.cursor = '';
    }

    /**
     * Capture-phase click listener that swallows synthetic click events emitted
     * immediately after a drag ends, preventing unintended face-selection changes.
     */
    private onClickCapture(event: MouseEvent): void {
        /* c8 ignore next 5 — guard when click fires without a prior drag */
        if (!this.s.suppressNextClick) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.s.suppressNextClick = false;
    }

    /** Processes a tap gesture — selects or deselects the tapped face. */
    private handleTap(hit: StickerHit | undefined): void {
        handleTap(this.s, hit);
    }

    /** Updates drag-label and cancellation-zone feedback while the drag is in progress. */
    private updateFromGesture(gesture: DragGesture): void {
        updateFromGesture(this.s, gesture);
    }

    /** Commits or discards the inferred move when the drag completes. */
    private finalizeGesture(gesture: DragGesture): void {
        // Check if a move will be emitted before clearing the selection
        const moveNotation = inferMoveNotationForGesture(this.s, gesture);

        finalizeGesture(this.s, gesture, moveNotation);

        // Clear face selection after move is emitted
        if (moveNotation) {
            this.selectFace(undefined);
        }
    }

    /** Shows the drag-direction label overlay near the given client coordinates. */
    showDragLabel(label: string, clientX: number, clientY: number): void {
        showDragLabel(this.s, label, clientX, clientY);
    }

    /**
     * Shows the axis-aligned decision cross for a whole-cube legend drag.
     *
     * Axis-aligned rather than face-derived, because the legend gesture is read
     * from the drag's screen direction alone — there is no face under it to give
     * a basis. This matches the Basic view's background drag, which shows the
     * same axis-aligned cross for the same reason.
     */
    showWholeCubeDragCross(clientX: number, clientY: number): void {
        showWholeCubeDragCross(this.s, clientX, clientY);
    }

    /** Hides the drag-decision indicator (cross or line). */
    hideDragDecision(): void {
        hideDragDecision(this.s);
    }

    /** Hides the drag-direction label overlay. */
    hideDragLabel(): void {
        hideDragLabel(this.s);
    }

    /** Applies or removes face-selection CSS classes on the host element. */
    private applyFaceSelectionStyling(): void {
        applyFaceSelectionStyling(this.s);
    }

    /** Repositions the halo hit-target overlay to track the currently selected face. */
    private updateHaloPosition(): void {
        updateHaloPosition(this.s);
    }

    /** Returns the sticker element and face at the given client coordinates, or undefined if none. */
    private getStickerHitFromPoint(clientX: number, clientY: number): StickerHit | undefined {
        return getStickerHitFromPoint(this.s, clientX, clientY);
    }

    /** Walks up the DOM from a sticker element to find its parent face element. */
    private findFaceElement(stickerElement: HTMLElement): HTMLElement | null {
        return findFaceElement(this.s, stickerElement);
    }

    /** Returns true when the given point falls within the halo hit-target overlay. */
    private isHaloHitTargetAtPoint(clientX: number, clientY: number): boolean {
        return isHaloHitTargetAtPoint(this.s, clientX, clientY);
    }

    /** Shows the circular cancellation-zone overlay centred on the given client coordinates. */
    showCancellationZoneAtOrigin(clientX: number, clientY: number, radiusPx?: number): void {
        showCancellationZoneAtOrigin(this.s, clientX, clientY, radiusPx);
    }

    /** Hides the cancellation-zone overlay. */
    hideCancellationZone(): void {
        hideCancellationZone(this.s);
    }

    /** Returns the cancellation-zone radius in pixels, scaled by the current cube size. */
    private cancelZoneRadiusPx(): number {
        return cancelZoneRadiusPx(this.s);
    }

    /** Returns true when the pointer travelled less than the drag threshold since pointerdown. */
    private wasTapWithoutDrag(clientX: number, clientY: number): boolean {
        return wasTapWithoutDrag(this.s, clientX, clientY);
    }
}

/**
 * Builds a {@link ViewInteractionAdapter} for the flat view.
 * When the view is rotated 90°, drag directions are remapped from screen space
 * back into the logical unrotated coordinate space.
 */
function createFlatInteractionAdapter(getIsRotated: () => boolean): ViewInteractionAdapter {
    return {
        mapDragDirection(direction: DragDirection): DragDirection {
            if (!getIsRotated()) {
                return direction;
            }

            // Content is visually rotated by +90deg. Convert screen drag direction
            // back into the unrotated logical direction using the inverse mapping.
            switch (direction) {
                case DragDirection.UP:
                    return DragDirection.LEFT;
                /* c8 ignore next */
                case DragDirection.RIGHT:
                    return DragDirection.UP;
                /* c8 ignore next */
                case DragDirection.DOWN:
                    return DragDirection.RIGHT;
                /* c8 ignore next */
                case DragDirection.LEFT:
                default:
                    return DragDirection.DOWN;
            }
        },
    };
}

/** Returns the centre point of an element in client (viewport) coordinates. */
function getElementCenter(element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
}
