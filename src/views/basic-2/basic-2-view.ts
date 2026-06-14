// Basic 2 View — per-cubie 3D architecture with move animations
import { Application } from '@/application';
import {
    CubeView,
    Face,
    LayoutMode,
    ReadOnlyCubeModel,
    Size2D,
    StickerId,
    Vector3,
} from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import {
    inferKeyboardMove,
    isFaceSelectKey,
    isKeyboardMoveKey,
    mapArrowToDirection,
} from '@/interaction/keyboard-moves';
import {
    BasicViewGhostToggledEvent,
    BasicViewResetLinkedEvent,
    BasicViewRotationLinkedEvent,
    Command,
    EventName,
    MoveExecutedEvent,
    MoveRequestedEvent,
    ViewRotation,
} from '@/types';
import { getBasicViewCommands } from '@/views/basic/commands';
import { GhostStickers, getGhostOpacityIndex, isGhostVisible } from '@/views/basic/ghost-stickers';
import { createBasicInteractionAdapter } from '@/views/basic/interaction-adapter';
import { isLinked, setLinked } from '@/views/basic/linked-rotations';
import {
    alignCubeToView,
    getDefaultVectors,
    isNavigationKey,
    navigate,
    resetView,
    rotateViewDown,
    rotateViewLeft,
    rotateViewRight,
    rotateViewUp,
} from '@/views/basic/navigation';
import { updateHighlight, updateSelected } from '@/views/basic/selection';
import { BasicTouchHandler } from '@/views/basic/touch-handler';

import * as animations from './animations';
import * as cubieRendering from './cubie-rendering';
import * as initialization from './initialization';
import styles from './basic-2-view.module.css';
import {
    getMinimumSize,
    getVisibleFacesWithPositions,
    resize,
    setBlockersVisible,
    update,
    updateFaceLabels,
    updateRotation,
} from './rendering';

/**
 * Variant type for basic view (front or back).
 */
export const BasicVariant = {
    Front: 'front',
    Back: 'back',
} as const;

export type BasicVariant = (typeof BasicVariant)[keyof typeof BasicVariant];

/**
 * State persisted for the basic view.
 */
export interface BasicViewState {
    viewRight: Vector3;
    viewUp: Vector3;
    viewForward: Vector3;
    isTilted: boolean;
    isPitched: boolean;
    faceDirectMode: boolean;
    linked: boolean;
    ghostOpacityIndex: number;
}

/**
 * Full internal state shared between all basic-view modules.
 * Defined here so modules can import it as a type without creating runtime
 * circular dependencies.
 */
export type BasicViewInternalData = {
    model?: ReadOnlyCubeModel;
    container: HTMLElement | null;
    cubeElement: HTMLElement | null;
    cubeContainer: HTMLElement | null;
    styles: Record<string, string>;
    stickerClass: string;
    highlightedClass: string;
    variant: BasicVariant;
    viewType: string;
    viewRight: Vector3;
    viewUp: Vector3;
    viewForward: Vector3;
    isTilted: boolean;
    isPitched: boolean;
    isHovered: boolean;
    layoutMode: LayoutMode;
    currentSelected?: StickerId;
    selectedFace?: string;
    selectedCubiePosition?: Vector3;
    cubieSize?: number;
};

/**
 * Result of starting an animation — held during animation to support interrupts.
 */
type ActiveAnimation = {
    animation: Animation;
    pivot: HTMLElement;
    cubieElements: HTMLElement[];
    event: MoveExecutedEvent;
};

export class BasicView implements CubeView {
    private state: BasicViewInternalData;
    private touchHandler: BasicTouchHandler | null = null;
    private ghostStickers: GhostStickers | null = null;
    private linkedRotationListener: ((e: BasicViewRotationLinkedEvent) => void) | null = null;
    private linkedResetListener: ((e: BasicViewResetLinkedEvent) => void) | null = null;
    private ghostToggledListener: ((e: BasicViewGhostToggledEvent) => void) | null = null;
    private activeAnimation: ActiveAnimation | null = null;

    constructor(config?: { viewType?: string }) {
        const viewType = config?.viewType === 'basic-2-back' ? 'basic-2-back' : 'basic-2-front';
        const variant: BasicVariant =
            viewType === 'basic-2-back' ? BasicVariant.Back : BasicVariant.Front;

        const defaultVectors = getDefaultVectors(variant);
        this.state = {
            model: undefined,
            container: null,
            cubeElement: null,
            cubeContainer: null,
            styles: styles as Record<string, string>,
            stickerClass: styles['sticker'] ?? 'sticker',
            highlightedClass: styles['highlighted'] ?? 'highlighted',
            variant,
            viewType,
            viewRight: defaultVectors.viewRight,
            viewUp: defaultVectors.viewUp,
            viewForward: defaultVectors.viewForward,
            isTilted: false,
            isPitched: false,
            isHovered: false,
            layoutMode: 'floating',
            currentSelected: undefined,
        };
    }

    getViewType(): string {
        return this.state.viewType;
    }

    getCubeElement(): HTMLElement | null {
        return this.state.cubeElement;
    }

    getCommands(): Command[] {
        return getBasicViewCommands({
            state: this.state,
            touchHandler: this.touchHandler,
            getViewType: () => this.getViewType(),
            resetView: () => this.resetView(),
            alignCubeToView: () => this.alignCubeToView(),
            rotateViewLeft: () => this.rotateViewLeft(),
            rotateViewRight: () => this.rotateViewRight(),
            rotateViewUp: () => this.rotateViewUp(),
            rotateViewDown: () => this.rotateViewDown(),
            toggleGhosts: () => this.toggleGhosts(),
            updateGhostEdges: () => this.updateGhostEdges(),
            emitStateChanged: () => this.emitStateChanged(),
        });
    }

    // -------------------------------------------------------------------------
    // CubeView interface
    // -------------------------------------------------------------------------

    create(container: HTMLElement, model: ReadOnlyCubeModel): void {
        // initialization.initialize builds the DOM and returns the canonical
        // state object.  Event listeners inside that function close over it,
        // so we must replace this.state with the returned reference.
        this.state = initialization.initialize(
            container,
            model,
            this.state.styles,
            this.state.variant,
            this.state.viewType,
            id => this.updateSelected(id)
        );
        // Apply the correct default orientation for this variant.
        resetView(this.state);
        updateRotation(this.state, true);
        updateFaceLabels(this.state);

        // Wire up touch/pointer interaction.
        const adapter = createBasicInteractionAdapter(
            () => this.state.viewRight,
            () => this.state.viewUp
        );
        this.touchHandler = new BasicTouchHandler({
            host: container,
            styles: this.state.styles,
            getCubeSize: () => this.state.model?.getCurrentState().cubeSize ?? 3,
            getState: () => this.state,
            onStickerSelected: id => this.updateSelected(id as StickerId | undefined),
            onViewRotated: (_direction: 'horizontal' | 'vertical', rotation, steps) => {
                updateRotation(this.state);
                updateFaceLabels(this.state, _direction);
                this.updateGhostEdges();
                this.emitStateChanged();
                if (isLinked()) {
                    for (let i = 0; i < steps; i++) {
                        Application.eventBus.emit(EventName.BASIC_VIEW_ROTATION_LINKED, {
                            rotation,
                            sourceViewType: this.state.viewType,
                        });
                    }
                }
            },
            viewId: this.state.viewType,
            adapter,
            getModel: () => this.state.model ?? null,
        });
        this.touchHandler.attach();

        // Subscribe to linked rotation events from the peer view.
        this.linkedRotationListener = (event: BasicViewRotationLinkedEvent) => {
            /* c8 ignore if — guard against self-events */
            if (event.sourceViewType === this.state.viewType) return;
            switch (event.rotation) {
                /* c8 ignore next */
                case ViewRotation.Left:
                    this.rotateViewLeft();
                    break;
                /* c8 ignore next */
                case ViewRotation.Right:
                    this.rotateViewRight();
                    break;
                /* c8 ignore next */
                case ViewRotation.Up:
                    this.rotateViewUp();
                    break;
                /* c8 ignore next */
                case ViewRotation.Down:
                    this.rotateViewDown();
                    break;
            }
            this.emitStateChanged();
        };
        Application.eventBus.on(EventName.BASIC_VIEW_ROTATION_LINKED, this.linkedRotationListener);

        // Subscribe to linked reset events from the peer view.
        this.linkedResetListener = (event: BasicViewResetLinkedEvent) => {
            /* c8 ignore if — guard against self-events */
            if (event.sourceViewType === this.state.viewType) return;
            this.resetView();
            this.emitStateChanged();
        };
        Application.eventBus.on(EventName.BASIC_VIEW_RESET_LINKED, this.linkedResetListener);

        // Subscribe to ghost toggle events from the peer view.
        this.ghostToggledListener = (event: BasicViewGhostToggledEvent) => {
            /* c8 ignore if — guard against self-events */
            if (event.sourceViewType === this.state.viewType) return;
            const { visibleFaces, hiddenFaces } = getVisibleFacesWithPositions(this.state);
            this.ghostStickers?.setOpacityIndex(
                event.opacityIndex,
                visibleFaces,
                hiddenFaces,
                this.state.isTilted,
                this.state.isPitched
            );
            this.emitStateChanged();
        };
        Application.eventBus.on(EventName.BASIC_VIEW_GHOST_TOGGLED, this.ghostToggledListener);

        // Create ghost stickers on the cube element.
        /* c8 ignore if — cubeElement always created in initialization */
        if (this.state.cubeElement) {
            this.ghostStickers = new GhostStickers(
                this.state.cubeElement,
                () => this.state.model ?? null
            );
            this.ghostStickers.create();
            if (isGhostVisible()) {
                this.updateGhostEdges();
            }
        }

        // Default selection: center sticker of the variant's front face.
        const defaultFace = this.state.variant === BasicVariant.Back ? Face.B : Face.F;
        const center = CubeStateUtils.getStickerAt(model.getCurrentState(), defaultFace, 4);
        if (center) this.updateSelected(center.id);
    }

    update(model: ReadOnlyCubeModel): void {
        this.state.model = model;
        update(this.state, model);
        this.ghostStickers?.updateColors();
        this.restoreSelection();
    }

    updateSelective(event?: MoveExecutedEvent): void {
        if (event && this.state.model) {
            this.handleMoveExecuted(event);
        }
    }

    private restoreSelection(): void {
        if (
            this.state.selectedFace == null ||
            this.state.selectedCubiePosition == null ||
            !this.state.model
        )
            return;
        const cubeState = this.state.model.getCurrentState();
        const cubie = CubeStateUtils.getCubieAtPosition(
            cubeState,
            this.state.selectedCubiePosition
        );
        if (cubie) {
            const sticker = cubie.stickers.find(s => s.currentFace === this.state.selectedFace);
            if (sticker) {
                this.updateSelected(sticker.id);
            }
        }
    }

    resize(): void {
        resize(this.state);
        this.touchHandler?.resize();
    }

    setLayoutMode(mode: LayoutMode): void {
        this.state.layoutMode = mode;
        this.touchHandler?.setLayoutMode(mode);
        resize(this.state);
    }

    getMinimumSize(): Size2D {
        return getMinimumSize();
    }

    // -------------------------------------------------------------------------
    // Keyboard navigation
    // -------------------------------------------------------------------------

    handleKeyDown(event: KeyboardEvent): boolean {
        return this.handleKeyPress(event, true);
    }

    handleKeyUp(event: KeyboardEvent): boolean {
        return this.handleKeyPress(event, false);
    }

    private handleKeyPress(event: KeyboardEvent, preview: boolean): boolean {
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
        /* c8 ignore if — guard for non-navigation keys */
        if (!isNavigationKey(event)) return false;

        const onRotated = (r: ViewRotation): void => {
            if (r === ViewRotation.Left) this.rotateViewLeft();
            /* c8 ignore else if */ else if (r === ViewRotation.Right) this.rotateViewRight();
            /* c8 ignore else if */ else if (r === ViewRotation.Up) this.rotateViewUp();
            /* c8 ignore else if */ else if (r === ViewRotation.Down) this.rotateViewDown();
            /* c8 ignore if — guard when not linked */
            if (isLinked()) {
                Application.eventBus.emit(EventName.BASIC_VIEW_ROTATION_LINKED, {
                    rotation: r,
                    sourceViewType: this.state.viewType,
                });
            }
        };

        const handled = navigate(
            event,
            preview,
            this.state,
            id => this.updateSelected(id),
            onRotated
        );
        if (handled && !preview) {
            updateRotation(this.state);
            updateFaceLabels(this.state);
        }
        return handled;
    }

    private handleFaceSelectKey(): void {
        /* c8 ignore if — model always present when method called via keyboard */
        if (!this.state.currentSelected || !this.state.model || !this.touchHandler) return;

        const sticker = CubeStateUtils.getStickerById(
            this.state.model.getCurrentState(),
            this.state.currentSelected
        );
        /* c8 ignore if — sticker always found for valid currentSelected */
        if (!sticker) return;

        const face = sticker.currentFace as Face;
        const current = this.touchHandler.getSelectedFace();
        this.touchHandler.selectFace(current === face ? undefined : face);
    }

    private handleKeyboardMove(event: KeyboardEvent): void {
        /* c8 ignore if — same invariant as handleFaceSelectKey */
        if (!this.state.currentSelected || !this.state.model || !this.touchHandler) return;

        const direction = mapArrowToDirection(event);
        /* c8 ignore if — mapArrowToDirection can return undefined on unexpected key */
        if (!direction) return;

        const notation = inferKeyboardMove({
            stickerId: this.state.currentSelected,
            selectedFace: this.touchHandler.getSelectedFace(),
            faceDirectMode: this.touchHandler.isFaceDirectMode(),
            direction,
            doubleTurn: event.shiftKey,
            model: this.state.model,
        });
        /* c8 ignore if — inferKeyboardMove returns undefined on some keys */
        if (!notation) return;

        const payload: MoveRequestedEvent = {
            moveNotation: notation,
            viewId: this.state.viewType,
            tentative: false,
        };
        Application.eventBus.emit(EventName.MOVE_REQUESTED, payload);
    }

    // -------------------------------------------------------------------------
    // Highlight / selection
    // -------------------------------------------------------------------------

    updateHighlight(highlightedSticker?: StickerId): void {
        updateHighlight(this.state, highlightedSticker);
    }

    updateSelected(selectedSticker?: StickerId): void {
        updateSelected(this.state, selectedSticker);
    }

    // -------------------------------------------------------------------------
    // Move handling with animation
    // -------------------------------------------------------------------------

    handleMoveExecuted(event: MoveExecutedEvent): void {
        if (!this.state.model) return;

        // Finalize any running animation (interrupt)
        this.finalizeAnimation();

        if (!event.moveDetails?.movedCubies) {
            this.update(this.state.model);
            return;
        }

        // Try to animate
        const result = animations.animateMove(event, this.state.cubeElement!, undefined);

        if (!result) {
            // prefers-reduced-motion, unknown definition, or no matching layer cubies
            cubieRendering.updateCubiePositions(
                this.state.cubeElement!,
                event.moveDetails.movedCubies
            );
            return;
        }

        setBlockersVisible(this.state, false);
        this.activeAnimation = { ...result, event };

        result.animation.finished
            .then(() => {
                if (this.activeAnimation?.event === event) {
                    const { pivot, cubieElements } = this.activeAnimation;
                    this.activeAnimation = null;
                    animations.finalizeLayer(pivot, cubieElements, this.state.cubeElement!);
                    cubieRendering.updateCubiePositions(
                        this.state.cubeElement!,
                        event.moveDetails!.movedCubies!
                    );
                    result.animation.cancel(); // remove fill effect after DOM is updated
                    setBlockersVisible(this.state, true);
                    this.ghostStickers?.updateColors();
                    this.restoreSelection();
                }
            })
            .catch(() => {
                // Cancelled via finalizeAnimation() — do nothing
            });
    }

    /**
     * Finalize (interrupt) the current animation.
     *
     * Phase 1: cubies snap from pre-A to post-A position.
     * No color flash — sticker colors update correctly.
     */
    private finalizeAnimation(): void {
        if (!this.activeAnimation) return;
        const { animation, pivot, cubieElements, event } = this.activeAnimation;
        this.activeAnimation = null;

        // Reparent cubies from pivot back to cube
        animations.finalizeLayer(pivot, cubieElements, this.state.cubeElement!);

        // Update positions and sticker faces from the interrupted move
        cubieRendering.updateCubiePositions(
            this.state.cubeElement!,
            event.moveDetails!.movedCubies!
        );

        // Remove fill effect after DOM is updated
        animation.cancel();

        setBlockersVisible(this.state, true);

        // Update ghost stickers and selection
        this.ghostStickers?.updateColors();
        this.restoreSelection();
    }

    // -------------------------------------------------------------------------
    // View rotation (public for commands and tests)
    // -------------------------------------------------------------------------

    rotateViewLeft(): void {
        rotateViewLeft(this.state);
        updateRotation(this.state);
        updateFaceLabels(this.state, 'horizontal');
        this.updateGhostEdges();
    }

    rotateViewRight(): void {
        rotateViewRight(this.state);
        updateRotation(this.state);
        updateFaceLabels(this.state, 'horizontal');
        this.updateGhostEdges();
    }

    rotateViewUp(): void {
        rotateViewUp(this.state);
        updateRotation(this.state);
        updateFaceLabels(this.state, 'vertical');
        this.updateGhostEdges();
    }

    rotateViewDown(): void {
        rotateViewDown(this.state);
        updateRotation(this.state);
        updateFaceLabels(this.state, 'vertical');
        this.updateGhostEdges();
    }

    resetView(): void {
        resetView(this.state);
        updateRotation(this.state);
        updateFaceLabels(this.state);
        this.updateGhostEdges();
    }

    alignCubeToView(): void {
        alignCubeToView(this.state);
        updateRotation(this.state, true);
        updateFaceLabels(this.state);
        this.updateGhostEdges();
    }

    // -------------------------------------------------------------------------
    // State persistence
    // -------------------------------------------------------------------------

    getState(): BasicViewState {
        return {
            viewRight: { ...this.state.viewRight },
            viewUp: { ...this.state.viewUp },
            viewForward: { ...this.state.viewForward },
            isTilted: this.state.isTilted,
            isPitched: this.state.isPitched,
            faceDirectMode: this.touchHandler?.isFaceDirectMode() ?? false,
            linked: isLinked(),
            ghostOpacityIndex: this.ghostStickers?.getOpacityIndex() ?? 0,
        };
    }

    setState(state: unknown): void {
        /* c8 ignore if — runtime guard for external callers */
        if (!state || typeof state !== 'object') return;
        const viewState = state as Record<string, unknown>;

        // Migrate old format — reset to default.
        /* c8 ignore if — migration for old state format */
        if (
            typeof viewState['xRotation'] === 'number' ||
            typeof viewState['yRotation'] === 'number' ||
            typeof viewState['zRotation'] === 'number'
        ) {
            resetView(this.state);
        } else {
            const vR = viewState['viewRight'];
            const vU = viewState['viewUp'];
            const vF = viewState['viewForward'];
            if (vR && typeof vR === 'object') this.state.viewRight = vR as Vector3;
            /* c8 ignore if — guard for invalid viewUp */
            if (vU && typeof vU === 'object') this.state.viewUp = vU as Vector3;
            /* c8 ignore if — guard for invalid viewForward */
            if (vF && typeof vF === 'object') this.state.viewForward = vF as Vector3;
        }
        /* c8 ignore if — guard for invalid isTilted */
        if (typeof viewState['isTilted'] === 'boolean') this.state.isTilted = viewState['isTilted'];
        /* c8 ignore if — guard for invalid isPitched */
        if (typeof viewState['isPitched'] === 'boolean')
            this.state.isPitched = viewState['isPitched'];
        if (typeof viewState['faceDirectMode'] === 'boolean')
            this.touchHandler?.setFaceDirectMode(viewState['faceDirectMode']);
        if (typeof viewState['linked'] === 'boolean') setLinked(viewState['linked']);

        // Restore ghost opacity
        let ghostIndex: number | null = null;
        /* c8 ignore if — guard for invalid ghostOpacityIndex */
        if (typeof viewState['ghostOpacityIndex'] === 'number') {
            ghostIndex = viewState['ghostOpacityIndex'];
            /* c8 ignore else if — guard for legacy showGhosts */
        } else if (typeof viewState['showGhosts'] === 'boolean') {
            ghostIndex = viewState['showGhosts'] ? 1 : 0;
        }
        /* c8 ignore if — guard when no ghost index provided */
        if (ghostIndex !== null) {
            const { visibleFaces, hiddenFaces } = getVisibleFacesWithPositions(this.state);
            this.ghostStickers?.setOpacityIndex(
                ghostIndex,
                visibleFaces,
                hiddenFaces,
                this.state.isTilted,
                this.state.isPitched
            );
        }

        updateRotation(this.state, true);
        updateFaceLabels(this.state);
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    destroy(): void {
        // Finalize any running animation
        this.finalizeAnimation();

        if (this.linkedRotationListener) {
            Application.eventBus.off(
                EventName.BASIC_VIEW_ROTATION_LINKED,
                this.linkedRotationListener
            );
            this.linkedRotationListener = null;
        }
        if (this.linkedResetListener) {
            Application.eventBus.off(EventName.BASIC_VIEW_RESET_LINKED, this.linkedResetListener);
            this.linkedResetListener = null;
        }
        if (this.ghostToggledListener) {
            Application.eventBus.off(EventName.BASIC_VIEW_GHOST_TOGGLED, this.ghostToggledListener);
            this.ghostToggledListener = null;
        }
        this.touchHandler?.destroy();
        this.touchHandler = null;
        initialization.destroy(this.state);
        this.state.cubeElement = null;
        this.state.container = null;
        this.state.model = undefined;
    }

    private emitStateChanged(): void {
        Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
            viewType: this.getViewType(),
        });
    }

    private toggleGhosts(): void {
        const { visibleFaces, hiddenFaces } = getVisibleFacesWithPositions(this.state);
        this.ghostStickers?.toggle(
            visibleFaces,
            hiddenFaces,
            this.state.isTilted,
            this.state.isPitched
        );
        Application.eventBus.emit(EventName.BASIC_VIEW_GHOST_TOGGLED, {
            sourceViewType: this.getViewType(),
            visible: isGhostVisible(),
            opacityIndex: getGhostOpacityIndex(),
        });
    }

    private updateGhostEdges(): void {
        if (!isGhostVisible()) return;
        const { visibleFaces, hiddenFaces } = getVisibleFacesWithPositions(this.state);
        this.ghostStickers?.updateVisibleEdges(
            visibleFaces,
            hiddenFaces,
            this.state.isTilted,
            this.state.isPitched
        );
    }
}
