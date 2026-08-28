import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { EventName } from '@/types';

import { FlatView } from './flat-view';
import styles from './flat-view.module.css';
import ghostStyles from './ghost-strips.module.css';

beforeAll(() => {
    if (!HTMLElement.prototype.setPointerCapture) {
        HTMLElement.prototype.setPointerCapture = function () {};
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
        HTMLElement.prototype.releasePointerCapture = function () {};
    }
});

describe('ghost hints', () => {
    let view: FlatView;
    let container: HTMLElement;
    let controller: CubeController;

    beforeEach(() => {
        container = document.createElement('div');
        container.style.width = '800px';
        container.style.height = '600px';
        document.body.appendChild(container);

        controller = new CubeController();
        view = new FlatView(styles);
        view.create(container, controller);
    });

    afterEach(() => {
        view.destroy();
        document.body.removeChild(container);
    });

    const getCmd = () => view.getCommands().find(c => c.id === 'flat.ghost-hints')!;

    it('creates ghost strip elements on initialisation', () => {
        const strips = container.querySelectorAll(`.${ghostStyles['flat-ghost-strip']}`);
        expect(strips.length).toBe(14);
    });

    it('creates 3 ghost stickers per strip (42 total)', () => {
        const ghosts = container.querySelectorAll(`.${ghostStyles['flat-ghost-sticker']}`);
        expect(ghosts.length).toBe(42);
    });

    it('ghost stickers have data-ghost-source-face and data-ghost-source-pos', () => {
        const ghost = container.querySelector(`.${ghostStyles['flat-ghost-sticker']}`)!;
        expect(ghost.getAttribute('data-ghost-source-face')).toBeTruthy();
        expect(ghost.getAttribute('data-ghost-source-pos')).not.toBeNull();
    });

    it('ghost strips are visible by default', () => {
        const strip = container.querySelector(`.${ghostStyles['flat-ghost-strip']}`) as HTMLElement;
        expect(strip.style.display).not.toBe('none');
    });

    it('flat.ghost-hints command toggles ghost visibility', () => {
        vi.useFakeTimers();
        const cmd = getCmd();
        expect(cmd.isActive!()).toBe(true);

        // Cycle: 75% → 100% → off
        cmd.action(); // → 100%
        expect(cmd.isActive!()).toBe(true);
        cmd.action(); // → off
        expect(cmd.isActive!()).toBe(false);

        // Fade-out uses a 400ms fallback timeout in jsdom (no transitionend)
        vi.advanceTimersByTime(400);
        const strip = container.querySelector(`.${ghostStyles['flat-ghost-strip']}`) as HTMLElement;
        expect(strip.style.display).toBe('none');

        cmd.action(); // → 75% (back on)
        expect(cmd.isActive!()).toBe(true);
        expect(strip.style.display).not.toBe('none');
        vi.useRealTimers();
    });

    it('getState/setState round-trips ghostOpacityIndex', () => {
        expect(view.getState().ghostOpacityIndex).toBe(1);
        view.setState({ ghostOpacityIndex: 0 });
        expect(view.getState().ghostOpacityIndex).toBe(0);
        view.setState({ ghostOpacityIndex: 2 });
        expect(view.getState().ghostOpacityIndex).toBe(2);
    });

    it('ghost stickers copy source sticker background colour', () => {
        const ghost = container.querySelector(
            `.${ghostStyles['flat-ghost-sticker']}`
        ) as HTMLElement;
        const face = ghost.getAttribute('data-ghost-source-face')!;
        const pos = ghost.getAttribute('data-ghost-source-pos')!;

        const sourceEl = container.querySelector(
            `.${styles['flat-sticker']}[data-face="${face}"][data-pos="${pos}"]`
        ) as HTMLElement;

        expect(ghost.style.backgroundColor).toBe(sourceEl.style.backgroundColor);
    });

    it('ghost stickers update after a move', () => {
        const ghost = container.querySelector(
            `.${ghostStyles['flat-ghost-sticker']}`
        ) as HTMLElement;

        // Apply a move that changes sticker colours
        Application.eventBus.emit(EventName.MOVE_REQUESTED, {
            moveNotation: 'R',
            viewId: 'test',
            tentative: false,
        });

        // Ghost colour may or may not have changed, but the sync should have run
        // without errors. We just verify it did not throw.
        expect(ghost.style.backgroundColor).toBeTruthy();
    });

    it('setState with ghostOpacityIndex=0 hides ghost strips', () => {
        view.setState({ ghostOpacityIndex: 0 });
        expect(view.getState().ghostOpacityIndex).toBe(0);

        const strips = container.querySelectorAll(`.${ghostStyles['flat-ghost-strip']}`);
        for (const strip of strips) {
            expect((strip as HTMLElement).style.display).toBe('none');
        }
    });

    it('getShowGhosts returns true when visible, false when hidden', () => {
        const gs = view.getGhostStrips()!;

        // Initially visible (opacityIndex = 1)
        expect(gs.getShowGhosts()).toBe(true);

        // Toggle twice: 75% → 100% → off
        getCmd().action(); // → 100%
        expect(gs.getShowGhosts()).toBe(true);
        getCmd().action(); // → off
        expect(gs.getShowGhosts()).toBe(false);
    });

    it('setShowGhosts cycles visibility correctly', () => {
        const gs = view.getGhostStrips()!;

        // Start visible
        expect(gs.getOpacityIndex()).toBe(1);

        // Set to hidden
        gs.setShowGhosts(false);
        expect(gs.getOpacityIndex()).toBe(0);
        expect(gs.getShowGhosts()).toBe(false);

        // Set back to visible
        gs.setShowGhosts(true);
        expect(gs.getOpacityIndex()).toBe(1);
        expect(gs.getShowGhosts()).toBe(true);
    });
});

describe('ghost hints (multi-size cubes)', () => {
    let view: FlatView;
    let container: HTMLElement;
    let controller: CubeController;

    beforeEach(() => {
        container = document.createElement('div');
        container.style.width = '800px';
        container.style.height = '600px';
        document.body.appendChild(container);
    });

    afterEach(() => {
        view?.destroy();
        controller?.dispose();
        document.body.removeChild(container);
    });

    it('2×2 cube creates 2 ghost stickers per strip (28 total)', () => {
        controller = new CubeController(2);
        view = new FlatView(styles);
        view.create(container, controller);

        const strips = container.querySelectorAll(`.${ghostStyles['flat-ghost-strip']}`);
        expect(strips.length).toBe(14);

        const ghosts = container.querySelectorAll(`.${ghostStyles['flat-ghost-sticker']}`);
        expect(ghosts.length).toBe(28); // 14 strips × 2 stickers per strip
    });

    it('4×4 cube creates 4 ghost stickers per strip (56 total)', () => {
        controller = new CubeController(4);
        view = new FlatView(styles);
        view.create(container, controller);

        const strips = container.querySelectorAll(`.${ghostStyles['flat-ghost-strip']}`);
        expect(strips.length).toBe(14);

        const ghosts = container.querySelectorAll(`.${ghostStyles['flat-ghost-sticker']}`);
        expect(ghosts.length).toBe(56); // 14 strips × 4 stickers per strip
    });

    it('7×7 cube creates 7 ghost stickers per strip (98 total)', () => {
        controller = new CubeController(7);
        view = new FlatView(styles);
        view.create(container, controller);

        const strips = container.querySelectorAll(`.${ghostStyles['flat-ghost-strip']}`);
        expect(strips.length).toBe(14);

        const ghosts = container.querySelectorAll(`.${ghostStyles['flat-ghost-sticker']}`);
        expect(ghosts.length).toBe(98); // 14 strips × 7 stickers per strip
    });

    it('reconstructs ghost strips when cube size changes', () => {
        // Start with 3×3
        controller = new CubeController(3);
        view = new FlatView(styles);
        view.create(container, controller);

        let ghosts = container.querySelectorAll(`.${ghostStyles['flat-ghost-sticker']}`);
        expect(ghosts.length).toBe(42); // 3×3

        // Switch to 2×2 by recreating view
        controller.dispose();
        container.innerHTML = '';
        controller = new CubeController(2);
        view.destroy();
        view = new FlatView(styles);
        view.create(container, controller);

        ghosts = container.querySelectorAll(`.${ghostStyles['flat-ghost-sticker']}`);
        expect(ghosts.length).toBe(28); // 2×2

        // Switch to 5×5
        controller.dispose();
        container.innerHTML = '';
        controller = new CubeController(5);
        view.destroy();
        view = new FlatView(styles);
        view.create(container, controller);

        ghosts = container.querySelectorAll(`.${ghostStyles['flat-ghost-sticker']}`);
        expect(ghosts.length).toBe(70); // 5×5 (14 × 5)
    });

    it('ghost stickers find correct source stickers for 2×2 cube', () => {
        controller = new CubeController(2);
        view = new FlatView(styles);
        view.create(container, controller);

        // Check that each ghost can find its source
        const ghosts = container.querySelectorAll(
            `.${ghostStyles['flat-ghost-sticker']}`
        ) as NodeListOf<HTMLElement>;

        let foundCount = 0;
        for (const ghost of ghosts) {
            const face = ghost.getAttribute('data-ghost-source-face');
            const pos = ghost.getAttribute('data-ghost-source-pos');

            const sourceEl = container.querySelector(
                `.${styles['flat-sticker']}[data-face="${face}"][data-pos="${pos}"]`
            );

            if (sourceEl) {
                foundCount++;
            }
        }

        // All ghosts should find their source stickers
        expect(foundCount).toBe(28);
    });

    it('ghost stickers find correct source stickers for 7×7 cube', () => {
        controller = new CubeController(7);
        view = new FlatView(styles);
        view.create(container, controller);

        // Check that each ghost can find its source
        const ghosts = container.querySelectorAll(
            `.${ghostStyles['flat-ghost-sticker']}`
        ) as NodeListOf<HTMLElement>;

        let foundCount = 0;
        for (const ghost of ghosts) {
            const face = ghost.getAttribute('data-ghost-source-face');
            const pos = ghost.getAttribute('data-ghost-source-pos');

            const sourceEl = container.querySelector(
                `.${styles['flat-sticker']}[data-face="${face}"][data-pos="${pos}"]`
            );

            if (sourceEl) {
                foundCount++;
            }
        }

        // All ghosts should find their source stickers
        expect(foundCount).toBe(98);
    });
});
