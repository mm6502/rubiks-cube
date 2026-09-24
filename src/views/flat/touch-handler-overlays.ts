/**
 * Visual overlay management for the flat touch handler.
 *
 * Exports functions that manage the DOM overlay elements: the invisible
 * halo hit-target, cancel zone, drag label, drag-decision indicator, and
 * face-selection styling.
 */
import { Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { normalize2 } from '@/cube/utils/math';
import { computeFaceScreenBasis } from '@/interaction/drag-decision-overlay';
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

// ── Halo drag-target position ───────────────────────────────────────

/**
 * Reposition the invisible halo hit-target to match the currently
 * selected face. Hides it when no face is selected. Also caches
 * `s.haloFaceCenter` for use by rotation-direction inference.
 */
export function updateHaloPosition(s: FlatTouchHandlerState): void {
    if (!s.selectedFace) {
        s.haloHitTargetEl.style.display = 'none';
        return;
    }

    const faceEl = s.host.querySelector(
        `.${s.styles['flat-face']} .${s.styles['flat-sticker']}[data-face="${s.selectedFace}"]`
    ) as HTMLElement | null;
    const owningFaceEl = faceEl ? findFaceElement(s, faceEl) : null;

    if (!owningFaceEl) {
        s.haloHitTargetEl.style.display = 'none';
        return;
    }

    const hostRect = s.host.getBoundingClientRect();
    const faceRect = owningFaceEl.getBoundingClientRect();
    const faceSize = Math.min(faceRect.width, faceRect.height);

    const centerX = faceRect.left + faceRect.width / 2;
    const centerY = faceRect.top + faceRect.height / 2;

    s.haloFaceCenter = { x: centerX, y: centerY, size: faceSize };

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

// ── Drag-decision indicator ─────────────────────────────────────────

/** The sticker element at a face/position, or null when the DOM has no such cell. */
function stickerElementAt(
    s: FlatTouchHandlerState,
    face: Face,
    position: number
): HTMLElement | null {
    return s.host.querySelector(
        `.${s.styles['flat-sticker']}[data-face="${face}"][data-pos="${position}"]`
    ) as HTMLElement | null;
}

/**
 * Show the decision cross for a sticker drag: two dashed arms at the pointer,
 * marking the boundaries between the four drag zones.
 *
 * The arms are derived from the face's measured screen basis — its three
 * corner stickers are read off the DOM — so the indicator follows the layout
 * rotation the Flat view applies, without this module restating that rotation.
 * Shows nothing when the basis cannot be measured (a degenerate or missing
 * face), rather than drawing a NaN arm.
 */
export function showStickerDragCross(
    s: FlatTouchHandlerState,
    face: Face,
    cubeSize: number,
    clientX: number,
    clientY: number
): void {
    const topLeft = stickerElementAt(s, face, 0);
    const rightOfTopLeft = stickerElementAt(s, face, 1);
    const belowTopLeft = stickerElementAt(s, face, cubeSize);
    /* c8 ignore if — a rendered face always has its corner stickers */
    if (!topLeft || !rightOfTopLeft || !belowTopLeft) {
        hideDragDecision(s);
        return;
    }

    const basis = computeFaceScreenBasis(topLeft, rightOfTopLeft, belowTopLeft);
    if (!basis) {
        hideDragDecision(s);
        return;
    }

    s.dragDecision.showCross(basis, clientX, clientY);
}

/**
 * Show the single radial guide line for a halo (selected-face rotation) drag,
 * pointing from the face centre through the pointer.
 */
export function showHaloGuideLine(
    s: FlatTouchHandlerState,
    clientX: number,
    clientY: number
): void {
    const center = s.haloFaceCenter;
    if (!center) {
        hideDragDecision(s);
        return;
    }

    const dir = normalize2({ x: clientX - center.x, y: clientY - center.y });
    if (!dir) {
        hideDragDecision(s);
        return;
    }

    s.dragDecision.showLine(dir, clientX, clientY);
}

/**
 * Show the axis-aligned decision cross for a whole-cube legend drag.
 *
 * The legend gesture is read from the drag's screen direction alone — there is
 * no face beneath it to measure a basis from — so its zones are the four screen
 * directions and the arms are the 45° bisectors between them, which on screen
 * are the two diagonals. This is the same shape the Basic view shows for its
 * background drag.
 */
export function showWholeCubeDragCross(
    s: FlatTouchHandlerState,
    clientX: number,
    clientY: number
): void {
    // Up = screen-up and right = screen-right, so the two bisector arms come out
    // as the screen diagonals — exactly the zone boundaries for a screen-direction
    // gesture.
    s.dragDecision.showCross(
        {
            upDir: { x: 0, y: -1 },
            rightDir: { x: 1, y: 0 },
        },
        clientX,
        clientY
    );
}

/** Hide the drag-decision indicator. */
export function hideDragDecision(s: FlatTouchHandlerState): void {
    s.dragDecision.hide();
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
