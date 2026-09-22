// Unit tests for cubie-rendering.ts — covers face transforms and the new
// per-cubie interior-face rendering for Basic 2.
import { describe, expect, it, vi } from 'vitest';

import { Face } from '@/cube/types';

import {
    buildCubieElement,
    getFaceTransform,
    initializeCubies,
    resizeCubies,
    stickerBorderWidth,
    updateCubiePositions,
} from './cubie-rendering';
import type { BasicViewInternalData } from './types';

const styles: Record<string, string> = {
    cubie: 'cubie',
    sticker: 'sticker',
    'cubie-interior': 'cubie-interior',
};

function createCubie(stickerFaces: Face[]): any {
    return {
        id: 'cubie-1',
        position: { x: 0, y: 0, z: 0 },
        stickers: stickerFaces.map((face, index) => ({
            id: `${face}-${index}` as any,
            currentFace: face,
            color: 'white',
        })),
    };
}

describe('cubie-rendering - stickerBorderWidth', () => {
    // The sticker border used to be `0.5cqmin`, a container-query unit. This codebase declares
    // no `container-type` anywhere, so per spec it resolved against the SMALL VIEWPORT rather
    // than the cube: measured, resizing the panel left the border at a fixed 4px while the
    // sticker went 63px -> 99px, and on a 900px-tall viewport the fractional 4.5px painted 4px
    // on some stickers and 5px on others on the same cube. These pin the replacement.

    it('scales with the cubie, so the proportion stays near-constant', () => {
        // The defect was a border that did not track the cube. Every realistic cubie size must
        // land in a narrow band; a fixed value would fail this by drifting as the size changes.
        const sizes = [33, 46, 55, 63, 70, 80, 98, 120];
        for (const cubie of sizes) {
            const pct = (stickerBorderWidth(cubie) / cubie) * 100;
            expect(pct, `cubie ${cubie}px should keep 8% +- rounding`).toBeGreaterThan(7);
            expect(pct, `cubie ${cubie}px should keep 8% +- rounding`).toBeLessThan(10);
        }
    });

    it('is strictly larger for a larger cubie, never smaller', () => {
        // Monotonic: growing the panel must never thin the border.
        let previous = 0;
        for (const cubie of [33, 46, 55, 63, 70, 80, 98, 120, 160]) {
            const width = stickerBorderWidth(cubie);
            expect(width, `cubie ${cubie}px`).toBeGreaterThanOrEqual(previous);
            previous = width;
        }
    });

    it('returns whole pixels, so every sticker on a cube agrees', () => {
        // The crux of the visible defect. A fractional width lets the browser round each
        // element independently, producing mixed border widths across one cube — the uneven
        // separations that were reported. Whole numbers make that impossible.
        for (let cubie = 20; cubie <= 200; cubie++) {
            const width = stickerBorderWidth(cubie);
            expect(
                Number.isInteger(width),
                `cubie ${cubie}px -> ${width} must be a whole pixel`
            ).toBe(true);
        }
    });

    it('stays legible on a small cubie and does not explode on a large one', () => {
        // A tiny cubie (a 7x7 in a short panel) would otherwise go sub-pixel and merge the
        // facelets; the floor keeps the grid readable.
        expect(stickerBorderWidth(10)).toBe(2);
        expect(stickerBorderWidth(33)).toBe(3);
        // And an absurd size is still bounded.
        expect(stickerBorderWidth(10000)).toBeLessThanOrEqual(16);
    });
});

describe('cubie-rendering - getFaceTransform', () => {
    it('returns a plain translateZ for Face.F', () => {
        expect(getFaceTransform(Face.F, 150)).toBe('translateZ(150px)');
    });

    it('returns a 180deg Y rotation + translateZ for Face.B', () => {
        expect(getFaceTransform(Face.B, 150)).toBe('rotateY(180deg) translateZ(150px)');
    });

    it('returns a 90deg Y rotation + translateZ for Face.R', () => {
        expect(getFaceTransform(Face.R, 150)).toBe('rotateY(90deg) translateZ(150px)');
    });

    it('returns a -90deg Y rotation + translateZ for Face.L', () => {
        expect(getFaceTransform(Face.L, 150)).toBe('rotateY(-90deg) translateZ(150px)');
    });

    it('returns a 90deg X rotation + translateZ for Face.U', () => {
        expect(getFaceTransform(Face.U, 150)).toBe('rotateX(90deg) translateZ(150px)');
    });

    it('returns a -90deg X rotation + translateZ for Face.D', () => {
        expect(getFaceTransform(Face.D, 150)).toBe('rotateX(-90deg) translateZ(150px)');
    });

    it('does not throw and returns a valid transform string for halfSize = 0', () => {
        expect(() => getFaceTransform(Face.F, 0)).not.toThrow();
        expect(getFaceTransform(Face.F, 0)).toBe('translateZ(0px)');
    });
});

describe('cubie-rendering - interior faces', () => {
    it('creates one interior face per non-sticker side for corner, edge, and face-center cubies', () => {
        const cornerCubie = createCubie([Face.F, Face.U, Face.R]);
        const edgeCubie = createCubie([Face.F, Face.U]);
        const centerCubie = createCubie([Face.F]);

        const cornerEl = buildCubieElement(cornerCubie, 100, 3, styles, vi.fn());
        const edgeEl = buildCubieElement(edgeCubie, 100, 3, styles, vi.fn());
        const centerEl = buildCubieElement(centerCubie, 100, 3, styles, vi.fn());

        expect(cornerEl.querySelectorAll('.cubie-interior')).toHaveLength(3);
        expect(edgeEl.querySelectorAll('.cubie-interior')).toHaveLength(4);
        expect(centerEl.querySelectorAll('.cubie-interior')).toHaveLength(5);
    });

    it('marks each interior face as non-interactive and aria-hidden, with the cube-interior color token', () => {
        const cubie = createCubie([Face.F, Face.U]);
        const cubieEl = buildCubieElement(cubie, 100, 3, styles, vi.fn());
        const interiorFaces = Array.from(
            cubieEl.querySelectorAll('.cubie-interior')
        ) as HTMLElement[];

        expect(interiorFaces).not.toHaveLength(0);
        interiorFaces.forEach(face => {
            expect(face.getAttribute('aria-hidden')).toBe('true');
            expect(face.style.pointerEvents).toBe('none');
            expect(face.style.backgroundColor).toBe('var(--color-domain-cube-interior)');
        });
    });

    it('does not fire the sticker callback when an interior face is clicked', () => {
        const onStickerSelected = vi.fn();
        const cubie = createCubie([Face.F]);
        const cubieEl = buildCubieElement(cubie, 100, 3, styles, onStickerSelected);
        const interiorFace = cubieEl.querySelector('.cubie-interior') as HTMLElement;

        interiorFace.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(onStickerSelected).not.toHaveBeenCalled();
    });

    it('rebuilds interior faces when cubie stickers change during a position update', () => {
        const cubeElement = document.createElement('div');
        cubeElement.style.width = '300px';
        cubeElement.style.height = '300px';
        (cubeElement as HTMLElement & { cubieSize?: number }).cubieSize = 100;

        const initialCubie = createCubie([Face.F, Face.U, Face.R]);
        const initialEl = buildCubieElement(initialCubie, 100, 3, styles, vi.fn());
        cubeElement.appendChild(initialEl);

        const updatedCubie = createCubie([Face.B]);
        updatedCubie.id = initialCubie.id;
        updateCubiePositions(cubeElement, { after: [updatedCubie] });

        const rebuiltInteriorFaces = cubeElement.querySelectorAll('.cubie-interior');
        expect(rebuiltInteriorFaces).toHaveLength(5);
    });

    it('keeps the sticker-selection callback wired after a position update rebuilds sticker faces', () => {
        const cubeElement = document.createElement('div');
        cubeElement.style.width = '300px';
        cubeElement.style.height = '300px';
        (cubeElement as HTMLElement & { cubieSize?: number }).cubieSize = 100;

        const initialCubie = createCubie([Face.F, Face.U, Face.R]);
        const initialEl = buildCubieElement(initialCubie, 100, 3, styles, vi.fn());
        cubeElement.appendChild(initialEl);

        const updatedCubie = createCubie([Face.F, Face.U, Face.R]);
        updatedCubie.id = initialCubie.id;
        const onStickerSelected = vi.fn();
        updateCubiePositions(cubeElement, { after: [updatedCubie] }, styles, onStickerSelected);

        const stickerFace = cubeElement.querySelector('[data-sticker-id]') as HTMLElement;
        stickerFace.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(onStickerSelected).toHaveBeenCalledTimes(1);
    });
});

describe('cubie-rendering - data-face contract', () => {
    // `data-face` is the ONE attribute naming a face element in this view. The
    // whole render path depends on two properties of it, and both are load-bearing
    // rather than incidental — a regression in either silently breaks something
    // far away from this file:
    //
    //  1. Every face element carries it, sticker AND interior alike, because
    //     `resizeCubies` finds them all through a single `[data-face]` query. An
    //     interior div missing it keeps its OLD halfSize transform after a resize
    //     and visibly detaches from its cubie.
    //  2. Every face element carries it EXACTLY ONCE, and no element carries a
    //     second face-naming attribute. A duplicate write is how this drifted into
    //     two attributes (`data-basic-face` + `data-face`) in the first place.
    it('marks every face element (sticker and interior) with exactly one data-face attribute', () => {
        const cubie = createCubie([Face.F, Face.U]);
        const cubieEl = buildCubieElement(cubie, 100, 3, styles, vi.fn());

        const stickers = Array.from(cubieEl.querySelectorAll('.sticker')) as HTMLElement[];
        const interiors = Array.from(cubieEl.querySelectorAll('.cubie-interior')) as HTMLElement[];

        expect(stickers).toHaveLength(2);
        expect(interiors).toHaveLength(4);

        for (const el of [...stickers, ...interiors]) {
            const face = el.getAttribute('data-face');
            expect(face, 'every face element must name its face').not.toBeNull();

            const faceAttrs = Array.from(el.attributes).filter(
                a => a.name === 'data-face' || a.name.endsWith('-face')
            );
            expect(
                faceAttrs.map(a => a.name),
                'exactly one face-naming attribute — never a duplicate'
            ).toEqual(['data-face']);
        }
    });

    it('gives every face element a face it can be transformed from', () => {
        // The transform is derived FROM the attribute, so an attribute value that
        // is not a real Face would silently fall through getFaceTransform's default
        // branch and stack every face on the front plane.
        const cubie = createCubie([Face.F, Face.U, Face.R]);
        const cubieEl = buildCubieElement(cubie, 100, 3, styles, vi.fn());
        const validFaces = new Set<string>(Object.values(Face));

        cubieEl.querySelectorAll('[data-face]').forEach(el => {
            const face = el.getAttribute('data-face')!;
            expect(validFaces.has(face), `"${face}" must be a real Face`).toBe(true);
        });
    });
});

// --- resizeCubies tests ---

describe('cubie-rendering - resizeCubies', () => {
    function makeState(
        cubeSize: number,
        cubieSize: number
    ): BasicViewInternalData & { cubieSize?: number } {
        const cubeEl = document.createElement('div');
        cubeEl.style.width = `${cubieSize * cubeSize}px`;
        cubeEl.style.height = `${cubieSize * cubeSize}px`;
        (cubeEl as HTMLElement & { cubieSize?: number }).cubieSize = cubieSize;

        const cubiesByPosition = new Map<string, any>();
        const max = cubeSize - 1;
        const pad = (n: number) => n.toString().padStart(2, '0');
        for (let x = 0; x < cubeSize; x++) {
            for (let y = 0; y < cubeSize; y++) {
                for (let z = 0; z < cubeSize; z++) {
                    if (x === 0 || x === max || y === 0 || y === max || z === 0 || z === max) {
                        const posKey = `pos_${pad(x)}_${pad(y)}_${pad(z)}` as any;
                        cubiesByPosition.set(posKey, {
                            id: `c-${x}-${y}-${z}`,
                            position: { x, y, z },
                            stickers: [],
                        });
                    }
                }
            }
        }

        const model = {
            getCurrentState: () => ({
                cubeSize,
                cubiesByPosition,
            }),
        } as any;

        return {
            cubeElement: cubeEl,
            model,
            styles: {},
            cubieSize,
        } as any;
    }

    it('returns true and resizes every cubie for a matching 3x3 DOM', () => {
        const state = makeState(3, 100);
        // Build initial DOM via initializeCubies
        initializeCubies(state, 300);

        const cubeEl = state.cubeElement!;
        expect(cubeEl.querySelectorAll('[data-cubie-id]')).toHaveLength(26);

        const result = resizeCubies(state, 600);
        expect(result).toBe(true);

        // Every cubie should now be 200px (600 / 3)
        const cubies = cubeEl.querySelectorAll('[data-cubie-id]');
        expect(cubies).toHaveLength(26);
        cubies.forEach(el => {
            const h = el as HTMLElement;
            expect(h.style.width).toBe('200px');
            expect(h.style.height).toBe('200px');
        });
    });

    it('preserves node identity for every cubie', () => {
        const state = makeState(3, 100);
        initializeCubies(state, 300);
        const cubeEl = state.cubeElement!;

        const beforeIds = Array.from(cubeEl.querySelectorAll('[data-cubie-id]')).map(el =>
            el.getAttribute('data-cubie-id')
        );

        resizeCubies(state, 450);

        const afterIds = Array.from(cubeEl.querySelectorAll('[data-cubie-id]')).map(el =>
            el.getAttribute('data-cubie-id')
        );
        expect(afterIds).toEqual(beforeIds);
    });

    it('rejects a DOM missing one expected cubie', () => {
        const state = makeState(3, 100);
        initializeCubies(state, 300);
        const cubeEl = state.cubeElement!;

        // Remove one cubie to break the match
        const all = cubeEl.querySelectorAll('[data-cubie-id]');
        all[0].remove();

        const result = resizeCubies(state, 450);
        expect(result).toBe(false);

        // Existing elements must be untouched — assert widths are still the old size.
        const remaining = cubeEl.querySelectorAll('[data-cubie-id]');
        remaining.forEach(el => {
            const h = el as HTMLElement;
            expect(h.style.width).toBe('100px');
        });
    });

    it('rejects an empty cubie DOM', () => {
        const state = makeState(3, 100);
        const result = resizeCubies(state, 450);
        expect(result).toBe(false);
    });

    it('updates every face element transform to the new half-size', () => {
        const state = makeState(3, 100);
        initializeCubies(state, 300);
        const cubeEl = state.cubeElement!;

        // Resize to a DIFFERENT size. A same-size resize would leave every
        // transform already correct, so it could not tell a working update from a
        // skipped one — which is exactly the failure mode being guarded.
        resizeCubies(state, 600);

        const faceEls = cubeEl.querySelectorAll('[data-face]');
        expect(faceEls.length).toBeGreaterThan(0);

        const newHalf = 600 / 3 / 2;
        faceEls.forEach(el => {
            const h = el as HTMLElement;
            const faceAttr = h.getAttribute('data-face');
            // No silent skip: an element that reaches this query without a face is
            // the bug, not a case to tolerate.
            expect(faceAttr, 'every element matched by [data-face] must carry one').not.toBeNull();
            expect(h.style.transform).toBe(getFaceTransform(faceAttr as Face, newHalf));
        });
    });

    it('rescales interior faces too, not only stickers', () => {
        // makeState builds cubies with NO stickers, so every face element here is
        // an interior div. `resizeCubies` finds them through the same `[data-face]`
        // query as stickers — if interiors ever stopped carrying the attribute they
        // would keep the pre-resize halfSize and visibly detach from their cubie.
        const state = makeState(3, 100);
        initializeCubies(state, 300);
        const cubeEl = state.cubeElement!;

        const interiors = cubeEl.querySelectorAll('.cubie-interior');
        expect(interiors.length).toBeGreaterThan(0);
        expect(cubeEl.querySelectorAll('.sticker')).toHaveLength(0);

        resizeCubies(state, 600);

        const newHalf = 600 / 3 / 2;
        cubeEl.querySelectorAll('.cubie-interior').forEach(el => {
            const interior = el as HTMLElement;
            const face = interior.getAttribute('data-face');
            expect(
                face,
                'an interior element without data-face is invisible to the resize'
            ).not.toBeNull();
            expect(interior.style.transform).toBe(getFaceTransform(face as Face, newHalf));
        });
    });

    it('sets --cubie-border-width from stickerBorderWidth of the new cubie size', () => {
        const state = makeState(3, 100);
        initializeCubies(state, 300);
        const cubeEl = state.cubeElement!;

        resizeCubies(state, 600);

        const newCubieSize = 600 / 3;
        const expectedBorder = stickerBorderWidth(newCubieSize);
        const actualBorder = cubeEl.style.getPropertyValue('--cubie-border-width');
        expect(actualBorder).toBe(`${expectedBorder}px`);
    });

    it('two resizes to the same size produce identical geometry', () => {
        const state = makeState(3, 100);
        initializeCubies(state, 300);
        const cubeEl = state.cubeElement!;

        resizeCubies(state, 400);
        const first = Array.from(cubeEl.querySelectorAll('[data-cubie-id]')).map(el => {
            const h = el as HTMLElement;
            return {
                width: h.style.width,
                height: h.style.height,
                transform: h.style.transform,
            };
        });

        resizeCubies(state, 400);
        const second = Array.from(cubeEl.querySelectorAll('[data-cubie-id]')).map(el => {
            const h = el as HTMLElement;
            return {
                width: h.style.width,
                height: h.style.height,
                transform: h.style.transform,
            };
        });

        expect(second).toEqual(first);
    });
});
