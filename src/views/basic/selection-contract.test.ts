// Tests for the Basic view's selection contract (U15).
//
// "Nothing selected" used to be reachable only by passing `undefined` to
// `updateSelected`, which made a supported state look like an accident of an
// optional parameter. These tests pin the contract explicitly: clearing is a
// supported operation with a named entry point, it is not a one-way door, and
// the invariant the plan states — "a view either has a selection it can show, or
// reports that it does not" — holds in both directions.
import { describe, expect, it } from 'vitest';

import { CubeController } from '@/cube-controller';
import { SUPPORTED_SIZES, StickerId } from '@/cube/types';
import { BasicView } from '@/views/basic/basic-view';
import styles from '@/views/basic/basic-view.module.css';

describe('BasicView selection contract', () => {
    const selectedCount = (container: HTMLElement) =>
        container.querySelectorAll(`.${styles.selected}`).length;

    const build = (cubeSize = 3) => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientWidth', { value: 600 });
        Object.defineProperty(container, 'clientHeight', { value: 600 });
        document.body.appendChild(container);
        const model = new CubeController(cubeSize);
        const view = new BasicView({ viewType: 'basic-front' });
        view.create(container, model);
        return { container, model, view };
    };

    /** Any sticker the view rendered — a valid selection target. */
    const someStickerId = (container: HTMLElement): StickerId =>
        container
            .querySelector(`.${styles.sticker}`)!
            .getAttribute('data-sticker-id')! as StickerId;

    it('clearing the selection is reachable and reported as cleared', () => {
        const { container, view } = build();
        expect(selectedCount(container), 'create establishes a selection').toBe(1);

        view.updateSelected(undefined);

        // The invariant: the view does not claim a selection it cannot show.
        expect(view.getSelectedSticker()).toBeUndefined();
        expect(selectedCount(container)).toBe(0);

        view.destroy();
        container.remove();
    });

    it('clearing is not a one-way door: a selection can be re-established', () => {
        // This is the regression the "make the clear path unreachable" reading of
        // the fix would have introduced — it would satisfy "cannot reach a
        // cleared selection" by deleting the ability to clear at all.
        const { container, view } = build();
        view.updateSelected(undefined);
        expect(view.getSelectedSticker()).toBeUndefined();

        const target = someStickerId(container);
        view.updateSelected(target);

        expect(view.getSelectedSticker()).toBe(target);
        expect(selectedCount(container)).toBe(1);

        view.destroy();
        container.remove();
    });

    it('a cleared selection survives a rebuild without being resurrected', () => {
        const { container, view } = build();
        view.updateSelected(undefined);

        view.resize();

        expect(view.getSelectedSticker()).toBeUndefined();
        expect(selectedCount(container)).toBe(0);

        view.destroy();
        container.remove();
    });

    it('re-selecting the same sticker twice is idempotent', () => {
        const { container, view } = build();
        const target = someStickerId(container);

        view.updateSelected(target);
        view.updateSelected(target);

        expect(selectedCount(container), 'exactly one element marked').toBe(1);
        expect(view.getSelectedSticker()).toBe(target);

        view.destroy();
        container.remove();
    });

    it('clearing drops the stored anchor, not just the markup', () => {
        // The anchor is what `restoreSelection` gates on. If clearing left it
        // behind, the view would report no selection while still holding
        // geometry for one.
        const { view } = build();
        expect(view.getSelectedSticker()).toBeDefined();

        view.updateSelected(undefined);

        const state = (view as unknown as { state: Record<string, unknown> }).state;
        expect(state.currentSelected).toBeUndefined();
        expect(state.selectedCubiePosition).toBeUndefined();
        expect(state.selectedFace).toBeUndefined();
    });

    it.each([...SUPPORTED_SIZES])(
        'establishes a default selection at size %i and can clear it',
        cubeSize => {
            // The default-selection sweep must stay green: clearing is an added
            // capability, not a change to what create() establishes.
            const { container, view } = build(cubeSize);

            expect(view.getSelectedSticker(), `size ${cubeSize} default`).toBeDefined();
            expect(selectedCount(container)).toBe(1);

            view.updateSelected(undefined);
            expect(view.getSelectedSticker()).toBeUndefined();
            expect(selectedCount(container)).toBe(0);

            view.destroy();
            container.remove();
        }
    );
});
