// The composition identity the animation depends on, verified against a REAL browser
// transform parser.
//
// Why this test exists at all, and why it is not a plain unit test:
//
// The animation composes
//
//   rotateX(baseX) rotateY(baseY) rotate3d(axis, angle) matrix3d(base)
//
// and the settle bake then writes
//
//   rotateX(baseX) rotateY(baseY) matrix3d(target)
//
// For there to be no visible flip when the animation ends, those two must describe the
// SAME orientation. Asserting that with hand-written matrix helpers is worthless here:
// the helpers and the implementation share a convention, so a transposed `matrix3d`
// reading is self-consistent and the assertion passes while the cube on screen shows the
// inverse rotation. That is precisely the bug this test was written to catch — the
// original 96/96 exhaustive test used the implementation's own helpers and could not
// see it, while a ~180° flip was visible at the end of every rotation.
//
// So the oracle is Chromium's own transform parser via `getComputedStyle`. It cannot be
// talked into agreeing with a wrong convention.
//
// Skipped when Playwright's Chromium is unavailable, rather than failing: this is a
// correctness guard for the rendering convention, not a prerequisite for the other
// unit tests. Run `npx playwright install chromium` to enable it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    type Orientation,
    axisToCss,
    reachableOrientations,
    rotationBetween,
    stepDown,
    stepLeft,
    stepRight,
    stepUp,
} from './rotation-math';

const STEPS: Array<[string, (o: Orientation) => Orientation]> = [
    ['left', stepLeft],
    ['right', stepRight],
    ['up', stepUp],
    ['down', stepDown],
];

type Browser = Awaited<ReturnType<(typeof import('playwright'))['chromium']['launch']>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;

let browser: Browser | null = null;
let page: Page | null = null;
/**
 * Set when Chromium could not be started, so the suite skips.
 *
 * Detected by attempting the launch rather than by probing the filesystem: a path check
 * needs Node's `fs`/`os`, which this project's test tsconfig does not type, and it also
 * gets the answer wrong when the browsers live somewhere non-default.
 */
let unavailable = false;

beforeAll(async () => {
    const { chromium } = await import('playwright');
    // Only a failed LAUNCH is skippable (no browser binary installed). Page creation and
    // navigation are pure setup that must work once Chromium exists; catching them too
    // would let any harness bug masquerade as "unavailable" and pass the suite without
    // ever running the assertion.
    try {
        browser = await chromium.launch({ headless: true });
    } catch {
        unavailable = true;
        browser = null;
        return;
    }
    page = await browser.newPage();
    // A blank page is enough: this is pure CSS transform algebra.
    await page.goto('data:text/html,<div id="h" style="position:absolute"></div>');
}, 60_000);

afterAll(async () => {
    await browser?.close();
    // Explicit, and deliberately the same 60s as the launch above. Closing a Chromium
    // under load is not instant — measured, it exceeded vitest's 10s default `hookTimeout`
    // while 19 other jsdom workers saturated the CPU, and a teardown timeout FAILS THE
    // SUITE even though every assertion passed. The setup side already knew a browser
    // operation needs a generous budget here; teardown needs it just as much.
}, 60_000);

describe('the animation slot composes to the target basis', () => {
    it('the implementation derives the rotation the browser requires, for all 96 cases', async () => {
        if (unavailable) return; // no browser installed — see the note above
        // The heart of it: for every one of the 24 orientations × 4 steps, the rotation
        // `rotationBetween` reports must reproduce the target basis when composed in the
        // slot the renderer uses:
        //
        //   rotateX(bx) rotateY(by) rotate3d(axis, angle) matrix3d(base)
        //                            == rotateX(bx) rotateY(by) matrix3d(target)
        //
        // The browser decides whether it does. The unit-test helpers do not get a vote,
        // which is the whole point: this is the assertion the original exhaustive 96/96
        // test could not make, because it built both sides from the same helpers and so
        // agreed with a transposed `matrix3d` reading while the cube on screen showed the
        // inverse rotation.
        //
        // A first revision of this test instead compared the DOM matrices directly and
        // asked whether some single 90° world axis reproduced the difference. That
        // question is wrong: because the slot sits *inside* the base tilt, the rotation
        // it needs is expressed in the tilted frame, so it is not a 90° rotation about a
        // world axis at all — it is a 90° rotation about a *tilted* axis. Only the
        // in-place composition asks the question the renderer actually depends on.
        const disagreements = await page!.evaluate(
            (payload: {
                cases: Array<{
                    name: string;
                    prev: unknown;
                    next: unknown;
                    axis: string;
                    angle: number;
                }>;
            }) => {
                const host = document.getElementById('h') as HTMLElement;
                const matrixOf = (text: string): number[][] => {
                    host.style.transform = 'none';
                    void host.offsetHeight;
                    host.style.transform = text;
                    const raw = getComputedStyle(host).transform;
                    if (raw.startsWith('matrix(')) {
                        const a = raw.slice(7, -1).split(',').map(Number);
                        return [
                            [a[0], a[2], 0],
                            [a[1], a[3], 0],
                            [0, 0, 1],
                        ];
                    }
                    const a = raw
                        .slice(raw.indexOf('(') + 1, -1)
                        .split(',')
                        .map(Number);
                    // Column-major, as the browser reports it.
                    const m = [
                        [0, 0, 0],
                        [0, 0, 0],
                        [0, 0, 0],
                    ];
                    for (let col = 0; col < 3; col++)
                        for (let row = 0; row < 3; row++) m[row][col] = a[col * 4 + row];
                    return m;
                };
                const close = (a: number[][], b: number[][]): boolean => {
                    for (let i = 0; i < 3; i++)
                        for (let j = 0; j < 3; j++)
                            if (Math.abs(a[i][j] - b[i][j]) > 1e-3) return false;
                    return true;
                };

                const tilt = `rotateX(-25deg) rotateY(-35deg)`;
                /** Matches `rendering.ts`: components grouped, so the vectors land in rows. */
                const basisText = (o: {
                    viewRight: number[];
                    viewUp: number[];
                    viewForward: number[];
                }): string =>
                    `matrix3d(${o.viewRight[0]},${o.viewUp[0]},${o.viewForward[0]},0, ` +
                    `${o.viewRight[1]},${o.viewUp[1]},${o.viewForward[1]},0, ` +
                    `${o.viewRight[2]},${o.viewUp[2]},${o.viewForward[2]},0, 0,0,0,1)`;

                const bad: string[] = [];
                for (const c of payload.cases) {
                    const prev = c.prev as {
                        viewRight: number[];
                        viewUp: number[];
                        viewForward: number[];
                    };
                    const next = c.next as {
                        viewRight: number[];
                        viewUp: number[];
                        viewForward: number[];
                    };
                    const animated = matrixOf(
                        `${tilt} rotate3d(${c.axis},${c.angle}deg) ${basisText(prev)}`
                    );
                    const baked = matrixOf(`${tilt} ${basisText(next)}`);
                    if (!close(animated, baked)) {
                        bad.push(
                            `${c.name}: slot rotate3d(${c.axis},${c.angle}deg) does not reach the target`
                        );
                    }
                }
                return bad;
            },
            {
                cases: reachableOrientations().flatMap(o =>
                    STEPS.map(([name, step]) => {
                        const next = step(o);
                        const ramp = rotationBetween(o, next)!;
                        const vec = (v: { x: number; y: number; z: number }): number[] => [
                            v.x,
                            v.y,
                            v.z,
                        ];
                        return {
                            name: `${name} from ${JSON.stringify(o)}`,
                            prev: {
                                viewRight: vec(o.viewRight),
                                viewUp: vec(o.viewUp),
                                viewForward: vec(o.viewForward),
                            },
                            next: {
                                viewRight: vec(next.viewRight),
                                viewUp: vec(next.viewUp),
                                viewForward: vec(next.viewForward),
                            },
                            axis: axisToCss(ramp.axis),
                            angle: ramp.angle,
                        };
                    })
                ),
            }
        );

        expect(disagreements).toEqual([]);
    });

    it('a 270° sweep is emitted verbatim and still reaches the target', async () => {
        if (unavailable) return; // no browser installed — see the note above
        // A rotation matrix cannot express more than a half turn, so the plan carries an
        // angle. This confirms the browser agrees that a 270° slot lands where a −90°
        // one would, while travelling the other way — which is what the plan's R1 needs.
        const result = await page!.evaluate(() => {
            const host = document.getElementById('h') as HTMLElement;
            const matrixOf = (text: string): number[][] => {
                host.style.transform = 'none';
                void host.offsetHeight;
                host.style.transform = text;
                const raw = getComputedStyle(host).transform;
                const a = raw
                    .slice(raw.indexOf('(') + 1, -1)
                    .split(',')
                    .map(Number);
                const m = [
                    [0, 0, 0],
                    [0, 0, 0],
                    [0, 0, 0],
                ];
                for (let col = 0; col < 3; col++)
                    for (let row = 0; row < 3; row++) m[row][col] = a[col * 4 + row];
                return m;
            };
            const tilt = 'rotateX(-25deg) rotateY(-35deg)';
            const identity = 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)';
            const at270 = matrixOf(`${tilt} rotate3d(0,1,0,270deg) ${identity}`);
            const atMinus90 = matrixOf(`${tilt} rotate3d(0,1,0,-90deg) ${identity}`);
            const same = at270.every((row, i) =>
                row.every((v, j) => Math.abs(v - atMinus90[i][j]) < 1e-3)
            );
            return { same, at270First: at270[0].map(v => Number(v.toFixed(4))) };
        });

        // Same destination, opposite direction of travel — the whole point of carrying
        // the angle rather than re-deriving it from a matrix.
        expect(result.same).toBe(true);
    });
});
