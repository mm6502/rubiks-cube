/**
 * Interaction logic for the flat touch handler.
 *
 * Exports functions for gesture interpretation, move inference,
 * tap handling, and interaction context construction.
 */
import { Application } from '@/application';
import { inferMoveFromDrag, inferMoveFromFaceRotation, toFar } from '@/interaction/move-inference';
import { DragGesture, GestureIntent, HitKind, InteractionContext } from '@/interaction/types';
import { EventName, MoveRequestedEvent } from '@/types';

import {
    applyFaceSelectionStyling,
    hideDragLabel,
    showDragLabel,
    updateHaloPosition,
} from './touch-handler-overlays';
import type { FlatTouchHandlerState, StickerHit } from './touch-handler-types';

// ── Interaction context ─────────────────────────────────────────────

/**
 * Build an {@link InteractionContext} snapshot from the current handler state,
 * capturing cube size, selected face, and rotation metadata for move inference.
 */
export function createInteractionContext(s: FlatTouchHandlerState): InteractionContext {
    return {
        cubeSize: s.getCubeSize(),
        selectedFace: s.selectedFace,
        metadata: {
            isRotated: s.getIsRotated(),
        },
    };
}

// ── Gesture intent construction ─────────────────────────────────────

/**
 * Convert a raw {@link DragGesture} into a classified {@link GestureIntent}.
 * Returns a HALO intent for selected-face rotation gestures, a STICKER
 * intent for ring-drag gestures originating on a sticker, or NONE otherwise.
 */
export function buildGestureIntent(s: FlatTouchHandlerState, gesture: DragGesture): GestureIntent {
    if (s.selectedFace && s.selectedFaceGesture) {
        return {
            hitKind: HitKind.HALO,
            direction: gesture.direction,
            distancePx: gesture.distancePx,
            deltaX: gesture.deltaX,
            deltaY: gesture.deltaY,
            angularDisplacementRad: gesture.angularDisplacementRad,
        };
    }

    if (s.startHit) {
        return {
            hitKind: HitKind.STICKER,
            direction: gesture.direction,
            distancePx: gesture.distancePx,
            deltaX: gesture.deltaX,
            deltaY: gesture.deltaY,
            angularDisplacementRad: gesture.angularDisplacementRad,
            face: s.startHit.face,
            row: s.startHit.row,
            col: s.startHit.col,
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

// ── Move inference ──────────────────────────────────────────────────

/**
 * Derive move notation (e.g. `"R"`, `"U'"`, `"F2"`) from a drag gesture.
 * Returns `undefined` when the gesture is too short, has no valid target,
 * or cannot be mapped to a move. Handles both halo (whole-face rotation)
 * and sticker (ring drag) gestures, including near-center cross-product
 * direction detection and far-drag double-move promotion.
 */
export function inferMoveNotationForGesture(
    s: FlatTouchHandlerState,
    gesture: DragGesture
): string | undefined {
    const context = createInteractionContext(s);
    const intent = buildGestureIntent(s, gesture);

    if (intent.distancePx < s.activeCommitDistancePx) {
        return undefined;
    }

    if (intent.hitKind === HitKind.HALO && s.selectedFace) {
        const center = s.haloFaceCenter;
        const startDistFromCenter = center
            ? Math.hypot(gesture.start.x - center.x, gesture.start.y - center.y)
            : Infinity;
        const nearCenterThreshold = center ? center.size / 4 : 0;
        const isNearCenter = startDistFromCenter < nearCenterThreshold;

        let clockwise: boolean;
        if (isNearCenter && center) {
            const armX = gesture.current.x - center.x;
            const armY = gesture.current.y - center.y;
            const cross = gesture.deltaX * armY - gesture.deltaY * armX;
            clockwise = cross < 0;
        } else {
            const angular = intent.angularDisplacementRad;
            if (angular === undefined || Math.abs(angular) < 0.1) {
                return undefined;
            }
            clockwise = angular > 0;
        }

        const baseNotation =
            s.adapter.inferFaceRotationNotation?.(s.selectedFace, clockwise, context) ??
            inferMoveFromFaceRotation(s.selectedFace, clockwise);
        if (intent.distancePx > s.dragStateMachine.farDragThresholdPx) {
            return toFar(baseNotation);
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
        s.adapter.mapDragDirection?.(intent.direction, intent.face, context) ?? intent.direction;
    const moveNotation = inferMoveFromDrag({
        face: intent.face,
        row,
        col,
        direction: mappedDirection,
        cubeSize: context.cubeSize,
        distancePx: intent.distancePx,
        farDragThresholdPx: s.dragStateMachine.farDragThresholdPx,
    });

    return moveNotation;
}

// ── Tap handling ────────────────────────────────────────────────────

/**
 * Process a tap on a sticker (or empty space). Toggles face selection:
 * tapping the already-selected face deselects it, tapping a different
 * sticker selects its face, and tapping empty space clears the selection.
 * Fires `onStickerSelected` and updates visual overlays accordingly.
 */
export function handleTap(s: FlatTouchHandlerState, hit: StickerHit | undefined): void {
    if (!hit) {
        s.selectedFace = undefined;
        applyFaceSelectionStyling(s);
        updateHaloPosition(s);
        return;
    }

    if (s.selectedFace === hit.face) {
        s.selectedFace = undefined;
    } else {
        s.selectedFace = hit.face;
    }

    s.onStickerSelected(hit.stickerId);
    applyFaceSelectionStyling(s);
    updateHaloPosition(s);
}

// ── Gesture lifecycle callbacks ─────────────────────────────────────

/**
 * Called on each drag update. Infers the current move notation and shows
 * (or hides) the drag label at the pointer position.
 */
export function updateFromGesture(s: FlatTouchHandlerState, gesture: DragGesture): void {
    const moveNotation = inferMoveNotationForGesture(s, gesture);
    if (!moveNotation) {
        hideDragLabel(s);
        return;
    }

    showDragLabel(s, moveNotation, gesture.current.x, gesture.current.y);
}

/**
 * Called when a drag ends. Infers the final move notation, hides the drag
 * label, and emits a `MOVE_REQUESTED` event if a valid move was produced.
 */
export function finalizeGesture(s: FlatTouchHandlerState, gesture: DragGesture): void {
    const moveNotation = inferMoveNotationForGesture(s, gesture);
    hideDragLabel(s);

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
