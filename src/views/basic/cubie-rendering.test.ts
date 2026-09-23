// Unit tests for cubie-rendering.ts — covers face transforms and the new
// per-cubie interior-face rendering for Basic 2.
import { describe, expect, it, vi } from 'vitest';

import { Face } from '@/cube/types';

import {
    STICKER_LIFT_PX,
    buildCubieElement,
    getFaceTransform,
    initializeCubies,
    resizeCubies,
    stickerBorderWidth,
    stickerTransform,
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

describe('cubie-rendering - stickerTransform', () => {
    it('is the wall transform with the sticker lift added', () => {
        // The pair exists so the initial render and the resize path can never disagree
        // about how far a sticker sits off its wall — that divergence is what makes a
        // sticker flicker or visibly detach after a resize.
        for (const face of [Face.F, Face.B, Face.R, Face.L, Face.U, Face.D]) {
            for (const half of [0, 23.1, 50, 150]) {
                expect(stickerTransform(face, half)).toBe(
                    getFaceTransform(face, half + STICKER_LIFT_PX)
                );
            }
        }
    });

    it('lifts by a small absolute amount, not a fraction of the cube', () => {
        // The lift only has to break a depth-sort tie; scaling it with the cube would make
        // a larger cube look like its stickers are floating.
        expect(STICKER_LIFT_PX).toBeGreaterThan(0);
        expect(STICKER_LIFT_PX).toBeLessThan(2);
        expect(stickerTransform(Face.F, 0)).toBe(`translateZ(${STICKER_LIFT_PX}px)`);
        expect(stickerTransform(Face.F, 400)).toBe(`translateZ(${400 + STICKER_LIFT_PX}px)`);
    });
});

describe('cubie-rendering - sealed body walls', () => {
    it('gives every cubie six walls, whatever its sticker count', () => {
        // The body is the seal: it is not "the sides without a sticker", it is ALL six
        // sides. Neighbouring cubies' walls meet flush on the shared face plane, which is
        // what closes the cube. So a centre cubie (1 sticker) gets six walls too — the
        // walls behind its sticker are load-bearing, not redundant.
        const cases: Array<[string, Face[], number]> = [
            ['corner', [Face.F, Face.U, Face.R], 3],
            ['edge', [Face.F, Face.U], 2],
            ['face-centre', [Face.F], 1],
        ];

        for (const [name, faces, stickerCount] of cases) {
            const el = buildCubieElement(createCubie(faces), 100, 3, styles, vi.fn());
            const walls = el.querySelectorAll('.cubie-interior');
            const stickers = el.querySelectorAll('.sticker');

            expect(stickers, `${name}: sticker count`).toHaveLength(stickerCount);
            expect(walls, `${name}: one wall per face`).toHaveLength(6);
            expect(el.children, `${name}: 6 walls + ${stickerCount} stickers`).toHaveLength(
                6 + stickerCount
            );
        }
    });

    it('lays the walls before the stickers, so a sticker paints over its own wall', () => {
        const el = buildCubieElement(createCubie([Face.F]), 100, 3, styles, vi.fn());
        const children = [...el.children];
        const lastWall = children.map(c => c.className).lastIndexOf('cubie-interior');
        const firstSticker = children.map(c => c.className).indexOf('sticker');

        expect(firstSticker, 'a sticker exists').toBeGreaterThan(-1);
        expect(lastWall).toBeLessThan(firstSticker);
    });

    it('marks every wall as non-interactive, aria-hidden, with the cube-interior colour', () => {
        const el = buildCubieElement(createCubie([Face.F, Face.U]), 100, 3, styles, vi.fn());
        const walls = Array.from(el.querySelectorAll('.cubie-interior')) as HTMLElement[];

        expect(walls).toHaveLength(6);
        walls.forEach(wall => {
            expect(wall.getAttribute('aria-hidden')).toBe('true');
            expect(wall.style.pointerEvents).toBe('none');
            expect(wall.style.backgroundColor).toBe('var(--color-domain-cube-interior)');
        });
    });

    it('does not fire the sticker callback when a wall is clicked', () => {
        const onStickerSelected = vi.fn();
        const el = buildCubieElement(createCubie([Face.F]), 100, 3, styles, onStickerSelected);

        (el.querySelector('.cubie-interior') as HTMLElement).dispatchEvent(
            new MouseEvent('click', { bubbles: true })
        );

        expect(onStickerSelected).not.toHaveBeenCalled();
    });

    it('lifts each sticker clear of the wall it sits on', () => {
        // Sticker and wall describe the same face, so without the lift they are coplanar
        // and the browser depth-sorts them inconsistently (visible flicker). The wall must
        // stay exactly on the face plane while the sticker moves in front of it.
        const half = 50;
        const el = buildCubieElement(createCubie([Face.F, Face.U]), 100, 3, styles, vi.fn());

        const zOf = (element: Element | null) => {
            const m = /translateZ\(([\d.]+)px\)/.exec(
                (element as HTMLElement | null)?.style.transform ?? ''
            );
            return m ? parseFloat(m[1]) : null;
        };

        for (const face of [Face.F, Face.U]) {
            const sticker = el.querySelector(`.sticker[data-face="${face}"]`);
            const wall = el.querySelector(`.cubie-interior[data-face="${face}"]`);

            expect(wall, `wall for ${face}`).not.toBeNull();
            expect(sticker, `sticker for ${face}`).not.toBeNull();
            expect(zOf(wall), `wall ${face} on the face plane`).toBe(half);
            expect(zOf(sticker), `sticker ${face} in front of its wall`).toBe(
                half + STICKER_LIFT_PX
            );
            expect(zOf(sticker)!).toBeGreaterThan(zOf(wall)!);
        }
    });

    it('rebuilds all six walls when a cubie’s stickers change during a position update', () => {
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

        expect(cubeElement.querySelectorAll('.cubie-interior')).toHaveLength(6);
        expect(cubeElement.querySelectorAll('.sticker')).toHaveLength(1);
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
    //  1. Every face element carries it, sticker AND wall alike, because
    //     `resizeCubies` finds them all through a single `[data-face]` query. A wall
    //     missing it keeps its OLD halfSize transform after a resize and visibly
    //     detaches from its cubie.
    //  2. Every face element carries it EXACTLY ONCE, and no element carries a
    //     second face-naming attribute. A duplicate write is how this drifted into
    //     two attributes (`data-basic-face` + `data-face`) in the first place.
    it('marks every face element (sticker and wall) with exactly one data-face attribute', () => {
        const cubie = createCubie([Face.F, Face.U]);
        const cubieEl = buildCubieElement(cubie, 100, 3, styles, vi.fn());

        const stickers = Array.from(cubieEl.querySelectorAll('.sticker')) as HTMLElement[];
        const walls = Array.from(cubieEl.querySelectorAll('.cubie-interior')) as HTMLElement[];

        expect(stickers).toHaveLength(2);
        expect(walls).toHaveLength(6);
        expect([...stickers, ...walls]).toHaveLength(8);

        for (const el of [...stickers, ...walls]) {
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
