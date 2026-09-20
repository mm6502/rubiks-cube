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
    /**
     * Whether `animateMove` actually started an animation for the last move.
     * False means it fell through to the non-animated branch, so any assertion
     * about mid-turn behaviour would be testing the wrong path.
     */
    animationStarted: () => boolean;
    strips: () => HTMLElement[];
    release: () => void;
}

// `Element.prototype.animate` and `window.matchMedia` are patched below with raw
// `Object.defineProperty` writes, which `vi.restoreAllMocks()` does not unwind — a
// stub left behind would silently affect a later test in the same worker. jsdom
// provides no `matchMedia` at all, so it is restored by deletion.
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function createHarness(): Harness {
    const model = new CubeController(3);

    // A controllable animation: `finished` settles only when the test asks.
    let settle: () => void = () => {};
    let started = 0;
    const finished = new Promise<void>(resolve => (settle = resolve));
    Object.defineProperty(HTMLElement.prototype, 'animate', {
        configurable: true,
        writable: true,
        value: () => {
            started++;
            return { cancel: () => {}, finished };
        },
    });
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        // `matches: false` keeps the animated branch — a truthy value is the
        // prefers-reduced-motion signal, which makes animateMove return null.
        value: () => ({
            matches: false,
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
        finishAnimation: () => settle(),
        animationStarted: () => started > 0,
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
    it('PATH 1: a plain arrow crossing an edge leaves the strips matching the NEW orientation', () => {
        const h = createHarness();
        try {
            enableGhosts(h);
            pressArrow(h, 'ArrowRight');
            vi.advanceTimersByTime(300);
            expect(shownIds(h), 'step 1 does not rotate, so nothing changes').toEqual(shouldIds(h));

            pressArrow(h, 'ArrowRight');
            vi.advanceTimersByTime(300);
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
    it('PATH 2: a view rotation hides the strips during the turn, then restores them', () => {
        const h = createHarness();
        try {
            enableGhosts(h);
            expect(shownIds(h).length).toBe(6);

            h.view.rotateViewRight();
            expect(shownIds(h), 'hidden immediately, for the duration of the turn').toEqual([]);

            vi.advanceTimersByTime(300);
            expect(shownIds(h), 'restored once the turn settles').toEqual(shouldIds(h));
        } finally {
            h.release();
        }
    });

    it('PATH 2: every view rotation entry point keeps the strips matching the orientation', () => {
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
                vi.advanceTimersByTime(300);
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
});
