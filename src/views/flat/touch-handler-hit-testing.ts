/**
 * Hit-testing utilities for the flat touch handler.
 *
 * Exports functions that resolve pointer coordinates to sticker hits,
 * check halo hit-target bounds, and detect tap-vs-drag thresholds.
 */
import { Face } from '@/cube/types';

import {
    DRAG_THRESHOLD_PX,
    type FlatTouchHandlerState,
    type StickerHit,
} from './touch-handler-types';

// ── Sticker hit detection ───────────────────────────────────────────

/**
 * Resolve a screen-space pointer coordinate to the sticker element underneath it.
 * Returns the face, row, column, and sticker ID if a flat-view sticker is found
 * at the given point; `undefined` otherwise.
 */
export function getStickerHitFromPoint(
    s: FlatTouchHandlerState,
    clientX: number,
    clientY: number
): StickerHit | undefined {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!element) {
        return undefined;
    }

    const stickerEl = element.closest(`.${s.styles['flat-sticker']}`) as HTMLElement | null;
    if (!stickerEl || !s.host.contains(stickerEl)) {
        return undefined;
    }

    const face = stickerEl.getAttribute('data-face') as Face | null;
    const posText = stickerEl.getAttribute('data-pos');
    if (!face || posText === null) {
        return undefined;
    }

    const cubeSize = s.getCubeSize();
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

// ── Face element lookup ─────────────────────────────────────────────

/**
 * Walk up the DOM from a sticker element to find its containing `.flat-face` wrapper.
 */
export function findFaceElement(
    s: FlatTouchHandlerState,
    stickerElement: HTMLElement
): HTMLElement | null {
    return stickerElement.closest(`.${s.styles['flat-face']}`) as HTMLElement | null;
}

// ── Halo hit-target bounds check ────────────────────────────────────

/**
 * Check whether a screen-space point falls inside the invisible halo hit-target
 * rectangle (the full selected-face area used for halo drag initiation).
 * Returns `false` when no face is selected or the hit-target is hidden.
 */
export function isHaloHitTargetAtPoint(
    s: FlatTouchHandlerState,
    clientX: number,
    clientY: number
): boolean {
    if (!s.selectedFace || s.haloHitTargetEl.style.display === 'none') {
        return false;
    }

    const r = s.haloHitTargetEl.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

// ── Tap-vs-drag threshold ───────────────────────────────────────────

/**
 * Determine whether the pointer moved less than `DRAG_THRESHOLD_PX` from its
 * origin, indicating a tap rather than a drag. Returns `false` if no origin
 * is recorded (no active pointer).
 */
export function wasTapWithoutDrag(
    s: FlatTouchHandlerState,
    clientX: number,
    clientY: number
): boolean {
    if (!s.activePointerOrigin) {
        return false;
    }

    const deltaX = clientX - s.activePointerOrigin.x;
    const deltaY = clientY - s.activePointerOrigin.y;
    return Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX;
}
