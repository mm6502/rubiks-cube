import { Application } from '@/application';
import { Face, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import {
    inferKeyboardMove,
    isFaceSelectKey,
    isKeyboardMoveKey,
    mapArrowToDirection,
} from '@/interaction/keyboard-moves';
import { DragDirection } from '@/interaction/types';
import { Command, CommandCategory, EventName, EventPayload, MoveRequestedEvent } from '@/types';

import type { FlatViewInternalData } from './flat-view';
import { isNavigationKey, navigate } from './navigation';

/** Callbacks the commands module needs from the coordinator. */
export interface FlatCommandContext {
    readonly state: FlatViewInternalData;
    isFaceDirectMode(): boolean;
    setFaceDirectMode(v: boolean): void;
    getSelectedFace(): Face | undefined;
    selectFace(f: Face | undefined): void;
    isGhostVisible(): boolean;
    toggleGhosts(): void;
    getViewType(): string;
    canUndo(): boolean;
    canRedo(): boolean;
    emitEvent(name: EventName, payload: EventPayload): void;
    /** Routes through to selection.updateSelected in the coordinator. */
    updateSelected(id?: StickerId): void;
}

/**
 * Remap a {@link DragDirection} for the +90° CW visual rotation applied on
 * mobile / portrait viewports.
 */
function remapDragDirectionForRotation(dir: DragDirection): DragDirection {
    switch (dir) {
        case DragDirection.UP:
            return DragDirection.LEFT;
        case DragDirection.RIGHT:
            return DragDirection.UP;
        case DragDirection.DOWN:
            return DragDirection.RIGHT;
        default:
            return DragDirection.DOWN;
    }
}

function willHandleKeyPress(
    ctx: FlatCommandContext,
    event: KeyboardEvent,
    preview: boolean
): boolean {
    // Face selection toggle (Space or Backtick).
    if (isFaceSelectKey(event)) {
        if (!preview) handleFaceSelectKey(ctx);
        return ctx.state.currentSelected !== undefined;
    }

    // Keyboard move (Ctrl+Arrow, optionally +Shift for 180°).
    if (isKeyboardMoveKey(event)) {
        if (!preview) handleKeyboardMove(ctx, event);
        return ctx.state.currentSelected !== undefined;
    }

    // Plain arrow keys — sticker navigation.
    if (isNavigationKey(event)) {
        return navigate(
            event,
            preview,
            ctx.state.currentSelected,
            ctx.state.model,
            ctx.state.cubeWalk,
            ctx.state.isRotated,
            id => ctx.updateSelected(id)
        );
    }

    return false;
}

function handleFaceSelectKey(ctx: FlatCommandContext): void {
    if (!ctx.state.currentSelected || !ctx.state.model) return;

    const sticker = CubeStateUtils.getStickerById(
        ctx.state.model.getCurrentState(),
        ctx.state.currentSelected
    );
    if (!sticker) return;

    const face = sticker.currentFace as Face;
    const current = ctx.getSelectedFace();
    ctx.selectFace(current === face ? undefined : face);
}

function handleKeyboardMove(ctx: FlatCommandContext, event: KeyboardEvent): void {
    if (!ctx.state.currentSelected || !ctx.state.model) return;

    const direction = mapArrowToDirection(event);
    if (!direction) return;

    const notation = inferKeyboardMove({
        stickerId: ctx.state.currentSelected,
        selectedFace: ctx.getSelectedFace(),
        faceDirectMode: ctx.isFaceDirectMode(),
        direction,
        doubleTurn: event.shiftKey,
        model: ctx.state.model,
        remapDirection: ctx.state.isRotated ? remapDragDirectionForRotation : undefined,
    });
    if (!notation) return;

    const payload: MoveRequestedEvent = {
        moveNotation: notation,
        viewId: 'flat',
        tentative: false,
    };
    Application.eventBus.emit(EventName.MOVE_REQUESTED, payload);
}

export function handleKeyDown(ctx: FlatCommandContext, event: KeyboardEvent): boolean {
    return willHandleKeyPress(ctx, event, true);
}

export function handleKeyUp(ctx: FlatCommandContext, event: KeyboardEvent): boolean {
    return willHandleKeyPress(ctx, event, false);
}

export function getCommands(ctx: FlatCommandContext): Command[] {
    return [
        {
            id: 'flat.cube-walk',
            label: 'Cube Walk',
            category: CommandCategory.VIEW,
            icon: '⊕',
            keyBindings: [{ key: '3', ctrlKey: true }],
            showInHeader: true,
            displayOrder: 880,
            tooltip:
                'Arrow-key navigation follows real cube surface — walking off an edge lands on the adjacent face.',
            isActive: () => ctx.state.cubeWalk,
            action: () => {
                ctx.state.cubeWalk = !ctx.state.cubeWalk;
                ctx.emitEvent(EventName.VIEW_STATE_CHANGED, {
                    viewType: ctx.getViewType(),
                });
            },
        },
        {
            id: 'flat.face-direct-mode',
            label: 'Face Mode',
            category: CommandCategory.VIEW,
            icon: '◎',
            keyBindings: [{ key: '2', ctrlKey: true }],
            showInHeader: true,
            displayOrder: 890,
            tooltip: 'Drag any sticker to rotate its face immediately (no pre-selection needed).',
            isActive: () => ctx.isFaceDirectMode(),
            action: () => {
                ctx.setFaceDirectMode(!ctx.isFaceDirectMode());
                ctx.emitEvent(EventName.VIEW_STATE_CHANGED, {
                    viewType: ctx.getViewType(),
                });
            },
        },
        {
            id: 'flat.ghost-hints',
            label: 'Ghost Hints',
            category: CommandCategory.VIEW,
            icon: '👻',
            keyBindings: [{ key: '4', ctrlKey: true }],
            showInHeader: true,
            displayOrder: 870,
            tooltip:
                'Show semi-transparent hint stickers on edges where cube-adjacent faces are not visually adjacent.',
            isActive: () => ctx.isGhostVisible(),
            action: () => {
                ctx.toggleGhosts();
                ctx.emitEvent(EventName.VIEW_STATE_CHANGED, {
                    viewType: ctx.getViewType(),
                });
            },
        },
        {
            id: 'flat.undo',
            label: 'Undo',
            category: CommandCategory.VIEW,
            showInHeader: true,
            icon: '↩',
            tooltip: 'Undo last move.',
            keyBindings: [{ key: '[' }, { key: ',' }],
            displayOrder: 900,
            overflowPriority: 901,
            action: () => Application.eventBus.emit(EventName.UNDO_REQUESTED, {}),
            isEnabled: () => ctx.canUndo(),
        },
        {
            id: 'flat.redo',
            label: 'Redo',
            category: CommandCategory.VIEW,
            showInHeader: true,
            icon: '↪',
            tooltip: 'Redo last undone move.',
            keyBindings: [{ key: ']' }, { key: '.' }],
            displayOrder: 901,
            overflowPriority: 900,
            action: () => Application.eventBus.emit(EventName.REDO_REQUESTED, {}),
            isEnabled: () => ctx.canRedo(),
        },
    ];
}
