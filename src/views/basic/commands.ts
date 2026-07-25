import { Application } from '@/application';
import { createUndoRedoCommands } from '@/cube/commands/undo-redo';
import { Command, CommandCategory, EventName, ViewRotation } from '@/types';

import * as rendering from './rendering';
import { isGhostVisible } from './ghost-stickers';
import { isLinked, setLinked } from './linked-rotations';
import type { BasicTouchHandler } from './touch-handler';
import type { BasicViewInternalData } from './types';

export interface BasicViewCommandContext {
    readonly state: BasicViewInternalData;
    readonly touchHandler: BasicTouchHandler | null;
    getViewType(): string;
    resetView(): void;
    alignCubeToView(): void;
    rotateViewLeft(): void;
    rotateViewRight(): void;
    rotateViewUp(): void;
    rotateViewDown(): void;
    toggleGhosts(): void;
    updateGhostEdges(): void;
    emitStateChanged(): void;
}

export function getBasicViewCommands(ctx: BasicViewCommandContext): Command[] {
    const undoRedo = createUndoRedoCommands(
        ctx.state.model?.getMoveHistory() ?? null,
        ctx.getViewType()
    );
    return [
        ...undoRedo,
        {
            id: 'reset-view',
            label: 'Reset View',
            keyBindings: [{ key: 'Home' }],
            displayOrder: 895,
            category: CommandCategory.VIEW,
            group: '.',
            icon: '↻',
            showInHeader: true,
            tooltip: 'Reset all view rotations to default position.',
            action: () => {
                ctx.resetView();
                ctx.emitStateChanged();
                if (isLinked()) {
                    Application.eventBus.emit(EventName.BASIC_VIEW_RESET_LINKED, {
                        sourceViewType: ctx.state.viewType,
                    });
                }
            },
        },
        {
            id: 'align-cube-to-view',
            label: 'Align Cube to View',
            keyBindings: [{ key: '=' }, { key: 'End' }, { key: 'Enter' }, { key: 'NumpadEnter' }],
            displayOrder: 893,
            category: CommandCategory.VIEW,
            group: '.',
            icon: '=',
            showInHeader: true,
            tooltip: 'Rotate the cube to match the current view orientation.',
            action: () => {
                ctx.alignCubeToView();
                ctx.emitStateChanged();
            },
        },
        {
            id: `${ctx.getViewType()}.face-direct-mode`,
            label: 'Face Mode',
            category: CommandCategory.VIEW,
            group: '.',
            icon: '◎',
            showInHeader: true,
            keyBindings: [{ key: '2', ctrlKey: true }],
            displayOrder: 890,
            tooltip: 'Drag any sticker to rotate its face immediately (no pre-selection needed).',
            isActive: () => ctx.touchHandler?.isFaceDirectMode() ?? false,
            action: () => {
                if (ctx.touchHandler) {
                    ctx.touchHandler.setFaceDirectMode(!ctx.touchHandler.isFaceDirectMode());
                    ctx.emitStateChanged();
                }
            },
        },
        {
            id: 'link-rotations',
            label: 'Link Rotations',
            keyBindings: [{ key: '5', ctrlKey: true }],
            category: CommandCategory.VIEW,
            group: '.',
            icon: '⛓',
            showInHeader: true,
            displayOrder: 580,
            tooltip: 'Link view rotations between Basic Front and Basic Back.',
            isActive: () => isLinked(),
            action: () => {
                setLinked(!isLinked());
                Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                    viewType: 'basic-front',
                });
                Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                    viewType: 'basic-back',
                });
            },
        },
        {
            id: 'tilt-view',
            label: 'Tilt View',
            keyBindings: [{ key: '|' }, { key: '\\' }, { key: '4', ctrlKey: true }],
            category: CommandCategory.VIEW,
            group: '.',
            icon: '↔',
            showInHeader: true,
            displayOrder: 710,
            tooltip: 'Toggle view tilt (Y-axis: -35° ↔ 35°)',
            isActive: () => ctx.state.isTilted,
            action: () => {
                ctx.state.isTilted = !ctx.state.isTilted;
                rendering.updateRotation(ctx.state);
                rendering.updateFaceLabels(ctx.state);
                ctx.updateGhostEdges();
                ctx.emitStateChanged();
            },
        },
        {
            id: 'pitch-view',
            label: 'Pitch View',
            keyBindings: [{ key: 'PageUp' }, { key: 'PageDown' }, { key: '6', ctrlKey: true }],
            category: CommandCategory.VIEW,
            group: '.',
            icon: '↕',
            showInHeader: true,
            displayOrder: 700,
            tooltip: 'Toggle view pitch (X-axis: -25° ↔ 25°)',
            isActive: () => ctx.state.isPitched,
            action: () => {
                ctx.state.isPitched = !ctx.state.isPitched;
                rendering.updateRotation(ctx.state);
                rendering.updateFaceLabels(ctx.state);
                ctx.updateGhostEdges();
                ctx.emitStateChanged();
            },
        },
        {
            id: 'basic-view.ghost-hints',
            label: 'Ghost Hints',
            category: CommandCategory.VIEW,
            group: '.',
            icon: '👻',
            showInHeader: true,
            keyBindings: [{ key: '3', ctrlKey: true }],
            displayOrder: 880,
            tooltip:
                'Show semi-transparent hint stickers on silhouette edges to reveal hidden face colours.',
            isActive: () => isGhostVisible(),
            action: () => {
                ctx.toggleGhosts();
                ctx.emitStateChanged();
            },
        },
        {
            id: 'rotate-view-left',
            label: 'Rotate View Left',
            keyBindings: [{ key: 'ArrowLeft', altKey: true }],
            category: CommandCategory.VIEW,
            group: '.',
            icon: '←',
            tooltip: 'Rotate cube view left.',
            action: () => {
                ctx.rotateViewLeft();
                ctx.emitStateChanged();
                if (isLinked()) {
                    Application.eventBus.emit(EventName.BASIC_VIEW_ROTATION_LINKED, {
                        rotation: ViewRotation.Left,
                        sourceViewType: ctx.state.viewType,
                    });
                }
            },
        },
        {
            id: 'rotate-view-right',
            label: 'Rotate View Right',
            keyBindings: [{ key: 'ArrowRight', altKey: true }],
            category: CommandCategory.VIEW,
            group: '.',
            icon: '→',
            tooltip: 'Rotate cube view right.',
            action: () => {
                ctx.rotateViewRight();
                ctx.emitStateChanged();
                if (isLinked()) {
                    Application.eventBus.emit(EventName.BASIC_VIEW_ROTATION_LINKED, {
                        rotation: ViewRotation.Right,
                        sourceViewType: ctx.state.viewType,
                    });
                }
            },
        },
        {
            id: 'rotate-view-up',
            label: 'Rotate View Up',
            keyBindings: [{ key: 'ArrowUp', altKey: true }],
            category: CommandCategory.VIEW,
            group: '.',
            icon: '↑',
            tooltip: 'Rotate cube view up.',
            action: () => {
                ctx.rotateViewUp();
                ctx.emitStateChanged();
                if (isLinked()) {
                    Application.eventBus.emit(EventName.BASIC_VIEW_ROTATION_LINKED, {
                        rotation: ViewRotation.Up,
                        sourceViewType: ctx.state.viewType,
                    });
                }
            },
        },
        {
            id: 'rotate-view-down',
            label: 'Rotate View Down',
            keyBindings: [{ key: 'ArrowDown', altKey: true }],
            category: CommandCategory.VIEW,
            group: '.',
            icon: '↓',
            tooltip: 'Rotate cube view down.',
            action: () => {
                ctx.rotateViewDown();
                ctx.emitStateChanged();
                if (isLinked()) {
                    Application.eventBus.emit(EventName.BASIC_VIEW_ROTATION_LINKED, {
                        rotation: ViewRotation.Down,
                        sourceViewType: ctx.state.viewType,
                    });
                }
            },
        },
    ];
}
