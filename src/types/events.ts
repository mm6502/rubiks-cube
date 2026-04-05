// Event type definitions and payload interfaces for the Commanding and Eventing System
//
// This module defines the event interfaces used for communication between the CubeController,
// views, and other components. The MoveExecutedEvent has been enhanced to provide comprehensive
// information about cube state changes, enabling views to implement advanced features like:
//
// - Selective updates (only re-render changed cubies)
// - Smooth animations based on actual cubie movements
// - Move validation and feedback
// - Debugging and development tools
// - Performance optimizations for large cubes
//
// Key improvements:
// - preState/postState: Complete before/after cube states (read-only for safety)
// - definition: Detailed cube2 move definition for the executed move
// - movedCubies: Detailed information about which cubies changed and how
// - Compile-time safety: Readonly<T> prevents accidental mutations
import { CubeState, ReadonlyCubie, StickerId } from '@/cube/types';
import type { MoveDefinition } from '@/cube/types/move';

/**
 * Constant object containing all valid event names
 * Used for type-safe event emission and handling
 */
export const EventName = {
    STICKER_SELECTED: 'stickerSelected',
    HIGHLIGHT_CHANGED: 'highlightChanged',
    MOVE_REQUESTED: 'moveRequested',
    MOVE_EXECUTED: 'moveExecuted',
    UNDO_REQUESTED: 'undoRequested',
    REDO_REQUESTED: 'redoRequested',
    VIEW_INTERACTED: 'viewInteracted',
    VIEW_STATE_CHANGED: 'viewStateChanged',
    COMMAND_EXECUTED: 'commandExecuted',
    CUBE_RESET_REQUESTED: 'cubeResetRequested',
    CUBE_SCRAMBLE_REQUESTED: 'cubeScrambleRequested',
    STORAGE_CLEAR_REQUESTED: 'storageClearRequested',
    STATE_EXPORT_REQUESTED: 'stateExportRequested',
    STATE_IMPORT_REQUESTED: 'stateImportRequested',
} as const;

/**
 * Type representing all valid event names.
 * Provides compile-time safety for event name usage.
 */
export type EventName = (typeof EventName)[keyof typeof EventName];

/**
 * Event emitted when a sticker is selected/clicked in a view.
 * Used for user interaction handling and focus management.
 */
export interface StickerSelectedEvent {
    /**
     * ID of the sticker that was selected/clicked.
     */
    stickerId?: StickerId;

    /**
     * ID of the view where the selection occurred.
     */
    viewId: string;
}

/**
 * Event emitted when a view requests a move to be executed.
 * The controller validates and executes the move, then emits MoveExecutedEvent.
 */
export interface MoveRequestedEvent {
    /**
     * The move notation requested (e.g., 'F', 'R2', 'U\'', '3Rw', etc.).
     */
    moveNotation: string;

    /**
     * ID of the view requesting the move.
     */
    viewId: string;

    /**
     * Whether this is a tentative/preview move (e.g., for hover effects).
     * Tentative moves are not executed, only validated.
     */
    tentative: boolean;
}

/**
 * Event emitted after a move has been successfully executed.
 * Provides comprehensive information about the move and resulting state changes.
 * Enhanced to support advanced view features like selective updates and animations.
 */
export interface MoveExecutedEvent {
    /**
     * Details about the move that was executed.
     */
    moveDetails: {
        /**
         * The move notation (e.g., 'F', 'R2', 'U\'', '3Rw', etc.).
         */
        notation: string;

        /**
         * Detailed cube move definition describing axis, layers, and angle.
         * Optional when legacy controllers cannot produce structured details.
         */
        definition?: MoveDefinition;

        /**
         * Information about cubies that were moved during this operation.
         * Optional - may be undefined if detailed cubies tracking is not needed.
         */
        movedCubies?: {
            /**
             * Array of cubies in their state before the move.
             */
            before: ReadonlyCubie[];

            /**
             * Array of cubies in their state after the move.
             */
            after: ReadonlyCubie[];
        };
    };

    /**
     * Complete cube state before the move was executed.
     * Read-only to prevent accidental mutations by event consumers.
     */
    preState: Readonly<CubeState>;

    /**
     * Complete cube state after the move was executed.
     * Read-only to prevent accidental mutations by event consumers.
     */
    postState: Readonly<CubeState>;
}

/**
 * Event emitted when a user interacts with a view (click, focus, etc.).
 * Used by the ViewManager for focus management and keyboard shortcut routing.
 */
export interface ViewInteractedEvent {
    /**
     * ID of the view that was interacted with.
     * Used for focus management and keyboard shortcut routing.
     */
    viewId: string;
}

/**
 * Event emitted when a view's state has changed and should be persisted.
 * Allows views to signal state changes without direct coupling to persistence logic.
 */
export interface ViewStateChangedEvent {
    /**
     * Type identifier of the view whose state changed.
     */
    viewType: string;
}

/**
 * Event emitted when a command is executed by a view.
 * Used for command tracking and UI state management.
 */
export interface CommandExecutedEvent {
    /**
     * Unique identifier of the command that was executed.
     */
    commandId: string;

    /**
     * ID of the view that executed the command.
     */
    viewId: string;
}

/**
 * Event emitted when the highlighted sticker changes (e.g., mouseover/mouseout).
 */
export interface HighlightChangedEvent {
    /**
     * ID of the sticker that is highlighted, or null when highlight is cleared.
     */
    stickerId?: StickerId;

    /**
     * Optional ID of the view that caused the highlight change.
     */
    viewId?: string;
}

/**
 * Event emitted when a cube reset is requested.
 */
export interface CubeResetRequestedEvent {
    // No additional data needed
}

/**
 * Event emitted when a cube scramble is requested.
 */
export interface CubeScrambleRequestedEvent {
    // No additional data needed
}

/**
 * Event emitted when storage clear is requested.
 */
export interface StorageClearRequestedEvent {
    // No additional data needed
}

/**
 * Event emitted when state export is requested.
 */
export interface StateExportRequestedEvent {
    // No additional data needed
}

/**
 * Event emitted when state import is requested.
 */
export interface StateImportRequestedEvent {
    // No additional data needed
}

/**
 * Union type for all event payloads.
 * Used by the EventBus for type-safe event emission and handling.
 * Each event name maps to its corresponding payload type.
 */
export type EventPayload =
    | StickerSelectedEvent
    | MoveRequestedEvent
    | MoveExecutedEvent
    | ViewInteractedEvent
    | CommandExecutedEvent
    | HighlightChangedEvent
    | CubeResetRequestedEvent
    | CubeScrambleRequestedEvent
    | StorageClearRequestedEvent
    | StateExportRequestedEvent
    | StateImportRequestedEvent;
