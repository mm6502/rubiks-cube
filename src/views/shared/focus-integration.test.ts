// Integration tests proving every view actually claims DOM focus on contact
// (U4 / AE11).
//
// `focus.test.ts` proves the helper works in isolation. These tests prove each
// view *wires* it — a distinction that matters because the shared helper could
// be perfect while one view never calls it. One parametrised suite covers all
// three views so a fourth view added later cannot quietly skip the behaviour
// without a single place failing.
import { Map as IMap } from 'immutable';

import { CubeController } from '@/cube-controller';
import { CubeState, Cubie, CubieId, PositionKey } from '@/cube/types';
import { BasicView } from '@/views/basic/basic-view';
import { circularViewFactory } from '@/views/circular';
import { FlatView } from '@/views/flat/flat-view';
import flatStyles from '@/views/flat/flat-view.module.css';

// Minimal model for the circular view. The circular view reads `cubiesById`
// through Immutable's collection API, so a native Map would fail with
// "state.cubiesById.filter is not a function".
const circularState = {
    cubeSize: 3,
    cubiesById: IMap<CubieId, Cubie>(),
    cubiesByPosition: IMap<PositionKey, Cubie>(),
    timestamp: 0,
} satisfies CubeState;

const circularModel = {
    isSolved: () => false,
    getState: () => circularState,
    getCurrentState: () => circularState,
    getMoveHistory: () => ({ canUndo: () => false, canRedo: () => false }),
} as any;

interface ViewHarness {
    name: string;
    container: HTMLElement;
    destroy: () => void;
}

/** Builds each view into a mounted container, returning a teardown. */
const harnesses: Record<string, () => ViewHarness> = {
    basic: () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const view = new BasicView({ viewType: 'basic-front' });
        view.create(container, new CubeController());
        return {
            name: 'basic',
            container,
            destroy: () => {
                view.destroy();
                container.remove();
            },
        };
    },
    circular: () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const view = circularViewFactory.create();
        view.create(container, circularModel);
        return {
            name: 'circular',
            container,
            destroy: () => {
                view.destroy();
                container.remove();
            },
        };
    },
    flat: () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const view = new FlatView(flatStyles);
        view.create(container, new CubeController());
        return {
            name: 'flat',
            container,
            destroy: () => {
                view.destroy();
                container.remove();
            },
        };
    },
};

describe.each(Object.keys(harnesses))('%s view claims DOM focus on contact', viewName => {
    let harness: ViewHarness;
    let priorFocus: HTMLInputElement;

    beforeEach(() => {
        // Focus starts on a control *outside* the view — this is the reported
        // defect's precondition: the user last touched a sidebar widget (the
        // cube-size radios) and their keyboard focus is still there.
        priorFocus = document.createElement('input');
        document.body.appendChild(priorFocus);
        priorFocus.focus();

        harness = harnesses[viewName]();
    });

    afterEach(() => {
        harness.destroy();
        priorFocus.remove();
    });

    it('is not focused before any contact (control test)', () => {
        // Guards against a trivially-passing suite: if the view grabbed focus
        // at construction the real assertion below would prove nothing.
        expect(document.activeElement).not.toBe(harness.container);
        expect(document.activeElement).toBe(priorFocus);
    });

    it('moves focus to the view container on pointerdown', () => {
        harness.container.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
        );

        expect(document.activeElement).toBe(harness.container);
        expect(document.activeElement).not.toBe(priorFocus);
    });

    it('makes the container focusable so it can hold focus at all', () => {
        // If tabIndex were left at -1 the container could not become
        // activeElement, so the assertion above would be impossible to satisfy.
        expect(harness.container.tabIndex).toBe(0);
    });
});
