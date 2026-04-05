import { Application } from '@/application';
import {
    CubeView,
    Face,
    FaceGrid,
    ReadOnlyCubeModel,
    Size2D,
    StickerId,
    resolveCubeColor,
} from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { CubeStateUtils, createFlatView } from '@/cube/utils/state-conversion';
import { computeAvailableContentSize } from '@/cube/utils/view-utils';
import { CANCEL_ZONE_RADIUS_BASE_PX, CANCEL_ZONE_TABBED_MULTIPLIER } from '@/interaction/types';
import { Command, CommandCategory, EventName, MoveExecutedEvent } from '@/types';

import { FlatTouchHandler } from './flat-touch-handler';
import { isNavigationKey, navigate } from './navigation';

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
    /**
     * Whether the cross layout is currently rotated 90° (portrait / mobile).
     * Used by touch-input handling to map swipe directions to cube moves.
     */
    isRotated: boolean;
    /** The legend DOM element, kept for runtime rotation updates. */
    legendElement: HTMLElement | null;
};

// Flat T-shaped Cube Visualization
export class FlatView implements CubeView {
    private state: FlatViewInternalData;
    private touchHandler: FlatTouchHandler | null = null;
    private layoutMode: LayoutMode = 'floating';
    private legendPointerDownBound: (e: PointerEvent) => void;
    private legendPointerMoveBound: (e: PointerEvent) => void;
    private legendPointerUpBound: (e: PointerEvent) => void;
    private legendIsDragging = false;
    private legendStartX = 0;
    private legendStartY = 0;

    constructor(styles: Record<string, string>) {
        this.state = {
            model: null,
            container: null,
            styles,
            currentSelected: undefined,
            isRotated: false,
            legendElement: null,
        };
        this.legendPointerDownBound = this.handleLegendPointerDown.bind(this);
        this.legendPointerMoveBound = this.handleLegendPointerMove.bind(this);
        this.legendPointerUpBound = this.handleLegendPointerUp.bind(this);
    }

    getViewType(): string {
        return 'flat';
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

        // Add drag interactions for whole cube rotations
        // Use pointer events and stopPropagation so FlatTouchHandler does not intercept this drag.
        legend.addEventListener('pointerdown', this.legendPointerDownBound);
        document.addEventListener('pointermove', this.legendPointerMoveBound);
        document.addEventListener('pointerup', this.legendPointerUpBound);

        flatContainer.appendChild(legend);
        flatContainer.appendChild(grid);

        this.state.container.appendChild(flatContainer);

        this.touchHandler = new FlatTouchHandler({
            host: flatContainer,
            styles: this.state.styles,
            getCubeSize: () => this.state.model?.getCurrentState().cubeSize ?? 3,
            getIsRotated: () => this.state.isRotated,
            onStickerSelected: stickerId => this.updateSelected(stickerId as StickerId | undefined),
        });
        this.touchHandler.attach();

        // Initial resize
        this.handleResize();

        // Subscribe to move executed events for selective updates
        Application.eventBus.on(EventName.MOVE_EXECUTED, this.handleMoveExecuted.bind(this));

        // Default selection: F4 sticker.
        const f4 = CubeStateUtils.getStickerAt(_model.getCurrentState(), Face.F, 4);
        if (f4) this.updateSelected(f4.id);
    }

    private createFaceElement(face: Face, faceGrid: FaceGrid): HTMLElement {
        const faceDiv = document.createElement('div');
        faceDiv.className = this.state.styles['flat-face'];

        const n = faceGrid.grid.length;

        // Iterate through the 2D grid
        for (let row = 0; row < n; row++) {
            for (let col = 0; col < n; col++) {
                const stickerObj = faceGrid.grid[row][col];
                if (!stickerObj) continue;

                const pos = row * n + col;
                const sticker = document.createElement('div');
                sticker.className = this.state.styles['flat-sticker'];

                sticker.setAttribute('data-sticker-id', stickerObj.id);
                sticker.setAttribute('data-face', face);
                sticker.setAttribute('data-pos', pos.toString());

                // Set color directly from sticker object
                sticker.style.backgroundColor = resolveCubeColor(stickerObj.color);

                // Add mouse events for highlighting
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

                // Add click event for selecting
                sticker.addEventListener('click', e => {
                    const target = e.currentTarget as HTMLElement;
                    const stickerId = target.getAttribute('data-sticker-id');
                    // Update selection directly — no global event needed.
                    this.updateSelected(stickerId as StickerId);
                    // Ensure container has focus for keyboard navigation
                    this.state.container?.focus();
                });

                faceDiv.appendChild(sticker);
            }
        }

        return faceDiv;
    }

    update(model: ReadOnlyCubeModel): void {
        if (!this.state.container) return;

        // Use createFlatView for consistent updates
        const displayGrid = createFlatView(model.getCurrentState());

        const faces: Face[] = [Face.U, Face.D, Face.F, Face.B, Face.R, Face.L];

        faces.forEach(face => {
            const faceGrid = displayGrid.get(face);
            if (!faceGrid) return;

            const n = faceGrid.grid.length;
            for (let row = 0; row < n; row++) {
                for (let col = 0; col < n; col++) {
                    const stickerObj = faceGrid.grid[row][col];
                    if (!stickerObj) continue;

                    const pos = row * n + col;
                    const stickerEl = this.state.container!.querySelector(
                        `.${this.state.styles['flat-sticker']}[data-face="${face}"][data-pos="${pos}"]`
                    ) as HTMLElement;
                    if (stickerEl) {
                        stickerEl.style.backgroundColor = resolveCubeColor(stickerObj.color);
                        stickerEl.setAttribute('data-sticker-id', stickerObj.id);
                    }
                }
            }
        });
    }

    public updateSelective(event?: MoveExecutedEvent): void {
        if (!this.state.container || !this.state.model) return;

        // Use createFlatView to get current state structure
        const state = this.state.model.getCurrentState();
        const displayGrid = createFlatView(state);

        const displayedFaces: Face[] = [Face.U, Face.F, Face.R, Face.B, Face.L, Face.D];

        // Collect positions that need updating
        const positionsToUpdate = new Set<string>();

        // For each moved cubie, calculate where its stickers appear on faces
        event?.moveDetails?.movedCubies?.after.forEach(cubie => {
            cubie.stickers.forEach(sticker => {
                const currentFace = sticker.currentFace;

                if (displayedFaces.includes(currentFace)) {
                    // Use pre-computed position on that face
                    const position = sticker.facePosition;

                    // Mark this face/position for update
                    positionsToUpdate.add(`${currentFace}_${position}`);
                }
            });
        });

        if (!positionsToUpdate.size) {
            return;
        }

        // Update each affected position using FaceGrid data
        displayedFaces.forEach(face => {
            const faceGrid = displayGrid.get(face);
            if (!faceGrid) return;

            const n = faceGrid.grid.length;
            for (let row = 0; row < n; row++) {
                for (let col = 0; col < n; col++) {
                    const pos = row * n + col;
                    const key = `${face}_${pos}`;
                    if (!positionsToUpdate.has(key)) continue;

                    const stickerObj = faceGrid.grid[row][col];
                    if (!stickerObj) continue;

                    const stickerEl = this.state.container!.querySelector(
                        `.${this.state.styles['flat-sticker']}[data-face="${face}"][data-pos="${pos}"]`
                    ) as HTMLElement | null;
                    if (stickerEl) {
                        stickerEl.style.backgroundColor = resolveCubeColor(stickerObj.color);
                        stickerEl.setAttribute('data-sticker-id', stickerObj.id);
                    }
                }
            }
        });
    }

    updateHighlight(highlightedSticker?: StickerId): void {
        // Remove previous highlights
        this.state.container
            ?.querySelectorAll(
                `.${this.state.styles['flat-sticker']}.${this.state.styles.highlighted}`
            )
            .forEach(el => {
                el.classList.remove(this.state.styles.highlighted);
            });

        if (highlightedSticker && this.state.container) {
            const sticker = this.state.container.querySelector(
                `.${this.state.styles['flat-sticker']}[data-sticker-id="${highlightedSticker}"]`
            ) as HTMLElement;
            if (sticker) {
                sticker.classList.add(this.state.styles.highlighted);
            }
        }
    }

    updateSelected(selectedSticker?: StickerId): void {
        // Remove previous selections
        this.state.container
            ?.querySelectorAll(
                `.${this.state.styles['flat-sticker']}.${this.state.styles.selected}`
            )
            .forEach(el => {
                el.classList.remove(this.state.styles.selected);
            });

        // For navigation purposes, keep track of face:pos format
        if (selectedSticker && this.state.container) {
            const stickerElement = this.state.container.querySelector(
                `.${this.state.styles['flat-sticker']}[data-sticker-id="${selectedSticker}"]`
            ) as HTMLElement;
            if (stickerElement) {
                this.state.currentSelected = selectedSticker;
                stickerElement.classList.add(this.state.styles.selected);
            }
        } else {
            this.state.currentSelected = undefined;
        }
    }

    handleKeyDown(event: KeyboardEvent): boolean {
        return this.willHandleKeyPress(event, true);
    }

    handleKeyUp(event: KeyboardEvent): boolean {
        return this.willHandleKeyPress(event, false);
    }

    /**
     * Check if this view would handle the given key press (used for pre-checking in keydown).
     */
    willHandleKeyPress(event: KeyboardEvent, preview: boolean = false): boolean {
        // Only arrow keys are handled by navigation logic.
        if (isNavigationKey(event)) {
            return navigate(event, preview, this.state.currentSelected, this.state.model, id =>
                this.updateSelected(id)
            );
        }

        return false;
    }

    resize(): void {
        this.handleResize();
        this.touchHandler?.resize();
    }

    private handleResize(): void {
        if (!this.state.container) return;

        // Use shared util to compute available size
        const available = computeAvailableContentSize(this.state.container);

        // On mobile (narrow viewport) rotate the cross 90° so it stands upright
        // in portrait orientation. Swapping the reference dimensions (300/400 vs
        // 400/300) ensures the scale is calculated against the post-rotation size.
        const isMobile = window.innerWidth < 769;
        let scale: number;
        let transform: string;
        if (isMobile) {
            // After a 90° rotation the grid's visual width ≈ 300 and height ≈ 400
            scale = Math.min(available.width / 300, available.height / 400);
            transform = `rotate(90deg) scale(${Math.max(scale, 0.1)})`;
        } else {
            scale = Math.min(available.width / 400, available.height / 300);
            transform = `scale(${Math.max(scale, 0.1)})`;
        }

        this.state.isRotated = isMobile;

        const grid = this.state.container.querySelector(
            `.${this.state.styles['flat-grid']}`
        ) as HTMLElement;
        if (grid) {
            // Centering is handled by the flex parent; only scale/rotation needed here.
            grid.style.transform = transform;
        }

        // Update the legend to reflect the current orientation.
        if (this.state.legendElement) {
            this.state.legendElement.innerHTML = this.buildLegendHTML(isMobile);
        }
    }

    /**
     * Returns the legend's inner HTML for the given orientation.
     * Desktop uses the natural 3×4 cross layout; mobile mirrors the 90° CW
     * rotation (4×3: L on top, U–F–D across, R below, B at bottom).
     */
    private buildLegendHTML(isMobile: boolean): string {
        const s = this.state.styles;
        if (isMobile) {
            return [
                `<div class="${s['legend-row']}"><span></span><span>L</span><span></span></div>`,
                `<div class="${s['legend-row']}"><span>D</span><span>F</span><span>U</span></div>`,
                `<div class="${s['legend-row']}"><span></span><span>R</span><span></span></div>`,
                `<div class="${s['legend-row']}"><span></span><span>B</span><span></span></div>`,
            ].join('');
        }
        return [
            `<div class="${s['legend-row']}"><span></span><span>U</span><span></span><span></span></div>`,
            `<div class="${s['legend-row']}"><span>L</span><span>F</span><span>R</span><span>B</span></div>`,
            `<div class="${s['legend-row']}"><span></span><span>D</span><span></span><span></span></div>`,
        ].join('');
    }

    getMinimumSize(): Size2D {
        // intrinsic grid size (300×300) is used when sizing panels
        return { width: 300, height: 300 };
    }

    getCubeElement(): HTMLElement | null {
        return this.state.container?.querySelector(`.${this.state.styles['flat-grid']}`) || null;
    }

    getCommands(): Command[] {
        return [
            {
                id: 'flat.undo',
                label: 'Undo',
                category: CommandCategory.VIEW,
                showInHeader: true,
                icon: '↩',
                tooltip: 'Undo last move',
                priority: 900,
                action: () => Application.eventBus.emit(EventName.UNDO_REQUESTED, {}),
                isEnabled: () => this.state.model?.getMoveHistory().canUndo() ?? false,
            },
            {
                id: 'flat.redo',
                label: 'Redo',
                category: CommandCategory.VIEW,
                showInHeader: true,
                icon: '↪',
                tooltip: 'Redo last undone move',
                priority: 901,
                action: () => Application.eventBus.emit(EventName.REDO_REQUESTED, {}),
                isEnabled: () => this.state.model?.getMoveHistory().canRedo() ?? false,
            },
        ];
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
        document.removeEventListener('pointermove', this.legendPointerMoveBound);
        document.removeEventListener('pointerup', this.legendPointerUpBound);

        this.touchHandler?.destroy();
        this.touchHandler = null;

        if (this.state.container) {
            this.state.container.innerHTML = '';
        }
    }

    private handleLegendPointerDown(event: PointerEvent): void {
        // Stop propagation so FlatTouchHandler on the parent container does not intercept this drag.
        event.stopPropagation();
        event.preventDefault();

        this.legendIsDragging = true;
        this.legendStartX = event.clientX;
        this.legendStartY = event.clientY;

        if (this.state.legendElement) {
            this.state.legendElement.style.cursor = 'grabbing';
            this.state.legendElement.setPointerCapture(event.pointerId);
        }

        this.touchHandler?.showCancellationZoneAtOrigin(
            event.clientX,
            event.clientY,
            this.layoutMode === 'tabbed'
                ? CANCEL_ZONE_RADIUS_BASE_PX * CANCEL_ZONE_TABBED_MULTIPLIER
                : CANCEL_ZONE_RADIUS_BASE_PX
        );
    }

    private handleLegendPointerMove(event: PointerEvent): void {
        if (!this.legendIsDragging) return;

        const deltaX = event.clientX - this.legendStartX;
        const deltaY = event.clientY - this.legendStartY;
        const threshold = 20;

        if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
            this.touchHandler?.showDragLabel(
                this.inferLegendMove(deltaX, deltaY),
                event.clientX,
                event.clientY
            );
        } else {
            this.touchHandler?.hideDragLabel();
        }
    }

    private handleLegendPointerUp(event: PointerEvent): void {
        if (!this.legendIsDragging) return;

        const deltaX = event.clientX - this.legendStartX;
        const deltaY = event.clientY - this.legendStartY;
        const threshold = 20;

        if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
            Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                moveNotation: this.inferLegendMove(deltaX, deltaY),
                viewId: this.getViewType(),
                tentative: false,
            });
        }

        this.legendIsDragging = false;
        this.touchHandler?.hideDragLabel();
        this.touchHandler?.hideCancellationZone();
        if (this.state.legendElement) {
            this.state.legendElement.style.cursor = 'grab';
        }
    }

    /**
     * Maps screen-space drag deltas to a whole-cube rotation notation.
     * Desktop (not rotated):
     *   left (negative deltaX) → y, right (positive deltaX) → y'
     *   up (negative deltaY) → x, down (positive deltaY) → x'
     * Mobile (rotated -90°):
     *   left (negative deltaX) → x', right (positive deltaX) → x
     *   up (negative deltaY) → y, down (positive deltaY) → y'
     */
    private inferLegendMove(deltaX: number, deltaY: number): string {
        if (this.state.isRotated) {
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                return deltaX > 0 ? 'x' : "x'";
            }
            return deltaY > 0 ? "y'" : 'y';
        }
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            return deltaX > 0 ? "y'" : 'y';
        }
        return deltaY > 0 ? "x'" : 'x';
    }
}
