// Basic 3D Cube Visualization
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
    BasicViewResetLinkedEvent,
    BasicViewRotationLinkedEvent,
    Command,
    EventName,
    MoveExecutedEvent,
    MoveRequestedEvent,
    ViewRotation,
} from '@/types';

import * as initialization from './initialization';
import * as navigation from './navigation';
import * as rendering from './rendering';
import * as selection from './selection';
import styles from './basic-view.module.css';
import { getBasicViewCommands } from './commands';
import { createBasicInteractionAdapter } from './interaction-adapter';
import { isLinked, setLinked } from './linked-rotations';
import { BasicTouchHandler } from './touch-handler';

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
};

export class BasicView implements CubeView {
    private state: BasicViewInternalData;
    private touchHandler: BasicTouchHandler | null = null;
    private linkedRotationListener: ((e: BasicViewRotationLinkedEvent) => void) | null = null;
    private linkedResetListener: ((e: BasicViewResetLinkedEvent) => void) | null = null;

    constructor(config?: { viewType?: string }) {
        const viewType = config?.viewType === 'basic-back' ? 'basic-back' : 'basic-front';
        const variant: BasicVariant =
            viewType === 'basic-back' ? BasicVariant.Back : BasicVariant.Front;

        const defaultVectors = navigation.getDefaultVectors(variant);
        this.state = {
            model: undefined,
            container: null,
            cubeElement: null,
            cubeContainer: null,
            styles: styles as Record<string, string>,
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
        navigation.resetView(this.state);
        rendering.updateRotation(this.state, true);
        rendering.updateFaceLabels(this.state);

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
            onViewRotated: (direction: 'horizontal' | 'vertical', rotation, steps) => {
                rendering.updateRotation(this.state);
                rendering.updateFaceLabels(this.state, direction);
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
        });
        this.touchHandler.attach();

        // Subscribe to linked rotation events from the peer view.
        this.linkedRotationListener = (event: BasicViewRotationLinkedEvent) => {
            if (event.sourceViewType === this.state.viewType) return;
            switch (event.rotation) {
                case ViewRotation.Left:
                    this.rotateViewLeft();
                    break;
                case ViewRotation.Right:
                    this.rotateViewRight();
                    break;
                case ViewRotation.Up:
                    this.rotateViewUp();
                    break;
                case ViewRotation.Down:
                    this.rotateViewDown();
                    break;
            }
            this.emitStateChanged();
        };
        Application.eventBus.on(EventName.BASIC_VIEW_ROTATION_LINKED, this.linkedRotationListener);

        // Subscribe to linked reset events from the peer view.
        this.linkedResetListener = (event: BasicViewResetLinkedEvent) => {
            if (event.sourceViewType === this.state.viewType) return;
            this.resetView();
            this.emitStateChanged();
        };
        Application.eventBus.on(EventName.BASIC_VIEW_RESET_LINKED, this.linkedResetListener);

        // Default selection: center sticker of the variant's front face.
        const defaultFace = this.state.variant === BasicVariant.Back ? Face.B : Face.F;
        const center = CubeStateUtils.getStickerAt(model.getCurrentState(), defaultFace, 4);
        if (center) this.updateSelected(center.id);
    }

    update(model: ReadOnlyCubeModel): void {
        this.state.model = model;
        rendering.update(this.state, model);
        this.restoreSelection();
    }

    updateSelective(event?: MoveExecutedEvent): void {
        if (event) {
            rendering.updateSelective(this.state, event);
            this.restoreSelection();
            // Whole-cube rotations (x/y/z) change which original face is at each
            // visible CSS position — update labels so they reflect the new mapping.
            const notation = event.moveDetails?.notation ?? '';
            if (/^[xyz]['2]?$/.test(notation) && this.state.model) {
                const direction = notation.charAt(0) === 'x' ? 'vertical' : 'horizontal';
                rendering.updateFaceLabels(this.state, direction);
            }
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
        rendering.resize(this.state);
        this.touchHandler?.resize();
    }

    setLayoutMode(mode: LayoutMode): void {
        this.state.layoutMode = mode;
        this.touchHandler?.setLayoutMode(mode);
        rendering.resize(this.state);
    }

    getMinimumSize(): Size2D {
        return rendering.getMinimumSize();
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
        if (!navigation.isNavigationKey(event)) return false;

        const onRotated = (r: ViewRotation): void => {
            if (r === ViewRotation.Left) this.rotateViewLeft();
            else if (r === ViewRotation.Right) this.rotateViewRight();
            else if (r === ViewRotation.Up) this.rotateViewUp();
            else if (r === ViewRotation.Down) this.rotateViewDown();
            if (isLinked()) {
                Application.eventBus.emit(EventName.BASIC_VIEW_ROTATION_LINKED, {
                    rotation: r,
                    sourceViewType: this.state.viewType,
                });
            }
        };

        const handled = navigation.navigate(
            event,
            preview,
            this.state,
            id => this.updateSelected(id),
            onRotated
        );
        if (handled && !preview) {
            rendering.updateRotation(this.state);
        }
        return handled;
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
        });
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
        selection.updateHighlight(this.state, highlightedSticker);
    }

    updateSelected(selectedSticker?: StickerId): void {
        selection.updateSelected(this.state, selectedSticker);
    }

    // -------------------------------------------------------------------------
    // Move handling
    // -------------------------------------------------------------------------

    handleMoveExecuted(event: MoveExecutedEvent): void {
        if (event.moveDetails?.movedCubies && this.state.model) {
            this.updateSelective(event);
        } else if (this.state.model) {
            this.update(this.state.model);
        }
    }

    // -------------------------------------------------------------------------
    // View rotation (public for commands and tests)
    // -------------------------------------------------------------------------

    rotateViewLeft(): void {
        navigation.rotateViewLeft(this.state);
        rendering.updateRotation(this.state);
        rendering.updateFaceLabels(this.state, 'horizontal');
    }

    rotateViewRight(): void {
        navigation.rotateViewRight(this.state);
        rendering.updateRotation(this.state);
        rendering.updateFaceLabels(this.state, 'horizontal');
    }

    rotateViewUp(): void {
        navigation.rotateViewUp(this.state);
        rendering.updateRotation(this.state);
        rendering.updateFaceLabels(this.state, 'vertical');
    }

    rotateViewDown(): void {
        navigation.rotateViewDown(this.state);
        rendering.updateRotation(this.state);
        rendering.updateFaceLabels(this.state, 'vertical');
    }

    resetView(): void {
        navigation.resetView(this.state);
        rendering.updateRotation(this.state);
        rendering.updateFaceLabels(this.state);
    }

    alignCubeToView(): void {
        navigation.alignCubeToView(this.state);
        rendering.updateRotation(this.state, true);
        rendering.updateFaceLabels(this.state);
    }

    // (Rendering helpers removed; tests updated to call rendering.updateRotation)
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
        };
    }

    setState(state: unknown): void {
        if (!state || typeof state !== 'object') return;
        const viewState = state as Record<string, unknown>;

        // Migrate old format (xRotation/yRotation/zRotation) — reset to default.
        if (
            typeof viewState['xRotation'] === 'number' ||
            typeof viewState['yRotation'] === 'number' ||
            typeof viewState['zRotation'] === 'number'
        ) {
            navigation.resetView(this.state);
        } else {
            const vR = viewState['viewRight'];
            const vU = viewState['viewUp'];
            const vF = viewState['viewForward'];
            if (vR && typeof vR === 'object') this.state.viewRight = vR as Vector3;
            if (vU && typeof vU === 'object') this.state.viewUp = vU as Vector3;
            if (vF && typeof vF === 'object') this.state.viewForward = vF as Vector3;
        }
        if (typeof viewState['isTilted'] === 'boolean') this.state.isTilted = viewState['isTilted'];
        if (typeof viewState['isPitched'] === 'boolean')
            this.state.isPitched = viewState['isPitched'];
        if (typeof viewState['faceDirectMode'] === 'boolean')
            this.touchHandler?.setFaceDirectMode(viewState['faceDirectMode']);
        if (typeof viewState['linked'] === 'boolean') setLinked(viewState['linked']);

        rendering.updateRotation(this.state, true);
        rendering.updateFaceLabels(this.state);
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    destroy(): void {
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
}
