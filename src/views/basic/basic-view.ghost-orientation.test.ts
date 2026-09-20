// How each orientation-changing path treats the ghost hint strips.
//
// The user observed THREE different behaviours:
//
//   PATH 1  plain arrow crossing an edge/corner — strips go stale and stay stale
//   PATH 2  Alt+Arrow view rotation            — strips hide, then restore
//   PATH 3  whole-cube move (x/y/z)            — strips stay up during the turn
//                                                and only recolour
//
// Paths 2 and 3 are deliberate but different; path 1 is a defect. This suite
// pins all three down by measurement so the divergence is visible and so any
// future unification has a baseline to change.
//
// Cause of PATH 1: `handleKeyPress`'s `onRotated` mutates the orientation in
// place, then refreshes rotation and face labels only. It is the one rotation
// entry point that never refreshes the ghost edges — `rotateViewLeft/Right/Up/
// Down`, `resetView`, `alignCubeToView`, the tilt/pitch commands and the touch
// callback all do.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CubeController } from '@/cube-controller';
import { setGhostOpacityIndex } from '@/views/basic/ghost-stickers';

import { BasicView } from './basic-view';
import { getVisibleFacesWithPositions } from './rendering';

interface Harness {
    view: BasicView;
    model: CubeController;
    strips: () => HTMLElement[];
    release: () => void;
}

function createHarness(): Harness {
    const model = new CubeController(3);
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
    it('PATH 2: an Alt+Arrow view rotation hides the strips during the turn, then restores them', () => {
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

    // PATH 3 — a whole-cube move turns the cube itself, so the set of visible
    // faces (from the view's point of view) does not change; only the colours do.
    // The strips therefore stay up for the whole turn and are recoloured when the
    // move lands.
    it('PATH 3: a whole-cube move leaves the set alone and recolours once the move lands', () => {
        const h = createHarness();
        try {
            enableGhosts(h);
            const before = shownIds(h);

            h.model.applyMove('x');
            h.view.update(h.model);

            expect(shownIds(h), 'the visible-face set is unchanged by the turn').toEqual(before);

            vi.advanceTimersByTime(400);
            expect(shownIds(h), 'and still matches the orientation').toEqual(shouldIds(h));
        } finally {
            h.release();
        }
    });
});
