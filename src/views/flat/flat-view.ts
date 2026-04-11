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
import { getAdjacentStickerOnSurface } from '@/cube/utils/surface-walking';
import { computeAvailableContentSize } from '@/cube/utils/view-utils';
import {
    inferKeyboardMove,
    isFaceSelectKey,
    isKeyboardMoveKey,
    mapArrowToDirection,
} from '@/interaction/keyboard-moves';
import {
    CANCEL_ZONE_RADIUS_BASE_PX,
    CANCEL_ZONE_TABBED_MULTIPLIER,
    DragDirection,
} from '@/interaction/types';
import {
    Command,
    CommandCategory,
    EventName,
    MoveExecutedEvent,
    MoveRequestedEvent,
    NavDirection,
} from '@/types';

import { isNavigationKey, navigate } from './navigation';
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
    /** Whether ghost edge-hint stickers are visible. */
    showGhosts: boolean;
    /** Cached ghost sticker elements for fast colour sync. */
    ghostElements: HTMLElement[];
};

/**
 * Describes one ghost strip: a row/column of 3 semi-transparent stickers
 * placed just outside a face edge to hint at the cube-adjacent face that
 * is not visually adjacent in the T-shaped layout.
 */
type GhostEdge = {
    /** Face that owns this ghost strip (the strip is rendered outside this face). */
    face: Face;
    /** Which edge of the owning face the strip sits on. */
    edge: 'top' | 'bottom' | 'left' | 'right';
    /** Source face whose stickers provide the ghost colours. */
    sourceFace: Face;
    /** Ordered source sticker positions (length 3 for a 3×3 cube). */
    sourcePositions: number[];
};

/**
 * All 14 ghost strips (7 non-adjacent cube-edge pairs × 2 directions).
 *
 * T-layout adjacency (already connected, no ghosts needed):
 *   U↔F (U bottom / F top), F↔L, F↔R, F↔D, R↔B
 *
 * Non-adjacent cube-edge pairs that need ghosts:
 *   U↔L, U↔R, U↔B, D↔L, D↔R, D↔B, L↔B
 */
const GHOST_EDGES: GhostEdge[] = [
    // U-L: U left col ↔ L top row
    { face: Face.U, edge: 'left', sourceFace: Face.L, sourcePositions: [0, 1, 2] },
    { face: Face.L, edge: 'top', sourceFace: Face.U, sourcePositions: [0, 3, 6] },
    // U-R: U right col ↔ R top row
    { face: Face.U, edge: 'right', sourceFace: Face.R, sourcePositions: [2, 1, 0] },
    { face: Face.R, edge: 'top', sourceFace: Face.U, sourcePositions: [8, 5, 2] },
    // U-B: U top row ↔ B top row (reversed)
    { face: Face.U, edge: 'top', sourceFace: Face.B, sourcePositions: [2, 1, 0] },
    { face: Face.B, edge: 'top', sourceFace: Face.U, sourcePositions: [2, 1, 0] },
    // D-L: D left col ↔ L bottom row
    { face: Face.D, edge: 'left', sourceFace: Face.L, sourcePositions: [8, 7, 6] },
    { face: Face.L, edge: 'bottom', sourceFace: Face.D, sourcePositions: [6, 3, 0] },
    // D-R: D right col ↔ R bottom row
    { face: Face.D, edge: 'right', sourceFace: Face.R, sourcePositions: [6, 7, 8] },
    { face: Face.R, edge: 'bottom', sourceFace: Face.D, sourcePositions: [2, 5, 8] },
    // D-B: D bottom row ↔ B bottom row (reversed)
    { face: Face.D, edge: 'bottom', sourceFace: Face.B, sourcePositions: [8, 7, 6] },
    { face: Face.B, edge: 'bottom', sourceFace: Face.D, sourcePositions: [8, 7, 6] },
    // L-B: L left col ↔ B right col
    { face: Face.L, edge: 'left', sourceFace: Face.B, sourcePositions: [2, 5, 8] },
    { face: Face.B, edge: 'right', sourceFace: Face.L, sourcePositions: [0, 3, 6] },
];

/**
 * Remap a {@link DragDirection} for the +90° CW visual rotation applied on
 * mobile / portrait viewports.
 *
 * When the flat grid is rotated 90° clockwise the on-screen swipe directions
 * no longer correspond 1-to-1 with the logical cube directions.  This function
 * converts a screen-space direction into the logical direction the cube model
 * expects:
 *
 * | Screen direction | Logical direction |
 * |------------------|-------------------|
 * | UP               | LEFT              |
 * | RIGHT            | UP                |
 * | DOWN             | RIGHT             |
 * | LEFT (default)   | DOWN              |
 */
function remapDragDirectionForRotation(dir: DragDirection): DragDirection {
    switch (dir) {
        case DragDirection.UP:
            return DragDirection.LEFT;
        case DragDirection.RIGHT:
            return DragDirection.UP;
        case DragDirection.DOWN:
            return DragDirection.RIGHT;
        default:
            return DragDirection.DOWN;
    }
}

// Flat T-shaped Cube Visualization
export class FlatView implements CubeView {
    private state: FlatViewInternalData;
    private touchHandler: FlatTouchHandler | null = null;
    private layoutMode: LayoutMode = LayoutMode.Floating;
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
            selectedFace: undefined,
            selectedPosition: undefined,
            isRotated: false,
            legendElement: null,
            cubeWalk: true,
            showGhosts: true,
            ghostElements: [],
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

        // Create ghost strips on all non-layout-adjacent edges
        this.createGhostStrips();

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

    /* ------------------------------------------------------------------ */
    /*  Ghost sticker helpers                                               */
    /* ------------------------------------------------------------------ */

    /**
     * Build all ghost strips and attach them to the appropriate face elements.
     * Each strip is a small row/column of `<div>`s positioned just outside the
     * face boundary using absolute positioning + `top/bottom/left/right: 100%`.
     */
    private createGhostStrips(): void {
        if (!this.state.container) return;

        this.state.ghostElements = [];

        for (const ge of GHOST_EDGES) {
            // Find the face element that owns this ghost strip
            const faceEl = this.state.container.querySelector(
                `.${this.state.styles['flat-face']}:has(.${this.state.styles['flat-sticker']}[data-face="${ge.face}"])`
            ) as HTMLElement | null;
            if (!faceEl) continue;

            const strip = document.createElement('div');
            strip.className = this.state.styles['flat-ghost-strip'];
            strip.setAttribute('data-edge', ge.edge);
            strip.setAttribute('aria-hidden', 'true');

            for (const srcPos of ge.sourcePositions) {
                const ghost = document.createElement('div');
                ghost.className = this.state.styles['flat-ghost-sticker'];
                ghost.setAttribute('data-ghost-source-face', ge.sourceFace);
                ghost.setAttribute('data-ghost-source-pos', srcPos.toString());
                strip.appendChild(ghost);
                this.state.ghostElements.push(ghost);
            }

            faceEl.appendChild(strip);
        }

        // Initial colour sync and visibility
        this.updateGhostStickers();
        this.setGhostVisibility(this.state.showGhosts);
    }

    /** Copy the background colour of each source sticker to its ghost. */
    private updateGhostStickers(): void {
        if (!this.state.showGhosts || !this.state.container) return;

        for (const ghost of this.state.ghostElements) {
            const face = ghost.getAttribute('data-ghost-source-face');
            const pos = ghost.getAttribute('data-ghost-source-pos');
            if (!face || !pos) continue;

            const sourceEl = this.state.container.querySelector(
                `.${this.state.styles['flat-sticker']}[data-face="${face}"][data-pos="${pos}"]`
            ) as HTMLElement | null;
            if (sourceEl) {
                ghost.style.backgroundColor = sourceEl.style.backgroundColor;
            }
        }
    }

    /** Show or hide all ghost strips, with an optional fade animation. */
    private setGhostVisibility(visible: boolean, animate = false): void {
        if (!this.state.container) return;
        const strips = this.state.container.querySelectorAll<HTMLElement>(
            `.${this.state.styles['flat-ghost-strip']}`
        );

        if (!animate) {
            for (const strip of strips) {
                strip.style.display = visible ? '' : 'none';
                for (const child of strip.children) {
                    (child as HTMLElement).style.opacity = visible ? '' : '0';
                }
            }
            return;
        }

        if (visible) {
            // Make strips visible first with opacity 0, then fade in
            for (const strip of strips) {
                strip.style.display = '';
                for (const child of strip.children) {
                    (child as HTMLElement).style.opacity = '0';
                }
            }
            // Force reflow so the browser registers opacity 0 before transitioning
            void this.state.container.offsetHeight;
            for (const strip of strips) {
                for (const child of strip.children) {
                    (child as HTMLElement).style.opacity = '';
                }
            }
        } else {
            // Fade out, then hide strips after the transition ends
            for (const strip of strips) {
                for (const child of strip.children) {
                    (child as HTMLElement).style.opacity = '0';
                }
            }
            const first = strips[0]?.querySelector(`.${this.state.styles['flat-ghost-sticker']}`);
            if (first) {
                const hide = () => {
                    for (const strip of strips) strip.style.display = 'none';
                    first.removeEventListener('transitionend', hide);
                };
                first.addEventListener('transitionend', hide, { once: true });
                // Fallback in case transitionend doesn't fire (e.g. zero-duration)
                setTimeout(hide, 400);
            } else {
                for (const strip of strips) strip.style.display = 'none';
            }
        }
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

        this.restoreSelection();
        this.updateGhostStickers();
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

        this.restoreSelection();
        this.updateGhostStickers();
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

        // Remove previous adjacent highlights
        this.state.container
            ?.querySelectorAll(
                `.${this.state.styles['flat-sticker']}.${this.state.styles['adjacent-highlight']}`
            )
            .forEach(el => {
                el.classList.remove(this.state.styles['adjacent-highlight']);
            });

        if (highlightedSticker && this.state.container) {
            const sticker = this.state.container.querySelector(
                `.${this.state.styles['flat-sticker']}[data-sticker-id="${highlightedSticker}"]`
            ) as HTMLElement;
            if (sticker) {
                sticker.classList.add(this.state.styles.highlighted);
            }

            // Highlight adjacent stickers subtly
            this.applyAdjacentClass(highlightedSticker, 'adjacent-highlight');
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

        // Remove previous adjacent selections
        this.state.container
            ?.querySelectorAll(
                `.${this.state.styles['flat-sticker']}.${this.state.styles.adjacent}`
            )
            .forEach(el => {
                el.classList.remove(this.state.styles.adjacent);
            });

        // For navigation purposes, keep track of face:pos format
        if (selectedSticker && this.state.container) {
            const stickerElement = this.state.container.querySelector(
                `.${this.state.styles['flat-sticker']}[data-sticker-id="${selectedSticker}"]`
            ) as HTMLElement;
            if (stickerElement) {
                this.state.currentSelected = selectedSticker;
                stickerElement.classList.add(this.state.styles.selected);

                if (this.state.model) {
                    const stickerObj = CubeStateUtils.getStickerById(
                        this.state.model.getCurrentState(),
                        selectedSticker
                    );
                    if (stickerObj) {
                        this.state.selectedFace = stickerObj.currentFace;
                        this.state.selectedPosition = stickerObj.facePosition;
                    }
                }

                // Mark adjacent stickers subtly
                this.applyAdjacentClass(selectedSticker, 'adjacent');
            }
        } else {
            this.state.currentSelected = undefined;
            this.state.selectedFace = undefined;
            this.state.selectedPosition = undefined;
        }
    }

    /**
     * Apply a CSS class to surface-adjacent stickers that lie on a different face.
     */
    private applyAdjacentClass(stickerId: StickerId, className: string): void {
        if (!this.state.model || !this.state.container) return;

        const cubeState = this.state.model.getCurrentState();
        const sourceSticker = CubeStateUtils.getStickerById(cubeState, stickerId);
        if (!sourceSticker) return;

        const sourceFace = sourceSticker.currentFace;
        const directions = [
            NavDirection.Up,
            NavDirection.Down,
            NavDirection.Left,
            NavDirection.Right,
        ];

        for (const dir of directions) {
            const adjId = getAdjacentStickerOnSurface(cubeState, stickerId, dir);
            if (!adjId) continue;

            const adjSticker = CubeStateUtils.getStickerById(cubeState, adjId);
            if (!adjSticker || adjSticker.currentFace === sourceFace) continue;

            const adjEl = this.state.container.querySelector(
                `.${this.state.styles['flat-sticker']}[data-sticker-id="${adjId}"]`
            ) as HTMLElement | null;
            if (adjEl) {
                adjEl.classList.add(this.state.styles[className]);
            }
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
        // Face selection toggle (Space or Backtick).
        if (isFaceSelectKey(event)) {
            if (!preview) this.handleFaceSelectKey();
            return this.state.currentSelected !== undefined;
        }

        // Keyboard move (Ctrl+Arrow, optionally +Shift for 180°).
        if (isKeyboardMoveKey(event)) {
            if (!preview) this.handleKeyboardMove(event);
            return this.state.currentSelected !== undefined;
        }

        // Plain arrow keys — sticker navigation.
        if (isNavigationKey(event)) {
            return navigate(
                event,
                preview,
                this.state.currentSelected,
                this.state.model,
                this.state.cubeWalk,
                this.state.isRotated,
                id => this.updateSelected(id)
            );
        }

        return false;
    }

    private handleFaceSelectKey(): void {
        if (!this.state.currentSelected || !this.state.model || !this.touchHandler) return;

        const sticker = CubeStateUtils.getStickerById(
            this.state.model.getCurrentState(),
            this.state.currentSelected
        );
        if (!sticker) return;

        const face = sticker.currentFace as Face;
        const current = this.touchHandler.getSelectedFace();
        this.touchHandler.selectFace(current === face ? undefined : face);
    }

    private handleKeyboardMove(event: KeyboardEvent): void {
        if (!this.state.currentSelected || !this.state.model || !this.touchHandler) return;

        const direction = mapArrowToDirection(event);
        if (!direction) return;

        const notation = inferKeyboardMove({
            stickerId: this.state.currentSelected,
            selectedFace: this.touchHandler.getSelectedFace(),
            faceDirectMode: this.touchHandler.isFaceDirectMode(),
            direction,
            doubleTurn: event.shiftKey,
            model: this.state.model,
            remapDirection: this.state.isRotated ? remapDragDirectionForRotation : undefined,
        });
        if (!notation) return;

        const payload: MoveRequestedEvent = {
            moveNotation: notation,
            viewId: 'flat',
            tentative: false,
        };
        Application.eventBus.emit(EventName.MOVE_REQUESTED, payload);
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
                id: 'flat.cube-walk',
                label: 'Cube Walk',
                category: CommandCategory.VIEW,
                icon: '⊕',
                keyBindings: [{ key: '3', ctrlKey: true }],
                showInHeader: true,
                priority: 880,
                tooltip:
                    'Arrow-key navigation follows real cube surface — walking off an edge lands on the adjacent face.',
                isActive: () => this.state.cubeWalk,
                action: () => {
                    this.state.cubeWalk = !this.state.cubeWalk;
                    Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                        viewType: this.getViewType(),
                    });
                },
            },
            {
                id: 'flat.face-direct-mode',
                label: 'Face Mode',
                category: CommandCategory.VIEW,
                icon: '◎',
                keyBindings: [{ key: '2', ctrlKey: true }],
                showInHeader: true,
                priority: 890,
                tooltip:
                    'Drag any sticker to rotate its face immediately (no pre-selection needed).',
                isActive: () => this.touchHandler?.isFaceDirectMode() ?? false,
                action: () => {
                    if (this.touchHandler) {
                        this.touchHandler.setFaceDirectMode(!this.touchHandler.isFaceDirectMode());
                        Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                            viewType: this.getViewType(),
                        });
                    }
                },
            },
            {
                id: 'flat.ghost-hints',
                label: 'Ghost Hints',
                category: CommandCategory.VIEW,
                icon: '👻',
                keyBindings: [{ key: '4', ctrlKey: true }],
                showInHeader: true,
                priority: 870,
                tooltip:
                    'Show semi-transparent hint stickers on edges where cube-adjacent faces are not visually adjacent.',
                isActive: () => this.state.showGhosts,
                action: () => {
                    this.state.showGhosts = !this.state.showGhosts;
                    if (this.state.showGhosts) this.updateGhostStickers();
                    this.setGhostVisibility(this.state.showGhosts, true);
                    Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                        viewType: this.getViewType(),
                    });
                },
            },
            {
                id: 'flat.undo',
                label: 'Undo',
                category: CommandCategory.VIEW,
                showInHeader: true,
                icon: '↩',
                tooltip: 'Undo last move.',
                keyBindings: [{ key: '[' }, { key: ',' }],
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
                tooltip: 'Redo last undone move.',
                keyBindings: [{ key: ']' }, { key: '.' }],
                priority: 901,
                action: () => Application.eventBus.emit(EventName.REDO_REQUESTED, {}),
                isEnabled: () => this.state.model?.getMoveHistory().canRedo() ?? false,
            },
        ];
    }

    private restoreSelection(): void {
        if (
            this.state.selectedFace == null ||
            this.state.selectedPosition == null ||
            !this.state.model
        )
            return;
        const sticker = CubeStateUtils.getStickerAt(
            this.state.model.getCurrentState(),
            this.state.selectedFace,
            this.state.selectedPosition
        );
        if (sticker) {
            this.updateSelected(sticker.id);
        }
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
            this.layoutMode === LayoutMode.Tabbed
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

    getState(): FlatViewState {
        return {
            faceDirectMode: this.touchHandler?.isFaceDirectMode() ?? false,
            cubeWalk: this.state.cubeWalk,
            showGhosts: this.state.showGhosts,
        };
    }

    setState(state: unknown): void {
        if (!state || typeof state !== 'object') return;
        const s = state as Record<string, unknown>;
        if (typeof s['faceDirectMode'] === 'boolean')
            this.touchHandler?.setFaceDirectMode(s['faceDirectMode']);
        if (typeof s['cubeWalk'] === 'boolean') this.state.cubeWalk = s['cubeWalk'];
        if (typeof s['showGhosts'] === 'boolean') {
            this.state.showGhosts = s['showGhosts'];
            this.setGhostVisibility(this.state.showGhosts);
            if (this.state.showGhosts) this.updateGhostStickers();
        }
    }
}
