// fallow-ignore-file unused-type
import { CubeView, Face, ReadOnlyCubeModel, StickerId } from '@/cube/types';
import { Size2D } from '@/cube/types/cubie';
import { LayoutMode } from '@/cube/types/view';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { centerFacePosition } from '@/cube/utils/sticker-position';
import { logger } from '@/diagnostics/logger';
import { getEventBus } from '@/event-bus-accessor';
import { Command, EventName, MoveExecutedEvent } from '@/types';
import { registerViewContainer, unregisterViewContainer } from '@/views/shared/focus';

import * as highlights from './highlights';
import * as initialization from './initialization';
import * as rendering from './rendering';
import styles from './circular.module.css';
import { getCommands, getState, setState } from './commands';
import { FaceLabelTiltController } from './face-label-tilt';
import { handleKeyPress } from './keyboard-actions';
import { CircularTouchHandler } from './touch-handler';
import { CircularCubeViewInternalData, CircularViewState } from './types';
import { ZoomPanController } from './zoom-pan';

export type { CircularCubeViewInternalData, CircularViewState, StickerLookupMap } from './types';

// Circular View: inline SVG + per-sticker manipulation and simple animations
export class CircularCubeView implements CubeView {
    /**
     * Internal state
     */
    private state: CircularCubeViewInternalData = {
        model: undefined,
        container: undefined,
        styles: {},
        svgRoot: undefined,
        svgReady: false,
        axisCircles: [],
        stickerLookupMap: undefined,
        svgElementCache: new Map<string, SVGCircleElement>(),
        svgIdToStickerId: new Map<string, StickerId>(),
        stickerIdToSvgId: new Map<StickerId, string>(),
        animationChain: Promise.resolve(),
        axisAnimationChains: { X: Promise.resolve(), Y: Promise.resolve(), Z: Promise.resolve() },
        cubeWalk: true,
        showGhosts: true,
        ghostOpacityIndex: 1,
        zoomPan: null,
        touchHandler: null,
        panMode: false,
    };

    /** Controller for face-label tilt animations. */
    private faceLabelTilt = new FaceLabelTiltController(() => this.state.svgRoot);

    create(container: HTMLElement, model: ReadOnlyCubeModel): void {
        const state = initialization.initialize(container, model, styles);
        if (!state?.svgRoot) {
            throw new Error(
                'CircularCubeView: Unable to load inline SVG layout; stickers will not render.'
            );
        } else {
            this.state = state;
        }

        // Attach sticker event listeners via initialization so the view remains thin.
        // Uses the view type string so the initialization module doesn't need a view instance.
        initialization.attachStickerEventListeners(this.state, this.getViewType(), id =>
            this.updateSelected(id)
        );

        // Pointer contact (`pointerdown` → claim focus + announce the
        // interaction) is wired by `registerViewContainer`, which also owns the
        // teardown path for it. Registration is also what makes this view
        // addressable without a pointer (see `shared/focus`).
        registerViewContainer(this.getViewType(), container);

        // Wire up zoom/pan on the scaffold elements added by initialization.
        const clipEl = container.querySelector<HTMLElement>('[data-role="clip-container"]');
        const transformEl = container.querySelector<HTMLElement>('[data-role="transform-target"]');
        if (clipEl && transformEl && this.state.svgRoot) {
            this.state.touchHandler = new CircularTouchHandler({
                svgRoot: this.state.svgRoot,
                host: clipEl,
                styles,
                axisCircles: this.state.axisCircles,
                /* c8 ignore start */
                getCubeSize: () => this.state.model?.getCurrentState().cubeSize ?? 3,
                getCubeState: () => this.state.model!.getCurrentState(),
                onStickerSelected: stickerId =>
                    this.updateSelected(stickerId as StickerId | undefined),
                /* c8 ignore stop */
            });
            this.state.touchHandler.attach();

            this.state.zoomPan = new ZoomPanController(clipEl, transformEl, {
                gestureMode: 'delegated-left-drag',
                pointerDelegate: {
                    /* c8 ignore start */
                    onPointerDown: (event, target) =>
                        this.state.touchHandler?.onPointerDown(event, target),
                    onPointerMove: event => this.state.touchHandler?.onPointerMove(event),
                    onPointerUp: (event, target) =>
                        this.state.touchHandler?.onPointerUp(event, target),
                    onPointerCancel: event => this.state.touchHandler?.onPointerCancel(event),
                    /* c8 ignore stop */
                },
                /* c8 ignore next */
                isDelegateTarget: target =>
                    target instanceof Node &&
                    (clipEl.contains(target) || transformEl.contains(target)),
            });
        }

        // initial paint
        this.update(model);

        // Default selection: the centre sticker of the front face. Derived from
        // the cube size rather than a fixed face position, which only exists at
        // 3×3 (position 4) — at 2×2 that lookup silently matched nothing and the
        // view opened with no sticker selected.
        const centre = CubeStateUtils.getStickerAt(
            model.getCurrentState(),
            Face.F,
            centerFacePosition(model.getCurrentState().cubeSize)
        );
        if (centre) this.updateSelected(centre.id);
    }

    setLayoutMode(mode: LayoutMode): void {
        // Gesture routing remains unchanged; we only adjust interaction affordances
        // (such as drag-label placement) for tabbed/mobile layouts.
        this.state.touchHandler?.setLayoutMode(mode);
    }

    update(model: ReadOnlyCubeModel): void {
        this.state.model = model;
        rendering.renderState(this.state, model.getCurrentState());
        this.restoreSelection();
    }

    updateSelective(event?: MoveExecutedEvent): void {
        // Reconcile the selection anchor with the new model state *now*: the
        // model already reflects this move, and the animation that follows is
        // purely cosmetic. Doing it inside the promise callback below left the
        // anchor pointing at the pre-move frame for the duration of the
        // animation, so a key pressed then inferred its move from stale geometry
        // and produced a different notation than the same key produced once the
        // animation had finished.
        this.restoreSelection();

        // Delegate to shared updateSelective which handles animation and state updates.
        //
        // A failure here is reported rather than swallowed. The empty catch this
        // replaced claimed to "preserve existing behavior", but that stopped being
        // true once the post-promise reconcile was removed: with nothing left to
        // run after a rejection, a silent failure is now a permanently skipped
        // paint, not a redundant one. The view still does not throw — a rendering
        // error must not take the app down — but it is no longer invisible.
        rendering.updateSelective(this.state, event as MoveExecutedEvent).catch(error => {
            logger.error('Circular view failed to apply an animated update:', error);
        });
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

    updateHighlight(highlightedSticker?: StickerId): void {
        highlights.updateHighlight(this.state, styles, highlightedSticker);
    }

    updateSelected(selectedSticker?: StickerId): void {
        highlights.updateSelected(this.state, styles, selectedSticker);
        // Announce the new selection: commands whose target depends on it (the
        // M/E/S slices above 3×3) derive it from the sticker, not from the cube.
        getEventBus().emit(EventName.STICKER_SELECTED, {
            stickerId: selectedSticker,
            viewId: this.getViewType(),
        });
    }

    /**
     * The sticker currently selected in this view, if any. Read by the command
     * host so the M/E/S slices can follow the active view's selection.
     */
    getSelectedSticker(): StickerId | undefined {
        return this.state.currentSelected;
    }

    handleKeyDown(event: KeyboardEvent): boolean {
        return handleKeyPress(
            event,
            true,
            this.state,
            id => this.updateSelected(id),
            () => this.faceLabelTilt.flash()
        );
    }

    handleKeyUp(event: KeyboardEvent): boolean {
        return handleKeyPress(
            event,
            false,
            this.state,
            id => this.updateSelected(id),
            () => this.faceLabelTilt.flash()
        );
    }

    getCommands(): Command[] {
        return getCommands(this.state);
    }

    getState(): CircularViewState {
        return getState(this.state);
    }

    setState(state: unknown): void {
        setState(this.state, state);
    }

    resize(): void {
        // no-op for now
    }

    getMinimumSize(): Size2D {
        return { width: 300, height: 300 };
    }

    getViewType(): string {
        return 'circular';
    }

    destroy(): void {
        // Stop being addressable: a destroyed view must not be activatable.
        unregisterViewContainer(this.getViewType());

        this.faceLabelTilt.destroy();
        this.state.zoomPan?.destroy();
        this.state.zoomPan = null;
        this.state.touchHandler?.destroy();
        this.state.touchHandler = null;
        if (this.state.container) {
            this.state.container.innerHTML = '';
        }
        this.state.svgRoot = undefined;
    }
}
