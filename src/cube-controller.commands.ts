import { createUndoRedoCommands } from '@/cube/commands/undo-redo';
import { ReadOnlyCubeModel } from '@/cube/types';
import { Axis } from '@/cube/types/common';
import { getEventBus } from '@/event-bus-accessor';
import { SliceBase, resolveSliceTarget } from '@/interaction/slice-target';
import {
    Command,
    CommandCategory,
    CommandGenerationOptions,
    EventName,
    GroupLayout,
    LabelPosition,
} from '@/types';

/**
 * A slice variant: the prime (counter-clockwise), base (clockwise) and double
 * (180°) spellings of one M/E/S family.
 *
 * The two suffixes differ because display and notation are not the same string:
 * label text uses the typographic prime (`M′`) to match every other move button,
 * while move notation must use the ASCII apostrophe the parser accepts (`M'`).
 */
const SLICE_VARIANTS = [
    {
        idSuffix: '-prime',
        labelSuffix: '′',
        notationSuffix: "'",
        iconSuffix: 'p',
        direction: 'counter-clockwise',
        keyModifier: { shiftKey: true },
    },
    {
        idSuffix: '',
        labelSuffix: '',
        notationSuffix: '',
        iconSuffix: '',
        direction: 'clockwise',
        keyModifier: {},
    },
    {
        idSuffix: '2',
        labelSuffix: '2',
        notationSuffix: '2',
        iconSuffix: '2',
        direction: '180°',
        keyModifier: undefined,
    },
] as const;

/**
 * Description of one slice family, used for its group, tooltip and key binding.
 */
type SliceFamilyDescription = {
    /** Group path the family's buttons render under. */
    group: string;
    /** Human-readable slice name including the faces it sits between. */
    description: string;
    /** Face whose direction the slice follows (L for M, D for E, F for S). */
    reference: string;
    /** Label overlay position for the family's base variant (S collides otherwise). */
    baseLabelPosition?: LabelPosition;
};

/**
 * Build the three commands (prime, base, double) for one slice family.
 *
 * All three follow the active view's selection on cubes larger than 3×3 — see
 * {@link resolveSliceTarget} for the size-dependent rule — so their label,
 * tooltip and enabled state are derived from the same resolved target. That
 * resolution happens when commands are generated, which is why the host
 * regenerates them when the selection changes.
 */
function createSliceCommands(
    base: SliceBase,
    axis: Axis,
    family: SliceFamilyDescription,
    getCubeSize: () => number,
    options?: CommandGenerationOptions
): Command[] {
    const resolve = () => resolveSliceTarget(base, axis, getCubeSize(), options);

    return SLICE_VARIANTS.map(variant => {
        const isBaseVariant = variant.idSuffix === '';
        return {
            id: `move-${base.toLowerCase()}${variant.idSuffix}`,
            // Falls back to the bare letter while nothing is selected, which is
            // also the point at which the button is disabled.
            label: `${resolve()?.notation ?? base}${variant.labelSuffix}`,
            icon: `move-${base.toLowerCase()}${variant.iconSuffix}`,
            ...(variant.keyModifier === undefined
                ? {}
                : { keyBindings: [{ key: base.toLowerCase(), ...variant.keyModifier }] }),
            category: CommandCategory.CUBE,
            group: family.group,
            ...(isBaseVariant && family.baseLabelPosition
                ? { labelPosition: family.baseLabelPosition }
                : {}),
            tooltip: `Rotate ${family.description} ${variant.direction} (follows ${family.reference} direction).`,
            isEnabled: () => resolve() !== undefined,
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
                    // Re-resolved at click time so the move matches the layer the
                    // button currently advertises; the bare letter is the last
                    // resort if the selection changed in between.
                    moveNotation: `${resolve()?.notation ?? base}${variant.notationSuffix}`,
                    viewId: 'controller',
                    tentative: false,
                }),
        } satisfies Command;
    });
}

export function getCommands(
    model: ReadOnlyCubeModel,
    options?: CommandGenerationOptions
): Command[] {
    const undoRedo = createUndoRedoCommands(model.getMoveHistory(), 'cube');
    const getCubeSize = () => model.getCurrentState().cubeSize;
    return [
        ...undoRedo,
        {
            id: 'reset-cube',
            label: 'Reset Cube',
            category: CommandCategory.CONTROLLER,
            group: 'State Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Reset cube to solved state.',
            action: () => getEventBus().emit(EventName.CUBE_RESET_REQUESTED, {}),
        },
        {
            id: 'scramble-cube',
            label: 'Scramble',
            category: CommandCategory.CONTROLLER,
            group: 'State Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Scramble the cube with random moves.',
            action: () => getEventBus().emit(EventName.CUBE_SCRAMBLE_REQUESTED, {}),
        },
        {
            id: 'clear-storage',
            label: 'Clear Saved Data',
            category: CommandCategory.CONTROLLER,
            group: 'State Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Clear saved cube state and layout.',
            action: () => getEventBus().emit(EventName.STORAGE_CLEAR_REQUESTED, {}),
        },
        {
            id: 'export-state',
            label: 'Export State',
            category: CommandCategory.CONTROLLER,
            group: 'State Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Save cube state to file.',
            action: () => getEventBus().emit(EventName.STATE_EXPORT_REQUESTED, {}),
        },
        {
            id: 'import-state',
            label: 'Import State',
            category: CommandCategory.CONTROLLER,
            group: 'State Management',
            groupLayout: GroupLayout.FLOW,
            tooltip: 'Import cube state from file.',
            action: () => getEventBus().emit(EventName.STATE_IMPORT_REQUESTED, {}),
        },
        {
            id: 'move-f-prime',
            label: 'F′',
            icon: 'move-fp',
            keyBindings: [{ key: 'f', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Basic 1/.Front',
            tooltip: 'Rotate front face counter-clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate front face clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate front face 180°.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate back face counter-clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate back face clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate back face 180°.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate top face counter-clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate top face clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate top face 180°.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate bottom face counter-clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate bottom face clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate bottom face 180°.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate left face counter-clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate left face clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate left face 180°.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate right face counter-clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate right face clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate right face 180°.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'R2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
        // Slice moves: M (middle between L and R), E (middle between U and D), S (middle between F and B).
        // Generated rather than hand-written because their target layer, notation and
        // enabled state all depend on the active view's selection at sizes above 3×3.
        ...createSliceCommands(
            'M',
            Axis.X,
            {
                group: 'Extended/.Middle',
                description: 'middle slice (between L and R)',
                reference: 'L',
            },
            getCubeSize,
            options
        ),
        ...createSliceCommands(
            'E',
            Axis.Y,
            {
                group: 'Extended/.Equatorial',
                description: 'equatorial slice (between U and D)',
                reference: 'D',
            },
            getCubeSize,
            options
        ),
        ...createSliceCommands(
            'S',
            Axis.Z,
            {
                group: 'Extended/.Standing',
                description: 'standing slice (between F and B)',
                reference: 'F',
                baseLabelPosition: 'top-right',
            },
            getCubeSize,
            options
        ),
        // Whole-cube rotations: x (R), y (U), z (F)
        {
            id: 'move-x-prime',
            label: 'x′',
            icon: 'move-xp',
            keyBindings: [{ key: 'x', shiftKey: true }],
            category: CommandCategory.CUBE,
            group: 'Whole Cube Rotations/.x',
            tooltip: 'Rotate entire cube around x-axis (R direction) counter-clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate entire cube around x-axis (R direction) clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate entire cube around x-axis 180°.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate entire cube around y-axis (U direction) counter-clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate entire cube around y-axis (U direction) clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate entire cube around y-axis 180°.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate entire cube around z-axis (F direction) counter-clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate entire cube around z-axis (F direction) clockwise.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
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
            tooltip: 'Rotate entire cube around z-axis 180°.',
            action: () =>
                getEventBus().emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'z2',
                    viewId: 'controller',
                    tentative: false,
                }),
        },
    ];
}
