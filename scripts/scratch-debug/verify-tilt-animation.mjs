// Real-browser verification of the tilt/pitch animation fix.
//
// jsdom cannot validate this: its `animate` does not interpolate, and the defect was
// specifically "does an animation start at all". This drives the real dev server and
// reads the Web Animations API's own view of what is running, plus the sampled transform
// mid-flight — the same "measure the outcome, not a proxy" discipline the rotation plan
// established after an earlier probe produced plausible-but-wrong numbers.
//
// Note on the selector: the Basic view renders two cubes (front and back variants) whose
// class is hashed (`_cube_xidl7_4`). `[class*="cube-container"]` matches a wrapper with no
// transform, so the element is chosen by having a laid-out box and a `matrix3d` transform
// rather than by class name alone — a class-only probe reported `transform: none` and
// produced five spurious failures before this was corrected.
//
// Run with the dev server already up on :5173.
//   node scripts/scratch-debug/verify-tilt-animation.mjs
import { chromium } from 'playwright';

const URL = 'http://localhost:5173';
const CUBE = 'div[class*="cube_"]';

async function main() {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const results = [];
    const fail = [];

    const check = (name, ok, detail) => {
        results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
        if (!ok) fail.push(name);
    };

    try {
        await page.goto(URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);

        // Keyboard commands are focus-scoped per panel, so the Basic panel must be focused
        // before its keys are live. Without this every press is silently dropped and the
        // harness reports six false failures — the transform simply never changes, which is
        // indistinguishable from a broken fix until the input path itself is confirmed.
        const panel = await page.evaluate(() => {
            const el = document.querySelector('div[class*="cube-container"]');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
        });
        if (!panel) throw new Error('Basic panel not found');
        await page.mouse.click(panel.x + panel.w / 2, panel.y + panel.h / 2);
        await page.waitForTimeout(300);

        const cube = await page.evaluateHandle(sel => {
            const all = [...document.querySelectorAll(sel)];
            return (
                all.find(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }) ?? all[0]
            );
        }, CUBE);

        const transformOf = () =>
            page.evaluate(el => (el ? getComputedStyle(el).transform : null), cube);
        const runningOn = () => page.evaluate(el => (el ? el.getAnimations().length : -1), cube);

        const atRest = await transformOf();
        check('found a cube element with a transform', !!atRest && atRest !== 'none');
        check('cube is a matrix3d (Basic 3D view)', String(atRest).startsWith('matrix3d'));
        check('no animation running at rest', (await runningOn()) === 0);

        // --- Control: a view rotation must animate. ---
        await page.keyboard.press('Alt+ArrowRight');
        const rotationRunning = await runningOn();
        check('Alt+Arrow starts an animation', rotationRunning > 0, `running=${rotationRunning}`);
        await page.waitForTimeout(700);

        // --- The reported defect: tilt must animate rather than snap. ---
        const beforeTilt = await transformOf();
        await page.keyboard.press('|');
        const tiltRunning = await runningOn();
        check('tilt toggle starts an animation', tiltRunning > 0, `running=${tiltRunning}`);

        // Mid-flight sample: on a 300ms ease-out ramp, ~120ms in must be neither endpoint,
        // which is what separates an animation from a snap.
        await page.waitForTimeout(120);
        const midTilt = await transformOf();
        await page.waitForTimeout(700);
        const afterTilt = await transformOf();

        check('tilt moves the transform', beforeTilt !== afterTilt);
        check(
            'the change is interpolated, not snapped',
            midTilt !== beforeTilt && midTilt !== afterTilt,
            `mid=${String(midTilt).slice(0, 44)}`
        );

        // --- Pitch, the sibling path. ---
        await page.keyboard.press('PageDown');
        const pitchRunning = await runningOn();
        check('pitch toggle starts an animation', pitchRunning > 0, `running=${pitchRunning}`);
        await page.waitForTimeout(800);

        // --- And it settles: the ramp is not left holding the element. ---
        check('animations finish and are cleaned up', (await runningOn()) === 0);

        // --- Orientation still works: the base ramp must not have disturbed it. ---
        const beforeSpin = await transformOf();
        await page.keyboard.press('Alt+ArrowRight');
        await page.waitForTimeout(700);
        check(
            'a later view rotation still changes the transform',
            beforeSpin !== (await transformOf())
        );
    } catch (error) {
        check('harness ran without throwing', false, String(error));
    } finally {
        await browser.close();
    }

    console.log(results.join('\n'));
    console.log('');
    console.log(fail.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${fail.join(', ')}`);
    process.exit(fail.length === 0 ? 0 : 1);
}

main();
