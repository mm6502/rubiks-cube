// SCRATCH PROBE — validates scripts/scratch-debug/repro.html in an automated
// engine. Drives the page's own buttons and prints what each panel reports.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, firefox } from 'playwright';

const engineName = process.argv[2] ?? 'chromium';
const engine = engineName === 'firefox' ? firefox : chromium;
const HEADED = process.env.PW_HEADED === '1';

const url = pathToFileURL(resolve('scripts/scratch-debug/repro.html')).href;

const browser = await engine.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(600);

const read = sel => page.locator(sel).innerText();

const cases = [
    ['A', 'A — matrix3d + transition', '1', 'a'],
    ['A', 'A — matrix3d + transition', '2', 'a'],
    ['A', 'A — matrix3d + transition', '3', 'a'],
    ['A', 'A — matrix3d + transition', '4', 'a'],
    ['B', 'B — rotate3d + WAAPI', '1', 'b'],
    ['B', 'B — rotate3d + WAAPI', '2', 'b'],
    ['B', 'B — rotate3d + WAAPI', '3', 'b'],
    ['B', 'B — rotate3d + WAAPI', '4', 'b'],
];

console.log(`\n===== ${engineName} (${HEADED ? 'headed' : 'headless'}) =====`);
for (const [panel, label, steps, attr] of cases) {
    await page.locator(`[data-${attr}-reset]`).click();
    await page.waitForTimeout(250);
    await page.locator(`[data-${attr}="${steps}"]`).click();
    await page.waitForTimeout(1100);
    const txt = await read(panel === 'A' ? '#outA' : '#outB');
    const oneLine = txt.replace(/\s+/g, ' ').trim();
    console.log(`${label}  ${steps} step(s) -> ${oneLine}`);
}

// burst cases
for (const [panel, steps] of [
    ['a', '2'],
    ['a', '3'],
    ['b', '2'],
    ['b', '3'],
]) {
    await page.locator(`[data-${panel}-reset]`).click();
    await page.waitForTimeout(250);
    await page.locator(`[data-${panel}-burst="${steps}"]`).click();
    await page.waitForTimeout(1100);
    const txt = await read(panel === 'a' ? '#outA' : '#outB');
    console.log(`${panel.toUpperCase()} burst->${steps} -> ${txt.replace(/\s+/g, ' ').trim()}`);
}

await browser.close();
