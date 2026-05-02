import { Application } from '@/application';
import { Command, CommandCategory, EventName } from '@/types';

import * as rendering from './rendering';
import { CircularCubeViewInternalData, CircularViewState } from './circular-view';
import { GHOST_OPACITY_LEVELS } from './constants';

const VIEW_TYPE = 'circular';

export function getCommands(state: CircularCubeViewInternalData): Command[] {
    return [
        {
            id: 'circular-view.pan-mode',
            label: 'Pan Mode',
            category: CommandCategory.VIEW,
            keyBindings: [{ key: '6', ctrlKey: true }],
            icon: '✥',
            tooltip: 'Drag to pan/zoom. Disables move gestures until toggled off.',
            showInHeader: true,
            displayOrder: 580,
            action: () => {
                state.panMode = !state.panMode;
                state.zoomPan?.setGestureMode(state.panMode ? 'legacy' : 'delegated-left-drag');
                Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                    viewType: VIEW_TYPE,
                });
            },
            isActive: () => state.panMode,
        },
        {
            id: 'circular-view.reset-zoom',
            label: 'Reset View',
            category: CommandCategory.VIEW,
            keyBindings: [{ key: 'Home' }, { key: '5', ctrlKey: true }],
            icon: '⊙',
            tooltip: 'Reset zoom and pan to default.',
            showInHeader: true,
            displayOrder: 590,
            action: () => state.zoomPan?.reset(),
        },
        {
            id: 'circular-view.ghost-hints',
            label: 'Ghost Hints',
            category: CommandCategory.VIEW,
            icon: '👻',
            keyBindings: [{ key: '3', ctrlKey: true }],
            showInHeader: true,
            displayOrder: 880,
            tooltip: 'Show semi-transparent hint stickers on the far side of each axis circle.',
            isActive: () => state.showGhosts,
            action: () => {
                // Cycle: 75% → 100% → off → 75% ...
                state.ghostOpacityIndex =
                    (state.ghostOpacityIndex + 1) % GHOST_OPACITY_LEVELS.length;
                state.showGhosts = state.ghostOpacityIndex > 0;
                void rendering.animateGhostToggle(state);
                Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                    viewType: VIEW_TYPE,
                });
            },
        },
        {
            id: 'circular-view.cube-walk',
            label: 'Cube Walk',
            category: CommandCategory.VIEW,
            icon: '⊕',
            keyBindings: [{ key: '4', ctrlKey: true }],
            showInHeader: true,
            displayOrder: 870,
            tooltip:
                'Arrow-key navigation follows real cube surface — walking off an edge lands on the adjacent face.',
            isActive: () => state.cubeWalk,
            action: () => {
                state.cubeWalk = !state.cubeWalk;
                Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                    viewType: VIEW_TYPE,
                });
            },
        },
        {
            id: 'circular-view.face-direct-mode',
            label: 'Face Mode',
            category: CommandCategory.VIEW,
            keyBindings: [{ key: '2', ctrlKey: true }],
            icon: '◎',
            tooltip: 'Drag face ellipses to rotate that face directly (without selecting first).',
            showInHeader: true,
            displayOrder: 890,
            action: () => {
                const handler = state.touchHandler;
                if (handler) {
                    handler.setFaceDirectMode(!handler.getFaceDirectMode());
                    Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                        viewType: VIEW_TYPE,
                    });
                }
            },
            isActive: () => state.touchHandler?.getFaceDirectMode() ?? false,
        },
        {
            id: 'circular.undo',
            label: 'Undo',
            category: CommandCategory.VIEW,
            showInHeader: true,
            icon: '↩',
            tooltip: 'Undo last move.',
            keyBindings: [{ key: '[' }, { key: ',' }],
            displayOrder: 900,
            overflowPriority: 901,
            action: () => Application.eventBus.emit(EventName.UNDO_REQUESTED, {}),
            isEnabled: () => state.model?.getMoveHistory().canUndo() ?? false,
        },
        {
            id: 'circular.redo',
            label: 'Redo',
            category: CommandCategory.VIEW,
            showInHeader: true,
            icon: '↪',
            tooltip: 'Redo last undone move.',
            keyBindings: [{ key: ']' }, { key: '.' }],
            displayOrder: 901,
            overflowPriority: 900,
            action: () => Application.eventBus.emit(EventName.REDO_REQUESTED, {}),
            isEnabled: () => state.model?.getMoveHistory().canRedo() ?? false,
        },
    ];
}

export function getState(state: CircularCubeViewInternalData): CircularViewState {
    return {
        faceDirectMode: state.touchHandler?.getFaceDirectMode() ?? false,
        panMode: state.panMode,
        cubeWalk: state.cubeWalk,
        showGhosts: state.showGhosts,
        ghostOpacityIndex: state.ghostOpacityIndex,
    };
}

export function setState(state: CircularCubeViewInternalData, input: unknown): void {
    if (!input || typeof input !== 'object') return;
    const s = input as Record<string, unknown>;
    if (typeof s['panMode'] === 'boolean') {
        state.panMode = s['panMode'];
        state.zoomPan?.setGestureMode(state.panMode ? 'legacy' : 'delegated-left-drag');
    }
    if (typeof s['faceDirectMode'] === 'boolean') {
        state.touchHandler?.setFaceDirectMode(s['faceDirectMode']);
    }
    if (typeof s['cubeWalk'] === 'boolean') {
        state.cubeWalk = s['cubeWalk'];
    }
    if (typeof s['showGhosts'] === 'boolean') {
        state.showGhosts = s['showGhosts'];
        state.ghostOpacityIndex = s['showGhosts'] ? 1 : 0;
        rendering.setGhostVisibility(state);
    }
    if (typeof s['ghostOpacityIndex'] === 'number') {
        state.ghostOpacityIndex = s['ghostOpacityIndex'];
        state.showGhosts = state.ghostOpacityIndex > 0;
        rendering.setGhostVisibility(state);
    }
}
