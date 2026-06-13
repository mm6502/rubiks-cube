import type { MoveHistory } from '@/cube/core/move-history';
import { getEventBus } from '@/event-bus-accessor';
import { Command, CommandCategory, EventName } from '@/types';

/**
 * Create shared Undo/Redo command definitions.
 *
 * All undo/redo commands across views emit the same events and share
 * identical key bindings, icons, and display order. This factory is the
 * single source of truth for their shape.
 *
 * @param moveHistory - The move history to query for availability.
 *   Pass `null` when the history is not yet available (e.g., during
 *   view initialization); `isEnabled` will return `false` in that case.
 * @param prefix - Prefix for command IDs (e.g., `'basic-front'` →
 *   `'basic-front.undo'`, `'basic-front.redo'`).
 * @returns Array of two Command objects: [undo, redo].
 */
export function createUndoRedoCommands(moveHistory: MoveHistory | null, prefix: string): Command[] {
    return [
        {
            id: `${prefix}.undo`,
            label: 'Undo',
            category: CommandCategory.VIEW,
            showInHeader: true,
            icon: '↩',
            tooltip: 'Undo last move.',
            keyBindings: [{ key: '[' }, { key: ',' }],
            displayOrder: 900,
            overflowPriority: 901,
            action: () => getEventBus().emit(EventName.UNDO_REQUESTED, {}),
            isEnabled: () => moveHistory?.canUndo() ?? false,
        },
        {
            id: `${prefix}.redo`,
            label: 'Redo',
            category: CommandCategory.VIEW,
            showInHeader: true,
            icon: '↪',
            tooltip: 'Redo last undone move.',
            keyBindings: [{ key: ']' }, { key: '.' }],
            displayOrder: 901,
            overflowPriority: 900,
            action: () => getEventBus().emit(EventName.REDO_REQUESTED, {}),
            isEnabled: () => moveHistory?.canRedo() ?? false,
        },
    ];
}
