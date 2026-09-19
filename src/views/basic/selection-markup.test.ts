import { describe, expect, it } from 'vitest';

import { CubeController } from '@/cube-controller';
import { StickerId } from '@/cube/types';
import { BasicView } from '@/views/basic/basic-view';
import styles from '@/views/basic/basic-view.module.css';

// Derived DOM state — the `selected` class — is written when the selection is
// made, but the cubie elements are rebuilt wholesale on resize and on model
// update. The rebuild drops the class while `state.currentSelected` survives,
// so the app reports a selection the user cannot see. That is why the previous
// suite passed: it asserted on the state accessor, never on the DOM.
//
// Every assertion here reads the DOM. A state-only assertion cannot catch this
// class of defect.
describe('BasicView selection markup survives a DOM rebuild', () => {
    const selectedCount = (container: HTMLElement) =>
        container.querySelectorAll(`.${styles.selected}`).length;

    const build = () => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientWidth', { value: 600 });
        Object.defineProperty(container, 'clientHeight', { value: 600 });
        document.body.appendChild(container);
        const model = new CubeController(3);
        const view = new BasicView({ viewType: 'basic-front' });
        return { container, model, view };
    };

    it('Covers AE6: the real startup sequence paints exactly one selected sticker', () => {
        // The reported defect. ViewLifecycleManager calls resize() immediately
        // after create(), and that rebuild used to drop the highlight.
        const { container, model, view } = build();

        view.create(container, model);
        expect(view.getSelectedSticker(), 'create establishes a selection').toBeDefined();
        expect(selectedCount(container), 'after create').toBe(1);

        view.resize();

        expect(selectedCount(container), 'after create + resize').toBe(1);
        expect(view.getSelectedSticker()).toBeDefined();

        view.destroy();
        container.remove();
    });

    it('Covers AE7: markup is present after a model update', () => {
        const { container, model, view } = build();
        view.create(container, model);
        view.resize();

        view.update(model.getReadOnlyModel());

        expect(selectedCount(container)).toBe(1);

        view.destroy();
        container.remove();
    });

    it('the highlighted element is the sticker the view reports as selected', () => {
        // Counting is not enough — the markup must be on the *right* sticker.
        const { container, model, view } = build();
        view.create(container, model);

        const reported = view.getSelectedSticker();
        view.resize();

        const marked = container.querySelector(`.${styles.selected}`);
        expect(marked).not.toBeNull();
        expect(marked!.getAttribute('data-sticker-id')).toBe(reported);

        view.destroy();
        container.remove();
    });

    it('a plain update does not duplicate the markup', () => {
        // Re-derivation must be idempotent: the class is added to one element,
        // not accumulated across rebuilds.
        const { container, model, view } = build();
        view.create(container, model);

        view.update(model.getReadOnlyModel());
        view.update(model.getReadOnlyModel());
        view.resize();

        expect(selectedCount(container)).toBe(1);

        view.destroy();
        container.remove();
    });

    it('a rebuild with no selection produces no selected markup', () => {
        // The re-derivation reads existing state, so it must not invent a
        // selection when there is none.
        const { container, model, view } = build();
        view.create(container, model);
        view.updateSelected(undefined);
        expect(selectedCount(container)).toBe(0);

        view.resize();

        expect(selectedCount(container)).toBe(0);
        expect(view.getSelectedSticker()).toBeUndefined();

        view.destroy();
        container.remove();
    });

    it('a rebuild after the selection was cleared leaves it cleared', () => {
        // The analogous regression: resurrecting a selection the user cleared.
        const { container, model, view } = build();
        view.create(container, model);
        expect(selectedCount(container)).toBe(1);

        view.updateSelected(undefined);
        view.update(model.getReadOnlyModel());

        expect(selectedCount(container)).toBe(0);

        view.destroy();
        container.remove();
    });

    it.each([2, 4, 5, 6, 7])('survives the rebuild at size %i', cubeSize => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientWidth', { value: 600 });
        Object.defineProperty(container, 'clientHeight', { value: 600 });
        document.body.appendChild(container);

        const model = new CubeController(cubeSize);
        const view = new BasicView({ viewType: 'basic-front' });
        view.create(container, model);
        view.resize();

        expect(selectedCount(container), `size ${cubeSize}`).toBe(1);

        view.destroy();
        container.remove();
    });
});

// The hover highlight is the same class of derived state as the selection — a
// class written into cubie elements that a rebuild replaces wholesale. Only the
// selection was re-derived at the rebuild boundary, so a rebuild while a sticker
// was hovered left the DOM disagreeing with the app about which sticker was
// highlighted, and `setHighlightedSticker`'s unchanged-value early return meant
// the natural repair path was closed until the pointer moved.
describe('BasicView hover highlight survives a DOM rebuild', () => {
    const highlightedCount = (container: HTMLElement) =>
        container.querySelectorAll(`.${styles.highlighted}`).length;

    const build = () => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientWidth', { value: 600 });
        Object.defineProperty(container, 'clientHeight', { value: 600 });
        document.body.appendChild(container);
        const model = new CubeController(3);
        const view = new BasicView({ viewType: 'basic-front' });
        view.create(container, model);
        return { container, model, view };
    };

    /** Any sticker element the view rendered — a valid highlight target. */
    const someStickerId = (container: HTMLElement): StickerId =>
        container
            .querySelector(`.${styles.sticker}`)!
            .getAttribute('data-sticker-id')! as StickerId;

    it('re-derives the highlight at the rebuild boundary', () => {
        const { container, view } = build();
        const stickerId = someStickerId(container);
        view.updateHighlight(stickerId);
        expect(highlightedCount(container), 'before rebuild').toBe(1);

        view.resize();

        // Before the fix this was 0: the rebuilt elements carried no highlight
        // while the app still considered the sticker highlighted.
        expect(highlightedCount(container), 'after rebuild').toBe(1);

        view.destroy();
        container.remove();
    });

    it('re-derives the highlight on a model update too', () => {
        const { container, model, view } = build();
        const stickerId = someStickerId(container);
        view.updateHighlight(stickerId);

        view.update(model.getReadOnlyModel());

        expect(highlightedCount(container)).toBe(1);

        view.destroy();
        container.remove();
    });

    it('does not invent a highlight when none was set', () => {
        // The re-derivation reads existing state, so a rebuild with no highlight
        // must not produce one.
        const { container, view } = build();
        expect(highlightedCount(container), 'no highlight yet').toBe(0);

        view.resize();

        expect(highlightedCount(container)).toBe(0);

        view.destroy();
        container.remove();
    });

    it('does not duplicate the highlight across repeated rebuilds', () => {
        const { container, view } = build();
        view.updateHighlight(someStickerId(container));

        view.resize();
        view.resize();
        view.updateHighlight(undefined);

        // Clearing still wins, and re-application never accumulates.
        expect(highlightedCount(container)).toBe(0);

        view.destroy();
        container.remove();
    });
});
