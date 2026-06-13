/**
 * Visual overlay management for the flat touch handler.
 *
 * Exports functions that manage the DOM overlay elements: halo ring,
 * halo hit-target, cancel zone, drag label, and face-selection styling.
 */
import { Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { computeDragLabelPosition } from '@/interaction/drag-label-positioning';
import { CANCEL_ZONE_RADIUS_BASE_PX, CANCEL_ZONE_TABBED_MULTIPLIER } from '@/interaction/types';

import type { FlatTouchHandlerState } from './touch-handler-types';

// ── Overlay element creation ────────────────────────────────────────

/**
 * Create a hidden, aria-hidden `<div>` overlay element with the given CSS
 * module class name. Used to construct halo, hit-target, cancel-zone, and
 * drag-label elements during handler initialization.
 */
export function createOverlayElement(
    styles: Record<string, string>,
    className: string
): HTMLDivElement {
    const el = document.createElement('div');
    el.className = styles[className];
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    return el;
}

// ── Halo position ───────────────────────────────────────────────────

/**
 * Reposition the visual halo ring and invisible hit-target to match the
 * currently selected face. Hides both elements when no face is selected.
 * Also caches `s.haloFaceCenter` for use by rotation-direction inference.
 */
export function updateHaloPosition(s: FlatTouchHandlerState): void {
    if (!s.selectedFace) {
        s.haloEl.style.display = 'none';
        s.haloHitTargetEl.style.display = 'none';
        return;
    }

    const faceEl = s.host.querySelector(
        `.${s.styles['flat-face']} .${s.styles['flat-sticker']}[data-face="${s.selectedFace}"]`
    ) as HTMLElement | null;
    const owningFaceEl = faceEl ? findFaceElement(s, faceEl) : null;

    if (!owningFaceEl) {
        s.haloEl.style.display = 'none';
        s.haloHitTargetEl.style.display = 'none';
        return;
    }

    const hostRect = s.host.getBoundingClientRect();
    const faceRect = owningFaceEl.getBoundingClientRect();
    const faceSize = Math.min(faceRect.width, faceRect.height);

    const visualDiameter = Math.max(0, faceSize - 2);
    const visualRadius = visualDiameter / 2;

    const innerRadius = Math.max(0, faceSize / 6);
    const ringWidth = Math.max(0, visualRadius - innerRadius);

    const centerX = faceRect.left + faceRect.width / 2;
    const centerY = faceRect.top + faceRect.height / 2;

    s.haloFaceCenter = { x: centerX, y: centerY, size: faceSize };

    s.haloEl.style.left = `${centerX - hostRect.left - visualRadius}px`;
    s.haloEl.style.top = `${centerY - hostRect.top - visualRadius}px`;
    s.haloEl.style.width = `${visualDiameter}px`;
    s.haloEl.style.height = `${visualDiameter}px`;
    s.haloEl.style.setProperty('--flat-halo-ring-width', `${ringWidth}px`);
    s.haloEl.style.display = 'block';

    s.haloHitTargetEl.style.left = `${faceRect.left - hostRect.left}px`;
    s.haloHitTargetEl.style.top = `${faceRect.top - hostRect.top}px`;
    s.haloHitTargetEl.style.width = `${faceRect.width}px`;
    s.haloHitTargetEl.style.height = `${faceRect.height}px`;
    s.haloHitTargetEl.style.display = 'block';
}

// ── Face selection styling ──────────────────────────────────────────

/**
 * Toggle the `face-selected` CSS class on every sticker element so that
 * only stickers belonging to the currently selected face are highlighted.
 */
export function applyFaceSelectionStyling(s: FlatTouchHandlerState): void {
    const stickers = s.host.querySelectorAll(`.${s.styles['flat-sticker']}`);

    stickers.forEach(stickerNode => {
        const sticker = stickerNode as HTMLElement;
        const face = sticker.getAttribute('data-face') as Face | null;
        if (face && s.selectedFace && face === s.selectedFace) {
            sticker.classList.add(s.styles['face-selected']);
        } else {
            sticker.classList.remove(s.styles['face-selected']);
        }
    });
}

// ── Drag label ──────────────────────────────────────────────────────

/**
 * Display the floating drag label near the pointer, showing the predicted
 * move notation. Positioning adapts to layout mode (fixed in Tabbed, local
 * in Floating) and pointer type (offset above finger for touch).
 */
export function showDragLabel(
    s: FlatTouchHandlerState,
    label: string,
    clientX: number,
    clientY: number
): void {
    const hostRect = s.host.getBoundingClientRect();
    s.dragLabelEl.textContent = label;
    s.dragLabelEl.style.display = 'block';

    const labelWidth = s.dragLabelEl.offsetWidth || 40;
    const labelHeight = s.dragLabelEl.offsetHeight || 22;

    const result = computeDragLabelPosition({
        layoutMode: s.layoutMode,
        clientX,
        clientY,
        hostRect,
        labelWidth,
        labelHeight,
        activePointerType: s.activePointerType,
    });

    s.dragLabelEl.style.position = result.position;
    s.dragLabelEl.style.zIndex = result.zIndex;
    s.dragLabelEl.style.left = `${result.x}px`;
    s.dragLabelEl.style.top = `${result.y}px`;
}

/** Hide the drag label and reset its positioning styles. */
export function hideDragLabel(s: FlatTouchHandlerState): void {
    s.dragLabelEl.style.display = 'none';
    s.dragLabelEl.style.position = '';
    s.dragLabelEl.style.zIndex = '';
}

// ── Cancellation zone ───────────────────────────────────────────────

/**
 * Compute the cancel-zone radius in pixels for the current layout mode.
 * Tabbed mode uses a larger multiplier to account for the narrower panel.
 */
export function cancelZoneRadiusPx(s: FlatTouchHandlerState): number {
    return s.layoutMode === LayoutMode.Tabbed
        ? CANCEL_ZONE_RADIUS_BASE_PX * CANCEL_ZONE_TABBED_MULTIPLIER
        : CANCEL_ZONE_RADIUS_BASE_PX;
}

/**
 * Show the circular cancel-zone overlay centered on the given screen
 * coordinates. Drags shorter than this radius are not committed.
 */
export function showCancellationZoneAtOrigin(
    s: FlatTouchHandlerState,
    clientX: number,
    clientY: number,
    radiusPx?: number
): void {
    const hostRect = s.host.getBoundingClientRect();
    const radius = radiusPx ?? cancelZoneRadiusPx(s);
    const diameter = radius * 2;

    s.haloCancelZoneEl.style.left = `${clientX - hostRect.left - radius}px`;
    s.haloCancelZoneEl.style.top = `${clientY - hostRect.top - radius}px`;
    s.haloCancelZoneEl.style.width = `${diameter}px`;
    s.haloCancelZoneEl.style.height = `${diameter}px`;
    s.haloCancelZoneEl.style.display = 'block';
}

/** Hide the cancel-zone overlay. */
export function hideCancellationZone(s: FlatTouchHandlerState): void {
    s.haloCancelZoneEl.style.display = 'none';
}

// ── Helper (used by updateHaloPosition) ─────────────────────────────

function findFaceElement(
    s: FlatTouchHandlerState,
    stickerElement: HTMLElement
): HTMLElement | null {
    return stickerElement.closest(`.${s.styles['flat-face']}`) as HTMLElement | null;
}
