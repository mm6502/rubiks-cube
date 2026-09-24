import { LayoutMode } from '@/cube/types/view';
import { clamp } from '@/cube/utils/math';
import { DRAG_LABEL_Z_INDEX } from '@/interaction/drag-decision-overlay';

/**
 * Parameters for computing the position of a floating drag-label overlay.
 */
export interface DragLabelPositionParams {
    /** Current layout mode (floating vs tabbed). */
    layoutMode: LayoutMode;
    /** Pointer client X coordinate (viewport space). */
    clientX: number;
    /** Pointer client Y coordinate (viewport space). */
    clientY: number;
    /** Measured or fallback width of the label element (px). */
    labelWidth: number;
    /** Measured or fallback height of the label element (px). */
    labelHeight: number;
    /** If `'touch'`, apply touch-specific offset so the label sits above the finger. */
    activePointerType?: string;
}

/**
 * Computed position result for a drag-label overlay.
 */
export interface DragLabelPositionResult {
    /** Computed left offset (px), ready for `style.left`. */
    x: number;
    /** Computed top offset (px), ready for `style.top`. */
    y: number;
    /** CSS `position` value — always `'fixed'`, so the label sits above every view. */
    position: 'fixed';
    /** CSS `z-index` value. */
    zIndex: string;
}

/** Keep this much of the label inside the viewport. */
const EDGE_MARGIN_PX = 4;

/**
 * Compute the screen position and style overrides for a drag-label overlay.
 *
 * The label is always `position: fixed` in viewport coordinates. Styling it
 * relative to its own panel looked equivalent but was not: a label drawn inside
 * a panel is clipped by whatever clips that panel, and is invisible the moment
 * the gesture is made against a screen edge — which is exactly when a user needs
 * to read it. Fixed positioning takes it out of every view's clipping context.
 *
 * The box is clamped to the *window*, never to a panel. Clamping to the panel is
 * what broke edge gestures before: a label 40px wide with the pointer 6px from
 * the edge would be pinned by its anchor and hang off screen, and a gesture made
 * near a screen edge could not show its own label at all.
 *
 * Offsets are preserved from the previous behaviour so the label still sits
 * clear of the cursor (down-right by default, above the finger for touch, and
 * well clear in tabbed layout).
 *
 * @param params - The pointer position, label size, and layout mode.
 */
export function computeDragLabelPosition(params: DragLabelPositionParams): DragLabelPositionResult {
    const { layoutMode, clientX, clientY, labelWidth, labelHeight, activePointerType } = params;

    let x: number;
    let y: number;

    if (layoutMode === LayoutMode.Tabbed) {
        // Centred above the pointer, clear of the tab bar.
        x = clientX - labelWidth / 2;
        y = clientY - labelHeight - 50;
    } else if (activePointerType === 'touch') {
        // Above the finger, so the finger does not cover it.
        x = clientX - labelWidth / 2;
        y = clientY - labelHeight - 36;
    } else {
        // Clear of the cursor, below-right.
        x = clientX + 14;
        y = clientY + 14;
    }

    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;

    /* c8 ignore if — a real browser always has a viewport */
    if (viewportWidth > 0 && viewportHeight > 0 && labelWidth > 0 && labelHeight > 0) {
        // `max` guards the case where the label cannot fit at all: without it the
        // clamp bounds invert (max < min) and produce a negative offset.
        const maxX = Math.max(EDGE_MARGIN_PX, viewportWidth - labelWidth - EDGE_MARGIN_PX);
        const maxY = Math.max(EDGE_MARGIN_PX, viewportHeight - labelHeight - EDGE_MARGIN_PX);
        x = clamp(x, EDGE_MARGIN_PX, maxX);
        y = clamp(y, EDGE_MARGIN_PX, maxY);
    }

    return { x, y, position: 'fixed', zIndex: String(DRAG_LABEL_Z_INDEX) };
}
