import { Axis, CubeView, Face, ReadOnlyCubeModel, StickerId } from '@/cube/types';
import { Size2D } from '@/cube/types/cubie';
import { LayoutMode } from '@/cube/types/view';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { Command, MoveExecutedEvent } from '@/types';

import * as highlights from './highlights';
import * as initialization from './initialization';
import * as rendering from './rendering';
import styles from './circular.module.css';
import { getCommands, getState, setState } from './commands';
import { FaceLabelTiltController } from './face-label-tilt';
import { StickerLookupMap } from './initialization';
import { handleKeyPress } from './keyboard-actions';
import { AxisCircle } from './svg-tools';
import { CircularTouchHandler } from './touch-handler';
import { ZoomPanController } from './zoom-pan';

/**
 * Internal data for CircularCubeView.
 * Holds references to DOM elements and mappings.
 * @internal
 */
export type CircularCubeViewInternalData = {
    /**
     * The cube model associated with this view.
     */
    model?: ReadOnlyCubeModel;

    /**
     * The container element for the view.
     */
    container: HTMLElement | undefined | null;

    /**
     * Styles applied to the view.
     */
    styles: Record<string, string>;

    /**
     * The root SVG element.
     */
    svgRoot: SVGSVGElement | undefined | null;

    /**
     * Flag indicating if the SVG is ready for interaction.
     */
    svgReady: boolean;

    /**
     * Array of axis circles for rotation animations.
     * Empty if not initialized.
     */
    axisCircles: AxisCircle[];

    /**
     * Mapping from position keys to face-to-SVG ID maps.
     * Null if not initialized.
     */
    stickerLookupMap?: StickerLookupMap;

    /**
     * Cache of SVG elements by their ID.
     */
    svgElementCache: Map<string, SVGCircleElement>;

    /**
     * Mapping from SVG element IDs to Sticker IDs.
     */
    svgIdToStickerId: Map<string, StickerId>;

    /**
     * Mapping from Sticker IDs to SVG element IDs.
     */
    stickerIdToSvgId: Map<StickerId, string>;

    /**
     * Currently selected sticker for keyboard navigation
     */
    currentSelected?: StickerId;

    /**
     * Face of the currently selected sticker (spatial anchor for selection).
     */
    selectedFace?: string;

    /**
     * Position on face of the currently selected sticker (spatial anchor).
     */
    selectedPosition?: number;

    /**
     * Serializes move animations so they never run concurrently.
     * Each updateSelective call chains onto this promise.
     */
    animationChain: Promise<void>;
    /**
     * Per-axis animation chains. Moves on the same axis animate in parallel
     * (their stickers are disjoint), while moves on different axes are serialized.
     */
    axisAnimationChains: Record<Axis, Promise<void>>;
    /** Whether keyboard walking follows real cube surface topology. */
    cubeWalk: boolean;
    /** Whether ghost hint stickers are visible. */
    showGhosts: boolean;
    /** Cached ghost-sticker SVG elements (lazily populated by rendering). */
    ghostElements?: SVGCircleElement[];
    /** Zoom/pan controller — set up in create(), torn down in destroy(). */
    zoomPan: ZoomPanController | null;
    /** Touch handler for drag gestures and face selection. */
    touchHandler: CircularTouchHandler | null;
    /** Whether left-drag pans instead of performing move gestures. */
    panMode: boolean;
};

export type CircularViewState = {
    faceDirectMode: boolean;
    panMode: boolean;
    cubeWalk: boolean;
    showGhosts: boolean;
};

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

        // Default selection: F4 sticker.
        const f4 = CubeStateUtils.getStickerAt(model.getCurrentState(), Face.F, 4);
        if (f4) this.updateSelected(f4.id);
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
        // Delegate to shared updateSelective which handles animation and state updates.
        rendering
            .updateSelective(this.state, event as MoveExecutedEvent)
            .then(() => this.restoreSelection())
            .catch(() => {
                // swallow errors to preserve existing behavior (no-throw on update)
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
