// Timing parity for Circular's selection anchor — the Circular half of the
// reported defect.
//
// Same contract as `src/views/basic/selection-anchor-timing.test.ts`: the anchor
// must be reconciled when the model changes, not when the animation finishes, so
// the same key produces the same move whether or not an animation is still
// running.
//
// Circular's mechanism differs from Basic's — animations are queued per axis in
// a promise chain — so the property is asserted here directly rather than
// inferred from Basic's fix. The animation is made to never settle, which is the
// strongest form of "still running": anything chained on it stays pending for the
// whole test.
import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Face, SUPPORTED_SIZES } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { centerFacePosition } from '@/cube/utils/sticker-position';
import { EventName, MoveExecutedEvent, MoveRequestedEvent } from '@/types';
import { CircularCubeView } from '@/views/circular/circular-view';

/** A promise that never settles — stands in for an animation in flight. */
function pendingAnimation(): void {
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
    const neverSettles = new Promise<void>(() => {});
    Object.defineProperty(HTMLElement.prototype, 'animate', {
        configurable: true,
        value: () => ({ cancel: () => {}, finished: neverSettles }),
    });
}

interface Harness {
    model: CubeController;
    emitted: string[];
    /** The face:position the view's selection anchor currently resolves to. */
    anchor: () => string;
    /** Presses Ctrl+Arrow and delivers the resulting move to the view. */
    press: (key: string) => Promise<void>;
    dispose: () => void;
}

function build(size: number): Harness {
    pendingAnimation();

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

    const anchor = (): string => {
        const id = view.getSelectedSticker();
        if (!id) return 'none';
        const sticker = CubeStateUtils.getStickerById(model.getCurrentState(), id as never);
        return `${sticker?.currentFace}:${sticker?.facePosition}`;
    };

    return {
        model,
        emitted,
        anchor,
        press: async (key: string) => {
            // `handleKeyUp` is where a bound move actually fires.
            view.handleKeyUp(new KeyboardEvent('keyup', { key, ctrlKey: true }) as KeyboardEvent);
            // The controller applies the move and emits MOVE_EXECUTED; deliver it
            // to the view exactly as the app does.
            if (lastEvent) view.updateSelective(lastEvent);
            await Promise.resolve();
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

describe('Circular selection anchor is reconciled when the model changes', () => {
    afterEach(() => {
        Application.eventBus.removeAllListeners();
        document.body.innerHTML = '';
    });

    it('opens with a selection, so the assertions below are not vacuous', () => {
        const harness = build(5);
        expect(harness.anchor()).not.toBe('none');
        harness.dispose();
    });

    it('keeps the anchor on the front face while the animation is still in flight', async () => {
        // The anchor is spatial — a face plus a face position — so after a move it
        // still names the same *slot*, resolving to whichever sticker now occupies
        // it. That slot is on the front face, which is what the user sees.
        //
        // The reported defect made the anchor name the pre-move *sticker* instead,
        // which after this move has travelled to the right face: the anchor left
        // the front face and the next key turned the wrong layer.
        const harness = build(5);
        const faceBefore = harness.anchor().split(':')[0];

        await harness.press('ArrowRight');
        expect(harness.anchor().split(':')[0]).toBe(faceBefore);

        await harness.press('ArrowUp');
        expect(harness.anchor().split(':')[0]).toBe(faceBefore);

        harness.dispose();
    });

    it('turns the layer the selection sits in, not the layer it sat in before', async () => {
        // With a stale anchor the second key targeted the wrong axis entirely,
        // emitting a slice move on Z (3S') where the selection called for Y (3M').
        const harness = build(5);

        await harness.press('ArrowRight');
        await harness.press('ArrowUp');

        expect(harness.emitted).toHaveLength(2);
        // Two presses on perpendicular keys must not collapse to the same move.
        expect(harness.emitted[0]).not.toBe(harness.emitted[1]);
        // The stale-frame answer is a Z-axis slice; the correct answer is Y-axis.
        expect(harness.emitted[1]).toMatch(/M/);
        expect(harness.emitted[1]).not.toMatch(/S/);

        harness.dispose();
    });

    it.each(SUPPORTED_SIZES.filter(n => n > 3))(
        'keeps the anchor on the front face at size %i',
        async size => {
            const harness = build(size);
            const face = harness.anchor().split(':')[0];

            await harness.press('ArrowRight');
            const afterFirst = harness.anchor().split(':')[0];
            await harness.press('ArrowUp');
            const afterSecond = harness.anchor().split(':')[0];

            expect([afterFirst, afterSecond], `size ${size}: anchor left the front face`).toEqual([
                face,
                face,
            ]);

            harness.dispose();
        }
    );
});
