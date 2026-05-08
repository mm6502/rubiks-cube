import { Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
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
import { finalizeGesture, handleTap, updateFromGesture } from './touch-handler-interaction';
import {
    applyFaceSelectionStyling,
    cancelZoneRadiusPx,
    createOverlayElement,
    hideCancellationZone,
    hideDragLabel,
    showCancellationZoneAtOrigin,
    showDragLabel,
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
 * Supports tap-to-select face, drag-to-infer move, halo rendering, and drag label feedback.
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

        const haloEl = createOverlayElement(options.styles, 'flat-halo');
        const haloHitTargetEl = createOverlayElement(options.styles, 'flat-halo-hit-target');
        const haloCancelZoneEl = createOverlayElement(options.styles, 'flat-halo-cancel-zone');
        const dragLabelEl = createOverlayElement(options.styles, 'flat-drag-label');

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
            suppressNextClick: false,
            activeCommitDistancePx: CANCEL_ZONE_RADIUS_BASE_PX,
            faceDirectMode: false,
            directModeTempFace: undefined,
            previousSelectedFace: undefined,
            haloEl,
            haloHitTargetEl,
            haloCancelZoneEl,
            dragLabelEl,
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

        this.s.host.appendChild(this.s.haloEl);
        this.s.host.appendChild(this.s.haloHitTargetEl);
        this.s.host.appendChild(this.s.haloCancelZoneEl);
        this.s.host.appendChild(this.s.dragLabelEl);

        this.s.host.addEventListener('pointerdown', this.onPointerDownBound);
        document.addEventListener('pointermove', this.onPointerMoveBound);
        document.addEventListener('pointerup', this.onPointerUpBound);
        document.addEventListener('pointercancel', this.onPointerCancelBound);
        this.s.host.addEventListener('click', this.onClickCaptureBound, { capture: true });
    }

    /** Recalculates and repositions the halo after the host element is resized. */
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

        this.s.haloEl.remove();
        this.s.haloHitTargetEl.remove();
        this.s.haloCancelZoneEl.remove();
        this.s.dragLabelEl.remove();
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
        this.s.startHit = this.getStickerHitFromPoint(event.clientX, event.clientY);

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
            this.restoreTempFaceState();
            this.hideCancellationZone();
            return;
        }

        this.s.activeCommitDistancePx = this.cancelZoneRadiusPx();
        this.showCancellationZoneAtOrigin(event.clientX, event.clientY);

        if ((isHaloDragStart || this.s.directModeTempFace) && this.s.selectedFace) {
            this.s.selectedFaceGesture = true;
            this.s.dragStateMachine.onPointerDown(event, {
                rotationCenter: getElementCenter(this.s.haloHitTargetEl),
            });
        } else if (this.s.startHit) {
            const faceElement = this.findFaceElement(this.s.startHit.stickerElement);
            const rotationCenter =
                faceElement && this.s.startHit.face === this.s.selectedFace
                    ? getElementCenter(faceElement)
                    : undefined;

            this.s.dragStateMachine.onPointerDown(event, { rotationCenter });
        } else {
            this.s.dragStateMachine.onPointerDown(event);
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
        this.s.startHit = undefined;
        this.hideCancellationZone();
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
        this.s.startHit = undefined;
        this.hideDragLabel();
        this.hideCancellationZone();
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
        finalizeGesture(this.s, gesture);
    }

    /** Shows the drag-direction label overlay near the given client coordinates. */
    showDragLabel(label: string, clientX: number, clientY: number): void {
        showDragLabel(this.s, label, clientX, clientY);
    }

    /** Hides the drag-direction label overlay. */
    hideDragLabel(): void {
        hideDragLabel(this.s);
    }

    /** Applies or removes face-selection CSS classes on the host element. */
    private applyFaceSelectionStyling(): void {
        applyFaceSelectionStyling(this.s);
    }

    /** Repositions the halo overlay to track the currently selected face. */
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
