import { Application } from '@/application';
import { CubeView, Face, ReadOnlyCubeModel, StickerId } from '@/cube/types';
import { Size2D } from '@/cube/types/cubie';
import { LayoutMode } from '@/cube/types/view';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { Command, CommandCategory, EventName, MoveExecutedEvent } from '@/types';

import * as highlights from './highlights';
import * as initialization from './initialization';
import * as rendering from './rendering';
import { CircularTouchHandler } from './circular-touch-handler';
import styles from './circular.module.css';
import { StickerLookupMap } from './initialization';
import { isNavigationKey, navigate } from './keyboard-cube-walking';
import { AxisCircle } from './svg-tools';
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
     * Serializes move animations so they never run concurrently.
     * Each updateSelective call chains onto this promise.
     */
    animationChain: Promise<void>;
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
    };

    /** Zoom/pan controller — set up in create(), torn down in destroy(). */
    private zoomPan: ZoomPanController | null = null;
    private touchHandler: CircularTouchHandler | null = null;
    /** When true, left-drag pans instead of performing move gestures. */
    private panMode = false;

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
            this.touchHandler = new CircularTouchHandler({
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
            this.touchHandler.attach();

            this.zoomPan = new ZoomPanController(clipEl, transformEl, {
                gestureMode: 'delegated-left-drag',
                pointerDelegate: {
                    /* c8 ignore start */
                    onPointerDown: (event, target) =>
                        this.touchHandler?.onPointerDown(event, target),
                    onPointerMove: event => this.touchHandler?.onPointerMove(event),
                    onPointerUp: (event, target) => this.touchHandler?.onPointerUp(event, target),
                    onPointerCancel: event => this.touchHandler?.onPointerCancel(event),
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
        this.touchHandler?.setLayoutMode(mode);
    }

    update(model: ReadOnlyCubeModel): void {
        this.state.model = model;
        rendering.renderState(this.state, model.getCurrentState());
    }

    updateSelective(event?: MoveExecutedEvent): void {
        // Delegate to shared updateSelective which handles animation and state updates.
        rendering.updateSelective(this.state, event as MoveExecutedEvent).catch(() => {
            // swallow errors to preserve existing behavior (no-throw on update)
        });
    }

    updateHighlight(highlightedSticker?: StickerId): void {
        highlights.updateHighlight(this.state, styles, highlightedSticker);
    }

    updateSelected(selectedSticker?: StickerId): void {
        highlights.updateSelected(this.state, styles, selectedSticker);
    }

    handleKeyDown(event: KeyboardEvent): boolean {
        return this.handleKeyPress(event, true);
    }

    handleKeyUp(event: KeyboardEvent): boolean {
        return this.handleKeyPress(event, false);
    }

    /**
     * Separate method to handle key presses, with a preview mode for keydown pre-checking.
     * @param event - The keyboard event to handle.
     * @param preview - If true, only check if the event would be handled without actually performing the action (used for keydown pre-checking).
     * @returns true if the event was handled (i.e., it was a navigation key and navigation succeeded), false otherwise.
     */
    private handleKeyPress(event: KeyboardEvent, preview: boolean = false): boolean {
        if (!isNavigationKey(event)) return false;

        return navigate(
            event,
            preview,
            this.state,
            /* c8 ignore next */ id => this.updateSelected(id)
        );
    }

    getCommands(): Command[] {
        return [
            {
                id: 'circular.undo',
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
                id: 'circular.redo',
                label: 'Redo',
                category: CommandCategory.VIEW,
                showInHeader: true,
                icon: '↪',
                tooltip: 'Redo last undone move',
                priority: 901,
                action: () => Application.eventBus.emit(EventName.REDO_REQUESTED, {}),
                isEnabled: () => this.state.model?.getMoveHistory().canRedo() ?? false,
            },
            {
                id: 'circular-view.pan-mode',
                label: 'Pan Mode',
                category: CommandCategory.VIEW,
                action: () => {
                    this.panMode = !this.panMode;
                    this.zoomPan?.setGestureMode(this.panMode ? 'legacy' : 'delegated-left-drag');
                },
                isActive: () => this.panMode,
                icon: '✥',
                tooltip: 'Drag to pan/zoom. Disables move gestures until toggled off.',
                showInHeader: true,
                priority: 47,
            },
            {
                id: 'circular-view.reset-zoom',
                label: 'Reset Zoom',
                category: CommandCategory.VIEW,
                action: () => this.zoomPan?.reset(),
                icon: '⊙',
                tooltip: 'Reset zoom and pan to default (double-click/tap to reset)',
                showInHeader: true,
                priority: 50,
            },
            {
                id: 'circular-view.face-direct-mode',
                label: 'Face Mode',
                category: CommandCategory.VIEW,
                action: () => {
                    const handler = this.touchHandler;
                    if (handler) {
                        handler.setFaceDirectMode(!handler.getFaceDirectMode());
                    }
                },
                isActive: () => this.touchHandler?.getFaceDirectMode() ?? false,
                icon: '◎',
                tooltip:
                    'Drag face ellipses to rotate that face directly (without selecting first)',
                showInHeader: true,
                priority: 45,
            },
        ];
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
        this.zoomPan?.destroy();
        this.zoomPan = null;
        this.touchHandler?.destroy();
        this.touchHandler = null;
        if (this.state.container) {
            this.state.container.innerHTML = '';
        }
        this.state.svgRoot = undefined;
    }
}
