import { Application } from '@/application';
import { Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { clamp } from '@/cube/utils/math';
import { DragStateMachine } from '@/interaction/drag-state-machine';
import { inferMoveFromDrag, inferMoveFromFaceRotation } from '@/interaction/move-inference';
import {
    CANCEL_ZONE_RADIUS_BASE_PX,
    CANCEL_ZONE_TABBED_MULTIPLIER,
    DragDirection,
    DragGesture,
    GestureIntent,
    HitKind,
    InteractionContext,
    ViewInteractionAdapter,
} from '@/interaction/types';
import { EventName, MoveRequestedEvent } from '@/types';

type FlatTouchHandlerOptions = {
    host: HTMLElement;
    styles: Record<string, string>;
    getCubeSize: () => number;
    getIsRotated: () => boolean;
    onStickerSelected: (stickerId?: string) => void;
    adapter?: ViewInteractionAdapter;
};

type StickerHit = {
    stickerElement: HTMLElement;
    face: Face;
    row: number;
    col: number;
    stickerId?: string;
};

const DRAG_THRESHOLD_PX = 4;
const FAR_DRAG_THRESHOLD_PX = 60;

/**
 * Flat-view pointer interaction handler.
 * Supports tap-to-select face, drag-to-infer move, halo rendering, and drag label feedback.
 */
export class FlatTouchHandler {
    private readonly host: HTMLElement;
    private readonly styles: Record<string, string>;
    private readonly getCubeSize: () => number;
    private readonly getIsRotated: () => boolean;
    private readonly onStickerSelected: (stickerId?: string) => void;
    private readonly adapter: ViewInteractionAdapter;

    private layoutMode: LayoutMode = LayoutMode.Floating;

    private readonly dragStateMachine: DragStateMachine;
    private selectedFace: Face | undefined;
    private activePointerId: number | undefined;
    private activePointerType: string | undefined;
    private activePointerOrigin: { x: number; y: number } | undefined;
    private activePointerAllowsDrag = false;
    private startHit: StickerHit | undefined;
    private selectedFaceGesture = false;
    private suppressNextClick = false;

    private faceDirectMode = false;
    private directModeTempFace: Face | undefined;
    private previousSelectedFace: Face | undefined;

    private haloEl: HTMLDivElement;
    private haloHitTargetEl: HTMLDivElement;
    private haloCancelZoneEl: HTMLDivElement;
    private dragLabelEl: HTMLDivElement;
    private previousTouchAction: string;
    private haloFaceCenter: { x: number; y: number; size: number } | undefined;

    private activeCommitDistancePx = CANCEL_ZONE_RADIUS_BASE_PX;

    private onPointerDownBound: (event: PointerEvent) => void;
    private onPointerMoveBound: (event: PointerEvent) => void;
    private onPointerUpBound: (event: PointerEvent) => void;
    private onPointerCancelBound: (event: PointerEvent) => void;
    private onClickCaptureBound: (event: MouseEvent) => void;

    constructor(options: FlatTouchHandlerOptions) {
        this.host = options.host;
        this.styles = options.styles;
        this.getCubeSize = options.getCubeSize;
        this.getIsRotated = options.getIsRotated;
        this.onStickerSelected = options.onStickerSelected;
        this.adapter = options.adapter ?? createFlatInteractionAdapter(this.getIsRotated);

        this.haloEl = document.createElement('div');
        this.haloEl.className = this.styles['flat-halo'];
        this.haloEl.style.display = 'none';
        this.haloEl.setAttribute('aria-hidden', 'true');

        this.haloHitTargetEl = document.createElement('div');
        this.haloHitTargetEl.className = this.styles['flat-halo-hit-target'];
        this.haloHitTargetEl.style.display = 'none';
        this.haloHitTargetEl.setAttribute('aria-hidden', 'true');

        this.haloCancelZoneEl = document.createElement('div');
        this.haloCancelZoneEl.className = this.styles['flat-halo-cancel-zone'];
        this.haloCancelZoneEl.style.display = 'none';
        this.haloCancelZoneEl.setAttribute('aria-hidden', 'true');

        this.dragLabelEl = document.createElement('div');
        this.dragLabelEl.className = this.styles['flat-drag-label'];
        this.dragLabelEl.style.display = 'none';
        this.dragLabelEl.setAttribute('aria-hidden', 'true');

        this.previousTouchAction = this.host.style.touchAction;

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
        this.onClickCaptureBound = this.onClickCapture.bind(this);
    }

    attach(): void {
        // Ensure touch drags are routed to pointer events instead of scroll/pan.
        this.host.style.touchAction = 'none';

        this.host.appendChild(this.haloEl);
        this.host.appendChild(this.haloHitTargetEl);
        this.host.appendChild(this.haloCancelZoneEl);
        this.host.appendChild(this.dragLabelEl);

        this.host.addEventListener('pointerdown', this.onPointerDownBound);
        document.addEventListener('pointermove', this.onPointerMoveBound);
        document.addEventListener('pointerup', this.onPointerUpBound);
        document.addEventListener('pointercancel', this.onPointerCancelBound);
        this.host.addEventListener('click', this.onClickCaptureBound, { capture: true });
    }

    resize(): void {
        this.updateHaloPosition();
    }

    setLayoutMode(mode: LayoutMode): void {
        this.layoutMode = mode;
    }

    isFaceDirectMode(): boolean {
        return this.faceDirectMode;
    }

    setFaceDirectMode(enabled: boolean): void {
        this.faceDirectMode = enabled;
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

    destroy(): void {
        this.host.removeEventListener('pointerdown', this.onPointerDownBound);
        document.removeEventListener('pointermove', this.onPointerMoveBound);
        document.removeEventListener('pointerup', this.onPointerUpBound);
        document.removeEventListener('pointercancel', this.onPointerCancelBound);
        this.host.removeEventListener('click', this.onClickCaptureBound, { capture: true });

        this.dragStateMachine.onPointerCancel({ pointerId: this.activePointerId ?? -1 });

        this.host.style.touchAction = this.previousTouchAction;

        this.haloEl.remove();
        this.haloHitTargetEl.remove();
        this.haloCancelZoneEl.remove();
        this.dragLabelEl.remove();
    }

    private onPointerDown(event: PointerEvent): void {
        if (this.activePointerId !== undefined) {
            return;
        }

        if (event.cancelable) {
            event.preventDefault();
        }

        this.activePointerId = event.pointerId;
        this.activePointerType = event.pointerType;
        this.activePointerOrigin = { x: event.clientX, y: event.clientY };
        this.activePointerAllowsDrag = false;
        this.selectedFaceGesture = false;
        this.startHit = this.getStickerHitFromPoint(event.clientX, event.clientY);

        const isHaloDragStart = this.isHaloHitTargetAtPoint(event.clientX, event.clientY);

        // Face mode: temporarily select the hit face so that the drag acts as a
        // face-rotation gesture (same logic as BasicTouchHandler / CircularTouchHandler).
        if (this.faceDirectMode && this.startHit && !isHaloDragStart) {
            this.directModeTempFace = this.startHit.face;
            this.previousSelectedFace = this.selectedFace;
            this.selectedFace = this.startHit.face;
            this.applyFaceSelectionStyling();
            this.updateHaloPosition();
            this.startHit = undefined;
        }

        if (this.selectedFace && this.startHit?.face === this.selectedFace && !isHaloDragStart) {
            // Selected-face rotation is ring-only: drags inside the invisible center are ignored.
            this.startHit = undefined;
        }

        const canStartDrag = Boolean(
            (isHaloDragStart && this.selectedFace) ||
            (this.directModeTempFace && this.selectedFace) ||
            this.startHit
        );
        this.activePointerAllowsDrag = canStartDrag;

        if (!canStartDrag) {
            this.restoreTempFaceState();
            this.hideCancellationZone();
            return;
        }

        this.activeCommitDistancePx = this.cancelZoneRadiusPx();
        this.showCancellationZoneAtOrigin(event.clientX, event.clientY);

        if ((isHaloDragStart || this.directModeTempFace) && this.selectedFace) {
            this.selectedFaceGesture = true;
            this.dragStateMachine.onPointerDown(event, {
                rotationCenter: getElementCenter(this.haloHitTargetEl),
            });
        } else if (this.startHit) {
            const faceElement = this.findFaceElement(this.startHit.stickerElement);
            const rotationCenter =
                faceElement && this.startHit.face === this.selectedFace
                    ? getElementCenter(faceElement)
                    : undefined;

            this.dragStateMachine.onPointerDown(event, { rotationCenter });
        } else {
            this.dragStateMachine.onPointerDown(event);
        }

        this.host.setPointerCapture?.(event.pointerId);
        this.host.style.cursor = 'grabbing';
    }

    private onPointerMove(event: PointerEvent): void {
        if (
            this.activePointerId === event.pointerId &&
            this.activePointerAllowsDrag &&
            event.cancelable
        ) {
            event.preventDefault();
        }

        if (!this.activePointerAllowsDrag) {
            return;
        }

        this.dragStateMachine.onPointerMove(event);
    }

    private onPointerUp(event: PointerEvent): void {
        if (this.activePointerId !== event.pointerId) {
            return;
        }

        if (this.activePointerAllowsDrag && event.cancelable) {
            event.preventDefault();
        }

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

        this.activePointerId = undefined;
        this.activePointerType = undefined;
        this.activePointerOrigin = undefined;
        this.activePointerAllowsDrag = false;
        this.selectedFaceGesture = false;
        this.startHit = undefined;
        this.hideCancellationZone();
        this.restoreTempFaceState();
        this.host.releasePointerCapture?.(event.pointerId);
        this.host.style.cursor = '';
    }

    private onPointerCancel(event: PointerEvent): void {
        if (this.activePointerId !== event.pointerId) {
            return;
        }

        if (this.activePointerAllowsDrag) {
            this.dragStateMachine.onPointerCancel(event);
        }

        this.activePointerId = undefined;
        this.activePointerType = undefined;
        this.activePointerOrigin = undefined;
        this.activePointerAllowsDrag = false;
        this.selectedFaceGesture = false;
        this.startHit = undefined;
        this.hideDragLabel();
        this.hideCancellationZone();
        this.restoreTempFaceState();
        this.host.style.cursor = '';
    }

    private onClickCapture(event: MouseEvent): void {
        if (!this.suppressNextClick) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.suppressNextClick = false;
    }

    private handleTap(hit: StickerHit | undefined): void {
        if (!hit) {
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

    private updateFromGesture(gesture: DragGesture): void {
        const moveNotation = this.inferMoveNotationForGesture(gesture);
        if (!moveNotation) {
            this.hideDragLabel();
            return;
        }

        this.showDragLabel(moveNotation, gesture.current.x, gesture.current.y);
    }

    private finalizeGesture(gesture: DragGesture): void {
        const moveNotation = this.inferMoveNotationForGesture(gesture);
        this.hideDragLabel();

        if (!moveNotation) {
            return;
        }

        const payload: MoveRequestedEvent = {
            moveNotation,
            viewId: 'flat',
            tentative: false,
        };
        Application.eventBus.emit(EventName.MOVE_REQUESTED, payload);
    }

    private inferMoveNotationForGesture(gesture: DragGesture): string | undefined {
        const context = this.createInteractionContext();
        const intent = this.buildGestureIntent(gesture);

        if (intent.distancePx < this.activeCommitDistancePx) {
            return undefined;
        }

        if (intent.hitKind === HitKind.HALO && this.selectedFace) {
            const center = this.haloFaceCenter;
            const startDistFromCenter = center
                ? Math.hypot(gesture.start.x - center.x, gesture.start.y - center.y)
                : Infinity;
            // Near-center threshold: roughly the center cubie radius.
            const nearCenterThreshold = center ? center.size / 4 : 0;
            const isNearCenter = startDistFromCenter < nearCenterThreshold;

            let clockwise: boolean;
            if (isNearCenter && center) {
                // Angular displacement is unreliable near the center (small arm → noisy angle).
                // Use the cross product of the drag vector with the arm to the current pointer
                // position instead — stable even when the start is at the center.
                const armX = gesture.current.x - center.x;
                const armY = gesture.current.y - center.y;
                const cross = gesture.deltaX * armY - gesture.deltaY * armX;
                // In screen coords (Y down): cross < 0 → clockwise.
                clockwise = cross < 0;
            } else {
                const angular = intent.angularDisplacementRad;
                if (angular === undefined || Math.abs(angular) < 0.1) {
                    return undefined;
                }
                clockwise = angular > 0;
            }

            const baseNotation =
                this.adapter.inferFaceRotationNotation?.(this.selectedFace, clockwise, context) ??
                inferMoveFromFaceRotation(this.selectedFace, clockwise);
            if (intent.distancePx > this.dragStateMachine.farDragThresholdPx) {
                return baseNotation.replace(/'$/, '') + '2';
            }
            return baseNotation;
        }

        if (intent.hitKind !== HitKind.STICKER || !intent.face) {
            return undefined;
        }

        const row = intent.row;
        const col = intent.col;
        if (row === undefined || col === undefined) {
            return undefined;
        }

        const mappedDirection =
            this.adapter.mapDragDirection?.(intent.direction, intent.face, context) ??
            intent.direction;
        const moveNotation = inferMoveFromDrag({
            face: intent.face,
            row,
            col,
            direction: mappedDirection,
            cubeSize: context.cubeSize,
            distancePx: intent.distancePx,
            farDragThresholdPx: this.dragStateMachine.farDragThresholdPx,
        });

        return moveNotation;
    }

    private buildGestureIntent(gesture: DragGesture): GestureIntent {
        if (this.selectedFace && this.selectedFaceGesture) {
            return {
                hitKind: HitKind.HALO,
                direction: gesture.direction,
                distancePx: gesture.distancePx,
                deltaX: gesture.deltaX,
                deltaY: gesture.deltaY,
                angularDisplacementRad: gesture.angularDisplacementRad,
            };
        }

        if (this.startHit) {
            return {
                hitKind: HitKind.STICKER,
                direction: gesture.direction,
                distancePx: gesture.distancePx,
                deltaX: gesture.deltaX,
                deltaY: gesture.deltaY,
                angularDisplacementRad: gesture.angularDisplacementRad,
                face: this.startHit.face,
                row: this.startHit.row,
                col: this.startHit.col,
            };
        }

        return {
            hitKind: HitKind.NONE,
            direction: gesture.direction,
            distancePx: gesture.distancePx,
            deltaX: gesture.deltaX,
            deltaY: gesture.deltaY,
            angularDisplacementRad: gesture.angularDisplacementRad,
        };
    }

    private createInteractionContext(): InteractionContext {
        return {
            cubeSize: this.getCubeSize(),
            selectedFace: this.selectedFace,
            metadata: {
                isRotated: this.getIsRotated(),
            },
        };
    }

    showDragLabel(label: string, clientX: number, clientY: number): void {
        const hostRect = this.host.getBoundingClientRect();
        this.dragLabelEl.textContent = label;
        this.dragLabelEl.style.display = 'block';

        const labelWidth = this.dragLabelEl.offsetWidth || 40;
        const labelHeight = this.dragLabelEl.offsetHeight || 22;

        let x: number;
        let y: number;

        if (this.layoutMode === LayoutMode.Tabbed) {
            // Fixed positioning lets the label float above the panel header when dragging near the top edge.
            this.dragLabelEl.style.position = 'fixed';
            this.dragLabelEl.style.zIndex = '10000';
            x = clientX - labelWidth / 2;
            y = clientY - labelHeight - 50;
            x = clamp(x, 4, window.innerWidth - labelWidth - 4);
            y = clamp(y, 4, window.innerHeight - labelHeight - 4);
        } else {
            this.dragLabelEl.style.position = '';
            this.dragLabelEl.style.zIndex = '';
            const localX = clientX - hostRect.left;
            const localY = clientY - hostRect.top;

            x = localX + 14;
            y = localY + 14;

            if (this.activePointerType === 'touch') {
                // Keep feedback above the finger so the user can see the predicted move.
                x = localX - labelWidth / 2;
                y = localY - labelHeight - 36;
            }

            x = clamp(x, 4, hostRect.width - labelWidth - 4);
            y = clamp(y, 4, hostRect.height - labelHeight - 4);
        }

        this.dragLabelEl.style.left = `${x}px`;
        this.dragLabelEl.style.top = `${y}px`;
    }

    hideDragLabel(): void {
        this.dragLabelEl.style.display = 'none';
        this.dragLabelEl.style.position = '';
        this.dragLabelEl.style.zIndex = '';
    }

    private applyFaceSelectionStyling(): void {
        const stickers = this.host.querySelectorAll(`.${this.styles['flat-sticker']}`);

        stickers.forEach(stickerNode => {
            const sticker = stickerNode as HTMLElement;
            const face = sticker.getAttribute('data-face') as Face | null;
            if (face && this.selectedFace && face === this.selectedFace) {
                sticker.classList.add(this.styles['face-selected']);
            } else {
                sticker.classList.remove(this.styles['face-selected']);
            }
        });
    }

    private updateHaloPosition(): void {
        if (!this.selectedFace) {
            this.haloEl.style.display = 'none';
            this.haloHitTargetEl.style.display = 'none';
            return;
        }

        const faceEl = this.host.querySelector(
            `.${this.styles['flat-face']} .${this.styles['flat-sticker']}[data-face="${this.selectedFace}"]`
        ) as HTMLElement | null;
        const owningFaceEl = faceEl ? this.findFaceElement(faceEl) : null;

        if (!owningFaceEl) {
            this.haloEl.style.display = 'none';
            this.haloHitTargetEl.style.display = 'none';
            return;
        }

        const hostRect = this.host.getBoundingClientRect();
        const faceRect = owningFaceEl.getBoundingClientRect();
        const faceSize = Math.min(faceRect.width, faceRect.height);

        // Visual halo: inscribed circle — fits entirely inside the face square.
        const visualDiameter = Math.max(0, faceSize - 2);
        const visualRadius = visualDiameter / 2;

        // Center hole: one-third of face side.
        const innerRadius = Math.max(0, faceSize / 6);
        const ringWidth = Math.max(0, visualRadius - innerRadius);

        const centerX = faceRect.left + faceRect.width / 2;
        const centerY = faceRect.top + faceRect.height / 2;

        this.haloFaceCenter = { x: centerX, y: centerY, size: faceSize };

        this.haloEl.style.left = `${centerX - hostRect.left - visualRadius}px`;
        this.haloEl.style.top = `${centerY - hostRect.top - visualRadius}px`;
        this.haloEl.style.width = `${visualDiameter}px`;
        this.haloEl.style.height = `${visualDiameter}px`;
        this.haloEl.style.setProperty('--flat-halo-ring-width', `${ringWidth}px`);
        this.haloEl.style.display = 'block';

        // Hit-target covers the full face for rectangular drag detection.
        this.haloHitTargetEl.style.left = `${faceRect.left - hostRect.left}px`;
        this.haloHitTargetEl.style.top = `${faceRect.top - hostRect.top}px`;
        this.haloHitTargetEl.style.width = `${faceRect.width}px`;
        this.haloHitTargetEl.style.height = `${faceRect.height}px`;
        this.haloHitTargetEl.style.display = 'block';
    }

    private getStickerHitFromPoint(clientX: number, clientY: number): StickerHit | undefined {
        const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
        if (!element) {
            return undefined;
        }

        const stickerEl = element.closest(`.${this.styles['flat-sticker']}`) as HTMLElement | null;
        if (!stickerEl || !this.host.contains(stickerEl)) {
            return undefined;
        }

        const face = stickerEl.getAttribute('data-face') as Face | null;
        const posText = stickerEl.getAttribute('data-pos');
        if (!face || posText === null) {
            return undefined;
        }

        const cubeSize = this.getCubeSize();
        const pos = Number(posText);
        if (!Number.isFinite(pos)) {
            return undefined;
        }

        return {
            stickerElement: stickerEl,
            face,
            row: Math.floor(pos / cubeSize),
            col: pos % cubeSize,
            stickerId: stickerEl.getAttribute('data-sticker-id') ?? undefined,
        };
    }

    private findFaceElement(stickerElement: HTMLElement): HTMLElement | null {
        return stickerElement.closest(`.${this.styles['flat-face']}`) as HTMLElement | null;
    }

    private isHaloHitTargetAtPoint(clientX: number, clientY: number): boolean {
        if (!this.selectedFace || this.haloHitTargetEl.style.display === 'none') {
            return false;
        }

        const r = this.haloHitTargetEl.getBoundingClientRect();
        return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    }

    showCancellationZoneAtOrigin(clientX: number, clientY: number, radiusPx?: number): void {
        const hostRect = this.host.getBoundingClientRect();
        const radius = radiusPx ?? this.cancelZoneRadiusPx();
        const diameter = radius * 2;

        this.haloCancelZoneEl.style.left = `${clientX - hostRect.left - radius}px`;
        this.haloCancelZoneEl.style.top = `${clientY - hostRect.top - radius}px`;
        this.haloCancelZoneEl.style.width = `${diameter}px`;
        this.haloCancelZoneEl.style.height = `${diameter}px`;
        this.haloCancelZoneEl.style.display = 'block';
    }

    hideCancellationZone(): void {
        this.haloCancelZoneEl.style.display = 'none';
    }

    private cancelZoneRadiusPx(): number {
        return this.layoutMode === LayoutMode.Tabbed
            ? CANCEL_ZONE_RADIUS_BASE_PX * CANCEL_ZONE_TABBED_MULTIPLIER
            : CANCEL_ZONE_RADIUS_BASE_PX;
    }

    private wasTapWithoutDrag(clientX: number, clientY: number): boolean {
        if (!this.activePointerOrigin) {
            return false;
        }

        const deltaX = clientX - this.activePointerOrigin.x;
        const deltaY = clientY - this.activePointerOrigin.y;
        return Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX;
    }
}

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
                case DragDirection.RIGHT:
                    return DragDirection.UP;
                case DragDirection.DOWN:
                    return DragDirection.RIGHT;
                case DragDirection.LEFT:
                default:
                    return DragDirection.DOWN;
            }
        },
    };
}

function getElementCenter(element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
}
