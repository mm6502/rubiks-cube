import { Application } from '@/application';
import { createUndoRedoCommands } from '@/cube/commands/undo-redo';
import { MoveHistory } from '@/cube/core/move-history';
import { CubeView, ReadOnlyCubeModel, Size2D, StickerId } from '@/cube/types';
import { MOVE_ICONS } from '@/icons';
import buttonStyles from '@/styles/buttons.module.css';
import { Command, CommandCategory, EventName, MoveExecutedEvent } from '@/types';

import styles from './moves-view.module.css';
import { MovesViewRenderer } from './renderer';

/**
 * State persisted for the moves view.
 */
interface MovesViewState {
    showAsIcons: boolean;
}

/**
 * Moves View - Displays move history with undo/redo support.
 *
 * This view shows the history of moves executed on the cube, with visual.
 * distinction between executed moves and undone moves (redo stack).
 */
export class MovesView implements CubeView {
    private moveHistory?: MoveHistory;
    private renderer?: MovesViewRenderer;

    // View state
    private showAsIcons: boolean = false;
    /** rAF handle for a pending deferred render, or null if none is queued. */
    private pendingRenderFrame: ReturnType<typeof requestAnimationFrame> | null = null;

    getViewType(): string {
        return 'moves';
    }

    create(container: HTMLElement, model: ReadOnlyCubeModel): void {
        this.moveHistory = model.getMoveHistory();

        // Initialize the renderer.
        this.renderer = new MovesViewRenderer(
            container,
            this.moveHistory,
            styles,
            buttonStyles,
            MOVE_ICONS
        );

        // Set up the DOM structure.
        this.renderer.initializeDOM();

        // Initial render.
        this.renderer.render();
    }

    /**
     * Full update - re-renders the entire move history.
     * Called by controller when moves are executed, undone, or cube is reset.
     */
    update(model: ReadOnlyCubeModel): void {
        // Refresh move history reference (important for state imports).
        this.moveHistory = model.getMoveHistory();
        if (this.renderer) {
            this.renderer.setMoveHistory(this.moveHistory);
            this.renderer.render();
        }
    }

    /**
     * Selective update - updates based on move execution data.
     *
     * Deferred to the next animation frame so it never runs in the same JS task
     * that starts a cube animation.  Multiple rapid moves coalesce into a single
     * render (only the last rAF fires).
     */
    updateSelective(_event?: MoveExecutedEvent): void {
        if (!this.renderer) return;
        // Cancel any already-queued frame so rapid moves coalesce into one render.
        if (this.pendingRenderFrame !== null) {
            cancelAnimationFrame(this.pendingRenderFrame);
        }
        const renderer = this.renderer;
        this.pendingRenderFrame = requestAnimationFrame(() => {
            this.pendingRenderFrame = null;
            renderer.render();
        });
    }

    updateHighlight(_highlightedSticker?: StickerId): void {
        // This view doesn't respond to sticker highlights.
    }

    updateSelected(_selectedSticker?: StickerId): void {
        // This view doesn't respond to sticker selection.
    }

    /**
     * Get the current state for persistence.
     */
    getState(): MovesViewState {
        return {
            showAsIcons: this.showAsIcons,
        };
    }

    /**
     * Set the view state from persisted data.
     */
    setState(state: unknown): void {
        if (!state || typeof state !== 'object' || !('showAsIcons' in state)) return;
        const viewState = state as MovesViewState;
        if (typeof viewState.showAsIcons === 'boolean') {
            this.showAsIcons = viewState.showAsIcons;
            if (this.renderer) {
                this.renderer.setShowAsIcons(this.showAsIcons);
            }
        }
    }

    getCommands(): Command[] {
        const undoRedo = createUndoRedoCommands(this.moveHistory ?? null, 'moves');
        return [
            ...undoRedo,
            {
                id: 'toggle-move-icons',
                label: 'Show Icons',
                category: CommandCategory.VIEW,
                group: '.',
                keyBindings: [{ key: '2', ctrlKey: true }, { key: '\\' }],
                icon: 'A',
                tooltip: 'Toggle between showing moves as text notation or icons.',
                showInHeader: true,
                isActive: () => this.showAsIcons,
                action: () => {
                    this.showAsIcons = !this.showAsIcons;
                    if (this.renderer) {
                        this.renderer.setShowAsIcons(this.showAsIcons);
                        this.renderer.render();
                    }
                    Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                        viewType: this.getViewType(),
                    });
                },
            },
        ];
    }

    getMinimumSize(): Size2D {
        return { width: 100, height: 200 };
    }

    destroy(): void {
        if (this.pendingRenderFrame !== null) {
            cancelAnimationFrame(this.pendingRenderFrame);
            this.pendingRenderFrame = null;
        }
        // Clear references.
        this.moveHistory = undefined;
        this.renderer = undefined;
    }
}
