import { Application } from '@/application';
import { ReadOnlyCubeModel } from '@/cube/types';
import { Command, CommandCategory, EventName, GroupLayout } from '@/types';

export function getCommands(model: ReadOnlyCubeModel): Command[] {
    return [
        {
            id: 'reset-cube',
            label: 'Reset Cube',
            category: CommandCategory.CONTROLLER,
            group: 'State Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Reset cube to solved state',
            action: () => Application.eventBus.emit(EventName.CUBE_RESET_REQUESTED, {}),
        },
        {
            id: 'scramble-cube',
            label: 'Scramble',
            category: CommandCategory.CONTROLLER,
            group: 'State Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Scramble the cube with random moves',
            action: () => Application.eventBus.emit(EventName.CUBE_SCRAMBLE_REQUESTED, {}),
        },
        {
            id: 'clear-storage',
            label: 'Clear Saved Data',
            category: CommandCategory.CONTROLLER,
            group: 'State Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Clear saved cube state and layout',
            action: () => Application.eventBus.emit(EventName.STORAGE_CLEAR_REQUESTED, {}),
        },
        {
            id: 'export-state',
            label: 'Export State',
            category: CommandCategory.CONTROLLER,
            group: 'State Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Save cube state to file',
            action: () => Application.eventBus.emit(EventName.STATE_EXPORT_REQUESTED, {}),
        },
        {
            id: 'import-state',
            label: 'Import State',
            category: CommandCategory.CONTROLLER,
            group: 'State Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Import cube state from file',
            action: () => Application.eventBus.emit(EventName.STATE_IMPORT_REQUESTED, {}),
        },
        {
            id: 'undo-move',
            label: 'Undo Move',
            category: CommandCategory.CONTROLLER,
            group: 'Move Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Undo the last move',
            keyBindings: [{ key: '[' }, { key: ',' }],
            action: () => Application.eventBus.emit(EventName.UNDO_REQUESTED, {}),
            isEnabled: () => model.getMoveHistory().canUndo(),
        },
        {
            id: 'redo-move',
            label: 'Redo Move',
            category: CommandCategory.CONTROLLER,
            group: 'Move Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Redo the last undone move',
            keyBindings: [{ key: ']' }, { key: '.' }],
            action: () => Application.eventBus.emit(EventName.REDO_REQUESTED, {}),
            isEnabled: () => model.getMoveHistory().canRedo(),
        },
        {
            id: 'move-f-prime',
            label: 'F′',
            icon: 'move-fp',
            keyBindings: [{ key: 'f', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Basic 1/.Front',
            tooltip: 'Rotate front face counter-clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "F'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-f',
            label: 'F',
            icon: 'move-f',
            keyBindings: [{ key: 'f' }],
            category: CommandCategory.CUBE,
            group: 'Basic 1/.Front',
            tooltip: 'Rotate front face clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'F',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-f2',
            label: 'F2',
            icon: 'move-f2',
            category: CommandCategory.CUBE,
            group: 'Basic 1/.Front',
            tooltip: 'Rotate front face 180°',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'F2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-b-prime',
            label: 'B′',
            icon: 'move-bp',
            keyBindings: [{ key: 'b', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Basic 2/.Back',
            tooltip: 'Rotate back face counter-clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "B'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-b',
            label: 'B',
            icon: 'move-b',
            keyBindings: [{ key: 'b' }],
            category: CommandCategory.CUBE,
            group: 'Basic 2/.Back',
            tooltip: 'Rotate back face clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'B',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-b2',
            label: 'B2',
            icon: 'move-b2',
            category: CommandCategory.CUBE,
            group: 'Basic 2/.Back',
            tooltip: 'Rotate back face 180°',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'B2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-u-prime',
            label: 'U′',
            icon: 'move-up',
            keyBindings: [{ key: 'u', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Basic 1/.Up',
            tooltip: 'Rotate top face counter-clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "U'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-u',
            label: 'U',
            icon: 'move-u',
            keyBindings: [{ key: 'u' }],
            category: CommandCategory.CUBE,
            group: 'Basic 1/.Up',
            tooltip: 'Rotate top face clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'U',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-u2',
            label: 'U2',
            icon: 'move-u2',
            category: CommandCategory.CUBE,
            group: 'Basic 1/.Up',
            tooltip: 'Rotate top face 180°',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'U2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-d-prime',
            label: 'D′',
            icon: 'move-dp',
            keyBindings: [{ key: 'd', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Basic 2/.Down',
            tooltip: 'Rotate bottom face counter-clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "D'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-d',
            label: 'D',
            icon: 'move-d',
            keyBindings: [{ key: 'd' }],
            category: CommandCategory.CUBE,
            group: 'Basic 2/.Down',
            tooltip: 'Rotate bottom face clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'D',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-d2',
            label: 'D2',
            icon: 'move-d2',
            category: CommandCategory.CUBE,
            group: 'Basic 2/.Down',
            tooltip: 'Rotate bottom face 180°',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'D2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-l-prime',
            label: 'L′',
            icon: 'move-lp',
            keyBindings: [{ key: 'l', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Basic 2/.Left',
            tooltip: 'Rotate left face counter-clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "L'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-l',
            label: 'L',
            icon: 'move-l',
            keyBindings: [{ key: 'l' }],
            category: CommandCategory.CUBE,
            group: 'Basic 2/.Left',
            tooltip: 'Rotate left face clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'L',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-l2',
            label: 'L2',
            icon: 'move-l2',
            category: CommandCategory.CUBE,
            group: 'Basic 2/.Left',
            tooltip: 'Rotate left face 180°',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'L2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-r-prime',
            label: 'R′',
            icon: 'move-rp',
            keyBindings: [{ key: 'r', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Basic 1/.Right',
            tooltip: 'Rotate right face counter-clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "R'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-r',
            label: 'R',
            icon: 'move-r',
            keyBindings: [{ key: 'r' }],
            category: CommandCategory.CUBE,
            group: 'Basic 1/.Right',
            tooltip: 'Rotate right face clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'R',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-r2',
            label: 'R2',
            icon: 'move-r2',
            category: CommandCategory.CUBE,
            group: 'Basic 1/.Right',
            tooltip: 'Rotate right face 180°',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'R2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        // Slice moves: M (middle between L and R), E (middle between U and D), S (middle between F and B)
        {
            id: 'move-m-prime',
            label: 'M′',
            icon: 'move-mp',
            keyBindings: [{ key: 'm', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Extended/.Middle',
            tooltip:
                'Rotate middle slice (between L and R) counter-clockwise (follows L direction)',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "M'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-m',
            label: 'M',
            icon: 'move-m',
            keyBindings: [{ key: 'm' }],
            category: CommandCategory.CUBE,
            group: 'Extended/.Middle',
            tooltip: 'Rotate middle slice (between L and R) clockwise (follows L direction)',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'M',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-m2',
            label: 'M2',
            icon: 'move-m2',
            category: CommandCategory.CUBE,
            group: 'Extended/.Middle',
            tooltip: 'Rotate middle slice 180° (follows L direction)',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'M2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-e-prime',
            label: 'E′',
            icon: 'move-ep',
            keyBindings: [{ key: 'e', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Extended/.Equatorial',
            tooltip:
                'Rotate equatorial slice (between U and D) counter-clockwise (follows D direction)',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "E'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-e',
            label: 'E',
            icon: 'move-e',
            keyBindings: [{ key: 'e' }],
            category: CommandCategory.CUBE,
            group: 'Extended/.Equatorial',
            tooltip: 'Rotate equatorial slice (between U and D) clockwise (follows D direction)',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'E',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-e2',
            label: 'E2',
            icon: 'move-e2',
            category: CommandCategory.CUBE,
            group: 'Extended/.Equatorial',
            tooltip: 'Rotate equatorial slice 180° (follows D direction)',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'E2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-s-prime',
            label: 'S′',
            icon: 'move-sp',
            keyBindings: [{ key: 's', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Extended/.Standing',
            tooltip:
                'Rotate standing slice (between F and B) counter-clockwise (follows F direction)',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "S'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-s',
            label: 'S',
            icon: 'move-s',
            labelPosition: 'top-right',
            keyBindings: [{ key: 's' }],
            category: CommandCategory.CUBE,
            group: 'Extended/.Standing',
            tooltip: 'Rotate standing slice (between F and B) clockwise (follows F direction)',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'S',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-s2',
            label: 'S2',
            icon: 'move-s2',
            category: CommandCategory.CUBE,
            group: 'Extended/.Standing',
            tooltip: 'Rotate standing slice 180° (follows F direction)',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'S2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        // Whole-cube rotations: x (R), y (U), z (F)
        {
            id: 'move-x-prime',
            label: 'x′',
            icon: 'move-xp',
            keyBindings: [{ key: 'x', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Whole Cube Rotations/.x',
            tooltip: 'Rotate entire cube around x-axis (R direction) counter-clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "x'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-x',
            label: 'x',
            icon: 'move-x',
            keyBindings: [{ key: 'x' }],
            category: CommandCategory.CUBE,
            group: 'Whole Cube Rotations/.x',
            tooltip: 'Rotate entire cube around x-axis (R direction) clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'x',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-x2',
            label: 'x2',
            icon: 'move-x2',
            category: CommandCategory.CUBE,
            group: 'Whole Cube Rotations/.x',
            tooltip: 'Rotate entire cube around x-axis 180°',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'x2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },

        {
            id: 'move-y-prime',
            label: 'y′',
            icon: 'move-yp',
            keyBindings: [{ key: 'y', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Whole Cube Rotations/.y',
            tooltip: 'Rotate entire cube around y-axis (U direction) counter-clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "y'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-y',
            label: 'y',
            icon: 'move-y',
            keyBindings: [{ key: 'y' }],
            category: CommandCategory.CUBE,
            group: 'Whole Cube Rotations/.y',
            tooltip: 'Rotate entire cube around y-axis (U direction) clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'y',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-y2',
            label: 'y2',
            icon: 'move-y2',
            category: CommandCategory.CUBE,
            group: 'Whole Cube Rotations/.y',
            tooltip: 'Rotate entire cube around y-axis 180°',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'y2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-z-prime',
            label: 'z′',
            icon: 'move-zp',
            keyBindings: [{ key: 'z', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Whole Cube Rotations/.z',
            tooltip: 'Rotate entire cube around z-axis (F direction) counter-clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: "z'",
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-z',
            label: 'z',
            icon: 'move-z',
            keyBindings: [{ key: 'z' }],
            category: CommandCategory.CUBE,
            group: 'Whole Cube Rotations/.z',
            tooltip: 'Rotate entire cube around z-axis (F direction) clockwise',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'z',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        {
            id: 'move-z2',
            label: 'z2',
            icon: 'move-z2',
            category: CommandCategory.CUBE,
            group: 'Whole Cube Rotations/.z',
            tooltip: 'Rotate entire cube around z-axis 180°',
            action: () =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'z2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
    ];
}
