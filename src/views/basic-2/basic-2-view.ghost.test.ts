// Integration tests for Basic 2's ghost-sticker wiring (U4): toggle command
// dispatch, silhouette-edge display, cross-variant sync, and post-move color
// refresh — exercising the real BasicView, not the shared GhostStickers class
// in isolation (already covered by src/views/basic/ghost-stickers.test.ts).
// See docs/plans/2026-07-25-001-feat-basic-2-ghost-stickers-plan.md
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CubeController } from '@/cube-controller';
import {
    getGhostOpacityIndex,
    isGhostVisible,
    setGhostOpacityIndex,
} from '@/views/basic/ghost-stickers';

import { BasicView } from './basic-2-view';
import { getVisibleFacesWithPositions } from './rendering';

function createView(viewType: 'basic-2-front' | 'basic-2-back', model: CubeController): BasicView {
    const view = new BasicView({ viewType });
    const container = document.createElement('div');
    view.create(container, model);
    return view;
}

function ghostHintsAction(view: BasicView): () => void {
    const command = view.getCommands().find(c => c.id === 'basic-view.ghost-hints');
    if (!command) throw new Error('basic-view.ghost-hints command not found');
    return command.action;
}

describe('BasicView (Basic 2) - ghost stickers integration', () => {
    let model: CubeController;

    beforeEach(() => {
        setGhostOpacityIndex(0);
        model = new CubeController();
    });

    afterEach(() => {
        setGhostOpacityIndex(0);
    });

    it('cycles ghost opacity off -> 75% -> 100% -> off via the ghost-hints command', () => {
        const view = createView('basic-2-front', model);

        expect(isGhostVisible()).toBe(false);

        ghostHintsAction(view)();
        expect(getGhostOpacityIndex()).toBe(1);
        expect(isGhostVisible()).toBe(true);

        ghostHintsAction(view)();
        expect(getGhostOpacityIndex()).toBe(2);

        ghostHintsAction(view)();
        expect(getGhostOpacityIndex()).toBe(0);
        expect(isGhostVisible()).toBe(false);
    });

    it('persists and restores state values including ghost opacity and link flags', () => {
        const view = createView('basic-2-front', model);

        view.setState({
            viewRight: { x: 1, y: 0, z: 0 },
            viewUp: { x: 0, y: 1, z: 0 },
            viewForward: { x: 0, y: 0, z: 1 },
            isTilted: true,
            isPitched: true,
            faceDirectMode: true,
            linked: false,
            ghostOpacityIndex: 2,
        });

        const persisted = view.getState();
        expect(persisted.isTilted).toBe(true);
        expect(persisted.isPitched).toBe(true);
        expect(persisted.ghostOpacityIndex).toBe(2);
        expect(persisted.linked).toBe(false);
    });

    it('tears down the cube DOM and clears the cube element reference on destroy', () => {
        const view = createView('basic-2-front', model);
        const container = document.createElement('div');
        view.create(container, model);

        view.destroy();

        expect(view.getCubeElement()).toBeNull();
        expect(container.querySelector('.cube')).toBeNull();
    });

    it('shows only silhouette-edge ghost strips once toggled on, hiding the rest', () => {
        const view = createView('basic-2-front', model);
        const cubeElement = view.getCubeElement()!;

        vi.useFakeTimers();
        ghostHintsAction(view)();
        vi.advanceTimersByTime(201);
        vi.useRealTimers();

        const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
        expect(strips.length).toBe(24); // 2 per edge x 12 edges, matching Basic view

        // Derive the actual visible/hidden face split from the view's own
        // current orientation, rather than assuming a fixed default — this
        // mirrors the invariant checked in src/views/basic/ghost-stickers.test.ts.
        const { visibleFaces, hiddenFaces } = getVisibleFacesWithPositions(
            view.getState() as unknown as Parameters<typeof getVisibleFacesWithPositions>[0]
        );

        let shownCount = 0;
        for (const strip of strips) {
            const hostFace = strip.getAttribute('data-host-face');
            const sourceFace = strip.getAttribute('data-source-face');
            const isVisible = strip.style.display !== 'none';
            if (isVisible) {
                // A shown strip must sit on a currently visible face and
                // borrow color from a currently hidden face — the silhouette
                // edge invariant that gives ghost stickers their meaning.
                expect(visibleFaces.some(f => f.face === hostFace)).toBe(true);
                expect(hiddenFaces.some(f => f.face === sourceFace)).toBe(true);
                shownCount++;
            } else {
                expect(
                    visibleFaces.some(f => f.face === hostFace) &&
                        hiddenFaces.some(f => f.face === sourceFace)
                ).toBe(false);
            }
        }
        // 3 visible faces x 2 silhouette edges each = 6 strips shown.
        expect(shownCount).toBe(6);
    });

    it('syncs ghost opacity to the peer view via BASIC_VIEW_GHOST_TOGGLED', () => {
        const frontView = createView('basic-2-front', model);
        const backView = createView('basic-2-back', model);

        ghostHintsAction(frontView)();

        expect(frontView.getState().ghostOpacityIndex).toBe(1);
        expect(backView.getState().ghostOpacityIndex).toBe(1);
    });

    it('refreshes ghost sticker colors after a move via update(), without a manual toggle', () => {
        const view = createView('basic-2-front', model);
        const cubeElement = view.getCubeElement()!;

        vi.useFakeTimers();
        ghostHintsAction(view)();
        vi.advanceTimersByTime(201);
        vi.useRealTimers();

        const colorsBefore = Array.from(
            cubeElement.querySelectorAll<HTMLElement>('[data-host-face]')
        ).flatMap(strip =>
            Array.from(strip.children).map(child => (child as HTMLElement).style.backgroundColor)
        );
        expect(colorsBefore.some(c => c !== '')).toBe(true);

        model.applyMove('R');
        view.update(model);

        const colorsAfter = Array.from(
            cubeElement.querySelectorAll<HTMLElement>('[data-host-face]')
        ).flatMap(strip =>
            Array.from(strip.children).map(child => (child as HTMLElement).style.backgroundColor)
        );
        expect(colorsAfter.some(c => c !== '')).toBe(true);
        // A move on a 3x3 always changes the color of at least one previously
        // hidden face's stickers — if update() failed to refresh, colorsAfter
        // would be identical to colorsBefore, which this comparison would miss.
        expect(colorsAfter).not.toEqual(colorsBefore);
    });

    it('does not throw when toggling ghosts immediately after create()', () => {
        const view = createView('basic-2-front', model);
        expect(() => ghostHintsAction(view)()).not.toThrow();
    });
});
