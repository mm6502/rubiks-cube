// Timing parity for the selection anchor.
//
// The anchor (`selectedFace` + `selectedCubiePosition`) is what inference reads
// to decide which layer a Ctrl+Arrow turns. It must be reconciled as soon as the
// model changes, because the animation is purely cosmetic — the model is already
// updated when MOVE_EXECUTED fires.
//
// The reported defect: Basic and Circular reconciled the anchor inside the
// animation's completion callback instead, so a key pressed while the animation
// was still running inferred its move from the pre-move frame and produced a
// different notation than the same input produced with the animation finished
// (`3S'` instead of `3M'` on a 5×5).
//
// These tests assert the property — the same input yields the same notation
// whatever the animation is doing — rather than one blessed notation, so they
// stay meaningful if the inference rules themselves change.
import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Face, SUPPORTED_SIZES } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { centerFacePosition } from '@/cube/utils/sticker-position';
import { EventName, MoveExecutedEvent, MoveRequestedEvent } from '@/types';
import { BasicView } from '@/views/basic/basic-view';

interface Harness {
    model: CubeController;
    view: BasicView;
    emitted: string[];
    /** Releases the pending animation so its `.then` callbacks run. */
    resolveAnimation: () => Promise<void>;
    /** The most recent MOVE_EXECUTED event, as the view receives it. */
    moveEvent: () => unknown;
    /** Unsubscribes this harness so it cannot react to later harnesses' moves. */
    dispose: () => void;
}

/** How the animation is allowed to behave for a given scenario. */
type AnimationMode = 'pending' | 'resolved' | 'none';

/**
 * Builds a Basic view with the front centre selected, plus a recorded
 * MOVE_EXECUTED event, under the requested animation behaviour.
 */
function build(size: number, mode: AnimationMode): Harness {
    let resolvePending: () => void = () => {};
    const finished = new Promise<void>(resolve => (resolvePending = resolve));

    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: () => ({
            // `none` takes the non-animated branch: animateMove returns null.
            matches: mode === 'none',
            media: '(prefers-reduced-motion: reduce)',
            addEventListener: () => {},
            removeEventListener: () => {},
        }),
    });

    // A controllable animation: `finished` settles only when the test says so.
    Object.defineProperty(HTMLElement.prototype, 'animate', {
        configurable: true,
        value: () => ({ cancel: () => {}, finished }),
    });

    const model = new CubeController(size);
    const view = new BasicView({ viewType: 'basic-front' });
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 600 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    document.body.appendChild(container);
    view.create(container, model);

    const centre = CubeStateUtils.getStickerAt(
        model.getCurrentState(),
        Face.F,
        centerFacePosition(size)
    );
    expect(centre, `size ${size} has a front centre`).toBeDefined();
    view.updateSelected(centre!.id);

    let lastEvent: unknown;
    const emitted: string[] = [];
    const onMoveExecuted = (event: MoveExecutedEvent): void => {
        lastEvent = event;
    };
    Application.eventBus.on(EventName.MOVE_EXECUTED, onMoveExecuted);

    const onMoveRequested = (event: MoveRequestedEvent): void => {
        emitted.push(event.moveNotation);
    };
    Application.eventBus.on(EventName.MOVE_REQUESTED, onMoveRequested);

    return {
        model,
        view,
        emitted,
        moveEvent: () => lastEvent,
        dispose: () => {
            // Every subscription made for this harness is removed here: the
            // controller and view subscribe globally, so a leaked one would keep
            // reacting to a later harness's moves and double its emissions.
            Application.eventBus.off(EventName.MOVE_EXECUTED, onMoveExecuted);
            Application.eventBus.off(EventName.MOVE_REQUESTED, onMoveRequested);
            view.destroy();
            model.dispose();
            container.remove();
        },
        resolveAnimation: async () => {
            resolvePending();
            // Let the `.then` chain and any nested microtasks drain.
            for (let i = 0; i < 5; i++) await Promise.resolve();
        },
    };
}

describe('Basic selection anchor is reconciled when the model changes', () => {
    afterEach(() => {
        Application.eventBus.removeAllListeners();
        document.body.innerHTML = '';
    });

    /**
     * Presses each key in turn, delivering each resulting move to the view while
     * leaving the animation in the requested state.
     *
     * The move itself is applied by the controller's own MOVE_REQUESTED
     * subscription — the real path — rather than by the test, so the sequence
     * cannot diverge from the app's.
     */
    async function sequence(mode: AnimationMode, keys: string[], size = 5): Promise<string[]> {
        const harness = build(size, mode);

        for (const key of keys) {
            harness.view.handleKeyUp(
                new KeyboardEvent('keyup', { key, ctrlKey: true }) as KeyboardEvent
            );
            // The controller has already applied it and emitted MOVE_EXECUTED.
            harness.view.updateSelective(harness.moveEvent() as never);

            if (mode === 'resolved') {
                await harness.resolveAnimation();
            } else {
                await Promise.resolve();
            }
        }

        harness.dispose();
        return harness.emitted;
    }

    const KEYS = ['ArrowRight', 'ArrowUp'];

    it('produces the same notation whether the animation is pending or resolved', async () => {
        // The reported defect: these two disagreed on the second move.
        const pending = await sequence('pending', KEYS);
        const resolved = await sequence('resolved', KEYS);

        expect(pending).toEqual(resolved);
        // Not merely equal but non-trivial: the sequence must actually turn two
        // different layers, or an implementation that always returned the same
        // move would pass.
        expect(pending).toHaveLength(2);
        expect(pending[0]).not.toBe(pending[1]);
    });

    it('produces the same notation when animations are disabled entirely', async () => {
        // Reduced motion takes the non-animated branch. If the anchor were only
        // reconciled by the animation callback, this path would never reconcile.
        const pending = await sequence('pending', KEYS);
        const noAnimation = await sequence('none', KEYS);

        expect(noAnimation).toEqual(pending);
    });

    it.each(SUPPORTED_SIZES.filter(n => n > 3))('agrees across timings at size %i', async size => {
        const pending = await sequence('pending', KEYS, size);
        const resolved = await sequence('resolved', KEYS, size);

        expect(pending, `size ${size}`).toEqual(resolved);
    });

    it('keeps the selection marked in the DOM on the non-animated path', async () => {
        // The rebuild in updateCubiePositions replaces every sticker element, so
        // derived markup like the `selected` class is dropped unless re-applied.
        const harness = build(5, 'none');
        const styles = (await import('@/views/basic/basic-view.module.css')).default;

        harness.model.applyMove('3E', false, false, true);
        harness.view.updateSelective(harness.moveEvent() as never);
        await Promise.resolve();

        const marked = document.querySelectorAll(`.${styles.selected}`);
        expect(marked).toHaveLength(1);
        expect(marked[0].getAttribute('data-sticker-id')).toBe(harness.view.getSelectedSticker());

        harness.dispose();
    });
});

// ─── Orientation entry points keep the selection visible ────────────────────
//
// The re-anchor contract has to hold at *every* entry point that changes the
// view's orientation, not only the arrow-key path. These cover the two that
// previously did not: restoring a saved state, and `alignCubeToView`.
//
// The defect class: the selection is a sticker id plus a spatial anchor, and an
// orientation change moves which faces the user can see without touching either.
// An entry point that skips the re-anchor can therefore leave the selection on a
// face behind the cube, with `getSelectedSticker()` still reporting it happily.
describe('every orientation entry point keeps the selection visible', () => {
    afterEach(() => {
        Application.eventBus.removeAllListeners();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    /**
     * The face the user is looking at, per the view's own orientation rule.
     *
     * Asserting against `viewFrontFace` rather than a private field keeps this
     * reading the same notion of "visible" the app itself uses.
     */
    async function frontFace(view: BasicView): Promise<string> {
        const { viewFrontFace } = await import('@/views/basic/navigation');
        const state = (view as unknown as { state: Parameters<typeof viewFrontFace>[0] }).state;
        return `${viewFrontFace(state)}`;
    }

    /** The face the reported selection currently sits on. */
    function selectedFace(harness: Harness): string {
        const selected = harness.view.getSelectedSticker();
        expect(selected, 'a selection exists').toBeDefined();
        const sticker = CubeStateUtils.getStickerById(
            harness.model.getCurrentState(),
            selected as never
        );
        expect(sticker, 'the reported sticker exists in the model').toBeDefined();
        return `${sticker!.currentFace}`;
    }

    it('keeps the selection on the front face when a legacy orientation is restored (AE5)', async () => {
        // The legacy payload's presence of xRotation takes the migration branch,
        // which calls `resetView`.
        //
        // Scope note, measured: this asserts the *invariant*, and it passes with
        // either capture ordering in `setState` — `reanchorSelection` resolves
        // against the front face at call time, so visibility does not depend on
        // when the cell was captured. The ordering is therefore intent (keep this
        // visual cell), not a visibility fix. Kept as an invariant guard.
        const harness = build(3, 'none');

        harness.view.setState({ xRotation: 0, yRotation: 90, zRotation: 0 });

        expect(selectedFace(harness)).toBe(await frontFace(harness.view));

        harness.dispose();
    });

    it('keeps the selection on the front face when an orientation-vector state is restored', async () => {
        const harness = build(3, 'none');

        // The non-migration branch, which assigns the vectors directly.
        harness.view.setState({
            viewRight: { x: 0, y: 0, z: -1 },
            viewUp: { x: 0, y: 1, z: 0 },
            viewForward: { x: 1, y: 0, z: 0 },
        });

        expect(selectedFace(harness)).toBe(await frontFace(harness.view));

        harness.dispose();
    });

    it('keeps the selection on the front face after alignCubeToView', async () => {
        // `alignCubeToView` changes the front face (measured: rotate-left then
        // align goes R -> F), so it is held to the same contract as the other
        // orientation commands.
        //
        // Honest scope note: this test asserts the *invariant*, and it passes
        // whether or not `alignCubeToView` carries the wrapper — the command
        // emits whole-cube moves, so the model changes and the MOVE_EXECUTED
        // path already re-resolves the selection by position. It is a genuine
        // invariant guard, not proof of the wrapper. The wrapper's own
        // contribution is covered by the five-command test below.
        const harness = build(3, 'none');

        // Move away from the default orientation first, so align has real work.
        harness.view.rotateViewLeft();
        harness.view.rotateViewUp();

        harness.view.alignCubeToView();

        expect(selectedFace(harness)).toBe(await frontFace(harness.view));

        harness.dispose();
    });

    it('keeps the selection on the front face across the five wrapped commands', async () => {
        // The load-bearing test for the wrapper contract. Verified by negative
        // control: unwrapping `rotateViewLeft` makes this fail with
        // `expected 'F' to be 'R'` — the selection left on the pre-rotation face
        // while the view shows a different one.
        const harness = build(3, 'none');

        const commands: Array<[string, () => void]> = [
            ['rotateViewLeft', () => harness.view.rotateViewLeft()],
            ['rotateViewRight', () => harness.view.rotateViewRight()],
            ['rotateViewUp', () => harness.view.rotateViewUp()],
            ['rotateViewDown', () => harness.view.rotateViewDown()],
            ['resetView', () => harness.view.resetView()],
        ];

        for (const [name, run] of commands) {
            run();

            expect(selectedFace(harness), `after ${name}`).toBe(await frontFace(harness.view));
        }

        harness.dispose();
    });
});
