import { LayoutMode } from '@/cube/types/view';
import { toFar } from '@/interaction/move-inference';
import { CANCEL_ZONE_RADIUS_BASE_PX, CANCEL_ZONE_TABBED_MULTIPLIER } from '@/interaction/types';

/** Mutable state for the legend drag gesture. */
export type LegendDragState = {
    isDragging: boolean;
    startX: number;
    startY: number;
};

/** Create an initial legend drag state. */
export function createLegendDragState(): LegendDragState {
    return { isDragging: false, startX: 0, startY: 0 };
}

export interface LegendDragCallbacks {
    readonly legendElement: HTMLElement;
    getIsRotated(): boolean;
    getLayoutMode(): LayoutMode;
    /**
     * Distance (px) past which a drag means the doubled move, not the quarter
     * turn. Shared with the layer-drag path so one gesture distance means one
     * thing across the view.
     */
    getFarDragThresholdPx(): number;
    showCancellationZone(x: number, y: number, radius: number): void;
    showDragLabel(notation: string, x: number, y: number): void;
    hideDragLabel(): void;
    hideCancellationZone(): void;
    /**
     * Show the axis-aligned decision cross at the pointer. The legend gesture is
     * read from screen direction alone, so the cross marks the four screen zones.
     */
    showDragCross(x: number, y: number): void;
    /** Hide the decision cross. */
    hideDragCross(): void;
    emitMove(notation: string): void;
}

/**
 * Maps screen-space drag deltas to a whole-cube rotation notation.
 * Desktop (not rotated):
 *   left (negative deltaX) → y, right (positive deltaX) → y'
 *   up (negative deltaY) → x, down (positive deltaY) → x'
 * Mobile (rotated -90°):
 *   left (negative deltaX) → x', right (positive deltaX) → x
 *   up (negative deltaY) → y, down (positive deltaY) → y'
 */
export function inferLegendMove(deltaX: number, deltaY: number, isRotated: boolean): string {
    if (isRotated) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            return deltaX > 0 ? 'x' : "x'";
        }
        return deltaY > 0 ? "y'" : 'y';
    }
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        return deltaX > 0 ? "y'" : 'y';
    }
    return deltaY > 0 ? "x'" : 'x';
}

/**
 * The notation a legend drag asks for, at the distance it was dragged.
 *
 * A drag past the far-drag threshold means the doubled rotation, spelled as the
 * `2` variant of the quarter turn the direction gives — `y` → `y2`, `x'` →
 * `x2'`. This is the same promotion the layer drags in this view already make,
 * through the same helper, so the two gesture families cannot drift apart.
 */
export function inferLegendNotation(
    deltaX: number,
    deltaY: number,
    isRotated: boolean,
    farDragThresholdPx: number
): string {
    const base = inferLegendMove(deltaX, deltaY, isRotated);
    const distance = Math.hypot(deltaX, deltaY);
    return distance > farDragThresholdPx ? toFar(base) : base;
}

/**
 * Create bound pointer-event handlers for the legend drag gesture.
 * Returns `{ down, move, up }` functions to attach to the DOM.
 */
export function createLegendDragHandlers(
    dragState: LegendDragState,
    cb: LegendDragCallbacks
): {
    down: (e: PointerEvent) => void;
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
} {
    const down = (event: PointerEvent): void => {
        event.stopPropagation();
        event.preventDefault();

        dragState.isDragging = true;
        dragState.startX = event.clientX;
        dragState.startY = event.clientY;

        cb.legendElement.style.cursor = 'grabbing';
        cb.legendElement.setPointerCapture(event.pointerId);

        cb.showCancellationZone(
            event.clientX,
            event.clientY,
            cb.getLayoutMode() === LayoutMode.Tabbed
                ? CANCEL_ZONE_RADIUS_BASE_PX * CANCEL_ZONE_TABBED_MULTIPLIER
                : CANCEL_ZONE_RADIUS_BASE_PX
        );
        cb.showDragCross(event.clientX, event.clientY);
    };

    const move = (event: PointerEvent): void => {
        if (!dragState.isDragging) return;

        const deltaX = event.clientX - dragState.startX;
        const deltaY = event.clientY - dragState.startY;
        const threshold = 20;

        if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
            cb.showDragLabel(
                inferLegendNotation(deltaX, deltaY, cb.getIsRotated(), cb.getFarDragThresholdPx()),
                event.clientX,
                event.clientY
            );
        } else {
            cb.hideDragLabel();
        }
    };

    const up = (event: PointerEvent): void => {
        if (!dragState.isDragging) return;

        const deltaX = event.clientX - dragState.startX;
        const deltaY = event.clientY - dragState.startY;
        const threshold = 20;

        if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
            cb.emitMove(
                inferLegendNotation(deltaX, deltaY, cb.getIsRotated(), cb.getFarDragThresholdPx())
            );
        }

        dragState.isDragging = false;
        cb.hideDragLabel();
        cb.hideCancellationZone();
        cb.hideDragCross();
        cb.legendElement.style.cursor = 'grab';
    };

    return { down, move, up };
}
