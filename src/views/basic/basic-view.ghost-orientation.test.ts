// How each orientation-changing path treats the ghost hint strips.
//
// A ghost strip borrows its colour from a hidden face, so for as long as the cube
// is turning that mapping is about to be wrong. The rule is therefore the same
// whichever way the cube is turned: take the strips off screen for the duration,
// then recompute them for the orientation that is now in effect.
//
// That rule is applied through one pair — `beginRotation()` / `endRotation()` —
// because the paths previously disagreed three ways:
//
//   plain arrow crossing an edge   strips went stale and stayed stale (README'd)
//   view rotation (Alt+Arrow)      strips hid, then restored
//   whole-cube move (x/y/z)        strips stayed up and only recoloured
//
// Only the middle one was intentional, and only by accident: it hid because
// `updateVisibleEdges` begins with `hideAllStrips`. The other two simply never
// called it. This suite pins the unified behaviour down, and separately asserts
// that the hide is synchronous — the animated fade-out leaves the strips on
// screen for the length of the opacity transition, i.e. exactly the stale window
// the hide exists to remove.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CubeController } from '@/cube-controller';
import { Axis, QuarterTurn } from '@/cube/types';
import type { MoveExecutedEvent } from '@/types';
import { setGhostOpacityIndex } from '@/views/basic/ghost-stickers';

import { BasicView } from './basic-view';
import { getVisibleFacesWithPositions } from './rendering';

interface Harness {
    view: BasicView;
    model: CubeController;
    /** Builds a MOVE_EXECUTED event of the shape the controller emits. */
    moveEvent: (notation: string) => MoveExecutedEvent;
    /** Settles the in-flight move animation, so the `finished` handler runs. */
    finishAnimation: () => void;
    /** Sets how far through the running ramp the cube is, as 0..1. */
    setProgress: (value: number) => void;
    /**
     * Whether `animateMove` actually started an animation for the last move.
     * False means it fell through to the non-animated branch, so any assertion
     * about mid-turn behaviour would be testing the wrong path.
     */
    animationStarted: () => boolean;
    /** How many animations have been started in total. */
    animationCount: () => number;
    /** How many animations have been cancelled in total. */
    animationsCancelled: () => number;
    strips: () => HTMLElement[];
    release: () => void;
}

// `Element.prototype.animate` and `window.matchMedia` are patched below with raw
// `Object.defineProperty` writes, which `vi.restoreAllMocks()` does not unwind — a
// stub left behind would silently affect a later test in the same worker. jsdom
// provides no `matchMedia` at all, so it is restored by deletion.
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function createHarness(options: { reducedMotion?: boolean } = {}): Harness {
    const model = new CubeController(3);

    // A controllable animation: `finished` settles only when the test asks, and
    // `progress` reports how far through the ramp the cube is (which is what one
    // rotation reads to know where to continue from when it interrupts another).
    //
    // Every call returns a *distinct* object, because the view guards a rotation's
    // completion by animation identity: a shared stub would make a superseded
    // animation indistinguishable from its replacement and hide the very
    // flicker that guard exists to prevent.
    let settle: () => void = () => {};
    let started = 0;
    let cancelled = 0;
    let progress = 0;
    const finished = new Promise<void>(resolve => (settle = resolve));
    Object.defineProperty(HTMLElement.prototype, 'animate', {
        configurable: true,
        writable: true,
        value: () => {
            started++;
            const handle = {
                cancel: () => {
                    cancelled++;
                },
                finished,
                effect: { getComputedTiming: () => ({ progress }) },
            };
            return handle;
        },
    });
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        // A truthy `matches` is the prefers-reduced-motion signal, which makes
        // both `animateMove` and `updateRotation` decline to animate.
        value: () => ({
            matches: options.reducedMotion === true,
            media: '(prefers-reduced-motion: reduce)',
            addEventListener: () => {},
            removeEventListener: () => {},
        }),
    });

    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 600 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    document.body.appendChild(container);

    const view = new BasicView({ viewType: 'basic-front' });
    view.create(container, model);
    view.resize();

    return {
        view,
        model,
        moveEvent: notation => {
            const axis =
                notation.charAt(0) === 'x' ? Axis.X : notation.charAt(0) === 'y' ? Axis.Y : Axis.Z;
            const isWholeCube = /^[xyz]/.test(notation);
            // Real cubie ids, read from the rendered cube. `animateMove` resolves
            // its layer by looking these up in the DOM, so a synthetic id makes it
            // return null and silently takes the NON-animated branch — which is a
            // different code path from the one this suite is about.
            const cubieIds = Array.from(
                view.getCubeElement()!.querySelectorAll<HTMLElement>('[data-cubie-id]')
            )
                .slice(0, 9)
                .map(el => el.getAttribute('data-cubie-id')!);
            return {
                moveDetails: {
                    notation,
                    definition: {
                        name: notation.replace(/['2]/g, ''),
                        axis,
                        layerIndices: isWholeCube ? [0, 1, 2] : [2],
                        angle: notation.includes('2') ? QuarterTurn.HALF : QuarterTurn.QUARTER,
                    },
                    movedCubies: {
                        before: cubieIds.map(id => ({ id, position: { x: 0, y: 0, z: 0 } })),
                        after: [],
                    },
                },
                preState: model.getCurrentState(),
                postState: model.getCurrentState(),
            } as never;
        },
        finishAnimation: () => {
            progress = 1;
            settle();
        },
        setProgress: (value: number) => {
            progress = value;
        },
        animationStarted: () => started > 0,
        animationCount: () => started,
        animationsCancelled: () => cancelled,
        strips: () =>
            Array.from(view.getCubeElement()!.querySelectorAll<HTMLElement>('[data-host-face]')),
        release: () => {
            view.destroy();
            container.remove();
        },
    };
}

/** Strips currently on screen. */
const shownIds = (h: Harness): string[] =>
    h
        .strips()
        .filter(s => s.style.display !== 'none')
        .map(s => `${s.getAttribute('data-host-face')}:${s.getAttribute('data-source-face')}`)
        .sort();

/** Strips the CURRENT orientation says belong on screen. */
function shouldIds(h: Harness): string[] {
    const { visibleFaces, hiddenFaces } = getVisibleFacesWithPositions(
        h.view.getState() as unknown as Parameters<typeof getVisibleFacesWithPositions>[0]
    );
    const visible = new Set(visibleFaces.map(f => f.face));
    const hidden = new Set(hiddenFaces.map(f => f.face));
    return h
        .strips()
        .map(s => `${s.getAttribute('data-host-face')}:${s.getAttribute('data-source-face')}`)
        .filter(id => {
            const [host, src] = id.split(':');
            return visible.has(host as never) && hidden.has(src as never);
        })
        .sort();
}

function enableGhosts(h: Harness): void {
    const cmd = h.view.getCommands().find(c => c.id === 'basic-view.ghost-hints');
    if (!cmd) throw new Error('basic-view.ghost-hints missing');
    cmd.action();
    vi.advanceTimersByTime(250);
}

const pressArrow = (h: Harness, key: string): void => {
    h.view.handleKeyUp(new KeyboardEvent('keyup', { key }) as KeyboardEvent);
};

describe('ghost strips across the orientation-changing paths', () => {
    beforeEach(() => {
        // The opacity index is module-global shared state. Without this reset a
        // later test's toggle starts from 100% and lands back on "off", so no
        // strips appear and the assertions fail for the wrong reason.
        setGhostOpacityIndex(0);
        vi.useFakeTimers();
    });

    afterEach(() => {
        setGhostOpacityIndex(0);
        vi.useRealTimers();
        if (originalAnimate)
            Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
        else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
        if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
        else Reflect.deleteProperty(window, 'matchMedia');
    });

    // PATH 1 — the reported defect. Arrow 1 stays on the front face; arrow 2
    // crosses onto a neighbouring face and rotates the view.
    it('PATH 1: a plain arrow crossing an edge leaves the strips matching the NEW orientation', async () => {
        const h = createHarness();
        try {
            enableGhosts(h);
            pressArrow(h, 'ArrowRight');
            vi.advanceTimersByTime(300);
            expect(shownIds(h), 'step 1 does not rotate, so nothing changes').toEqual(shouldIds(h));

            pressArrow(h, 'ArrowRight');
            // The rotation now animates, so the strips come back when the turn
            // actually settles rather than after the old fixed 250ms.
            expect(shownIds(h), 'off screen while the turn runs').toEqual([]);
            h.finishAnimation();
            await vi.advanceTimersByTimeAsync(300);
            expect(shownIds(h), 'step 2 rotated the view, so the strips must follow').toEqual(
                shouldIds(h)
            );
        } finally {
            h.release();
        }
    });

    // A same-face step does not rotate, so it must leave the strips alone. A fix
    // that refreshed unconditionally would hide and re-fade every strip on each
    // ordinary step, which reads as a flicker while walking the cube.
    it('PATH 1: a step that does not rotate the view leaves the strips untouched', () => {
        const h = createHarness();
        try {
            enableGhosts(h);
            const before = shownIds(h);
            const frontBefore = { ...h.view.getState().viewForward };

            pressArrow(h, 'ArrowDown');
            expect({ ...h.view.getState().viewForward }, 'must not rotate').toEqual(frontBefore);
            expect(shownIds(h)).toEqual(before);
        } finally {
            h.release();
        }
    });

    // PATH 2 — the Alt+Arrow view rotation. Hide during the turn, restore after.
    it('PATH 2: a view rotation hides the strips during the turn, then restores them', async () => {
        const h = createHarness();
        try {
            enableGhosts(h);
            expect(shownIds(h).length).toBe(6);

            h.view.rotateViewRight();
            expect(shownIds(h), 'hidden immediately, for the duration of the turn').toEqual([]);

            h.finishAnimation();
            await vi.advanceTimersByTimeAsync(300);
            expect(shownIds(h), 'restored once the turn settles').toEqual(shouldIds(h));
        } finally {
            h.release();
        }
    });

    it('PATH 2: every view rotation entry point keeps the strips matching the orientation', async () => {
        const h = createHarness();
        try {
            enableGhosts(h);
            const entryPoints: Array<[string, () => void]> = [
                ['rotateViewLeft', () => h.view.rotateViewLeft()],
                ['rotateViewRight', () => h.view.rotateViewRight()],
                ['rotateViewUp', () => h.view.rotateViewUp()],
                ['rotateViewDown', () => h.view.rotateViewDown()],
            ];
            for (const [name, run] of entryPoints) {
                run();
                h.finishAnimation();
                await vi.advanceTimersByTimeAsync(300);
                expect(shownIds(h), `after ${name}`).toEqual(shouldIds(h));
            }
        } finally {
            h.release();
        }
    });

    // PATH 3 — a whole-cube move, driven through the real MOVE_EXECUTED path with
    // a controllable animation so the mid-turn window can be inspected. (Calling
    // `view.update()` instead would take the full-repaint branch and never reach
    // `handleMoveExecuted` at all, so it would prove nothing about this path.)
    it('PATH 3: a whole-cube move hides the strips for the turn and restores them', async () => {
        const h = createHarness();
        try {
            enableGhosts(h);
            const before = shownIds(h);
            expect(before.length).toBe(6);

            const event = h.moveEvent('x');
            h.view.handleMoveExecuted(event);

            // This must be the ANIMATED branch, or the test proves nothing about
            // the path it names: `animateMove` returns null when it cannot resolve
            // the layer in the DOM, and the fallback branch never starts an
            // animation at all.
            expect(h.animationStarted(), 'the move animation actually started').toBe(true);

            expect(shownIds(h), 'off screen while the cube turns').toEqual([]);

            h.finishAnimation();
            await vi.advanceTimersByTimeAsync(400);
            expect(shownIds(h), 'and back once the move lands').toEqual(before);
        } finally {
            h.release();
        }
    });

    // A layer move rotates only part of the cube. The visible-face set does not
    // change, but every move is expected to treat the strips the same way.
    it('PATH 3: a layer move hides the strips for the turn and restores them', async () => {
        const h = createHarness();
        try {
            enableGhosts(h);
            const before = shownIds(h);

            h.view.handleMoveExecuted(h.moveEvent('R'));

            expect(h.animationStarted(), 'the move animation actually started').toBe(true);
            expect(shownIds(h), 'off screen while the layer turns').toEqual([]);

            h.finishAnimation();
            await vi.advanceTimersByTimeAsync(400);
            expect(shownIds(h), 'and back once the move lands').toEqual(before);
        } finally {
            h.release();
        }
    });

    // The hide must be immediate, not the animated fade-out: `setVisible(false,
    // true)` leaves each strip in the DOM until its opacity transition ends, which
    // would keep the stale strips on screen for the length of the turn — the exact
    // thing this hides them for.
    it('strips are removed synchronously, not left mid-fade', () => {
        const h = createHarness();
        try {
            enableGhosts(h);
            expect(
                h.strips().filter(s => s.style.display !== 'none').length,
                'strips on screen before the turn'
            ).toBe(6);

            h.view.rotateViewRight();
            expect(
                h.strips().filter(s => s.style.display !== 'none').length,
                'no strip is still displayed in the same tick as the rotation'
            ).toBe(0);
        } finally {
            h.release();
        }
    });

    // A move that is interrupted by the next move must not leave the strips
    // hidden. `handleMoveExecuted` finalises the running animation first, so the
    // second move re-opens the rotation; the strips have to come back when the
    // second one lands rather than staying off screen for the rest of the session.
    it('interrupting a move with a second move still restores the strips', async () => {
        const h = createHarness();
        try {
            enableGhosts(h);

            h.view.handleMoveExecuted(h.moveEvent('x'));
            expect(h.animationStarted(), 'the first move animated').toBe(true);
            expect(shownIds(h), 'hidden for the first turn').toEqual([]);

            // A second move arrives before the first animation settles.
            h.view.handleMoveExecuted(h.moveEvent('y'));
            expect(shownIds(h), 'still hidden, now for the second turn').toEqual([]);

            h.finishAnimation();
            await vi.advanceTimersByTimeAsync(400);
            expect(shownIds(h), 'restored once the interrupting move lands').toEqual(shouldIds(h));
        } finally {
            h.release();
        }
    });

    // R7 — the strips must stay hidden for a whole *sequence* of turns, not
    // reappear between steps. This is the visible half of "the cube has settled":
    // a rapid burst of rotations is one continuous turn, so the strips belong to the
    // sequence rather than to each step.
    it('R7: the strips stay hidden across a multi-step sequence and return once', async () => {
        const h = createHarness();
        try {
            enableGhosts(h);
            expect(shownIds(h).length, 'visible before the sequence').toBe(6);

            h.view.rotateViewRight();
            expect(shownIds(h), 'hidden from the first step').toEqual([]);

            // A second rotation arrives before the first settles. It extends the same
            // sweep, so nothing may be revealed in between.
            h.setProgress(0.4);
            h.view.rotateViewRight();
            expect(shownIds(h), 'still hidden once the sequence has grown').toEqual([]);

            // Let the sequence settle; the strips come back exactly once.
            h.finishAnimation();
            await vi.advanceTimersByTimeAsync(300);
            expect(shownIds(h), 'returned once the cube settled').toEqual(shouldIds(h));
        } finally {
            h.release();
        }
    });

    // R1 / the reported defect — interrupting a view rotation mid-flight must not
    // adopt a sheared starting state. The old scheme wrote a new `matrix3d` and let
    // a CSS transition blend it; interrupting blended the half-way matrix again,
    // and because matrix blending is component-wise the geometry sheared and the
    // cube visibly unwound the wrong way.
    //
    // The animation now ramps one angle, so this asserts the mechanism that makes
    // the defect impossible: an interruption cancels the outgoing animation and
    // starts a new one from the interrupted angle, and the two never both hold the
    // element.
    it('R1: an interrupted rotation hands over cleanly instead of blending', async () => {
        const h = createHarness();
        try {
            enableGhosts(h);

            h.view.rotateViewRight();
            expect(h.animationCount(), 'a first animation really started').toBeGreaterThan(0);

            // Interrupt 40% of the way through. The direction is chosen to land on
            // a different world axis, so the ramp cannot simply be extended and the
            // hand-over has to re-base onto the interrupted pose.
            h.setProgress(0.4);
            h.view.rotateViewUp();

            // The outgoing animation was cancelled rather than left running under
            // the new one, so only one transform is ever driving the element —
            // which is what makes the old component-wise blending impossible.
            expect(
                h.animationsCancelled(),
                'the superseded animation was cancelled'
            ).toBeGreaterThan(0);

            h.finishAnimation();
            await vi.advanceTimersByTimeAsync(300);
            expect(shownIds(h), 'the sequence still settles').toEqual(shouldIds(h));
        } finally {
            h.release();
        }
    });

    // R3 — bounded animation under rapid input. Past the threshold the orientation is
    // applied without animating, so a long burst cannot keep restarting the ramp. The
    // orientation must still land, and the sequence must still settle so the strips are
    // not stranded.
    it('R3: past the pending threshold a rotation skips its animation but still lands', async () => {
        const h = createHarness();
        try {
            enableGhosts(h);

            // Six rotations, none settling. The animation count must stay bounded
            // rather than growing once per rotation — which is the property that
            // matters, independent of the exact threshold.
            const counts: number[] = [];
            for (let i = 0; i < 6; i++) {
                if (i > 0) h.setProgress(0.1 * i);
                h.view.rotateViewRight();
                counts.push(h.animationCount());
            }

            expect(counts[counts.length - 1], 'animation count stayed bounded').toBeLessThan(6);
            // And it did animate at first — a skipped step is a trailing behaviour, not
            // the whole path.
            expect(counts[0], 'the gesture starts out animated').toBeGreaterThan(0);

            // Six right turns is more than a full revolution, so the exact orientation
            // is not the assertion; that it advanced is.
            expect(
                { ...h.view.getState().viewForward },
                'the gesture still applied its orientation'
            ).not.toEqual({ x: 1, y: 0, z: 0 });

            // And the sequence still settles, so the strips are not stranded hidden.
            h.finishAnimation();
            await vi.advanceTimersByTimeAsync(400);
            expect(shownIds(h)).toEqual(shouldIds(h));
        } finally {
            h.release();
        }
    });

    // R4 — reduced motion. Currently unrequired and untested; the orientation must
    // be applied without animating.
    it('R4: under prefers-reduced-motion a view rotation applies directly and does not animate', () => {
        const h = createHarness({ reducedMotion: true });
        try {
            enableGhosts(h);

            const before = { ...h.view.getState().viewForward };
            h.view.rotateViewRight();

            expect(h.animationCount(), 'no animation was started').toBe(0);
            expect(
                { ...h.view.getState().viewForward },
                'the orientation still changed'
            ).not.toEqual(before);
            // With nothing to wait for, the strips return in the same tick.
            expect(shownIds(h), 'strips restored immediately').toEqual(shouldIds(h));
        } finally {
            h.release();
        }
    });

    // R8 — the orientation, STATE_CHANGED and the re-anchor all apply immediately;
    // the animation is only a visual layer. `getState()` must never report an
    // orientation the cube has not visibly reached *because* it is animating, and a
    // caller reading it mid-flight must see the destination.
    it('R8: getState reports the new orientation while the rotation is still animating', () => {
        const h = createHarness();
        try {
            enableGhosts(h);

            h.view.rotateViewRight();
            // Deliberately not settled. `rotateViewRight` sets viewForward = −vR,
            // so from the default front orientation the front direction becomes −X.
            expect({ ...h.view.getState().viewForward }, 'front is now the left face').toEqual({
                x: -1,
                y: 0,
                z: 0,
            });
            expect(shownIds(h), 'still mid-turn').toEqual([]);
        } finally {
            h.release();
        }
    });

    // A cancelled turn must not leak the pending count — if it did, the strips
    // would stay hidden for the rest of the session and no later rotation would
    // animate. This is the shape the Circular view's counter has (its decrement
    // sits outside `try/finally`, so an `AbortError` from `cancel()` strands it).
    it('a cancelled rotation does not leak the count, and a later rotation still animates', async () => {
        const h = createHarness();
        try {
            enableGhosts(h);

            h.view.rotateViewRight();
            // Interrupt, then settle the interrupting turn.
            h.setProgress(0.5);
            h.view.rotateViewLeft();
            h.finishAnimation();
            await vi.advanceTimersByTimeAsync(300);
            expect(shownIds(h), 'the interrupted sequence still restored the strips').toEqual(
                shouldIds(h)
            );

            // A fresh rotation must still animate — proof the counter did not latch.
            const animationsBefore = h.animationCount();
            h.view.rotateViewRight();
            expect(h.animationCount(), 'a later rotation still animates').toBeGreaterThan(
                animationsBefore
            );
            h.finishAnimation();
            await vi.advanceTimersByTimeAsync(300);
            expect(shownIds(h)).toEqual(shouldIds(h));
        } finally {
            h.release();
        }
    });

    // Tilt and pitch are the call sites most likely to be silently missed: the
    // view-rotation commands go through the view's methods, but these used to call
    // `rendering.updateRotation` directly from `commands.ts`. They swap which CSS
    // slots are visible, so the silhouette edges the strips sit on change with them
    // and the strips have to follow.
    it('tilt and pitch keep the strips matching the orientation', async () => {
        const h = createHarness();
        try {
            enableGhosts(h);

            for (const id of ['tilt-view', 'pitch-view']) {
                const command = h.view.getCommands().find(c => c.id === id);
                expect(command, `${id} exists`).toBeDefined();
                command!.action();
                await vi.advanceTimersByTimeAsync(300);
                expect(shownIds(h), `after ${id}`).toEqual(shouldIds(h));
            }
        } finally {
            h.release();
        }
    });
});
