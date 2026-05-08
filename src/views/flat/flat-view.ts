import { Application } from '@/application';
import { CubeView, Face, FaceGrid, ReadOnlyCubeModel, Size2D, StickerId } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { CubeStateUtils, createFlatView } from '@/cube/utils/state-conversion';
import { Command, EventName, MoveExecutedEvent } from '@/types';

import * as commands from './commands';
import * as legendDrag from './legend-drag';
import * as rendering from './rendering';
import * as selection from './selection';
import { GhostStrips } from './ghost-strips';
import { FlatTouchHandler } from './touch-handler';

export type FlatViewState = {
    faceDirectMode: boolean;
    cubeWalk: boolean;
    ghostOpacityIndex: number;
};

/**
 * Internal state shared between all flat-view operations.
 */
export type FlatViewInternalData = {
    /** The cube model associated with this view. */
    model: ReadOnlyCubeModel | null;
    /** The host container element supplied by the view manager. */
    container: HTMLElement | null;
    /** CSS module class map. */
    styles: Record<string, string>;
    /** Currently selected sticker for keyboard navigation. */
    currentSelected: StickerId | undefined;
    /** Face of the currently selected sticker (spatial anchor for selection). */
    selectedFace: string | undefined;
    /** Position on face of the currently selected sticker (spatial anchor). */
    selectedPosition: number | undefined;
    /**
     * Whether the cross layout is currently rotated 90° (portrait / mobile).
     * Used by touch-input handling to map swipe directions to cube moves.
     */
    isRotated: boolean;
    /** The legend DOM element, kept for runtime rotation updates. */
    legendElement: HTMLElement | null;
    /** Whether keyboard walking follows real cube surface topology. */
    cubeWalk: boolean;
};

// Flat T-shaped Cube Visualization
export class FlatView implements CubeView {
    /** Internal runtime state shared across all flat-view operations. */
    private state: FlatViewInternalData;
    /** Pointer-interaction handler; null before {@link create} and after {@link destroy}. */
    private touchHandler: FlatTouchHandler | null = null;
    /** Ghost-strip overlay manager; null before {@link create} and after {@link destroy}. */
    private ghostStrips: GhostStrips | null = null;

    /** @internal Exposed for test access only — not part of the public CubeView contract. */
    getGhostStrips(): GhostStrips | null {
        return this.ghostStrips;
    }
    /** Current layout mode, forwarded to the touch handler on change. */
    private layoutMode: LayoutMode = LayoutMode.Floating;
    /** Mutable state used by the legend drag subsystem. */
    private legendDragState = legendDrag.createLegendDragState();
    /** Stable listener references for the legend drag pointer events; null before {@link create}. */
    private legendHandlers: {
        down: (e: PointerEvent) => void;
        move: (e: PointerEvent) => void;
        up: (e: PointerEvent) => void;
    } | null = null;

    constructor(styles: Record<string, string>) {
        this.state = {
            model: null,
            container: null,
            styles,
            currentSelected: undefined,
            selectedFace: undefined,
            selectedPosition: undefined,
            isRotated: false,
            legendElement: null,
            cubeWalk: true,
        };
    }

    /** Returns the view type identifier used to distinguish this view from others. */
    getViewType(): string {
        return 'flat';
    }

    /**
     * Assembles the {@link commands.FlatCommandContext} object that gives command
     * handlers access to view state and touch-handler callbacks.
     */
    private commandContext(): commands.FlatCommandContext {
        return {
            state: this.state,
            isFaceDirectMode: () => this.touchHandler?.isFaceDirectMode() ?? false,
            setFaceDirectMode: v => this.touchHandler?.setFaceDirectMode(v),
            getSelectedFace: () => this.touchHandler?.getSelectedFace(),
            selectFace: f => this.touchHandler?.selectFace(f),
            isGhostVisible: () => this.ghostStrips?.isVisible() ?? false,
            toggleGhosts: () => this.ghostStrips?.toggle(),
            getViewType: () => this.getViewType(),
            canUndo: () => this.state.model?.getMoveHistory().canUndo() ?? false,
            canRedo: () => this.state.model?.getMoveHistory().canRedo() ?? false,
            emitEvent: (name, payload) => Application.eventBus.emit(name, payload),
            updateSelected: id => this.updateSelected(id),
        };
    }

    /** Updates the layout mode and forwards it to the touch handler. */
    setLayoutMode(mode: LayoutMode): void {
        this.layoutMode = mode;
        this.touchHandler?.setLayoutMode(mode);
    }

    /**
     * Builds the full flat-view DOM, sets up the touch handler, ghost strips,
     * legend drag interactions, and subscribes to move-executed events.
     */
    create(container: HTMLElement | null, _model: ReadOnlyCubeModel | null): void {
        /* c8 ignore if — CubeView.create contract guarantees non-null args */
        if (!container || !_model) return;
        this.state.container = container;
        this.state.model = _model;
        this.state.container.innerHTML = '';
        // Make focusable for keyboard navigation
        this.state.container.tabIndex = 0;

        // Create the flat view container
        const flatContainer = document.createElement('div');
        flatContainer.className = this.state.styles['flat-container'];

        // Create the T-shaped grid (3 rows x 4 columns)
        const grid = document.createElement('div');
        grid.className = this.state.styles['flat-grid'];
        // Set initial scale (centering is handled by the flex parent)
        grid.style.transform = 'scale(1)';

        // Use createFlatView to get structured face data
        const currentState3D = _model.getCurrentState();
        const displayGrid = createFlatView(currentState3D);

        // Define the layout: [row][col] -> face or null
        const layout: (Face | null)[][] = [
            [null, Face.U, null, null],
            [Face.L, Face.F, Face.R, Face.B],
            [null, Face.D, null, null],
        ];

        // Create the grid cells using FaceGrid data
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 4; col++) {
                const cell = document.createElement('div');
                cell.className = this.state.styles['flat-cell'];

                const face = layout[row][col];
                if (face) {
                    const faceGrid = displayGrid.get(face);
                    if (faceGrid) {
                        const faceDiv = this.createFaceElement(face, faceGrid);
                        cell.appendChild(faceDiv);
                    }
                }

                grid.appendChild(cell);
            }
        }

        // Create legend — innerHTML is populated by handleResize() called below.
        const legend = document.createElement('div');
        legend.className = this.state.styles['flat-legend'];
        this.state.legendElement = legend;

        flatContainer.appendChild(legend);
        flatContainer.appendChild(grid);

        this.state.container.appendChild(flatContainer);

        // Create ghost strips on all non-layout-adjacent edges
        this.ghostStrips = new GhostStrips(flatContainer, this.state.styles);
        this.ghostStrips.create();

        this.touchHandler = new FlatTouchHandler({
            host: flatContainer,
            styles: this.state.styles,
            getCubeSize: () => this.state.model?.getCurrentState().cubeSize ?? 3,
            getIsRotated: () => this.state.isRotated,
            onStickerSelected: stickerId => this.updateSelected(stickerId as StickerId | undefined),
        });
        this.touchHandler.attach();

        // Add drag interactions for whole cube rotations (after touchHandler is ready).
        this.legendHandlers = legendDrag.createLegendDragHandlers(this.legendDragState, {
            legendElement: legend,
            getIsRotated: () => this.state.isRotated,
            getLayoutMode: () => this.layoutMode,
            showCancellationZone: (x, y, r) =>
                this.touchHandler?.showCancellationZoneAtOrigin(x, y, r),
            showDragLabel: (n, x, y) => this.touchHandler?.showDragLabel(n, x, y),
            hideDragLabel: () => this.touchHandler?.hideDragLabel(),
            hideCancellationZone: () => this.touchHandler?.hideCancellationZone(),
            emitMove: notation =>
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: notation,
                    viewId: this.getViewType(),
                    tentative: false,
                }),
        });
        legend.addEventListener('pointerdown', this.legendHandlers.down);
        document.addEventListener('pointermove', this.legendHandlers.move);
        document.addEventListener('pointerup', this.legendHandlers.up);

        // Initial resize
        this.handleResize();

        // Subscribe to move executed events for selective updates
        Application.eventBus.on(EventName.MOVE_EXECUTED, this.handleMoveExecuted.bind(this));

        // Default selection: F4 sticker.
        const f4 = CubeStateUtils.getStickerAt(_model.getCurrentState(), Face.F, 4);
        if (f4) this.updateSelected(f4.id);
    }

    /**
     * Creates the DOM element for a single cube face and attaches hover/click
     * listeners for highlight and selection feedback.
     */
    private createFaceElement(face: Face, faceGrid: FaceGrid): HTMLElement {
        const faceDiv = rendering.createFaceElement(face, faceGrid, this.state.styles);

        // Attach interaction listeners (rendering module produces DOM only).
        faceDiv.querySelectorAll(`.${this.state.styles['flat-sticker']}`).forEach(sticker => {
            sticker.addEventListener('mouseover', e => {
                const target = e.currentTarget as HTMLElement;
                const stickerId = target.getAttribute('data-sticker-id');
                Application.eventBus.emit(EventName.HIGHLIGHT_CHANGED, {
                    stickerId,
                    viewId: this.getViewType(),
                });
            });

            sticker.addEventListener('mouseout', () => {
                Application.eventBus.emit(EventName.HIGHLIGHT_CHANGED, {
                    stickerId: undefined,
                    viewId: this.getViewType(),
                });
            });

            sticker.addEventListener('click', e => {
                const target = e.currentTarget as HTMLElement;
                const stickerId = target.getAttribute('data-sticker-id');
                this.updateSelected(stickerId as StickerId);
                this.state.container?.focus();
            });
        });

        return faceDiv;
    }

    /** Performs a full DOM re-render from the given model and restores selection. */
    update(model: ReadOnlyCubeModel): void {
        rendering.update(this.state, model);
        this.restoreSelection();
        this.ghostStrips?.updateColors();
    }

    /** Re-renders only the stickers affected by the given move event, falling back to a full update. */
    public updateSelective(event?: MoveExecutedEvent): void {
        rendering.updateSelective(this.state, event);
        this.restoreSelection();
        this.ghostStrips?.updateColors();
    }

    /** Applies or clears the hover-highlight style on the given sticker. */
    updateHighlight(highlightedSticker?: StickerId): void {
        selection.updateHighlight(this.state, highlightedSticker);
    }

    /** Marks the given sticker as selected and updates the spatial anchor used for keyboard navigation. */
    updateSelected(selectedSticker?: StickerId): void {
        selection.updateSelected(this.state, selectedSticker);
    }

    /** Dispatches a keydown event to the command system; returns true if the event was consumed. */
    handleKeyDown(event: KeyboardEvent): boolean {
        return commands.handleKeyDown(this.commandContext(), event);
    }

    /** Dispatches a keyup event to the command system; returns true if the event was consumed. */
    handleKeyUp(event: KeyboardEvent): boolean {
        return commands.handleKeyUp(this.commandContext(), event);
    }

    /** Recalculates scale and legend content, and repositions the halo overlay. */
    resize(): void {
        this.handleResize();
        this.touchHandler?.resize();
    }

    /** Delegates to the rendering module to recalculate scale and legend content. */
    private handleResize(): void {
        rendering.handleResize(this.state);
    }

    /** Returns the minimum intrinsic size of the flat-view grid used when sizing panels. */
    getMinimumSize(): Size2D {
        // intrinsic grid size (300×300) is used when sizing panels
        return { width: 300, height: 300 };
    }

    /** Returns the flat-grid element, or null if the view has not been created yet. */
    getCubeElement(): HTMLElement | null {
        return this.state.container?.querySelector(`.${this.state.styles['flat-grid']}`) || null;
    }

    /** Returns the list of keyboard commands available in this view. */
    getCommands(): Command[] {
        return commands.getCommands(this.commandContext());
    }

    /** Re-applies the stored selection after a model update so visual state stays consistent. */
    private restoreSelection(): void {
        selection.restoreSelection(this.state);
    }

    /**
     * Event handler invoked after each move execution.
     * Uses selective rendering when cubie-level diff data is available,
     * otherwise falls back to a full update.
     */
    private handleMoveExecuted(event: any): void {
        // Use selective updates if movedCubies data is available
        /* c8 ignore if — model always present when events fire */
        if (!this.state.model) {
            return;
        }

        if (event.moveDetails?.movedCubies) {
            this.updateSelective(event as MoveExecutedEvent);
            return;
        }

        // Fall back to full update for backward compatibility
        this.update(this.state.model);
    }

    /** Tears down all event listeners, nulls the touch handler, and clears the container DOM. */
    destroy(): void {
        if (this.legendHandlers) {
            document.removeEventListener('pointermove', this.legendHandlers.move);
            document.removeEventListener('pointerup', this.legendHandlers.up);
        }

        this.touchHandler?.destroy();
        this.touchHandler = null;

        if (this.state.container) {
            this.state.container.innerHTML = '';
        }
    }

    /** Returns a serialisable snapshot of view-specific UI state for persistence. */
    getState(): FlatViewState {
        return {
            faceDirectMode: this.touchHandler?.isFaceDirectMode() ?? false,
            cubeWalk: this.state.cubeWalk,
            ghostOpacityIndex: this.ghostStrips?.getOpacityIndex() ?? 1,
        };
    }

    /** Restores view-specific UI state from a previously captured snapshot. */
    setState(state: unknown): void {
        if (!state || typeof state !== 'object') return;
        const s = state as Record<string, unknown>;
        if (typeof s['faceDirectMode'] === 'boolean')
            this.touchHandler?.setFaceDirectMode(s['faceDirectMode']);
        if (typeof s['cubeWalk'] === 'boolean') this.state.cubeWalk = s['cubeWalk'];

        // Restore ghost opacity — support both new (ghostOpacityIndex) and legacy (showGhosts)
        if (typeof s['ghostOpacityIndex'] === 'number') {
            this.ghostStrips?.setOpacityIndex(s['ghostOpacityIndex']);
        } else if (typeof s['showGhosts'] === 'boolean') {
            this.ghostStrips?.setShowGhosts(s['showGhosts']);
        }
    }
}
