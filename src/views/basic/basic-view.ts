// fallow-ignore-file unused-type
// Basic View — per-cubie 3D architecture with move animations
import { Application } from '@/application';
import {
    Axis,
    CubeView,
    Face,
    LayoutMode,
    QuarterTurn,
    ReadOnlyCubeModel,
    Size2D,
    StickerId,
    Vector3,
} from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { centerFacePosition, facePositionTo3D } from '@/cube/utils/sticker-position';
import {
    inferKeyboardMove,
    isFaceSelectKey,
    isKeyboardMoveKey,
    mapArrowToDirection,
} from '@/interaction/keyboard-moves';
import { notationForSignedAngle } from '@/interaction/move-inference';
import { DragDirection } from '@/interaction/types';
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
import { isLinked, isSameFamily, setLinked } from '@/views/basic/linked-rotations';
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
    viewFrontFace,
} from '@/views/basic/navigation';
import { updateHighlight, updateSelected } from '@/views/basic/selection';
import { BasicTouchHandler } from '@/views/basic/touch-handler';
import { unregisterViewContainer } from '@/views/shared/focus';

import * as animations from './animations';
import * as cubieRendering from './cubie-rendering';
import * as initialization from './initialization';
import styles from './basic-view.module.css';
import {
    ReanchorTarget,
    selectionVisualCell as policySelectionVisualCell,
    preserveSelectionAcrossOrientationChange as preserveSelection,
    reanchorSelection as reanchor,
} from './reanchor';
import {
    getMinimumSize,
    getVisibleFacesWithPositions,
    resize,
    update,
    updateFaceLabels,
    updateRotation,
} from './rendering';
import { sliceRotationForViewTurn, stepDown, stepLeft, stepRight, stepUp } from './rotation-math';
import type { Orientation } from './rotation-math';
import { BasicVariant } from './types';
import type { BasicViewInternalData, BasicViewState } from './types';
import type { ViewOrientation, VisualCell } from './visual-cell';

export type { BasicVariant, BasicViewInternalData, BasicViewState } from './types';

/**
 * Result of starting an animation — held during animation to support interrupts.
 */
type ActiveAnimation = {
    animation: Animation;
    pivot: HTMLElement;
    cubieElements: HTMLElement[];
    event: MoveExecutedEvent;
};

/**
 * How many rotations may coalesce into one gesture before further ones stop
 * animating.
 *
 * Expressed as "after two", matching the Circular view's `pending > 2` rule so the
 * two views agree on what "rapid input" means. A two-step gesture is one continuous
 * turn, so the first two are always animated; from the third on, the orientation is
 * applied directly.
 */
const SKIP_ANIMATION_AFTER = 2;

export class BasicView implements CubeView {
    private state: BasicViewInternalData;
    private touchHandler: BasicTouchHandler | null = null;
    private ghostStickers: GhostStickers | null = null;
    private linkedRotationListener: ((e: BasicViewRotationLinkedEvent) => void) | null = null;
    private linkedResetListener: ((e: BasicViewResetLinkedEvent) => void) | null = null;
    private ghostToggledListener: ((e: BasicViewGhostToggledEvent) => void) | null = null;
    private activeAnimation: ActiveAnimation | null = null;
    /**
     * How many rotations are currently turning the cube.
     *
     * Held here rather than in `rendering.ts` because it spans *both* kinds of
     * turn — view rotations and move animations — and the ghost strips must stay
     * hidden across a whole rapid sequence, not just one step of it (R7).
     *
     * Decremented in one place that runs on fulfilment and cancellation alike, so
     * an interrupt cannot leak the count and latch the strips off permanently.
     * That is the failure mode the Circular view's counter has (its decrement
     * sits outside `try/finally`, so an `AbortError` from `cancel()` strands it);
     * interruption is exactly the case being fixed here, so cancel-safety is
     * required rather than nice to have.
     */
    private turnsInFlight = 0;
    /**
     * The rotation animation the view currently considers open, if any.
     *
     * Needed in addition to the plan on the state object, because a rotation that is
     * superseded has already been forgotten there. This is what lets the settle guard
     * tell an obsolete completion from the live one, and what lets a superseding
     * rotation close its predecessor's turn so the count cannot leak.
     */
    private rotationAnimation: Animation | null = null;
    /**
     * How many rotations have coalesced into the gesture currently being shown.
     *
     * Reset when the sequence settles. Distinct from {@link turnsInFlight}, which
     * counts open turns for the ghost strips: a superseded rotation is closed at once, so
     * `turnsInFlight` stays at one throughout a burst and cannot express its length.
     */
    private rotationsInSequence = 0;

    constructor(config?: { viewType?: string }) {
        const viewType = config?.viewType === 'basic-back' ? 'basic-back' : 'basic-front';
        const variant: BasicVariant =
            viewType === 'basic-back' ? BasicVariant.Back : BasicVariant.Front;

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
            toggleTilt: () => this.toggleTilt(),
            togglePitch: () => this.togglePitch(),
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
            // Two halves used to make up this cast, and only one of them was
            // real:
            //
            // - `| undefined` advertised a cleared selection as a gesture
            //   outcome. No gesture can produce one — every rendered sticker
            //   carries `data-sticker-id`, so the touch handler's `?? undefined`
            //   fallback is unreachable (verified) — so that half was a widening
            //   with no runtime path behind it, and it is gone. Clearing remains
            //   supported through `clearSelection` and an explicit
            //   `updateSelected(state)` call.
            // - `as StickerId` bridges the touch handler's deliberately loose
            //   `(stickerId?: string) => void` to the branded id `updateSelected`
            //   expects. That mismatch is real, so this half stays; narrowing it
            //   means narrowing the touch handler's declaration.
            onStickerSelected: id => this.updateSelected(id as StickerId),
            onViewRotated: (_direction: 'horizontal' | 'vertical', rotation, steps) => {
                // The gesture has already applied `steps` rotations to the
                // orientation (the touch handler loops over them), so this is one
                // rotation of the cube whose ramp merges those steps into a single
                // continuous sweep — not `steps` separate turns.
                this.beginRotation();
                updateFaceLabels(this.state, _direction);
                this.applyRotation(this.shouldSkipRotationAnimation());
                this.emitStateChanged();
                if (isLinked(this.state.viewType)) {
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
            /* c8 ignore if — guard against self-events and cross-family events */
            if (
                event.sourceViewType === this.state.viewType ||
                !isSameFamily(event.sourceViewType, this.state.viewType)
            ) {
                return;
            }
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
            /* c8 ignore if — guard against self-events and cross-family events */
            if (
                event.sourceViewType === this.state.viewType ||
                !isSameFamily(event.sourceViewType, this.state.viewType)
            ) {
                return;
            }
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

        // Create ghost stickers on the ghost-anchor wrapper (scoped root),
        // not the whole cube element — the shared GhostStickers module's
        // data-basic-face query would otherwise be ambiguous against cubie
        // sticker divs that share the same attribute shape.
        /* c8 ignore if — cubeElement/ghostAnchorContainer always created in initialization */
        if (this.state.cubeElement && this.state.ghostAnchorContainer) {
            this.ghostStickers = new GhostStickers(
                this.state.ghostAnchorContainer,
                () => this.state.model ?? null
            );
            this.ghostStickers.create();
            if (isGhostVisible()) {
                this.updateGhostEdges();
            }
        }

        // Default selection: center sticker of the variant's front face. The
        // position comes from the shared helper rather than a literal, which only
        // existed at 3×3 — at 2×2 the lookup silently matched nothing.
        const defaultFace = this.state.variant === BasicVariant.Back ? Face.B : Face.F;
        const center = CubeStateUtils.getStickerAt(
            model.getCurrentState(),
            defaultFace,
            centerFacePosition(model.getCurrentState().cubeSize)
        );
        if (center) this.updateSelected(center.id);
    }

    update(model: ReadOnlyCubeModel): void {
        this.state.model = model;
        update(this.state, model);
        this.ghostStickers?.updateColors();
        this.restoreSelection();
    }

    // Called by ViewManager via the CubeView interface (updateSelective?); fallow
    // cannot see interface-member calls, so this is suppressed as a known pattern.
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

    /**
     * The view orientation, in the shape the visual-cell rule expects.
     */
    private orientation(): ViewOrientation {
        return { viewRight: this.state.viewRight, viewUp: this.state.viewUp };
    }

    /**
     * Open a rotation: take the ghost strips off screen until the last turn in the
     * sequence settles.
     *
     * A ghost strip borrows its colour from a hidden face, so while the cube is
     * turning it would show a mapping that is about to be wrong — during a
     * whole-cube move the strips would sit visibly on stale geometry and only
     * recolour at the end. Hiding first means a strip is either correct or
     * absent, never confidently wrong.
     *
     * Every rotation and move entry point goes through this, and pairing is
     * enforced by {@link turnsInFlight} rather than by each caller remembering to
     * close what it opened: the strips come back when the counter reaches zero,
     * so a rapid sequence hides them once and restores them once (R7) instead of
     * flickering between steps.
     *
     * The hide is immediate (`animate = false`), not the animated fade-out: the
     * fade leaves each strip on screen for the length of its opacity transition
     * and only sets `display: none` from a later `transitionend`/timeout. A strip
     * still in the DOM during the turn is exactly the stale geometry this exists
     * to avoid, and it also stops `updateVisibleEdges` from tidying up, because
     * `hideAllStrips` only touches strips still flagged as showing.
     */
    private beginRotation(): void {
        this.turnsInFlight++;
        this.rotationsInSequence++;
        this.ghostStickers?.setVisible(false, false);
    }

    /**
     * Close a rotation and reveal the strips if this was the last turn in flight.
     *
     * Must be called for **both** outcomes of a turn — completed and cancelled —
     * because a leaked count would hide the strips for the rest of the session.
     * The counter lives with the view, which owns every animation, so a stale
     * animation resolving after a resize or a model update cannot strand it: the
     * guard in {@link closeRotation} refuses to touch replaced DOM.
     *
     * The reveal is immediate. The cube's own motion has already been awaited by
     * whoever held the turn, so a fade-in delay would be a second, phantom turn:
     * the same 233ms pause the user reported after a whole-cube move.
     */
    private endRotation(): void {
        this.turnsInFlight = Math.max(0, this.turnsInFlight - 1);
        if (this.turnsInFlight === 0) {
            // The sequence is over, so the next gesture starts its count afresh.
            this.rotationsInSequence = 0;
            this.updateGhostEdges();
        }
    }

    /**
     * Run a rotation and close it exactly once, whichever way it settles.
     *
     * `updateRotation` reports whether the orientation settled immediately or is
     * still animating, and this is the only place that decides what to do about it.
     * Every branch ends in {@link endRotation}, so a cancelled or superseded ramp
     * cannot leak the counter.
     *
     * A rotation resolving after the element was replaced (resize, model update) still
     * closes its turn, but does not bake a transform onto whatever replaced it.
     */
    private applyRotation(skipAnimation?: boolean): void {
        const element = this.state.cubeElement;
        const previous = this.rotationAnimation;
        const result = updateRotation(this.state, skipAnimation);
        const opened = result.kind === 'animating' ? result.animation : null;
        const finished = result.kind === 'animating' ? result.finished : null;

        // A rotation that supersedes another closes it here. The superseded one will
        // never settle on its own — its completion is refused by the identity guard
        // below — so leaving it open would leak the count and strand the strips
        // hidden for the rest of the session.
        if (previous !== null && previous !== opened) {
            this.rotationAnimation = null;
            this.endRotation();
        }
        this.rotationAnimation = opened;

        if (!opened || !finished) {
            this.endRotation();
            return;
        }

        void finished.then(() => {
            // Guard by *animation identity*. A superseded rotation's `finished` settles
            // when it is cancelled, and if it were allowed to close the turn it would
            // settle the rotation that replaced it — revealing the strips mid-sequence,
            // which is exactly the flicker R7 forbids. Measured in a real browser before
            // this guard existed: `0 → shown → 0 → shown`, two reveals for one gesture.
            // The move path below guards the same hazard by event identity.
            if (this.rotationAnimation !== opened) return;
            this.rotationAnimation = null;

            // Nothing to bake if the element this rotation was animating is gone.
            if (this.state.cubeElement === element) {
                // Bake the settled transform and drop the animation. While a ramp is
                // running, the animation is what holds the element's transform with
                // `fill: forwards`, so the inline style is still the pre-rotation value
                // — leaving it there would make the DOM disagree with the cube the user
                // is looking at, and anything reading the style would see stale geometry.
                // `skipAnimation` performs exactly that settle, so there is one code
                // path for it.
                updateRotation(this.state, true);
            }
            this.endRotation();
        });
    }

    /**
     * Skip the animation for this rotation when enough of them have already coalesced
     * into the current gesture.
     *
     * Follows the Circular view's skip-when-overloaded intent — the *pattern*, not the
     * code, which is not cancel-safe. The reason differs slightly in this view: rapid
     * input is not queued, so there is no unbounded backlog to prevent. What it bounds
     * is animation restarts — each rotation retargets the ramp, and continuing to
     * restart it for a long burst costs work while showing less than a steady sweep
     * would. Dropping the animation while still applying the orientation keeps the cube
     * where the gestures asked and keeps the trailing end of a burst cheap.
     *
     * Counted per gesture rather than per in-flight animation, because a superseded
     * rotation is closed immediately: the in-flight count stays at one throughout a
     * burst, so it can never express "this gesture is getting long".
     *
     * The threshold is two rather than one, because a two-step gesture designates a
     * single continuous turn (a far-drag, or the anti-parallel case of `rotateViewToFace`)
     * and skipping it would stutter the very case the shared primitive smooths.
     */
    private shouldSkipRotationAnimation(): boolean {
        return this.rotationsInSequence > SKIP_ANIMATION_AFTER;
    }

    /**
     * The view-side contract the re-anchor policy needs.
     *
     * The policy itself lives in `./reanchor` so Circular and Flat can reuse it.
     * This adapter is what keeps it view-agnostic: the policy decides *which*
     * sticker should be selected and hands the id back, and the view decides what
     * selecting it means — its own markup, its own state fields, and its own
     * `STICKER_SELECTED` emission.
     */
    private reanchorTarget(): ReanchorTarget {
        return {
            // Accessors, not values: the policy reads these both before and after
            // the orientation changes, so a snapshot would resolve the captured
            // cell against a stale front face.
            getModel: () => this.state.model,
            getCurrentSelected: () => this.state.currentSelected,
            getOrientation: () => this.orientation(),
            getFrontFace: () => viewFrontFace(this.state),
            applySelection: id => this.updateSelected(id),
        };
    }

    /**
     * Keep the selection on screen after the view's orientation changed.
     *
     * Delegates to the extracted policy, passing this view as the target. The
     * cell is captured before the orientation moves and resolved after it lands,
     * so the selection follows the screen position the user was looking at rather
     * than the face that used to be front.
     */
    private preserveSelectionAcrossOrientationChange(applyOrientation: () => void): void {
        preserveSelection(this.reanchorTarget(), applyOrientation);
    }

    /**
     * Re-anchor a previously captured cell, without changing the orientation.
     *
     * Used by `setState`, where the orientation is restored first and the anchor
     * is reconciled against it afterwards.
     */
    private reanchorSelection(cell: VisualCell | undefined): void {
        reanchor(cell, this.reanchorTarget());
    }

    resize(): void {
        resize(this.state);
        this.touchHandler?.resize();
    }

    // Called by ViewManager via the CubeView interface (setLayoutMode?); fallow
    // cannot see interface-member calls, so this is suppressed as a known pattern.
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

        // A rotation the arrow key triggers is *not* a view rotation the user
        // asked for: it exists to bring the selected sticker's face forward, and
        // the selection must survive it unchanged. Routing it through
        // `rotateViewLeft()` and friends would apply the user-rotation rule
        // (preserve the screen cell, not the sticker), which slides the selection
        // onto whichever sticker now occupies that cell — off a face centre onto
        // an edge cubie at column 0. Mutate the orientation directly and refresh
        // the rendering instead; the linked-view event still fires so a peer Basic
        // view stays in sync.
        const onRotated = (r: ViewRotation): void => {
            // Which faces are "visible" just changed, so the silhouette edges the
            // ghost strips sit on changed with it. Hide them for the turn and
            // recompute on the way out, exactly as every other rotation path does.
            this.beginRotation();
            if (r === ViewRotation.Left) rotateViewLeft(this.state);
            /* c8 ignore else if */ else if (r === ViewRotation.Right) rotateViewRight(this.state);
            /* c8 ignore else if */ else if (r === ViewRotation.Up) rotateViewUp(this.state);
            /* c8 ignore else if */ else if (r === ViewRotation.Down) rotateViewDown(this.state);
            this.applyRotation(this.shouldSkipRotationAnimation());
            /* c8 ignore if — guard when not linked */
            if (isLinked(this.state.viewType)) {
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
        /* c8 ignore if — the rotation path renders itself */
        if (handled && !preview) {
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

        const face = sticker.currentFace;
        const current = this.touchHandler.getSelectedFace();
        this.touchHandler.selectFace(current === face ? undefined : face);
    }

    /**
     * The layer turn a `Ctrl+Arrow` asks for when no face is selected.
     *
     * The arrow names a direction on screen, and the matching `Alt+Arrow` view
     * rotation is the reference for how a turn in that direction goes. Working from
     * that view rotation — rather than from the face the sticker sits on — is what
     * makes the answer independent of which face the selection happens to be on.
     *
     * The layer comes from the selected sticker's coordinate along the turn's axis, so
     * the press turns the layer the sticker is in: a centre sticker turns the middle
     * slice, an edge sticker on the outer layer turns a face, and so on. That falls out
     * of the sticker's own position, so a rotated view needs no special case.
     */
    private inferViewRelativeSlice(
        event: KeyboardEvent,
        direction: DragDirection
    ): string | undefined {
        const model = this.state.model;
        /* c8 ignore if — guarded by the caller */
        if (!model || !this.state.currentSelected) return undefined;

        const sticker = CubeStateUtils.getStickerById(
            model.getCurrentState(),
            this.state.currentSelected
        );
        /* c8 ignore if — sticker always found for a valid selection */
        if (!sticker) return undefined;

        // Which view rotation does this arrow correspond to? The keyboard's arrow and
        // the view rotation are the same physical motion: screen-right is
        // `rotateViewRight`, and so on through the four directions.
        const step =
            direction === DragDirection.RIGHT
                ? stepRight
                : direction === DragDirection.LEFT
                  ? stepLeft
                  : direction === DragDirection.UP
                    ? stepUp
                    : stepDown;

        const current: Orientation = {
            viewRight: this.state.viewRight,
            viewUp: this.state.viewUp,
            viewForward: this.state.viewForward,
        };
        const turn = sliceRotationForViewTurn(current, step(current));

        const cubeSize = model.getCurrentState().cubeSize;

        // The sticker's coordinate along the turn's axis selects the layer. This is
        // the same integer the drag inference uses, so `M` names the middle layer on a
        // 3×3 and the numbered slices follow for larger cubes.
        const position = facePositionTo3D(sticker.facePosition, sticker.currentFace, cubeSize);
        const layerIndex =
            turn.axis === Axis.X ? position.x : turn.axis === Axis.Y ? position.y : position.z;

        const angle = event.shiftKey
            ? ((turn.angle > 0 ? 180 : -180) as QuarterTurn)
            : (turn.angle as QuarterTurn);

        return notationForSignedAngle(turn.axis, layerIndex, angle, cubeSize);
    }

    /**
     * Handle a `Ctrl+Arrow` layer move.
     *
     * Two cases, and they mean different things:
     *
     * - **A face is effectively selected** (explicitly, or via face-direct mode).
     *   The key names a turn of *that face*, so "clockwise" is read on the face
     *   itself and the arrow is a direction within the face's own frame. This is
     *   what `inferKeyboardMove` already does, and the screen orientation is
     *   deliberately irrelevant — a user turning the F face means `F`/`F'` however
     *   the view is rotated.
     * - **No face selected.** The arrow names a direction *on screen*, and the
     *   selected sticker only chooses which layer is involved: the slice must turn
     *   the same way the matching view rotation turns the whole cube. That turn is
     *   derived by {@link sliceRotationForViewTurn} rather than read off the face
     *   under the sticker — doing the latter made the key's meaning depend on which
     *   face the selection happened to be on, so the same press turned different
     *   ways before and after a rotation.
     *
     * `Ctrl+Shift+Arrow` doubles the derived turn. Because the derived angle is
     * signed about a positive axis, the 180° variant keeps the sense: a doubled
     * clockwise turn is `2` and a doubled anticlockwise turn is `2'`. That is why
     * the slice path does not route through `toDoubleTurn` — that helper collapses
     * the prime, which is right for a face turn but would lose the sense here.
     */
    private handleKeyboardMove(event: KeyboardEvent): void {
        const model = this.state.model;
        /* c8 ignore if — same invariant as handleFaceSelectKey */
        if (!this.state.currentSelected || !model || !this.touchHandler) return;

        const direction = mapArrowToDirection(event);
        /* c8 ignore if — mapArrowToDirection can return undefined on unexpected key */
        if (!direction) return;

        // A face is effectively selected when it was picked explicitly or when
        // face-direct mode is on. That case is a face turn, and `inferKeyboardMove`
        // already reads it correctly in the face's own frame — clockwise means
        // clockwise *on that face*, whatever the view is doing. Only the no-face case
        // below needs the view-relative treatment, so the two are kept apart here
        // rather than folded into one path that would have to un-learn the distinction.
        const selectedFace = this.touchHandler.getSelectedFace();
        const faceDirectMode = this.touchHandler.isFaceDirectMode();

        if (selectedFace === undefined && !faceDirectMode) {
            const notation = this.inferViewRelativeSlice(event, direction);
            /* c8 ignore if — only a cube too small to have a slice resolves to none */
            if (!notation) return;
            Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                moveNotation: notation,
                viewId: this.state.viewType,
                tentative: false,
            });
            return;
        }

        const notation = inferKeyboardMove({
            stickerId: this.state.currentSelected,
            selectedFace,
            faceDirectMode,
            direction,
            doubleTurn: event.shiftKey,
            model,
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
        // Announce the new selection: commands whose target depends on it (the
        // M/E/S slices above 3×3) derive it from the sticker, not from the cube.
        Application.eventBus.emit(EventName.STICKER_SELECTED, {
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

    // -------------------------------------------------------------------------
    // Move handling with animation
    // -------------------------------------------------------------------------

    /**
     * Whole-cube rotations (x/y/z) change which original face sits at each
     * visible CSS position — refresh the corner/hidden face labels so they
     * reflect the new face mapping after the move lands. No-op for face and
     * slice moves. The label DOM is built from model virtual centers that are
     * already in post-move state, so any post-move call point is correct.
     */
    private refreshFaceLabelsAfterWholeCubeMove(event: MoveExecutedEvent): void {
        const notation = event.moveDetails?.notation ?? '';
        if (!/^[xyz]['2]?$/.test(notation)) return;
        const direction = notation.charAt(0) === 'x' ? 'vertical' : 'horizontal';
        updateFaceLabels(this.state, direction);
    }

    handleMoveExecuted(event: MoveExecutedEvent): void {
        if (!this.state.model) return;

        // Finalize any running animation (interrupt)
        this.finalizeAnimation();

        // A move turns part of the cube, and a whole-cube move turns all of it.
        // Either way a ghost strip — which borrows a hidden face's colour — is
        // only meaningful once the move has landed, so take the strips off screen
        // for the duration and recompute them at the end. Both the animated and
        // the non-animated branch below call `endRotation`.
        this.beginRotation();

        // Reconcile the selection anchor now, while the model already reflects
        // this move. The animation is purely cosmetic — the model is updated
        // before MOVE_EXECUTED fires — so waiting for it left the anchor pointing
        // at the pre-move frame. A key pressed during the animation then inferred
        // its move from stale geometry and produced a different notation than the
        // same key produced once the animation had finished.
        //
        // The markup (the `selected` class) is re-applied after each DOM rebuild
        // below, because those rebuilds replace the sticker elements that carry it.
        this.restoreSelection();

        if (!event.moveDetails?.movedCubies) {
            this.update(this.state.model);
            // No-cubie path (e.g. whole-cube rotation with no tracked cubies)
            // still needs the label refresh.
            this.refreshFaceLabelsAfterWholeCubeMove(event);
            this.endRotation();
            return;
        }

        // Try to animate
        const result = animations.animateMove(event, this.state.cubeElement!, undefined);

        if (!result) {
            // prefers-reduced-motion, unknown definition, or no matching layer cubies
            cubieRendering.updateCubiePositions(
                this.state.cubeElement!,
                event.moveDetails.movedCubies,
                this.state.styles,
                this.state.onStickerSelected
            );
            // The rebuild above replaced the sticker elements, dropping the
            // markup, so re-apply it — without this the selection stays reported
            // by the app but is invisible on the non-animated path.
            this.restoreSelection();
            // Reduced-motion / non-animated whole-cube path. There is no turn to
            // wait for, so the strips return immediately.
            this.refreshFaceLabelsAfterWholeCubeMove(event);
            this.endRotation();
            return;
        }

        this.activeAnimation = { ...result, event };

        result.animation.finished
            .then(() => {
                if (this.activeAnimation?.event === event) {
                    const { pivot, cubieElements } = this.activeAnimation;
                    this.activeAnimation = null;
                    animations.finalizeLayer(pivot, cubieElements, this.state.cubeElement!);
                    cubieRendering.updateCubiePositions(
                        this.state.cubeElement!,
                        event.moveDetails!.movedCubies!,
                        this.state.styles,
                        this.state.onStickerSelected
                    );
                    result.animation.cancel(); // remove fill effect after DOM is updated
                    // Markup only: the anchor was reconciled when the move landed.
                    this.restoreSelection();
                    // Animated whole-cube path — refresh labels post-move.
                    this.refreshFaceLabelsAfterWholeCubeMove(event);
                    // The move animation has just finished, so there is nothing
                    // left to wait for.
                    this.endRotation();
                }
            })
            .catch(() => {
                // Cancelled via `finalizeAnimation()`, which already closed the
                // rotation as part of its own teardown. Anything else rejecting
                // here would otherwise leave the strips hidden for the rest of the
                // session, so close the rotation whenever this event is still the
                // one we opened it for. Re-closing a rotation that is already shut
                // is harmless: it recomputes the same set of strips.
                if (this.activeAnimation?.event === event) {
                    this.endRotation();
                }
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
            event.moveDetails!.movedCubies!,
            this.state.styles,
            this.state.onStickerSelected
        );

        // Remove fill effect after DOM is updated
        animation.cancel();

        // If the interrupted move was a whole-cube rotation, its result is now
        // visible (cubies snapped to post-move positions) — refresh labels so
        // the corner-face mapping matches before the next move proceeds.
        this.refreshFaceLabelsAfterWholeCubeMove(event);

        // Update ghost stickers and selection. The cube has just been snapped to
        // its post-move positions, so this rotation is over — there is nothing
        // left to wait for.
        this.restoreSelection();
        this.endRotation();
    }

    // -------------------------------------------------------------------------
    // View rotation (public for commands and tests)
    // -------------------------------------------------------------------------

    rotateViewLeft(): void {
        this.preserveSelectionAcrossOrientationChange(() => {
            this.beginRotation();
            rotateViewLeft(this.state);
            updateFaceLabels(this.state, 'horizontal');
            this.applyRotation(this.shouldSkipRotationAnimation());
        });
    }

    rotateViewRight(): void {
        this.preserveSelectionAcrossOrientationChange(() => {
            this.beginRotation();
            rotateViewRight(this.state);
            updateFaceLabels(this.state, 'horizontal');
            this.applyRotation(this.shouldSkipRotationAnimation());
        });
    }

    rotateViewUp(): void {
        this.preserveSelectionAcrossOrientationChange(() => {
            this.beginRotation();
            rotateViewUp(this.state);
            updateFaceLabels(this.state, 'vertical');
            this.applyRotation(this.shouldSkipRotationAnimation());
        });
    }

    rotateViewDown(): void {
        this.preserveSelectionAcrossOrientationChange(() => {
            this.beginRotation();
            rotateViewDown(this.state);
            updateFaceLabels(this.state, 'vertical');
            this.applyRotation(this.shouldSkipRotationAnimation());
        });
    }

    resetView(): void {
        this.preserveSelectionAcrossOrientationChange(() => {
            this.beginRotation();
            resetView(this.state);
            updateFaceLabels(this.state);
            this.applyRotation(this.shouldSkipRotationAnimation());
        });
    }

    alignCubeToView(): void {
        // The sixth orientation entry point, wrapped for the same reason as the
        // five above. Measured: this one changes the front face (a rotate-left
        // then align goes R -> F), so the contract applies.
        //
        // Unlike its siblings, though, its selection survives unwrapped — it
        // emits whole-cube moves, so the model changes and the MOVE_EXECUTED
        // path re-resolves the selection by position. The wrapper here is
        // therefore defence in depth, keeping the entry points uniform rather
        // than fixing a live defect. It also protects the invariant if that
        // move-emission path ever stops reconciling.
        this.preserveSelectionAcrossOrientationChange(() => {
            this.beginRotation();
            alignCubeToView(this.state);
            updateFaceLabels(this.state);
            // Snapping is the intent here — the cube is being aligned to the view,
            // not turned towards it — so the write is deliberately non-animating.
            this.applyRotation(true);
        });
    }

    /**
     * Toggle the view's tilt (a cosmetically rotated presentation of the same
     * orientation).
     *
     * Routed through the view rather than letting the command call
     * `rendering.updateRotation` directly, because a tilt swaps which CSS slots
     * are visible and therefore which silhouette edges the ghost strips belong
     * on — so it needs the same strips-off/refresh treatment as a rotation, and
     * the command context has no way to express that.
     *
     * The base tilt is not the orientation, so there is no *orientation* rotation to
     * animate — but the change itself is animated, as its own ramp on the base angles
     * (see `updateRotation`). Asking to skip it would snap, which is the regression
     * this restored: the skip was correct when a CSS transition on `.cube` covered the
     * presentation change, and that transition had to be removed when the rotation
     * primitive replaced it.
     */
    toggleTilt(): void {
        this.beginRotation();
        this.state.isTilted = !this.state.isTilted;
        this.applyRotation();
        updateFaceLabels(this.state);
    }

    /**
     * Toggle the view's pitch. Same reasoning as {@link toggleTilt}.
     */
    togglePitch(): void {
        this.beginRotation();
        this.state.isPitched = !this.state.isPitched;
        this.applyRotation();
        updateFaceLabels(this.state);
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
            linked: isLinked(this.state.viewType),
            ghostOpacityIndex: this.ghostStickers?.getOpacityIndex() ?? 0,
        };
    }

    setState(state: unknown): void {
        /* c8 ignore if — runtime guard for external callers */
        if (!state || typeof state !== 'object') return;
        const viewState = state as Record<string, unknown>;

        // Captured before the saved orientation is applied: a saved state can
        // record an orientation in which the current selection sits on a face
        // behind the cube, and the re-anchor below resolves it back onto the
        // front face rather than restoring an invisible selection.
        //
        // Measured, because the ordering looks wrong at a glance: `reanchorSelection`
        // resolves against the front face *at call time*, so the invariant holds
        // whether the cell is captured here or after the branch below. The two
        // orderings differ in intent, not in visibility — capturing here is
        // "keep this visual cell across the restore", capturing later would be a
        // no-op for a centre selection. Left as intended.
        const cellBefore = policySelectionVisualCell(this.reanchorTarget());

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
        if (typeof viewState['linked'] === 'boolean') {
            setLinked(viewState['linked'], this.state.viewType);
        }

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

        // Restoring a saved orientation is not a turn the user asked for: there is
        // no travel to show, so the write is settled and no rotation is opened.
        // Going through `updateRotation` directly keeps the ramp bookkeeping
        // consistent without touching `turnsInFlight`.
        updateRotation(this.state, true);
        updateFaceLabels(this.state);

        // Resolve the captured cell against the orientation now in effect.
        // Unchanged from the reviewed code — see the capture site for why the
        // ordering is deliberate rather than a defect.
        this.reanchorSelection(cellBefore);
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    destroy(): void {
        // Stop being addressable: a destroyed view must not be activatable.
        unregisterViewContainer(this.getViewType());

        // Drop any rotation still in flight. Its completion is refused by the identity
        // guard in `applyRotation`, so the view must not leave it holding a turn.
        this.rotationAnimation = null;
        this.turnsInFlight = 0;
        this.rotationsInSequence = 0;

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

    /**
     * Recompute which ghost strips belong on screen for the current orientation.
     *
     * The reveal is immediate. Every caller has already waited for its own turn —
     * view rotations and move animations alike settle through
     * {@link endRotation} — so the fade-in delay that used to live here would be a
     * second, phantom turn. It was tuned against the CSS `transition: transform`
     * that no longer exists, and it measured as a 233ms dead pause between the
     * cube stopping and the strips returning.
     */
    private updateGhostEdges(): void {
        if (!isGhostVisible()) return;
        const { visibleFaces, hiddenFaces } = getVisibleFacesWithPositions(this.state);
        this.ghostStickers?.updateVisibleEdges(
            visibleFaces,
            hiddenFaces,
            this.state.isTilted,
            this.state.isPitched,
            0
        );
    }
}
