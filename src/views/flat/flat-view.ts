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
    showGhosts: boolean;
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
    private state: FlatViewInternalData;
    private touchHandler: FlatTouchHandler | null = null;
    private ghostStrips: GhostStrips | null = null;
    private layoutMode: LayoutMode = LayoutMode.Floating;
    private legendDragState = legendDrag.createLegendDragState();
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

    getViewType(): string {
        return 'flat';
    }

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

    setLayoutMode(mode: LayoutMode): void {
        this.layoutMode = mode;
        this.touchHandler?.setLayoutMode(mode);
    }

    create(container: HTMLElement | null, _model: ReadOnlyCubeModel | null): void {
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

    update(model: ReadOnlyCubeModel): void {
        rendering.update(this.state, model);
        this.restoreSelection();
        this.ghostStrips?.updateColors();
    }

    public updateSelective(event?: MoveExecutedEvent): void {
        rendering.updateSelective(this.state, event);
        this.restoreSelection();
        this.ghostStrips?.updateColors();
    }

    updateHighlight(highlightedSticker?: StickerId): void {
        selection.updateHighlight(this.state, highlightedSticker);
    }

    updateSelected(selectedSticker?: StickerId): void {
        selection.updateSelected(this.state, selectedSticker);
    }

    handleKeyDown(event: KeyboardEvent): boolean {
        return commands.handleKeyDown(this.commandContext(), event);
    }

    handleKeyUp(event: KeyboardEvent): boolean {
        return commands.handleKeyUp(this.commandContext(), event);
    }

    resize(): void {
        this.handleResize();
        this.touchHandler?.resize();
    }

    private handleResize(): void {
        rendering.handleResize(this.state);
    }

    getMinimumSize(): Size2D {
        // intrinsic grid size (300×300) is used when sizing panels
        return { width: 300, height: 300 };
    }

    getCubeElement(): HTMLElement | null {
        return this.state.container?.querySelector(`.${this.state.styles['flat-grid']}`) || null;
    }

    getCommands(): Command[] {
        return commands.getCommands(this.commandContext());
    }

    private restoreSelection(): void {
        selection.restoreSelection(this.state);
    }

    private handleMoveExecuted(event: any): void {
        // Use selective updates if movedCubies data is available
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

    getState(): FlatViewState {
        return {
            faceDirectMode: this.touchHandler?.isFaceDirectMode() ?? false,
            cubeWalk: this.state.cubeWalk,
            showGhosts: this.ghostStrips?.getShowGhosts() ?? true,
        };
    }

    setState(state: unknown): void {
        if (!state || typeof state !== 'object') return;
        const s = state as Record<string, unknown>;
        if (typeof s['faceDirectMode'] === 'boolean')
            this.touchHandler?.setFaceDirectMode(s['faceDirectMode']);
        if (typeof s['cubeWalk'] === 'boolean') this.state.cubeWalk = s['cubeWalk'];
        if (typeof s['showGhosts'] === 'boolean') {
            this.ghostStrips?.setShowGhosts(s['showGhosts']);
        }
    }
}
