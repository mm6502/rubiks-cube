// Circular's selection must end up on the circle the user sees, and must agree
// whichever way the animation was timed.
//
// Two things are asserted here that an earlier version of this suite missed, and
// the omission is why a regression reached review:
//
//  1. *Which SVG circle is highlighted*, not just which sticker the view
//     reports. Circular keeps a sticker id, a spatial anchor, and the highlighted
//     circle, and they can disagree — the reported sticker was right while the
//     highlight sat on the wrong face.
//  2. Animations that actually **settle**. Holding every animation pending
//     forever tests only the in-flight window; the defect appeared once an
//     animation finished, because the completion callback also writes a
//     selection.
//
// The animation is driven explicitly so each move can be settled on its own,
// which is how the slow and fast paths are told apart.
import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Face, SUPPORTED_SIZES } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { centerFacePosition } from '@/cube/utils/sticker-position';
import { EventName, MoveExecutedEvent, MoveRequestedEvent } from '@/types';
import { CircularCubeView } from '@/views/circular/circular-view';
import styles from '@/views/circular/circular.module.css';

interface Harness {
    emitted: string[];
    /** The face of the circle currently carrying the selected class. */
    highlightedFace: () => string;
    /** How many circles carry the selected class. */
    highlightedCount: () => number;
    /** The sticker id the view reports as selected. */
    reported: () => string | undefined;
    /** The face of the sticker the view reports as selected. */
    reportedFace: () => string;
    /** Presses Ctrl+Arrow and hands the resulting move to the view. */
    press: (key: string) => void;
    /** Lets every animation created so far finish. */
    settle: () => Promise<void>;
    dispose: () => void;
}

/**
 * Builds a Circular view whose animations are individually controllable.
 *
 * Every `animate()` call gets its own resolver, so a test can settle one move at
 * a time (slow input) or let several pile up and settle together (fast input).
 */
function build(size: number): Harness {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: () => ({
            matches: false,
            media: '(prefers-reduced-motion: reduce)',
            addEventListener: () => {},
            removeEventListener: () => {},
        }),
    });

    const pending: Array<() => void> = [];
    // `Element.prototype`, not `HTMLElement.prototype`: Circular animates SVG
    // circles, and SVGElement does not inherit from HTMLElement — a mock on
    // HTMLElement silently leaves these animations undefined, so they never
    // complete and the completion callback under test never runs. Existing
    // Circular suites patch `Element.prototype` for the same reason.
    Object.defineProperty(Element.prototype, 'animate', {
        configurable: true,
        value: () => {
            let resolve!: () => void;
            const finished = new Promise<void>(r => (resolve = r));
            pending.push(resolve);
            return { cancel: () => {}, finished };
        },
    });

    const model = new CubeController(size);
    const container = document.createElement('div');
    document.body.appendChild(container);
    // The concrete class, not the factory's `CubeView` interface: the test needs
    // `updateSelected` / `getSelectedSticker`, which are view-specific.
    const view = new CircularCubeView();
    view.create(container, model);

    const emitted: string[] = [];
    const onMoveRequested = (event: MoveRequestedEvent): void => {
        emitted.push(event.moveNotation);
    };
    let lastEvent: MoveExecutedEvent | undefined;
    const onMoveExecuted = (event: MoveExecutedEvent): void => {
        lastEvent = event;
    };
    Application.eventBus.on(EventName.MOVE_REQUESTED, onMoveRequested);
    Application.eventBus.on(EventName.MOVE_EXECUTED, onMoveExecuted);

    const centre = CubeStateUtils.getStickerAt(
        model.getCurrentState(),
        Face.F,
        centerFacePosition(size)
    );
    expect(centre, `size ${size} has a front centre`).toBeDefined();
    view.updateSelected(centre!.id);

    const internal = (): { svgElementCache: Map<string, SVGCircleElement> } =>
        (view as unknown as { state: { svgElementCache: Map<string, SVGCircleElement> } }).state;

    const selectedCircles = (): SVGCircleElement[] =>
        [...internal().svgElementCache.values()].filter(circle =>
            circle.classList.contains(styles['selected'])
        );

    const reportedFace = (): string => {
        const id = view.getSelectedSticker();
        if (!id) return 'none';
        const sticker = CubeStateUtils.getStickerById(model.getCurrentState(), id as never);
        return `${sticker?.currentFace}`;
    };

    const drain = async (n: number): Promise<void> => {
        for (let i = 0; i < n; i++) await Promise.resolve();
    };

    return {
        emitted,
        highlightedFace: () => {
            const circles = selectedCircles();
            return circles.length === 0 ? 'NONE' : (circles[0].getAttribute('data-face') ?? '?');
        },
        highlightedCount: () => selectedCircles().length,
        reported: () => view.getSelectedSticker() as string | undefined,
        reportedFace,
        press: (key: string) => {
            // `handleKeyUp` is where a bound move actually fires.
            view.handleKeyUp(new KeyboardEvent('keyup', { key, ctrlKey: true }) as KeyboardEvent);
            // The controller applies the move and emits MOVE_EXECUTED; deliver it
            // to the view exactly as the app does.
            if (lastEvent) view.updateSelective(lastEvent);
        },
        settle: async () => {
            // Resolve animations in waves: settling one can start another, so a
            // single pass would leave the chain unfinished.
            for (let round = 0; round < 4; round++) {
                const batch = pending.splice(0, pending.length);
                batch.forEach(resolve => resolve());
                await drain(8);
            }
        },
        dispose: () => {
            // Remove every subscription made here: these are global listeners, so
            // a leaked one keeps reacting to a later harness's moves.
            Application.eventBus.off(EventName.MOVE_REQUESTED, onMoveRequested);
            Application.eventBus.off(EventName.MOVE_EXECUTED, onMoveExecuted);
            view.destroy();
            container.remove();
        },
    };
}

const KEYS = ['ArrowRight', 'ArrowUp'];

// The animation and media-query stubs are raw `Object.defineProperty` writes, and
// `vi.restoreAllMocks()` does not unwind those — it only restores `vi.spyOn`
// spies. Without the restore below, a stub outlives its own test and a later test
// in the same worker silently sees it. Verified by probe: the patched
// `Element.prototype.animate` was still present after this suite's teardown.
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
const originalElementAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');

afterEach(() => {
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    else Reflect.deleteProperty(window, 'matchMedia');

    if (originalElementAnimate) {
        Object.defineProperty(Element.prototype, 'animate', originalElementAnimate);
    } else {
        Reflect.deleteProperty(Element.prototype, 'animate');
    }
});

describe('Circular selection ends up on the circle the user sees', () => {
    afterEach(() => {
        Application.eventBus.removeAllListeners();
        document.body.innerHTML = '';
    });

    it('opens with exactly one highlighted circle on the front face', () => {
        // Guards against every assertion below passing vacuously.
        const harness = build(5);
        expect(harness.highlightedCount()).toBe(1);
        expect(harness.highlightedFace()).toBe('F');
        harness.dispose();
    });

    it('keeps the highlight on the front face when each animation settles (slow input)', async () => {
        // The reported slow path: the selection ended on the face opposite the
        // rotation.
        const harness = build(5);

        for (const key of KEYS) {
            harness.press(key);
            await harness.settle();
        }

        expect(harness.highlightedCount(), 'exactly one circle is selected').toBe(1);
        expect(harness.highlightedFace(), 'highlight stays on the front face').toBe('F');

        harness.dispose();
    });

    it('leaves the highlight on the front face when both moves are in flight (fast input)', async () => {
        const harness = build(5);

        // Both presses land before either animation finishes.
        for (const key of KEYS) harness.press(key);
        await harness.settle();

        // Assert the face that is *expected*, not merely the absence of one wrong
        // face: `not.toBe('D')` also passed on 'NONE' (nothing highlighted) and on
        // every other wrong face, so it could not distinguish a correct result
        // from a different regression.
        expect(harness.highlightedCount(), 'exactly one circle is selected').toBe(1);
        expect(harness.highlightedFace(), 'highlight stays on the front face').toBe('F');

        harness.dispose();
    });

    it('reaches the same highlighted face whichever way the input was timed', async () => {
        const slow = build(5);
        for (const key of KEYS) {
            slow.press(key);
            await slow.settle();
        }
        // Pin both sides before comparing. `NONE` (no circle marked) is not a face,
        // so two empty highlights would otherwise satisfy the equality below — the
        // parity assertion could pass while both paths were broken.
        expect(slow.highlightedCount(), 'slow path highlights one circle').toBe(1);
        const slowFace = slow.highlightedFace();
        expect(slowFace, 'slow path reaches a real face').not.toBe('NONE');
        slow.dispose();

        Application.eventBus.removeAllListeners();
        document.body.innerHTML = '';

        const fast = build(5);
        for (const key of KEYS) fast.press(key);
        await fast.settle();
        expect(fast.highlightedCount(), 'fast path highlights one circle').toBe(1);
        const fastFace = fast.highlightedFace();
        expect(fastFace, 'fast path reaches a real face').not.toBe('NONE');
        fast.dispose();

        expect(fastFace).toBe(slowFace);
    });

    it('highlights the circle matching the sticker the view reports', async () => {
        // The three representations — reported sticker, spatial anchor, and
        // highlighted circle — must agree, since the user only sees the last one.
        const harness = build(5);

        for (const key of KEYS) {
            harness.press(key);
            await harness.settle();

            expect(harness.reported(), 'a selection is reported').toBeDefined();
            expect(harness.highlightedCount(), 'one highlight').toBe(1);
            expect(harness.highlightedFace()).toBe(harness.reportedFace());
        }

        harness.dispose();
    });

    it.each([...SUPPORTED_SIZES])(
        'keeps exactly one highlight on the front face at size %i',
        async size => {
            const harness = build(size);

            for (const key of KEYS) {
                harness.press(key);
                await harness.settle();
            }

            expect(harness.highlightedCount(), `size ${size}`).toBe(1);
            expect(harness.highlightedFace(), `size ${size}`).toBe('F');

            harness.dispose();
        }
    );
});
