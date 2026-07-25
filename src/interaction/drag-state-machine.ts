// fallow-ignore-file unused-class-member
import { DragDirection, DragGesture, Point2D } from './types';

type PointerLike = {
    pointerId: number;
    clientX: number;
    clientY: number;
};

export type DragCallbacks = {
    onDragStart?: (gesture: DragGesture) => void;
    onDragUpdate?: (gesture: DragGesture) => void;
    onDragEnd?: (gesture: DragGesture) => void;
};

export type DragStateMachineOptions = {
    dragThresholdPx?: number;
    /** Minimum drag distance (px) required to treat a gesture as a "far" drag (e.g. 180° move). */
    farDragThresholdPx?: number;
};

export type PointerDownOptions = {
    rotationCenter?: Point2D;
};

export type PointerUpResult = {
    wasTap: boolean;
    gesture?: DragGesture;
};

type ActivePointerState = {
    pointerId: number;
    start: Point2D;
    current: Point2D;
    isDragging: boolean;
    rotationCenter?: Point2D;
};

const DEFAULT_DRAG_THRESHOLD_PX = 4;
const DEFAULT_FAR_DRAG_THRESHOLD_PX = 60;

/**
 * Shared pointer drag recognizer used by touch handlers across views.
 */
export class DragStateMachine {
    private readonly callbacks: DragCallbacks;
    private readonly dragThresholdPx: number;
    readonly farDragThresholdPx: number;
    private active: ActivePointerState | undefined;

    constructor(callbacks: DragCallbacks = {}, options: DragStateMachineOptions = {}) {
        this.callbacks = callbacks;
        this.dragThresholdPx = options.dragThresholdPx ?? DEFAULT_DRAG_THRESHOLD_PX;
        this.farDragThresholdPx = options.farDragThresholdPx ?? DEFAULT_FAR_DRAG_THRESHOLD_PX;
    }

    onPointerDown(pointer: PointerLike, options: PointerDownOptions = {}): void {
        this.active = {
            pointerId: pointer.pointerId,
            start: { x: pointer.clientX, y: pointer.clientY },
            current: { x: pointer.clientX, y: pointer.clientY },
            isDragging: false,
            rotationCenter: options.rotationCenter,
        };
    }

    onPointerMove(pointer: PointerLike): DragGesture | undefined {
        if (!this.active || pointer.pointerId !== this.active.pointerId) {
            return undefined;
        }

        this.active.current = { x: pointer.clientX, y: pointer.clientY };
        const gesture = this.buildGesture(this.active);

        if (!this.active.isDragging && gesture.distancePx >= this.dragThresholdPx) {
            this.active.isDragging = true;
            this.callbacks.onDragStart?.(gesture);
        }

        if (this.active.isDragging) {
            this.callbacks.onDragUpdate?.(gesture);
            return gesture;
        }

        return undefined;
    }

    onPointerUp(pointer: PointerLike): PointerUpResult {
        if (!this.active || pointer.pointerId !== this.active.pointerId) {
            return { wasTap: false };
        }

        this.active.current = { x: pointer.clientX, y: pointer.clientY };
        const gesture = this.buildGesture(this.active);
        const wasTap = !this.active.isDragging && gesture.distancePx < this.dragThresholdPx;

        if (this.active.isDragging) {
            this.callbacks.onDragEnd?.(gesture);
        }

        this.active = undefined;

        return wasTap ? { wasTap: true } : { wasTap: false, gesture };
    }

    onPointerCancel(pointer: Pick<PointerLike, 'pointerId'>): void {
        if (!this.active || pointer.pointerId !== this.active.pointerId) {
            return;
        }

        this.active = undefined;
    }

    isDragging(): boolean {
        return this.active?.isDragging ?? false;
    }

    /**
     * Update the rotation center used for angular displacement computation
     * while a drag is in progress. No-op if no pointer is being tracked.
     */
    setRotationCenter(center: Point2D): void {
        if (!this.active) {
            return;
        }
        this.active.rotationCenter = center;
    }

    private buildGesture(state: ActivePointerState): DragGesture {
        const deltaX = state.current.x - state.start.x;
        const deltaY = state.current.y - state.start.y;
        const distancePx = Math.hypot(deltaX, deltaY);
        const direction = quantizeDirection(deltaX, deltaY);

        const gesture: DragGesture = {
            pointerId: state.pointerId,
            start: state.start,
            current: state.current,
            deltaX,
            deltaY,
            distancePx,
            direction,
        };

        if (state.rotationCenter) {
            const startAngleRad = Math.atan2(
                state.start.y - state.rotationCenter.y,
                state.start.x - state.rotationCenter.x
            );
            const currentAngleRad = Math.atan2(
                state.current.y - state.rotationCenter.y,
                state.current.x - state.rotationCenter.x
            );

            gesture.startAngleRad = startAngleRad;
            gesture.currentAngleRad = currentAngleRad;
            gesture.angularDisplacementRad = normalizeAngleRad(currentAngleRad - startAngleRad);
        }

        return gesture;
    }
}

function quantizeDirection(deltaX: number, deltaY: number): DragDirection {
    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        return deltaX >= 0 ? DragDirection.RIGHT : DragDirection.LEFT;
    }
    return deltaY >= 0 ? DragDirection.DOWN : DragDirection.UP;
}

function normalizeAngleRad(angle: number): number {
    const twoPi = Math.PI * 2;
    let normalized = angle % twoPi;
    if (normalized > Math.PI) normalized -= twoPi;
    if (normalized < -Math.PI) normalized += twoPi;
    return normalized;
}
