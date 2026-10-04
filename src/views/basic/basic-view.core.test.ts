import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Face, QuarterTurn, SUPPORTED_SIZES } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { centerFacePosition } from '@/cube/utils/sticker-position';
import { type LogEntry, LogLevel, logger } from '@/diagnostics/logger';
import { EventName } from '@/types';

import * as rendering from './rendering';
import { BasicView, BasicViewState } from './basic-view';

// Exercises the "core" surface of BasicView which is not covered by the
// more specialized navigation and manual-rotation suites.

describe('BasicView core API', () => {
    let view: BasicView;
    let model: CubeController;
    let container: HTMLElement;

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-back' });
        container = document.createElement('div');
        view.create(container, model);
    });

    it('should report the configured view type and expose the cube element', () => {
        // Arrange - view created in beforeEach

        // Act
        const type = view.getViewType();
        const elt = view.getCubeElement();

        // Assert
        expect(type).toBe('basic-back');
        expect(elt).toBeInstanceOf(HTMLElement);
    });

    it('makes the container focusable and claims focus when contacted (U4)', () => {
        // Arrange — focus on a control outside the view is the state the reported
        // defect occurred in. Basic had no coverage for this at all.
        //
        // The container must be in the document: a detached element cannot hold
        // focus, and `focusViewContainer` deliberately declines to try.
        document.body.appendChild(container);
        const outside = document.createElement('input');
        document.body.appendChild(outside);
        outside.focus();
        expect(document.activeElement).toBe(outside);

        // Act
        container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

        // Assert — the container is focusable *and* actually takes focus, which is
        // what stops an arrow key also reaching the outside control.
        expect(container.tabIndex).toBe(0);
        expect(document.activeElement).toBe(container);

        outside.remove();
        container.remove();
    });

    it('contacting the view raises no uncaught error from its hit test', () => {
        // A pointer-down reaches the touch handler, which hit-tests the point under
        // the pointer to decide whether the gesture starts on a sticker. That hit
        // test needs `document.elementFromPoint` — absent in jsdom, present in every
        // browser — and it runs inside a DOM listener.
        //
        // This is the assertion that was missing. Without it the throw was invisible:
        // an exception inside a listener does not fail a vitest test. jsdom reports it
        // by dispatching a `window` error event, and the app's own global handler
        // catches that, logs it, and calls `stopImmediatePropagation()` — so a test
        // cannot observe it with its own `window` listener. The logger listener is the
        // route that survives, and it is exactly what CI printed: an `ERROR Uncaught
        // error: …` line on stderr under a passing suite.
        document.body.appendChild(container);

        const logged: string[] = [];
        const listener = (entry: LogEntry): void => {
            if (entry.level === LogLevel.ERROR) logged.push(entry.args.map(String).join(' '));
        };
        logger.addListener(listener);
        try {
            container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        } finally {
            logger.removeListener(listener);
            container.remove();
        }

        expect(logged, 'pointer-down must not log an uncaught error').toEqual([]);
    });

    it('getCommands returns a full command list and running actions updates state', () => {
        // Arrange
        const spyEmit = vi.spyOn(Application.eventBus, 'emit');
        // These stubs must return the shape the real functions do: `updateRotation`
        // now reports whether the rotation settled or is still ramping, and the
        // view closes its rotation on that answer.
        vi.spyOn(rendering as any, 'updateRotation').mockImplementation(() => ({
            kind: 'settled',
        }));
        vi.spyOn(rendering as any, 'updateFaceLabels').mockImplementation(() => {});

        // Act
        const commands = view.getCommands();
        const ids = commands.map(c => c.id);

        // Assert list properties
        expect(commands.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);

        // Undo/redo present and use view-type-scoped IDs
        expect(ids).toContain('basic-back.undo');
        expect(ids).toContain('basic-back.redo');
        const undo = commands.find(c => c.id === 'basic-back.undo')!;
        const redo = commands.find(c => c.id === 'basic-back.redo')!;
        expect(undo.showInHeader).toBe(true);
        expect(redo.showInHeader).toBe(true);
        // No moves made yet ΓÇö both should be disabled
        expect(undo.isEnabled!()).toBe(false);
        expect(redo.isEnabled!()).toBe(false);

        // Arrange further for command actions
        const tilt = commands.find(c => c.id === 'tilt-view');
        const pitch = commands.find(c => c.id === 'pitch-view');
        const reset = commands.find(c => c.id === 'reset-view');
        expect(tilt).toBeDefined();
        expect(pitch).toBeDefined();
        expect(reset).toBeDefined();

        // Act/Assert tilt
        expect((view as any).state.isTilted).toBe(false);
        tilt!.action();
        expect((view as any).state.isTilted).toBe(true);
        expect(spyEmit).toHaveBeenCalledWith(EventName.VIEW_STATE_CHANGED, {
            viewType: view.getViewType(),
        });

        // Act/Assert pitch
        expect((view as any).state.isPitched).toBe(false);
        pitch!.action();
        expect((view as any).state.isPitched).toBe(true);

        // Act/Assert reset behaviour ΓÇö rotateViewLeft changes vectors; reset restores defaults
        view.rotateViewLeft();
        reset!.action();
        // After reset, back-variant default: vF = (0,0,-1)
        expect((view as any).state.viewForward).toEqual({ x: 0, y: 0, z: -1 });
        expect((view as any).state.viewRight).toEqual({ x: -1, y: 0, z: 0 });
        expect((view as any).state.viewUp).toEqual({ x: 0, y: 1, z: 0 });
    });

    it('getState and setState allow persisting/restoring the view state', () => {
        // Arrange: rotate the view and set aesthetic flags
        view.rotateViewLeft();
        (view as any).state.isTilted = true;

        // Act: capture state
        const persisted = view.getState();

        // Assert persisted structure ΓÇö vectors reflect the rotation
        expect(persisted).toEqual<BasicViewState>({
            viewRight: { x: 0, y: 0, z: 1 }, // after rotateViewLeft from back default
            viewUp: { x: 0, y: 1, z: 0 },
            viewForward: { x: -1, y: 0, z: 0 },
            isTilted: true,
            isPitched: false,
            faceDirectMode: false,
            linked: true,
            ghostOpacityIndex: 0,
        });

        // Arrange: fresh view
        const another = new BasicView({ viewType: 'basic-back' });
        another.create(container, model);

        // Act: restore state
        another.setState(persisted);

        // Assert restoration
        expect((another as any).state.isTilted).toBe(true);
        expect((another as any).state.viewForward).toEqual({ x: -1, y: 0, z: 0 });

        // Act & Assert: garbage inputs don't throw
        another.setState(null);
        another.setState({});
        another.setState({ isTilted: 'nope' } as any);

        // Act & Assert: old-format state (xRotation present) silently resets to default
        another.setState({ xRotation: QuarterTurn.QUARTER, yRotation: 0, zRotation: 0 });
        expect((another as any).state.viewForward).toEqual({ x: 0, y: 0, z: -1 }); // back default
    });

    it('public helpers delegate to the rendering module', () => {
        // Arrange — spy on the module functions the view delegates to
        const updateSpy = vi.spyOn(rendering, 'update').mockImplementation(() => {});
        const resizeSpy = vi.spyOn(rendering, 'resize').mockImplementation(() => {});
        vi.spyOn(rendering, 'getMinimumSize').mockReturnValue({ width: 111, height: 222 });

        // Act & Assert
        view.update(model);
        expect(updateSpy).toHaveBeenCalledWith(expect.anything(), model);

        view.resize();
        expect(resizeSpy).toHaveBeenCalled();

        expect(view.getMinimumSize()).toEqual({ width: 111, height: 222 });

        vi.restoreAllMocks();
    });

    it('destroy clears references', () => {
        // Arrange
        const elt = view.getCubeElement();
        expect(elt).toBeInstanceOf(HTMLElement);

        // Act
        view.destroy();

        // Assert
        expect(view.getCubeElement()).toBeNull();
        expect((view as any).state.container).toBeNull();
        expect((view as any).state.model).toBeUndefined();
    });
});

// The default selection used to hardcode face position 4, which only exists at
// 3×3. `getStickerAt` returns undefined rather than throwing when nothing
// matches, and every call site guarded with `if (sticker)`, so at other sizes the
// view opened with nothing selected — and at 4×4+ with an off-center sticker.
// These tests pin the size-correct behavior for every supported size.
describe('BasicView default selection', () => {
    const createView = (viewType: string, cubeSize: number) => {
        const model = new CubeController(cubeSize);
        const container = document.createElement('div');
        const view = new BasicView({ viewType });
        view.create(container, model);
        return { view, model, container };
    };

    it.each(SUPPORTED_SIZES)('opens with a sticker selected at size %i', cubeSize => {
        const { view } = createView('basic-front', cubeSize);

        // The defect: this was undefined at 2×2 and every other non-3 size.
        expect(view.getSelectedSticker()).toBeDefined();
    });

    it.each(SUPPORTED_SIZES)('selects the center of the variant face at size %i', cubeSize => {
        const front = createView('basic-front', cubeSize);
        const back = createView('basic-back', cubeSize);

        // Assert exact identity, not merely definedness: a definedness-only
        // assertion would stay green if the helper were "simplified" to
        // floor(cubeSize/2), which yields an edge sticker at 3×3.
        const expectedPosition = centerFacePosition(cubeSize);

        const expectedFront = CubeStateUtils.getStickerAt(
            front.model.getCurrentState(),
            Face.F,
            expectedPosition
        );
        const expectedBack = CubeStateUtils.getStickerAt(
            back.model.getCurrentState(),
            Face.B,
            expectedPosition
        );

        expect(front.view.getSelectedSticker()).toBe(expectedFront?.id);
        expect(back.view.getSelectedSticker()).toBe(expectedBack?.id);
    });

    it.each([2, 4, 6])('back variant selects a B-face sticker at size %i', cubeSize => {
        const { view, model } = createView('basic-back', cubeSize);
        const selectedId = view.getSelectedSticker();

        expect(selectedId).toBeDefined();

        const sticker = CubeStateUtils.getStickerById(model.getCurrentState(), selectedId!);
        expect(sticker?.currentFace).toBe(Face.B);
    });

    it('keeps 3×3 on the F-centre at position 4', () => {
        // 3×3 is the size the old literal happened to be correct for, so this is
        // the regression guard for "the fix changed 3×3 too".
        const { view, model } = createView('basic-front', 3);
        const expected = CubeStateUtils.getStickerAt(model.getCurrentState(), Face.F, 4);

        expect(centerFacePosition(3)).toBe(4);
        expect(view.getSelectedSticker()).toBe(expected?.id);
    });
});

// =========================================================================
// U4: resize settles in-flight animation
// =========================================================================

describe('BasicView resize settles in-flight animation', () => {
    let view: BasicView;
    let model: CubeController;
    let container: HTMLElement;

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-back' });
        container = document.createElement('div');
        view.create(container, model);
    });

    it('resize with no animation leaves animation state untouched', () => {
        // Arrange — no animation has been started.
        const pivotBefore = (view as any).pivot;

        // Act
        view.resize();

        // Assert — no pivot was created, animation state is null.
        const pivotAfter = (view as any).pivot;
        expect(pivotAfter).toBe(pivotBefore);
        expect((view as any).activeAnimation).toBeNull();
    });

    it('resize during a move animation cancels it and removes the pivot', () => {
        // Arrange — start a move to create an animation.
        (view as any).beginRotation();
        (view as any).activeAnimation = {
            animation: { cancel: vi.fn() } as any,
            pivot: document.createElement('div'),
            cubieElements: [],
            event: {
                moveDetails: {
                    movedCubies: {
                        before: [],
                        after: [],
                    },
                },
            },
        };

        const pivotEl = (view as any).activeAnimation.pivot;
        container.appendChild(pivotEl);

        // Act
        view.resize();

        // Assert — pivot was removed, animation was cancelled.
        expect(pivotEl.parentNode).toBeNull();
        expect((view as any).activeAnimation).toBeNull();
    });

    /**
     * Builds a viewed 3×3 with a real, still-pending move animation whose layer
     * cubies are the live DOM elements the pivot actually holds.
     *
     * A synthetic `activeAnimation` (as the two tests above use) cannot express the
     * defect: the bug is that the *detached* elements the animation still holds get
     * re-inserted by `finalizeLayer`, so the fixture has to carry the real elements
     * the pivot reparents.
     *
     * Returns the view it built — the caller must assert against *that* view, not the
     * `beforeEach` one, or the assertions pass vacuously.
     */
    function startRealMove(size: number = 3): {
        view: BasicView;
        model: CubeController;
        pivot: HTMLElement;
        cubieElements: HTMLElement[];
    } {
        const controller = new CubeController(size);
        const v = new BasicView({ viewType: 'basic-front' });
        const c = document.createElement('div');
        Object.defineProperty(c, 'clientWidth', { value: 600 });
        Object.defineProperty(c, 'clientHeight', { value: 600 });
        document.body.appendChild(c);
        v.create(c, controller);

        const cubeEl = v.getCubeElement()!;
        const result = controller.applyMove('R', true)!;
        const movedBefore = result.movedCubies.before.map(m => m.id);
        const cubieElements = movedBefore
            .map(id => cubeEl.querySelector<HTMLElement>(`[data-cubie-id="${id}"]`))
            .filter((el): el is HTMLElement => el !== null);
        expect(cubieElements.length).toBeGreaterThan(0);

        // Mirror the real animated branch: hole the layer out into a pivot.
        const pivot = document.createElement('div');
        pivot.style.cssText =
            `position:absolute;left:0;top:0;transform-origin:150px 150px 0;` +
            `transform-style:preserve-3d;width:0;height:0;`;
        cubeEl.appendChild(pivot);
        cubieElements.forEach(el => pivot.appendChild(el));

        (v as any).beginRotation();
        (v as any).activeAnimation = {
            animation: { cancel: vi.fn() },
            pivot,
            cubieElements,
            event: {
                moveDetails: {
                    notation: 'R',
                    definition: { axis: 'x', angle: 90 },
                    movedCubies: { before: [], after: result.movedCubies.after },
                },
            },
        };

        return { view: v, model: controller, pivot, cubieElements };
    }

    it('update during a move animation re-parents the layer exactly once', () => {
        // The reported defect: in tabbed mode a tap on an already-visible panel
        // calls `view.update()`, which rebuilds the cubie DOM — but it left the
        // in-flight move animation alive. When that animation finished,
        // `finalizeLayer` moved its now-detached elements back into the cube, so one
        // layer existed twice: once at rest and once animating. Duplicated
        // `data-cubie-id`s are the observable signature.
        const started = startRealMove();
        const subject = started.view;
        const subjectModel = started.model;
        const panel = subject.getCubeElement()!;

        // Sanity: before the rebuild the layer lives in the pivot, not the cube.
        expect(started.cubieElements.every(el => el.parentElement === started.pivot)).toBe(true);
        expect(panel.contains(started.pivot)).toBe(true);

        // Act — the panel-focus path.
        subject.update(subjectModel);

        // Assert — the interrupted animation is settled.
        expect((subject as any).activeAnimation).toBeNull();

        // ...the pivot is gone (so a later `finished` has nothing to re-insert)...
        expect(started.pivot.isConnected).toBe(false);
        expect(panel.contains(started.pivot)).toBe(false);

        // ...and the layer's elements are NOT re-attached by the settle. Asserting
        // only "activeAnimation is null" would also pass for a fix that merely drops
        // the reference, leaking the pivot and its holed-out cubies — so pin that the
        // old elements are gone from the tree entirely, not just forgotten.
        expect(started.cubieElements.some(el => el.isConnected)).toBe(false);

        // The rebuild left exactly one element per surface cubie, reachable through
        // the same descendant query every consumer uses.
        const ids = Array.from(panel.querySelectorAll('[data-cubie-id]')).map(el =>
            el.getAttribute('data-cubie-id')
        );
        const seen = new Map<string, number>();
        for (const id of ids) seen.set(id!, (seen.get(id!) || 0) + 1);
        const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
        expect(duplicated, 'no cubie id may appear twice after an update').toEqual([]);
        expect(ids.length, 'every surface cubie is present exactly once').toBe(seen.size);
    });
});
