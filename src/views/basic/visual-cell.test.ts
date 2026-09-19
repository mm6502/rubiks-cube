import { describe, expect, it } from 'vitest';

import { CubeController } from '@/cube-controller';
import { CubieType, Face, SUPPORTED_SIZES, StickerId } from '@/cube/types';
import { facePositionTo3D } from '@/cube/utils/sticker-position';

import { BasicView } from './basic-view';
import { viewFrontFace } from './navigation';
import {
    PositionedSticker,
    ViewOrientation,
    stickerAtVisualCell,
    visualCellOf,
    visualCellOfSticker,
} from './visual-cell';

// Exercises the visual-cell rule as a *property* rather than against a fixture
// table: uniqueness, resolution and round trip are asserted at every supported
// size, so a geometry regression fails rather than silently matching stale
// expected values.

type Fixture = {
    view: BasicView;
    model: CubeController;
    container: HTMLElement;
};

/** Build a real view so the orientation vectors are the app's own, not hand-built. */
function createFixture(cubeSize: number): Fixture {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 600 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    document.body.appendChild(container);

    const model = new CubeController(cubeSize);
    const view = new BasicView({ viewType: 'basic-front' });
    view.create(container, model);
    view.resize();

    return { view, model, container };
}

function destroyFixture({ view, container }: Fixture): void {
    view.destroy();
    container.remove();
}

function orientationOf(view: BasicView): ViewOrientation {
    const state = view as unknown as { state: ViewOrientation };
    return { viewRight: { ...state.state.viewRight }, viewUp: { ...state.state.viewUp } };
}

/** All physical (non virtual-centre) stickers of the cube. */
function physicalStickers(model: CubeController): PositionedSticker[] {
    const out: PositionedSticker[] = [];
    for (const cubie of model.getCurrentState().cubiesById.values()) {
        // Virtual-centre cubies each carry a sticker at facePosition 4 for their
        // face, which would show up as a duplicate cell if counted here.
        if (cubie.type === CubieType.VIRTUAL_CENTER) continue;
        for (const sticker of cubie.stickers.values()) {
            out.push({
                id: sticker.id as StickerId,
                face: sticker.currentFace as Face,
                position: sticker.facePosition,
            });
        }
    }
    return out;
}

/** The stickers of whichever face currently faces the viewer. */
function frontFaceStickers(fixture: Fixture): PositionedSticker[] {
    const front = viewFrontFace(
        (fixture.view as unknown as { state: never }).state as never
    ) as Face;
    return physicalStickers(fixture.model).filter(s => s.face === front);
}

const positionOf = (sticker: PositionedSticker, cubeSize: number) =>
    facePositionTo3D(sticker.position, sticker.face, cubeSize);

describe('visualCellOf', () => {
    it('places the centre cell at the origin', () => {
        // The centre offsets to zero along every axis, so its cell is (0, 0)
        // regardless of orientation — the one case where the rule is forced.
        const cubeSize = 3;
        const centre: PositionedSticker = { id: 'x' as StickerId, face: Face.F, position: 4 };
        const cell = visualCellOfSticker(centre, cubeSize, {
            viewRight: { x: 1, y: 0, z: 0 },
            viewUp: { x: 0, y: 1, z: 0 },
        });

        expect(cell).toEqual({ visualX: 0, visualY: 0 });
    });

    it('uses CSS screen conventions: right is positive, up is negative', () => {
        // Face position 0 is the top-left of F — screen-left and screen-up. CSS
        // screen Y grows downward, so "up" must read as a negative visualY.
        const cubeSize = 3;
        const topLeft: PositionedSticker = { id: 'x' as StickerId, face: Face.F, position: 0 };
        const cell = visualCellOfSticker(topLeft, cubeSize, {
            viewRight: { x: 1, y: 0, z: 0 },
            viewUp: { x: 0, y: 1, z: 0 },
        });

        expect(cell.visualX).toBe(-1);
        expect(cell.visualY).toBe(-1);
    });

    it('keeps both components signed', () => {
        // A cell on the opposite side must produce the opposite sign, not the
        // same magnitude. This is the mirroring the raw-index approach loses.
        const cubeSize = 3;
        const orientation = {
            viewRight: { x: 1, y: 0, z: 0 },
            viewUp: { x: 0, y: 1, z: 0 },
        };
        const left = visualCellOfSticker({ face: Face.F, position: 3 }, cubeSize, orientation);
        const right = visualCellOfSticker({ face: Face.F, position: 5 }, cubeSize, orientation);

        expect(left.visualX).toBe(-1);
        expect(right.visualX).toBe(1);
    });

    it('produces exact half-step coordinates with no drift', () => {
        // Positions are integral half-steps and the view vectors are axis-aligned
        // units, so every projected value must land exactly on a half-integer.
        // A non-zero deviation would mean an epsilon is needed — measured as 0.
        for (const cubeSize of SUPPORTED_SIZES) {
            const fixture = createFixture(cubeSize);
            const orientation = orientationOf(fixture.view);

            for (const sticker of frontFaceStickers(fixture)) {
                const cell = visualCellOf(positionOf(sticker, cubeSize), cubeSize, orientation);
                for (const value of [cell.visualX, cell.visualY]) {
                    const nearestHalf = Math.round(value * 2) / 2;
                    expect(value, `size ${cubeSize} value ${value}`).toBe(nearestHalf);
                }
            }

            destroyFixture(fixture);
        }
    });
});

describe('stickerAtVisualCell', () => {
    it.each(SUPPORTED_SIZES)(
        'resolves every front-face cell to exactly one sticker at size %i',
        cubeSize => {
            const fixture = createFixture(cubeSize);
            const orientation = orientationOf(fixture.view);
            const front = viewFrontFace(
                (fixture.view as unknown as { state: never }).state as never
            ) as Face;
            const candidates = physicalStickers(fixture.model);

            const cells = frontFaceStickers(fixture);
            expect(cells.length).toBe(cubeSize * cubeSize);

            for (const sticker of cells) {
                const cell = visualCellOf(positionOf(sticker, cubeSize), cubeSize, orientation);
                const match = stickerAtVisualCell(cell, front, candidates, cubeSize, orientation);

                expect(match, `size ${cubeSize} position ${sticker.position}`).toBeDefined();
                expect(match!.id).toBe(sticker.id);
            }

            destroyFixture(fixture);
        }
    );

    it.each(SUPPORTED_SIZES)(
        'gives every front-face cell a distinct coordinate at size %i',
        cubeSize => {
            const fixture = createFixture(cubeSize);
            const orientation = orientationOf(fixture.view);

            const keys = frontFaceStickers(fixture).map(sticker => {
                const cell = visualCellOf(positionOf(sticker, cubeSize), cubeSize, orientation);
                return `${cell.visualX},${cell.visualY}`;
            });

            expect(new Set(keys).size).toBe(keys.length);

            destroyFixture(fixture);
        }
    );

    it('resolves centre and corner and edge cells, not just the centre', () => {
        // The centre is the easy case — its cell is the origin regardless of
        // orientation. Corner and edge cells are where the signed components and
        // the face-base mirroring actually matter.
        const cubeSize = 3;
        const fixture = createFixture(cubeSize);
        const orientation = orientationOf(fixture.view);
        const front = viewFrontFace(
            (fixture.view as unknown as { state: never }).state as never
        ) as Face;
        const candidates = physicalStickers(fixture.model);

        // 0=top-left, 2=top-right, 4=centre, 6=bottom-left, 8=bottom-right,
        // 1=top-edge, 3=left-edge.
        for (const facePosition of [0, 1, 2, 3, 4, 6, 8]) {
            const sticker = candidates.find(s => s.face === front && s.position === facePosition);
            expect(sticker, `position ${facePosition}`).toBeDefined();

            const cell = visualCellOf(positionOf(sticker!, cubeSize), cubeSize, orientation);
            const match = stickerAtVisualCell(cell, front, candidates, cubeSize, orientation);

            expect(match?.id, `position ${facePosition}`).toBe(sticker!.id);
        }

        destroyFixture(fixture);
    });

    it('returns undefined for a cell that no front-face sticker occupies', () => {
        // The caller's contract relies on this: a miss must be distinguishable
        // from a match so the previous selection can be kept rather than cleared.
        const cubeSize = 3;
        const fixture = createFixture(cubeSize);
        const orientation = orientationOf(fixture.view);
        const front = viewFrontFace(
            (fixture.view as unknown as { state: never }).state as never
        ) as Face;

        const match = stickerAtVisualCell(
            { visualX: 99, visualY: 99 },
            front,
            physicalStickers(fixture.model),
            cubeSize,
            orientation
        );

        expect(match).toBeUndefined();
        destroyFixture(fixture);
    });

    it('returns undefined rather than a near match when a cell does not exist at the size', () => {
        // A cell valid at 5×5 has no equivalent at 2×2. This must be a miss, not
        // a clamped or nearest-cell match.
        const big = createFixture(5);
        const bigOrientation = orientationOf(big.view);
        const outerCell = visualCellOf({ x: 0, y: 0, z: 0 }, 5, bigOrientation);
        const farCell = visualCellOf({ x: 4, y: 4, z: 0 }, 5, bigOrientation);
        expect(outerCell).not.toEqual(farCell);
        destroyFixture(big);

        const small = createFixture(2);
        const smallOrientation = orientationOf(small.view);
        const front = viewFrontFace(
            (small.view as unknown as { state: never }).state as never
        ) as Face;

        const match = stickerAtVisualCell(
            farCell,
            front,
            physicalStickers(small.model),
            2,
            smallOrientation
        );

        expect(match).toBeUndefined();
        destroyFixture(small);
    });

    it('Covers AE2: a corner keeps its visual side across a left rotation', () => {
        // The load-bearing case. Top-left of F, rotate so R fronts: the selection
        // must land top-left again, NOT the mirrored top-right. Preserving the
        // face-position index would put it top-right.
        const cubeSize = 3;
        const fixture = createFixture(cubeSize);

        const frontBefore = viewFrontFace(
            (fixture.view as unknown as { state: never }).state as never
        ) as Face;
        const startSticker = physicalStickers(fixture.model).find(
            s => s.face === frontBefore && s.position === 0
        );
        expect(startSticker, 'top-left of the front face exists').toBeDefined();

        const cellBefore = visualCellOf(
            positionOf(startSticker!, cubeSize),
            cubeSize,
            orientationOf(fixture.view)
        );
        // Top-left is screen-left and screen-up: negative on both axes, since
        // CSS screen Y grows downward.
        expect(cellBefore.visualX).toBeLessThan(0);
        expect(cellBefore.visualY).toBeLessThan(0);

        fixture.view.rotateViewLeft();

        const frontAfter = viewFrontFace(
            (fixture.view as unknown as { state: never }).state as never
        ) as Face;
        const match = stickerAtVisualCell(
            cellBefore,
            frontAfter,
            physicalStickers(fixture.model),
            cubeSize,
            orientationOf(fixture.view)
        );

        expect(match, 'the cell is occupied on the new front face').toBeDefined();

        const cellAfter = visualCellOf(
            positionOf(match!, cubeSize),
            cubeSize,
            orientationOf(fixture.view)
        );
        expect(cellAfter).toEqual(cellBefore);

        // And the index is deliberately NOT preserved. Copying `facePosition`
        // onto the new face would give position 0 on R — which projects to the
        // *top-right*, the mirror image of where the user was looking. The
        // correct sticker is position 2, because R's column index runs opposite
        // to F's in screen space (viewRight becomes −Z after the rotation).
        // This is the concrete proof that preserving the visual cell and
        // preserving the index are different answers.
        expect(startSticker!.position).toBe(0);
        expect(match!.position).toBe(2);
        expect(match!.position).not.toBe(startSticker!.position);

        destroyFixture(fixture);
    });

    it('Covers AE3: rotating one way and back returns the original cell', () => {
        const cubeSize = 3;
        const fixture = createFixture(cubeSize);

        const front = viewFrontFace(
            (fixture.view as unknown as { state: never }).state as never
        ) as Face;
        const start = physicalStickers(fixture.model).find(
            s => s.face === front && s.position === 6
        )!;
        const startCell = visualCellOf(
            positionOf(start, cubeSize),
            cubeSize,
            orientationOf(fixture.view)
        );

        fixture.view.rotateViewLeft();
        const midFront = viewFrontFace(
            (fixture.view as unknown as { state: never }).state as never
        ) as Face;
        const mid = stickerAtVisualCell(
            startCell,
            midFront,
            physicalStickers(fixture.model),
            cubeSize,
            orientationOf(fixture.view)
        );
        expect(mid).toBeDefined();

        fixture.view.rotateViewRight();
        const endFront = viewFrontFace(
            (fixture.view as unknown as { state: never }).state as never
        ) as Face;
        const end = stickerAtVisualCell(
            startCell,
            endFront,
            physicalStickers(fixture.model),
            cubeSize,
            orientationOf(fixture.view)
        );

        expect(end?.id).toBe(start.id);

        destroyFixture(fixture);
    });

    it('Covers AE4: resolves at 4x4 with the size-ambiguous centre block', () => {
        const cubeSize = 4;
        const fixture = createFixture(cubeSize);
        const orientation = orientationOf(fixture.view);
        const front = viewFrontFace(
            (fixture.view as unknown as { state: never }).state as never
        ) as Face;
        const candidates = physicalStickers(fixture.model);

        // Every cell, including the four central ones which share the idea of
        // "the centre" and therefore could collide under a naive rule.
        for (const sticker of candidates.filter(s => s.face === front)) {
            expect(sticker.position).toBeGreaterThanOrEqual(0);
            expect(sticker.position).toBeLessThan(cubeSize * cubeSize);

            const cell = visualCellOf(positionOf(sticker, cubeSize), cubeSize, orientation);
            const match = stickerAtVisualCell(cell, front, candidates, cubeSize, orientation);

            expect(match?.id, `position ${sticker.position}`).toBe(sticker.id);
        }

        destroyFixture(fixture);
    });

    it.each(['rotL', 'rotR', 'rotU', 'rotD'] as const)('resolves every cell after %s', rotation => {
        const cubeSize = 3;
        const fixture = createFixture(cubeSize);

        // Capture each front-face cell *before* rotating.
        const beforeFront = viewFrontFace(
            (fixture.view as unknown as { state: never }).state as never
        ) as Face;
        const before = physicalStickers(fixture.model)
            .filter(s => s.face === beforeFront)
            .map(s => ({
                sticker: s,
                cell: visualCellOf(positionOf(s, cubeSize), cubeSize, orientationOf(fixture.view)),
            }));

        switch (rotation) {
            case 'rotL':
                fixture.view.rotateViewLeft();
                break;
            case 'rotR':
                fixture.view.rotateViewRight();
                break;
            case 'rotU':
                fixture.view.rotateViewUp();
                break;
            case 'rotD':
                fixture.view.rotateViewDown();
                break;
        }

        const afterFront = viewFrontFace(
            (fixture.view as unknown as { state: never }).state as never
        ) as Face;
        const candidates = physicalStickers(fixture.model);

        for (const { sticker, cell } of before) {
            const match = stickerAtVisualCell(
                cell,
                afterFront,
                candidates,
                cubeSize,
                orientationOf(fixture.view)
            );
            expect(
                match,
                `${rotation}: ${sticker.face}:${sticker.position} unresolved`
            ).toBeDefined();
        }

        destroyFixture(fixture);
    });
});
