import { Application } from '@/application';
import { CubeView, Face, ReadOnlyCubeModel, StickerId } from '@/cube/types';
import { Size2D } from '@/cube/types/cubie';
import { LayoutMode } from '@/cube/types/view';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import {
    inferKeyboardMove,
    isFaceSelectKey,
    isKeyboardMoveKey,
    mapArrowToDirection,
} from '@/interaction/keyboard-moves';
import {
    Command,
    CommandCategory,
    EventName,
    MoveExecutedEvent,
    MoveRequestedEvent,
} from '@/types';

import * as highlights from './highlights';
import * as initialization from './initialization';
import * as rendering from './rendering';
import styles from './circular.module.css';
import { FACE_TOP_DIRECTION_HINTS, tiltAngleFromHint } from './direction-mapping';
import { StickerLookupMap } from './initialization';
import { isNavigationKey, navigate } from './keyboard-cube-walking';
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
    /** Whether keyboard walking follows real cube surface topology. */
    cubeWalk: boolean;
};

export type CircularViewState = {
    faceDirectMode: boolean;
    panMode: boolean;
    cubeWalk: boolean;
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
        cubeWalk: true,
    };

    /** Zoom/pan controller — set up in create(), torn down in destroy(). */
    private zoomPan: ZoomPanController | null = null;
    private touchHandler: CircularTouchHandler | null = null;
    /** When true, left-drag pans instead of performing move gestures. */
    private panMode = false;
    /** Timer to revert face label tilt after keyboard idle. */
    private faceLabelResetTimer: ReturnType<typeof setTimeout> | null = null;

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
        // Face selection toggle (Space or Backtick).
        if (isFaceSelectKey(event)) {
            if (!preview) {
                this.handleFaceSelectKey();
                this.flashFaceLabelTilt();
            }
            return this.state.currentSelected !== undefined;
        }

        // Keyboard move (Ctrl+Arrow, optionally +Shift for 180°).
        if (isKeyboardMoveKey(event)) {
            if (!preview) {
                this.handleKeyboardMove(event);
                this.flashFaceLabelTilt();
            }
            return this.state.currentSelected !== undefined;
        }

        // Plain arrow keys — sticker navigation.
        if (!isNavigationKey(event)) return false;

        const handled = navigate(
            event,
            preview,
            this.state,
            /* c8 ignore next */ id => this.updateSelected(id)
        );
        if (handled && !preview) this.flashFaceLabelTilt();
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
            faceDirectMode: this.touchHandler.getFaceDirectMode(),
            direction,
            doubleTurn: event.shiftKey,
            model: this.state.model,
        });
        if (!notation) return;

        const payload: MoveRequestedEvent = {
            moveNotation: notation,
            viewId: 'circular',
            tentative: false,
        };
        Application.eventBus.emit(EventName.MOVE_REQUESTED, payload);
    }

    getCommands(): Command[] {
        return [
            {
                id: 'circular-view.pan-mode',
                label: 'Pan Mode',
                category: CommandCategory.VIEW,
                keyBindings: [{ key: '5', ctrlKey: true }],
                icon: '✥',
                tooltip: 'Drag to pan/zoom. Disables move gestures until toggled off.',
                showInHeader: true,
                priority: 580,
                action: () => {
                    this.panMode = !this.panMode;
                    this.zoomPan?.setGestureMode(this.panMode ? 'legacy' : 'delegated-left-drag');
                    Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                        viewType: this.getViewType(),
                    });
                },
                isActive: () => this.panMode,
            },
            {
                id: 'circular-view.reset-zoom',
                label: 'Reset View',
                category: CommandCategory.VIEW,
                keyBindings: [{ key: 'Home' }, { key: '4', ctrlKey: true }],
                icon: '⊙',
                tooltip: 'Reset zoom and pan to default.',
                showInHeader: true,
                priority: 590,
                action: () => this.zoomPan?.reset(),
            },
            {
                id: 'circular-view.cube-walk',
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
                id: 'circular-view.face-direct-mode',
                label: 'Face Mode',
                category: CommandCategory.VIEW,
                keyBindings: [{ key: '2', ctrlKey: true }],
                icon: '◎',
                tooltip:
                    'Drag face ellipses to rotate that face directly (without selecting first).',
                showInHeader: true,
                priority: 890,
                action: () => {
                    const handler = this.touchHandler;
                    if (handler) {
                        handler.setFaceDirectMode(!handler.getFaceDirectMode());
                        Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
                            viewType: this.getViewType(),
                        });
                    }
                },
                isActive: () => this.touchHandler?.getFaceDirectMode() ?? false,
            },
            {
                id: 'circular.undo',
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
                id: 'circular.redo',
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

    getState(): CircularViewState {
        return {
            faceDirectMode: this.touchHandler?.getFaceDirectMode() ?? false,
            panMode: this.panMode,
            cubeWalk: this.state.cubeWalk,
        };
    }

    setState(state: unknown): void {
        if (!state || typeof state !== 'object') return;
        const s = state as Record<string, unknown>;
        if (typeof s['panMode'] === 'boolean') {
            this.panMode = s['panMode'];
            this.zoomPan?.setGestureMode(this.panMode ? 'legacy' : 'delegated-left-drag');
        }
        if (typeof s['faceDirectMode'] === 'boolean') {
            this.touchHandler?.setFaceDirectMode(s['faceDirectMode']);
        }
        if (typeof s['cubeWalk'] === 'boolean') {
            this.state.cubeWalk = s['cubeWalk'];
        }
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
        if (this.faceLabelResetTimer) clearTimeout(this.faceLabelResetTimer);
        this.faceLabelResetTimer = null;
        this.zoomPan?.destroy();
        this.zoomPan = null;
        this.touchHandler?.destroy();
        this.touchHandler = null;
        if (this.state.container) {
            this.state.container.innerHTML = '';
        }
        this.state.svgRoot = undefined;
    }

    // ── Face-label tilt helpers ──────────────────────────────────────────

    /**
     * Per-face translate origin (tx, ty) and tilt angle (degrees).
     * The angle is derived from {@link FACE_TOP_DIRECTION_HINTS} via
     * {@link tiltAngleFromHint} so it stays in sync with the direction system.
     */
    private static readonly FACE_LABEL_TRANSFORMS: Record<
        string,
        { tx: number; ty: number; angle: number }
    > = {
        U: { tx: 200, ty: 115, angle: tiltAngleFromHint(FACE_TOP_DIRECTION_HINTS[Face.U]) },
        D: { tx: 200, ty: 326, angle: tiltAngleFromHint(FACE_TOP_DIRECTION_HINTS[Face.D]) },
        L: { tx: 85, ty: 120, angle: tiltAngleFromHint(FACE_TOP_DIRECTION_HINTS[Face.L]) },
        B: { tx: 315, ty: 120, angle: tiltAngleFromHint(FACE_TOP_DIRECTION_HINTS[Face.B]) },
        F: { tx: 133, ty: 228, angle: tiltAngleFromHint(FACE_TOP_DIRECTION_HINTS[Face.F]) },
        R: { tx: 267, ty: 228, angle: tiltAngleFromHint(FACE_TOP_DIRECTION_HINTS[Face.R]) },
    };

    private static readonly FACE_LABEL_RESET_MS = 1500;

    /** Tilt all face labels and schedule a reset after idle. */
    private flashFaceLabelTilt(): void {
        this.setFaceLabelRotations(true);
        if (this.faceLabelResetTimer) clearTimeout(this.faceLabelResetTimer);
        this.faceLabelResetTimer = setTimeout(
            () => this.setFaceLabelRotations(false),
            CircularCubeView.FACE_LABEL_RESET_MS
        );
    }

    /** Apply or remove tilt rotation on every face label element. */
    private setFaceLabelRotations(tilted: boolean): void {
        const svg = this.state.svgRoot;
        if (!svg) return;
        for (const [face, { tx, ty, angle }] of Object.entries(
            CircularCubeView.FACE_LABEL_TRANSFORMS
        )) {
            const el = svg.getElementById(`face-label-${face}`);
            if (!el) continue;
            el.setAttribute(
                'transform',
                tilted ? `translate(${tx},${ty}) rotate(${angle})` : `translate(${tx},${ty})`
            );
        }
    }
}
