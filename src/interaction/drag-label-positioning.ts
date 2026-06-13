import { LayoutMode } from '@/cube/types/view';
import { clamp } from '@/cube/utils/math';

/**
 * Parameters for computing the position of a floating drag-label overlay.
 */
export interface DragLabelPositionParams {
    /** Current layout mode (floating vs tabbed). */
    layoutMode: LayoutMode;
    /** Pointer client X coordinate. */
    clientX: number;
    /** Pointer client Y coordinate. */
    clientY: number;
    /** Bounding rect of the host element. */
    hostRect: DOMRect;
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
    /** CSS `position` value — `'fixed'` for tabbed, `''` for floating. */
    position: 'fixed' | '';
    /** CSS `z-index` value — `'10000'` for tabbed, `''` for floating. */
    zIndex: string;
}

/**
 * Compute the screen position and style overrides for a drag-label overlay.
 *
 * In **tabbed** layout the label uses `position: fixed` (viewport-relative)
 * with a generous vertical offset above the pointer.  In **floating** layout
 * the label is host-relative, offset below-right of the pointer by default,
 * or above the pointer for touch input.
 */
export function computeDragLabelPosition(params: DragLabelPositionParams): DragLabelPositionResult {
    const { layoutMode, clientX, clientY, hostRect, labelWidth, labelHeight, activePointerType } =
        params;

    let x: number;
    let y: number;
    let position: 'fixed' | '';
    let zIndex: string;

    if (layoutMode === LayoutMode.Tabbed) {
        position = 'fixed';
        zIndex = '10000';
        x = clientX - labelWidth / 2;
        y = clientY - labelHeight - 50;
        x = clamp(x, 4, window.innerWidth - labelWidth - 4);
        y = clamp(y, 4, window.innerHeight - labelHeight - 4);
    } else {
        position = '';
        zIndex = '';
        const localX = clientX - hostRect.left;
        const localY = clientY - hostRect.top;

        x = localX + 14;
        y = localY + 14;

        if (activePointerType === 'touch') {
            x = localX - labelWidth / 2;
            y = localY - labelHeight - 36;
        }

        x = clamp(x, 4, hostRect.width - labelWidth - 4);
        y = clamp(y, 4, hostRect.height - labelHeight - 4);
    }

    return { x, y, position, zIndex };
}
