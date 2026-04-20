import { LayoutMode } from '@/cube/types/view';
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
    showCancellationZone(x: number, y: number, radius: number): void;
    showDragLabel(notation: string, x: number, y: number): void;
    hideDragLabel(): void;
    hideCancellationZone(): void;
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
    };

    const move = (event: PointerEvent): void => {
        if (!dragState.isDragging) return;

        const deltaX = event.clientX - dragState.startX;
        const deltaY = event.clientY - dragState.startY;
        const threshold = 20;

        if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
            cb.showDragLabel(
                inferLegendMove(deltaX, deltaY, cb.getIsRotated()),
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
            cb.emitMove(inferLegendMove(deltaX, deltaY, cb.getIsRotated()));
        }

        dragState.isDragging = false;
        cb.hideDragLabel();
        cb.hideCancellationZone();
        cb.legendElement.style.cursor = 'grab';
    };

    return { down, move, up };
}
