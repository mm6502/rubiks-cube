// Net-new regression coverage for R1b: the surviving Basic view must refresh
// face labels after whole-cube x/y/z MOVE_EXECUTED events on every outcome
// path (animated, reduced-motion/non-animated, and the no-movedCubies full
// update). This mirrors the behavior the deleted static Basic view had in its
// updateSelective `/^[xyz]['2]?$/` branch — Basic 2 previously never refreshed
// labels after whole-cube moves, leaving corner-face labels stale.
// See docs/brainstorms/2026-09-05-basic2-cutover-requirements.md (AE6).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CubeController } from '@/cube-controller';
import { Axis, QuarterTurn } from '@/cube/types';
import type { MoveExecutedEvent } from '@/types';

import { BasicView } from './basic-view';

const { updateFaceLabelsMock, updateMock, animateMoveMock, updateCubiePositionsMock } = vi.hoisted(
    () => ({
        updateFaceLabelsMock: vi.fn(),
        updateMock: vi.fn(),
        animateMoveMock: vi.fn(),
        updateCubiePositionsMock: vi.fn(),
    })
);

vi.mock('./rendering', async importOriginal => {
    const actual = await importOriginal<typeof import('./rendering')>();
    return {
        ...actual,
        update: updateMock,
        updateFaceLabels: updateFaceLabelsMock,
    };
});

vi.mock('./animations', async importOriginal => {
    const actual = await importOriginal<typeof import('./animations')>();
    return {
        ...actual,
        animateMove: animateMoveMock,
    };
});

vi.mock('./cubie-rendering', async importOriginal => {
    const actual = await importOriginal<typeof import('./cubie-rendering')>();
    return {
        ...actual,
        updateCubiePositions: updateCubiePositionsMock,
    };
});

function wholeCubeEvent(model: CubeController, notation: string): MoveExecutedEvent {
    // Build the event shape CubeController emits for a whole-cube rotation.
    const axis = notation.charAt(0) === 'x' ? Axis.X : notation.charAt(0) === 'y' ? Axis.Y : Axis.Z;
    return {
        moveDetails: {
            notation,
            definition: {
                name: notation.replace(/['2]/g, ''),
                axis,
                layerIndices: [0, 1, 2],
                angle: notation.includes('2') ? QuarterTurn.HALF : QuarterTurn.QUARTER,
            },
            movedCubies: {
                before: [
                    {
                        id: 'cubie-a',
                        position: { x: 0, y: 0, z: 0 },
                    },
                ] as any,
                after: [] as any,
            },
        },
        preState: model.getCurrentState(),
        postState: model.getCurrentState(),
    };
}

function faceMoveEvent(model: CubeController, notation: string): MoveExecutedEvent {
    return {
        moveDetails: {
            notation,
            definition: {
                name: notation.replace(/['2]/g, ''),
                axis: Axis.X,
                layerIndices: [2],
                angle: QuarterTurn.QUARTER,
            },
            movedCubies: { before: [], after: [] },
        },
        preState: model.getCurrentState(),
        postState: model.getCurrentState(),
    };
}

describe('BasicView - whole-cube x/y/z face-label refresh (R1b)', () => {
    let model: CubeController;
    let view: BasicView;

    // Returns the direction argument of the last updateFaceLabels call, or
    // undefined if it was never called. (Asserting on the recorded call args
    // directly avoids deep-diff printing of the large state object.)
    const lastLabelRefreshDirection = () => {
        const calls = updateFaceLabelsMock.mock.calls;
        if (calls.length === 0) return undefined;
        return calls[calls.length - 1][1] as string | undefined;
    };

    beforeEach(() => {
        updateFaceLabelsMock.mockClear();
        updateMock.mockClear();
        animateMoveMock.mockClear();
        updateCubiePositionsMock.mockClear();

        // Default: matchMedia reports no reduced motion, and the real
        // animations module is replaced by the mock below per test.
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: vi.fn().mockReturnValue({
                matches: false,
                media: '(prefers-reduced-motion: reduce)',
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }),
        });

        model = new CubeController();
        view = new BasicView({ viewType: 'basic-front' });
        const container = document.createElement('div');
        view.create(container, model);

        // create() itself calls updateFaceLabels to lay out the initial
        // labels — clear the mocks so the assertions below observe only the
        // handleMoveExecuted call under test.
        updateFaceLabelsMock.mockClear();
        updateMock.mockClear();
        animateMoveMock.mockClear();
        updateCubiePositionsMock.mockClear();
    });

    afterEach(() => {
        view.destroy();
        vi.restoreAllMocks();
    });

    it('refreshes labels with vertical direction after an animated x move', async () => {
        // Animation succeeds.
        const deferred: { resolve: () => void; promise: Promise<void> } = (() => {
            let resolve!: () => void;
            const promise = new Promise<void>(r => (resolve = r));
            return { resolve, promise };
        })();
        const pivot = document.createElement('div');
        view.getCubeElement()!.appendChild(pivot);
        animateMoveMock.mockReturnValue({
            animation: { finished: deferred.promise, cancel: vi.fn() },
            pivot,
            cubieElements: [],
        });

        view.handleMoveExecuted(wholeCubeEvent(model, 'x'));

        // Before the animation resolves, labels are not yet refreshed.
        expect(lastLabelRefreshDirection()).toBeUndefined();

        deferred.resolve();
        await deferred.promise;
        await Promise.resolve();

        expect(lastLabelRefreshDirection()).toBe('vertical');
    });

    it('refreshes labels with horizontal direction after an animated z move', async () => {
        const deferred: { resolve: () => void; promise: Promise<void> } = (() => {
            let resolve!: () => void;
            const promise = new Promise<void>(r => (resolve = r));
            return { resolve, promise };
        })();
        const pivot = document.createElement('div');
        view.getCubeElement()!.appendChild(pivot);
        animateMoveMock.mockReturnValue({
            animation: { finished: deferred.promise, cancel: vi.fn() },
            pivot,
            cubieElements: [],
        });

        view.handleMoveExecuted(wholeCubeEvent(model, 'z'));
        deferred.resolve();
        await deferred.promise;
        await Promise.resolve();

        expect(lastLabelRefreshDirection()).toBe('horizontal');
    });

    it('refreshes labels after a y2 move on the animated path', async () => {
        const deferred: { resolve: () => void; promise: Promise<void> } = (() => {
            let resolve!: () => void;
            const promise = new Promise<void>(r => (resolve = r));
            return { resolve, promise };
        })();
        const pivot = document.createElement('div');
        view.getCubeElement()!.appendChild(pivot);
        animateMoveMock.mockReturnValue({
            animation: { finished: deferred.promise, cancel: vi.fn() },
            pivot,
            cubieElements: [],
        });

        view.handleMoveExecuted(wholeCubeEvent(model, 'y2'));
        deferred.resolve();
        await deferred.promise;
        await Promise.resolve();

        expect(lastLabelRefreshDirection()).toBe('horizontal');
    });

    it('refreshes labels on the reduced-motion / no-animation path', () => {
        // animateMove returns null (reduced motion, unknown definition, or no
        // matching layer cubies) — the view falls through to an instant update.
        animateMoveMock.mockReturnValue(null);

        view.handleMoveExecuted(wholeCubeEvent(model, 'x'));

        expect(updateCubiePositionsMock).toHaveBeenCalled();
        expect(lastLabelRefreshDirection()).toBe('vertical');
    });

    it('refreshes labels on the no-movedCubies full-update path', () => {
        const event = wholeCubeEvent(model, 'z');
        delete (event.moveDetails as { movedCubies?: unknown }).movedCubies;

        view.handleMoveExecuted(event);

        expect(updateMock).toHaveBeenCalled();
        expect(lastLabelRefreshDirection()).toBe('horizontal');
    });

    it('does NOT refresh labels after a face move', () => {
        // Face moves do not change which original face is at each label slot.
        view.handleMoveExecuted(faceMoveEvent(model, 'R'));
        view.handleMoveExecuted(faceMoveEvent(model, 'U'));

        expect(updateFaceLabelsMock).not.toHaveBeenCalled();
    });
});
