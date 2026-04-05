// Command interface and types for the Commanding and Eventing System

/**
 * Categories for commands in the application.
 */
export const CommandCategory = {
    CONTROLLER: 'controller',
    CUBE: 'cube',
    VIEW: 'view',
} as const;

export type CommandCategory = (typeof CommandCategory)[keyof typeof CommandCategory];

/**
 * Represents a key binding for a command.
 * @interface KeyBinding
 * @property {string} key - The key that triggers the command.
 * @property {boolean} [altKey] - Whether the Alt key must be pressed.
 * @property {boolean} [ctrlKey] - Whether the Ctrl key must be pressed.
 * @property {boolean} [shiftKey] - Whether the Shift key must be pressed.
 * @property {boolean} [metaKey] - Whether the Meta key (Command on Mac, Windows key on Windows) must be pressed.
 */
export type KeyBinding = {
    key: string;
    altKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    metaKey?: boolean;
};

/**
 * Layout mode for rendering buttons within a command group/subgroup.
 *
 * - `'flow'` (default): buttons are placed directly in the flex row and wrap naturally.
 *   Each button sizes to its own content. Best for text-only or mixed buttons.
 * - `'stack'`: each button occupies a full row, laid out in a column. Best for
 *   descriptive labels or actions that should be visually distinct and easy to tap.
 */
export const GroupLayout = {
    FLOW: 'flow',
    STACK: 'stack',
} as const;

export type GroupLayout = (typeof GroupLayout)[keyof typeof GroupLayout];

/**
 * Position for rendering label text over icon buttons.
 */
export type LabelPosition =
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'center'
    | 'none';

/**
 * Represents a command that can be executed in the application.
 * Commands can be categorized, have optional key bindings,
 * and may include icons, button text, and tooltips for UI representation.
 * @type Command
 * @property {string} id - Unique identifier for the command.
 * @property {string} label - Human-readable label for the command.
 * @property {KeyBinding[]} [keyBindings] - Optional array of key bindings for the command.
 * @property {CommandCategory} category - Category of the command (e.g., CommandCategory.CUBE, 'view').
 * @property {() => void | Promise<void>} action - Function to execute when the command is invoked.
 * @property {string} [icon] - Optional icon (text, emoji, or image) for button display.
 * @property {string} [tooltip] - Optional tooltip for button.
 * @property {string} [group] - Optional group identifier for organizing related commands together. Supports hierarchical group paths separated by '/'. Example: `Moves/Basic`, `Moves/Extended`, `Whole Cube Rotations`.
 * @property {boolean} [showInHeader] - Whether to show in view header. If false (default), shows only in view actions panel.
 * @property {number} [priority] - Display priority (lower numbers = higher priority). Used to determine which buttons to hide when space is limited. Default is 100.
 * @property {LabelPosition} [labelPosition] - Position for rendering label text over icon. Only applies when icon is present. Options: 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'none'. Default is 'none'.
 * @property {() => boolean} [isActive] - Optional function returning whether this command is currently toggled on. When provided, the button renders with `aria-pressed` and an active/highlighted style.
 * @property {() => boolean} [isEnabled] - Optional function returning whether this command is currently available. When provided, the button is rendered as `disabled` when it returns false.
 */
export type Command = {
    id: string;
    label: string;
    keyBindings?: KeyBinding[];
    category: CommandCategory;
    action: () => void | Promise<void>;
    icon?: string; // Optional icon (text, emoji, or image) for button display
    tooltip?: string; // Optional tooltip for button
    group?: string; // Optional group identifier for organizing related commands
    showInHeader?: boolean; // Whether to show in view header (default: false, shows only in view actions)
    priority?: number; // Display priority (lower = higher priority), default 100
    labelPosition?: LabelPosition; // Position for label text over icon (default: 'none')
    isActive?: () => boolean; // Optional toggle-state getter; when present the button renders with aria-pressed
    isEnabled?: () => boolean; // Optional availability getter; when present the button is disabled when it returns false
    groupLayout?: GroupLayout; // Optional layout mode for rendering buttons within this command's group (default: 'flow')
};
