// Characterization coverage for Basic 2 layer transform stability (U2).
//
// These tests document the current `cubieSize` / face-size / position-derivation
// behavior across cube sizes before the layer-distortion fix. They assert the
// invariant that post-move `updateCubiePositions` must compute the same
// translate3d coordinates that `initializeCubies` used to lay cubies out,
// otherwise the animated layer "distorts" when it is rehomed after a move.
import { describe, expect, it, vi } from 'vitest';

import { Map as IMap } from 'immutable';

import { Axis, Cubie, CubieType, Face, QuarterTurn, Sticker, StickerId } from '@/cube/types';

import { buildCubieElement, updateCubiePositions } from './cubie-rendering';

const styles: Record<string, string> = {
    cubie: 'cubie',
    sticker: 'sticker',
    'cubie-interior': 'cubie-interior',
};

function makeCubie(id: string, position: { x: number; y: number; z: number }): Cubie {
    const stickerId = (face: Face): StickerId => `${id}_${face}_sticker` as StickerId;
    const stickers: Sticker[] = [
        {
            id: stickerId(Face.F),
            color: 'white',
            cubieId: id as Cubie['id'],
            localIndex: 0,
            currentFace: Face.F,
            facePosition: 0,
        },
        {
            id: stickerId(Face.U),
            color: 'yellow',
            cubieId: id as Cubie['id'],
            localIndex: 0,
            currentFace: Face.U,
            facePosition: 0,
        },
    ];
    return {
        id: id as Cubie['id'],
        type: CubieType.CENTER,
        position,
        orientation: 0,
        canonicalIndex: 0,
        stickers: IMap<StickerId, Sticker>(stickers.map(s => [s.id, s])),
    };
}

/**
 * Expected translate3d for a cubie under the size-aware layout formula used by
 * initializeCubies (the source of truth for the rest pose):
 *   cx = x * cubieSize
 *   cy = (cubeSize - 1 - y) * cubieSize
 *   cz = ((cubeSize - 1) / 2 - z) * cubieSize
 */
function expectedTransform(
    position: { x: number; y: number; z: number },
    cubeSize: number,
    faceSize: number
): string {
    const cubieSize = faceSize / cubeSize;
    const cx = position.x * cubieSize;
    const cy = (cubeSize - 1 - position.y) * cubieSize;
    const cz = ((cubeSize - 1) / 2 - position.z) * cubieSize;
    return `translate3d(${cx}px, ${cy}px, ${cz}px)`;
}

/**
 * Simulates the real-view setup: initializeCubies lays cubies out with the
 * correct size-aware geometry and stores cubieSize on the cube element (the
 * fix in cubie-rendering.ts). A subsequent move calls updateCubiePositions,
 * which must derive the same coordinates from that stored value.
 */
function buildCubeElement(
    faceSize: number,
    cubeSize: number
): HTMLElement & { cubieSize?: number } {
    const cubeElement = document.createElement('div') as HTMLElement & { cubieSize?: number };
    cubeElement.style.width = `${faceSize}px`;
    cubeElement.style.height = `${faceSize}px`;
    cubeElement.cubieSize = faceSize / cubeSize;
    return cubeElement;
}

describe('layer stability - post-move cubie positions match initial layout', () => {
    it('2x2: updateCubiePositions derives the correct cube size and repositions in place', () => {
        const faceSize = 400; // 2x2, cubieSize = 200
        const cubeElement = buildCubeElement(faceSize, 2);
        const cubie = makeCubie('pos_00_00_00', { x: 0, y: 0, z: 0 });
        const el = buildCubieElement(cubie, 200, 2, styles, vi.fn());
        cubeElement.appendChild(el);

        // Rest pose from initializeCubies
        expect(el.style.transform).toBe(expectedTransform(cubie.position, 2, faceSize));

        // Move changes the cubie's position (e.g. U layer rotates), then the
        // view calls updateCubiePositions to rehome it.
        const moved = { ...cubie, position: { x: 0, y: 0, z: 1 } };
        updateCubiePositions(cubeElement, { after: [moved] });

        // updateCubiePositions must compute geometry from the real cube size,
        // not a hardcoded 3x3 assumption.
        expect(el.style.transform).toBe(expectedTransform(moved.position, 2, faceSize));
    });

    it('4x4: updateCubiePositions repositions a face-center cubie without 3x3 skew', () => {
        const faceSize = 400; // 4x4, cubieSize = 100
        const cubeElement = buildCubeElement(faceSize, 4);
        const cubie = makeCubie('pos_01_01_00', { x: 1, y: 1, z: 0 });
        const el = buildCubieElement(cubie, 100, 4, styles, vi.fn());
        cubeElement.appendChild(el);

        expect(el.style.transform).toBe(expectedTransform(cubie.position, 4, faceSize));

        // Simulate a U move that carries this cubie to a new position.
        const moved = { ...cubie, position: { x: 1, y: 1, z: 2 } };
        updateCubiePositions(cubeElement, { after: [moved] });

        expect(el.style.transform).toBe(expectedTransform(moved.position, 4, faceSize));
    });

    it('5x5: repeated moves keep using the updated cubie geometry rather than stale 3x3 coordinates', () => {
        const faceSize = 500; // 5x5, cubieSize = 100
        const cubeElement = buildCubeElement(faceSize, 5);
        const cubie = makeCubie('pos_02_02_00', { x: 2, y: 2, z: 0 });
        const el = buildCubieElement(cubie, 100, 5, styles, vi.fn());
        cubeElement.appendChild(el);

        // First move: an R turn moves the cubie from the F face inward.
        updateCubiePositions(cubeElement, {
            after: [{ ...cubie, position: { x: 2, y: 2, z: 1 } }],
        });
        expect(el.style.transform).toBe(expectedTransform({ x: 2, y: 2, z: 1 }, 5, faceSize));

        // Second move: it keeps moving, still at 5x5 geometry.
        updateCubiePositions(cubeElement, {
            after: [{ ...cubie, position: { x: 2, y: 2, z: 2 } }],
        });
        expect(el.style.transform).toBe(expectedTransform({ x: 2, y: 2, z: 2 }, 5, faceSize));
    });

    it('7x7: the largest supported size repositions without clipping or overlap', () => {
        const faceSize = 700; // 7x7, cubieSize = 100
        const cubeElement = buildCubeElement(faceSize, 7);
        const cubie = makeCubie('pos_03_06_00', { x: 3, y: 6, z: 0 });
        const el = buildCubieElement(cubie, 100, 7, styles, vi.fn());
        cubeElement.appendChild(el);

        expect(el.style.transform).toBe(expectedTransform(cubie.position, 7, faceSize));

        const moved = { ...cubie, position: { x: 3, y: 6, z: 3 } };
        updateCubiePositions(cubeElement, { after: [moved] });

        expect(el.style.transform).toBe(expectedTransform(moved.position, 7, faceSize));
    });

    it('3x3: the baseline size is unaffected by the fix', () => {
        const faceSize = 300;
        const cubeElement = buildCubeElement(faceSize, 3);
        const cubie = makeCubie('pos_00_00_00', { x: 0, y: 0, z: 0 });
        const el = buildCubieElement(cubie, 100, 3, styles, vi.fn());
        cubeElement.appendChild(el);

        expect(el.style.transform).toBe(expectedTransform(cubie.position, 3, faceSize));

        const moved = { ...cubie, position: { x: 0, y: 0, z: 1 } };
        updateCubiePositions(cubeElement, { after: [moved] });

        expect(el.style.transform).toBe(expectedTransform(moved.position, 3, faceSize));
    });
});

// ---------------------------------------------------------------------------
// Integration: an animated move rehomes the layer to size-aware coordinates
// ---------------------------------------------------------------------------

describe('layer stability - animated move through the real view (integration)', () => {
    let deferred: { resolve: () => void; promise: Promise<void> } | null = null;

    function installAnimationMocks() {
        // Resolve the animation.finished promise only when the test flushes it,
        // so the post-animation rehome (finalizeLayer + updateCubiePositions)
        // runs deterministically.
        deferred = (() => {
            let resolve!: () => void;
            const promise = new Promise<void>(r => (resolve = r));
            return { resolve, promise };
        })();
        Object.defineProperty(HTMLElement.prototype, 'animate', {
            configurable: true,
            value: vi.fn(() => ({
                cancel: vi.fn(),
                finished: deferred!.promise,
            })),
        });
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
    }

    afterEach(() => {
        deferred = null;
        vi.restoreAllMocks();
    });

    it('rehomes a 4x4 U-layer cubie to the correct size-aware coordinates after an animated move', async () => {
        const { CubeController } = await import('@/cube-controller');
        const { BasicView } = await import('./basic-view');
        installAnimationMocks();

        const model = new CubeController(4);
        const view = new BasicView({ viewType: 'basic-front' });
        const container = document.createElement('div');
        view.create(container, model);

        const cubeElement = view.getCubeElement()!;
        const faceSize = parseFloat(cubeElement.style.width);

        // Apply U and capture the real move result to build the event exactly
        // as CubeController would emit it.
        const result = model.applyMove('U');
        expect(result).not.toBeNull();

        view.handleMoveExecuted({
            moveDetails: {
                notation: 'U',
                definition: {
                    name: 'U',
                    axis: Axis.Y,
                    layerIndices: [0],
                    angle: QuarterTurn.QUARTER,
                },
                movedCubies: result!.movedCubies,
            },
            preState: result!.preState,
            postState: result!.postState,
        });

        // The animation is in flight; the moved cubies currently live in the pivot.
        const movedId = result!.movedCubies.after[0].id;
        const inPivotCubie = cubeElement.querySelector(`[data-cubie-id="${movedId}"]`);
        expect(inPivotCubie).not.toBeNull();

        // Flush the animation; the rehome continuation must now run.
        deferred!.resolve();
        await deferred!.promise;
        await Promise.resolve();
        await Promise.resolve();

        // Every moved cubie must sit at a size-aware position after rehoming.
        for (const after of result!.movedCubies.after) {
            const el = cubeElement.querySelector(`[data-cubie-id="${after.id}"]`) as HTMLElement;
            expect(el).not.toBeNull();
            expect(el.style.transform).toMatch(/^translate3d\(/);
            expect(el.style.transform).toBe(expectedTransform(after.position, 4, faceSize));
        }

        view.destroy();
    });

    it('keeps a 3x3 animated layer on its baseline coordinates', async () => {
        const { CubeController } = await import('@/cube-controller');
        const { BasicView } = await import('./basic-view');
        installAnimationMocks();

        const model = new CubeController(3);
        const view = new BasicView({ viewType: 'basic-front' });
        const container = document.createElement('div');
        view.create(container, model);

        const cubeElement = view.getCubeElement()!;
        const faceSize = parseFloat(cubeElement.style.width);

        const result = model.applyMove('U');
        expect(result).not.toBeNull();

        view.handleMoveExecuted({
            moveDetails: {
                notation: 'U',
                definition: {
                    name: 'U',
                    axis: Axis.Y,
                    layerIndices: [0],
                    angle: QuarterTurn.QUARTER,
                },
                movedCubies: result!.movedCubies,
            },
            preState: result!.preState,
            postState: result!.postState,
        });

        deferred!.resolve();
        await deferred!.promise;
        await Promise.resolve();
        await Promise.resolve();

        // Every moved cubie must sit at the same 3x3 baseline coordinates it
        // would have under the original (and now preserved) geometry.
        for (const after of result!.movedCubies.after) {
            const el = cubeElement.querySelector(`[data-cubie-id="${after.id}"]`) as HTMLElement;
            expect(el).not.toBeNull();
            expect(el.style.transform).toMatch(/^translate3d\(/);
            expect(el.style.transform).toBe(expectedTransform(after.position, 3, faceSize));
        }

        view.destroy();
    });
});
