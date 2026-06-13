// View interfaces for cube visualization
import { Size2D } from '@/cube/types/cubie';
import { ReadOnlyCubeModel } from '@/cube/types/model';
import { StickerId } from '@/cube/types/sticker';
import { Command, MoveExecutedEvent } from '@/types';

/** Layout mode for the application — floating panels (desktop) or tabbed (mobile/tablet). */
export const LayoutMode = {
    Floating: 'floating',
    Tabbed: 'tabbed',
} as const;

export type LayoutMode = (typeof LayoutMode)[keyof typeof LayoutMode];

/** Interface for cube visualization views */
export interface CubeView {
    /** Get the type identifier for this view */
    getViewType(): string;

    /**
     * Create and initialize the view in the given container
     * @param container - The HTML element to render the view in
     * @param model - The read-only cube model for data access
     */
    create(container: HTMLElement, model: ReadOnlyCubeModel): void;

    /**
     * Update the view with new cube state
     * @param model - The read-only cube model with updated data
     */
    update?(model: ReadOnlyCubeModel): void;

    /**
     * Update the view with new cube state
     * @param event - The move executed event containing details of the move
     */
    updateSelective?(event?: MoveExecutedEvent): void;

    /**
     * Update highlight for a specific sticker
     * @param highlightedSticker - The sticker ID to highlight, or undefined to clear highlight
     */
    updateHighlight(highlightedSticker?: StickerId): void;

    /** Handle view resize events */
    resize?(): void;

    /** Get minimum panel dimensions (width x height) for this view */
    getMinimumSize(): Size2D;

    /** Get the cube DOM element for external manipulation (e.g., flip) */
    getCubeElement?(): HTMLElement | null;

    /** Get supported commands for this view */
    getCommands(): Command[];

    /**
     * Handle keyboard down events for this view (called before keyup)
     * @param event - The keyboard event
     * @returns True if the event was handled, false otherwise
     */
    handleKeyDown?(event: KeyboardEvent): boolean;

    /**
     * Handle keyboard up events for this view
     * @param event - The keyboard event
     * @returns True if the event was handled, false otherwise
     */
    handleKeyUp?(event: KeyboardEvent): boolean;

    /**
     * Notify the view that the application layout mode has changed.
     * Views that alter their gesture handling based on layout (e.g. circular
     * view switching between delegated and legacy pan modes) should implement
     * this.
     */
    setLayoutMode?(mode: LayoutMode): void;

    /** Clean up resources when view is destroyed */
    destroy(): void;

    /**
     * Get the current state of the view for persistence
     * @returns The view's state data, or undefined if no state to persist
     */
    getState?(): unknown;

    /**
     * Set the view's state from persisted data
     * @param state - The previously saved state data
     */
    setState?(state: unknown): void;
}
