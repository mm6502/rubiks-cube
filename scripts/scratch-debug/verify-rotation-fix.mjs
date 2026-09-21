// Verifies the shared-rotation-animation fix on the real, built app.
//
// The unit tests cannot settle this question. jsdom has no Web Animations API, so a
// stubbed animation resolves instantly, and the defect is a property of the
// *traversal* that only exists while frames are genuinely being painted. This
// drives the built app in a real engine and measures what the user sees.
//
// The metric is the OUTCOME, not a proxy. Each frame's computed matrix is
//   C = B · R · M
// where B is the base tilt, M is the basis the ramp is built on, and R is the
// rotation the animation is applying. So R is recovered exactly as
//   R = B⁻¹ · C · M⁻¹
// and can then be checked directly: is it still a rotation (orthonormal,
// determinant +1), what is its axis, and how far has it swept.
//
// Two traps this avoids, both of which produced plausible-but-wrong conclusions
// earlier in this work:
//
//   * The determinant of a *composed* frame is not the assertion. It measures 1.0
//     throughout even on the broken implementation, so a determinant check passes
//     on the very defect this exists to catch. The determinant is checked here on
//     the *recovered rotation*, where it is genuinely meaningful.
//   * A metric that only accepts 16-value `matrix3d(...)` strings silently drops
//     identity and 360° frames, which serialize as 2D `matrix(1,0,0,1,0,0)`, and
//     under-reports the swept angle. Both forms are handled.
//
// Sampling is driven from Node rather than an in-page `requestAnimationFrame`
// loop: a headless page with no compositor does not run rAF, so an in-page loop
// silently records zero frames — which reads as "nothing happened" rather than as
// a broken harness. Polling `getComputedStyle` still returns the painted value of
// a running animation.
//
// Run: node scripts/scratch-debug/verify-rotation-fix.mjs [chromium|firefox]
//      PW_HEADED=1 for the headed compositor path.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, firefox } from 'playwright';

const engineName = process.argv[2] ?? 'chromium';
const engine = engineName === 'firefox' ? firefox : chromium;
const HEADED = process.env.PW_HEADED === '1';

const url = pathToFileURL(resolve('dist/index.html')).href;

const browser = await engine.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1200);

const CUBE = '[class*="cube"]:not([class*="wrapper"]):not([class*="container"])';

/**
 * Activates the Basic view and gives it keyboard focus.
 *
 * The tab is hidden because the controls panel starts collapsed, so the click is
 * dispatched directly. Focus then has to be claimed through the app's own contact
 * path — a real `pointerdown` on the view content — because the app routes keys from
 * its own focus model: an element focused by calling `focus()` receives nothing, and
 * every measurement would come back as a meaningless zero. The result is verified so
 * that failure mode cannot recur silently.
 */
async function openBasicView() {
    const found = await page.evaluate(() => {
        const tab = document.querySelector('button[data-view-type="basic-front"]');
        if (!tab) return false;
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
    });
    if (!found) throw new Error('the Basic view has no tab to activate');
    await page.waitForTimeout(1200);

    const box = await page.locator('[class*="view-content"]').first().boundingBox();
    if (!box || box.width === 0) throw new Error('the Basic view did not become visible');

    // `registerViewContainer` attaches its `pointerdown` listener to the view's own
    // container — the element the view was created into, which is the cube's
    // grandparent, not `view-content` itself. Dispatching there is what exercises the
    // app's real contact path and claims focus onto the right element.
    const focusInfo = await page.evaluate(() => {
        const cube = document.querySelector(
            '[class*="cube"]:not([class*="wrapper"]):not([class*="container"])'
        );
        if (!cube) return { ok: false, reason: 'no cube element' };
        const viewContainer = cube.closest('[class*="cube-container"]')?.parentElement;
        if (!viewContainer) return { ok: false, reason: 'no view container' };

        const rect = viewContainer.getBoundingClientRect();
        viewContainer.dispatchEvent(
            new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                clientX: rect.x + rect.width / 2,
                clientY: rect.y + rect.height / 2,
            })
        );
        return {
            ok: document.activeElement === viewContainer,
            reason: `activeElement=${document.activeElement?.className || document.activeElement?.tagName}`,
        };
    });
    if (!focusInfo.ok) {
        throw new Error(`the Basic view did not take focus (${focusInfo.reason})`);
    }

    return { box };
}

/**
 * The view's current orientation, as the forward axis read from its settled
 * transform. Used to prove a rotation actually happened, so a measurement can never
 * pass vacuously because the key never arrived.
 */
async function orientation() {
    return page.evaluate(cubeSelector => {
        const cube = document.querySelector(cubeSelector);
        const args = /matrix3d\(([^)]+)\)/.exec(cube.style.transform)[1].split(',').map(Number);
        // Third matrix3d group is viewForward (CSS is column-major).
        return [args[8], args[9], args[10]].map(v => Math.round(v));
    }, CUBE);
}

/**
 * Installs the in-page recovery helpers.
 *
 * The helpers read the element's resting inline transform to learn the base tilt
 * and the basis the ramp is built on, then recover R from whatever computed frame
 * is on screen. The sampling loop itself runs from Node.
 */
async function installProbe() {
    await page.evaluate(cubeSelector => {
        const cube = document.querySelector(cubeSelector);
        if (!cube) throw new Error('cube element not found for recording');

        const mul = (a, b) =>
            a.map(row =>
                [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j])
            );
        const transpose = m => [
            [m[0][0], m[1][0], m[2][0]],
            [m[0][1], m[1][1], m[2][1]],
            [m[0][2], m[1][2], m[2][2]],
        ];
        const rotX = deg => {
            const r = (deg * Math.PI) / 180;
            return [
                [1, 0, 0],
                [0, Math.cos(r), -Math.sin(r)],
                [0, Math.sin(r), Math.cos(r)],
            ];
        };
        const rotY = deg => {
            const r = (deg * Math.PI) / 180;
            return [
                [Math.cos(r), 0, Math.sin(r)],
                [0, 1, 0],
                [-Math.sin(r), 0, Math.cos(r)],
            ];
        };

        /** The 3×3 upper-left of a transform, handling the 2D identity form. */
        const matrixOf = raw => {
            if (!raw || raw === 'none') return null;
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
            if (a.length !== 16) return null;
            // CSS is column-major.
            const m = [
                [0, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
            ];
            for (let col = 0; col < 3; col++)
                for (let row = 0; row < 3; row++) m[row][col] = a[col * 4 + row];
            return m;
        };

        window.__probe = {
            /** Records the resting transform, which defines B and M for this run. */
            mark: () => {
                window.__rest = cube.style.transform;
                return window.__rest;
            },
            /** Recovers the animation's own rotation from the current frame. */
            sample: () => {
                const current = matrixOf(getComputedStyle(cube).transform);
                if (!current) return null;

                // Parse the resting transform by regex rather than by splitting on
                // whitespace: the animation's own keyframe text carries spaces inside
                // its `matrix3d(...)` groups, while the settled inline style does not,
                // so a positional parse breaks on one of the two forms.
                const rest = window.__rest || cube.style.transform;
                const baseX = Number(/rotateX\((-?[\d.]+)deg\)/.exec(rest)?.[1] ?? 0);
                const baseY = Number(/rotateY\((-?[\d.]+)deg\)/.exec(rest)?.[1] ?? 0);
                const basisPart = /matrix3d\([^)]*\)/.exec(rest)?.[0];
                const basis = basisPart
                    ? matrixOf(basisPart)
                    : [
                          [1, 0, 0],
                          [0, 1, 0],
                          [0, 0, 1],
                      ];

                const b = mul(rotX(baseX), rotY(baseY));
                const r = mul(mul(transpose(b), current), transpose(basis));

                const trace = r[0][0] + r[1][1] + r[2][2];
                const cos = Math.max(-1, Math.min(1, (trace - 1) / 2));
                const skew = [r[2][1] - r[1][2], r[0][2] - r[2][0], r[1][0] - r[0][1]];
                const sinScale = Math.hypot(...skew) / 2;
                const angle = (Math.atan2(sinScale, cos) * 180) / Math.PI;

                // Orthonormality and determinant of the recovered rotation: the real
                // validity check, and the one the old scheme failed.
                const prod = mul(r, transpose(r));
                let orthoError = 0;
                for (let i = 0; i < 3; i++)
                    for (let j = 0; j < 3; j++)
                        orthoError = Math.max(orthoError, Math.abs(prod[i][j] - (i === j ? 1 : 0)));
                const det =
                    r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) -
                    r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0]) +
                    r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);

                let axis = null;
                if (sinScale > 1e-9) axis = skew.map(v => Math.round(v / (sinScale * 2)));
                else if (cos < 0)
                    axis = [
                        Math.round(Math.sqrt(Math.max(0, (r[0][0] + 1) / 2))),
                        Math.round(Math.sqrt(Math.max(0, (r[1][1] + 1) / 2))),
                        Math.round(Math.sqrt(Math.max(0, (r[2][2] + 1) / 2))),
                    ];

                return {
                    angle,
                    axis,
                    orthoError,
                    det,
                    running: cube.getAnimations().length,
                    restingInline: cube.style.transform,
                };
            },
        };
    }, CUBE);
}

/**
 * Samples the recovered rotation for `durationMs` and aggregates it.
 *
 * Driven from Node, one `evaluate` per frame, because a headless page does not run
 * its own animation frames.
 */
async function recordFor(durationMs) {
    await page.evaluate(() => window.__probe.mark());
    const samples = [];
    const started = Date.now();
    while (Date.now() - started < durationMs) {
        const sample = await page.evaluate(() => window.__probe.sample());
        if (sample) samples.push(sample);
        await page.waitForTimeout(16);
    }

    // Swept angle, unwrapped across the ±180° wrap, plus a reversal count. The old
    // scheme showed 90° where 270° was intended, with reversals in between.
    let sweep = 0;
    let reversals = 0;
    let sign;
    for (let i = 1; i < samples.length; i++) {
        let delta = samples[i].angle - samples[i - 1].angle;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        if (Math.abs(delta) > 0.5) {
            if (sign && Math.sign(delta) !== sign) reversals++;
            sign = Math.sign(delta);
        }
        sweep += delta;
    }

    return {
        frames: samples.length,
        sweep,
        reversals,
        animationsSeen: samples.reduce((m, s) => Math.max(m, s.running), 0),
        worstOrtho: samples.reduce((m, s) => Math.max(m, s.orthoError), 0),
        worstDet: samples.reduce((m, s) => Math.min(m, s.det), 1),
        axes: [
            ...new Set(samples.map(s => (s.axis || []).join(',')).filter(a => a && a !== '0,0,0')),
        ],
    };
}

/** Presses a rotation key. */
async function rotate(key, { alt = false } = {}) {
    await page.keyboard.down(alt ? 'Alt' : 'Control');
    await page.keyboard.press(key);
    await page.keyboard.up(alt ? 'Alt' : 'Control');
}

const results = [];
const record = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}\n        ${detail}`);
};

console.log(
    `\n===== verifying the built app in ${engineName} (${HEADED ? 'headed' : 'headless'}) =====\n`
);

try {
    const { box } = await openBasicView();
    await installProbe();

    // ---- R1: one rotation sweeps the intended angle, and actually animates ---
    const beforeSingle = await orientation();
    const single = rotate('ArrowRight', { alt: true });
    const singleStats = await recordFor(700);
    await single;
    const afterSingle = await orientation();
    // Guard against a vacuous pass: if the key reached nothing the orientation is
    // unchanged and every number below would be a meaningless zero.
    const singleMoved = beforeSingle.join(',') !== afterSingle.join(',');
    record(
        'R1: a view rotation animates as a sweep of ~90° with no reversal',
        singleMoved &&
            singleStats.animationsSeen > 0 &&
            Math.abs(Math.abs(singleStats.sweep) - 90) < 25 &&
            singleStats.reversals === 0,
        `orientation ${beforeSingle.join(',')} -> ${afterSingle.join(',')}; ` +
            `swept ${singleStats.sweep.toFixed(1)}° over ${singleStats.frames} frames; ` +
            `max animations running=${singleStats.animationsSeen}; ` +
            `reversals=${singleStats.reversals}; axis=${singleStats.axes.join(' ') || '(none)'}`
    );
    record(
        'R1: no interpolated frame leaves the rotation group',
        singleStats.worstOrtho < 1e-5 && singleStats.worstDet > 1 - 1e-5,
        `worst orthonormality error=${singleStats.worstOrtho.toExponential(1)}, ` +
            `min determinant=${singleStats.worstDet.toFixed(9)} ` +
            '(a component-wise matrix blend shears every mid-flight frame)'
    );

    // ---- R1: an interrupted rotation continues instead of unwinding ---------
    // The reported defect. A matrix transition adopted the half-blended matrix as
    // its new start, so the second rotation travelled back the way it came.
    const interrupted = (async () => {
        await rotate('ArrowRight', { alt: true });
        await page.waitForTimeout(110);
        await rotate('ArrowRight', { alt: true });
    })();
    const interruptedStats = await recordFor(900);
    await interrupted;
    record(
        'R1: an interrupted rotation never reverses direction',
        interruptedStats.reversals === 0 && Math.abs(interruptedStats.sweep) > 100,
        `swept ${interruptedStats.sweep.toFixed(1)}° over ${interruptedStats.frames} frames; ` +
            `reversals=${interruptedStats.reversals}; ` +
            `worst orthonormality error=${interruptedStats.worstOrtho.toExponential(1)}`
    );

    // ---- R2: the axis is state-derived -------------------------------------
    const up = rotate('ArrowUp', { alt: true });
    const upStats = await recordFor(500);
    await up;
    const right = rotate('ArrowRight', { alt: true });
    const rightStats = await recordFor(500);
    await right;
    record(
        'R2: different orientations use different world axes',
        upStats.axes.length > 0 &&
            rightStats.axes.length > 0 &&
            upStats.axes.join(' ') !== rightStats.axes.join(' '),
        `an up rotation used [${upStats.axes.join(' ')}]; the following right rotation used ` +
            `[${rightStats.axes.join(' ')}] (a fixed axis cannot produce both)`
    );

    // ---- R3: rapid input past the threshold still lands ---------------------
    // Four right turns return the front face to F. Later steps skip their animation
    // under the bounded-queue rule, but the orientation must still land.
    for (let i = 0; i < 4; i++) {
        await rotate('ArrowRight', { alt: true });
        await page.waitForTimeout(45);
    }
    await page.waitForTimeout(1200);
    const frontFace = await orientation();
    record(
        'R3: a burst past the threshold still lands on the requested orientation',
        frontFace[2] === 1,
        `after four right turns viewForward = (${frontFace.join(', ')}) — z=1 restores the front face`
    );

    // ---- R4: reduced motion applies the rotation without animating ---------
    const reducedContext = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        reducedMotion: 'reduce',
    });
    const reducedPage = await reducedContext.newPage();
    await reducedPage.goto(url, { waitUntil: 'load' });
    await reducedPage.waitForTimeout(1200);
    await reducedPage.evaluate(() => {
        document
            .querySelector('button[data-view-type="basic-front"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await reducedPage.waitForTimeout(1000);
    const reducedFocused = await reducedPage.evaluate(() => {
        const cube = document.querySelector(
            '[class*="cube"]:not([class*="wrapper"]):not([class*="container"])'
        );
        const viewContainer = cube?.closest('[class*="cube-container"]')?.parentElement;
        if (!viewContainer) return false;
        const rect = viewContainer.getBoundingClientRect();
        viewContainer.dispatchEvent(
            new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                clientX: rect.x + rect.width / 2,
                clientY: rect.y + rect.height / 2,
            })
        );
        return document.activeElement === viewContainer;
    });
    if (!reducedFocused) throw new Error('could not focus the reduced-motion view');

    const reducedBefore = await reducedPage.evaluate(cubeSelector => {
        const cube = document.querySelector(cubeSelector);
        const args = /matrix3d\(([^)]+)\)/.exec(cube.style.transform)[1].split(',').map(Number);
        return [args[8], args[9], args[10]].map(v => Math.round(v));
    }, CUBE);
    await reducedPage.keyboard.down('Alt');
    await reducedPage.keyboard.press('ArrowRight');
    await reducedPage.keyboard.up('Alt');
    // Sampled immediately: with reduced motion the orientation is applied in the
    // same tick, so there is no window in which an animation could be running.
    await reducedPage.waitForTimeout(80);
    const reduced = await reducedPage.evaluate(cubeSelector => {
        const cube = document.querySelector(cubeSelector);
        const args = /matrix3d\(([^)]+)\)/.exec(cube.style.transform)[1].split(',').map(Number);
        return {
            running: cube.getAnimations().length,
            viewForward: [args[8], args[9], args[10]].map(v => Math.round(v)),
        };
    }, CUBE);
    await reducedContext.close();
    record(
        'R4: prefers-reduced-motion applies the rotation without animating',
        reduced.running === 0 && reduced.viewForward.join(',') !== reducedBefore.join(','),
        `animations running=${reduced.running} (want 0); viewForward ` +
            `${reducedBefore.join(',')} -> ${reduced.viewForward.join(',')} applied immediately`
    );

    // ---- R7: the strips return once, at the end ----------------------------
    // Restricted to strips that are actually rendered: the DOM also holds a second,
    // hidden Basic view, and counting its strips too would double the denominator and
    // make a genuine reveal look like a partial one.
    await page.keyboard.press('Control+3');
    await page.waitForTimeout(500);

    const STRIPS = '[data-host-face]';
    const rendered = sel =>
        Array.from(document.querySelectorAll(sel)).filter(s => s.offsetParent !== null);
    const stripCount = await page.evaluate(
        sel =>
            Array.from(document.querySelectorAll(sel)).filter(s => s.offsetParent !== null).length,
        STRIPS
    );
    const shownBefore = await page.evaluate(
        sel =>
            Array.from(document.querySelectorAll(sel)).filter(
                s => s.offsetParent !== null && s.style.display !== 'none'
            ).length,
        STRIPS
    );

    await page.evaluate(sel => {
        const visible = () =>
            Array.from(document.querySelectorAll(sel)).filter(
                s => s.offsetParent !== null && s.style.display !== 'none'
            ).length;
        // Only reveals that follow the burst's own hide count. The strips are
        // already on screen when the burst begins, so a naive hidden→shown counter
        // would count the *initial* state as a reveal and mis-report the sequence.
        // Record the raw visible-count timeline, then analyse the transitions after
        // the fact. Counting reveals as they happen required guessing a baseline, and
        // the strips can also be shown by the *peer* Basic view (linked rotations are
        // on by default), so the transitions are scoped to the panel that is actually
        // rendering and the sequence is read back whole.
        window.__strips = { timeline: [], t0: performance.now() };
        window.__strips.timer = setInterval(() => {
            const now = visible();
            const last = window.__strips.timeline[window.__strips.timeline.length - 1];
            if (!last || last.shown !== now) {
                window.__strips.timeline.push({
                    at: Math.round(performance.now() - window.__strips.t0),
                    shown: now,
                });
            }
        }, 16);
        window.__strips.mark = () => {
            window.__strips.burstAt = Math.round(performance.now() - window.__strips.t0);
        };
    }, STRIPS);

    await page.evaluate(() => window.__strips.mark());
    await page.keyboard.down('Alt');
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(60);
    }
    await page.keyboard.up('Alt');
    await page.waitForTimeout(1800);

    const stripResult = await page.evaluate(sel => {
        clearInterval(window.__strips.timer);
        const shownNow = Array.from(document.querySelectorAll(sel)).filter(
            s => s.offsetParent !== null && s.style.display !== 'none'
        ).length;
        // Count the transitions that happened at or after the burst began: how many
        // times the strips went from hidden to shown once the burst had hidden them.
        const burstAt = window.__strips.burstAt ?? 0;
        const after = window.__strips.timeline.filter(t => t.at >= burstAt);
        let reveals = 0;
        for (let i = 1; i < after.length; i++) {
            if (after[i - 1].shown === 0 && after[i].shown > 0) reveals++;
        }
        return {
            reveals,
            shownNow,
            burstAt,
            timeline: window.__strips.timeline,
        };
    }, STRIPS);

    const timelineText = stripResult.timeline.map(t => `${t.at}ms:${t.shown}`).join(' ');

    record(
        'R7: a rapid sequence reveals the strips exactly once, at the end',
        stripCount > 0 && shownBefore > 0 && stripResult.shownNow > 0 && stripResult.reveals === 1,
        `${stripResult.reveals} reveal(s) after the burst began at ${stripResult.burstAt}ms ` +
            `(want exactly 1); ${stripResult.shownNow}/${stripCount} strips showing at the end ` +
            `(shown before the burst: ${shownBefore})\n` +
            `        visible-count timeline: ${timelineText}`
    );

    record(
        'no uncaught page errors during the run',
        pageErrors.length === 0,
        pageErrors.length === 0 ? 'none' : pageErrors.join(' | ')
    );
} catch (error) {
    record('harness ran to completion', false, `threw: ${error.message}`);
}

await browser.close();

const failed = results.filter(r => !r.pass);
console.log(`\n===== ${results.length - failed.length}/${results.length} checks passed =====\n`);
process.exit(failed.length === 0 ? 0 : 1);
