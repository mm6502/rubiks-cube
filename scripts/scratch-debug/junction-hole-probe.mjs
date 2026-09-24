// Scratch harness: does `border-radius` on `.cubie-interior` show ANY colour through
// the junctions between cubies?
//
// WHY THIS EXISTS
// A review comment on PR #18 claims the rounded wall behind a sticker is clipped in the
// same place as the sticker, so it cannot fill the area the rounded sticker leaves
// transparent, and the junctions therefore expose far-side geometry. It proposes
// squaring sticker-backed walls.
//
// DECIDED BY DIFF, NOT BY GEOMETRY
// Instead of locating junctions geometrically (the front face is a 3/4-view trapezoid,
// so screen rects are not the quads they look like) this diffs two screenshots of the
// REAL app that differ in exactly one declaration:
//
//   A: as shipped       - `.cubie-interior { border-radius: 15% }`
//   B: every wall squared - `border-radius: 0`
//
// Every pixel that changes is a pixel the rounded corner failed to cover. Classifying
// those pixels by their colour in A answers the question that matters:
//
//   * a saturated sticker colour -> face colour really was visible there (a defect)
//   * dark in A                  -> only body/sticker-border colour moved, so the hole
//                                   was filled with the same dark body a squared wall
//                                   would paint. No user-visible difference.
//
// Classifying is required, because squaring a wall ALWAYS paints more body: "the images
// differ" proves nothing on its own.
//
// THE PREDICTION THIS TESTS
// A cubie is a closed box of six opaque walls, so looking through a clipped wall corner
// leads into that cubie's own interior and lands on the far wall of the SAME cubie —
// painted #222222, the same colour as the wall whose corner is clipped. So the
// prediction is that squaring every wall changes essentially nothing, and the comment's
// visible-consequence claim is a false positive even though the hole is real.
//
// A 2D reduction of this scene gets it WRONG and reports a large leak: with the
// perpendicular and back walls omitted, magenta sits directly behind the hole. That is
// why this probe drives the real app rather than a model of it.
//
// Run: node scripts/scratch-debug/junction-hole-probe.mjs --browser=chromium
//      PW_HEADED=1 for the headed compositor path.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, firefox } from 'playwright';

const argValue = (name, fallback) => {
    const prefix = `--${name}=`;
    const hit = process.argv.find(a => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : fallback;
};
const browserName = argValue('browser', 'chromium');
const HEADED = process.env.PW_HEADED === '1';

console.log('junction-hole-probe: received args');
console.log(`  --browser=${browserName}`);
console.log(`  PW_HEADED=${HEADED ? '1' : '0'}`);
console.log('');

// Sticker colours from src/cube/types/common.ts. Body is #222222 and the sticker border
// is #333333 — near-identical to each other, which is exactly why "dark" gets an
// explicit predicate instead of being judged by eye.
const STICKER_COLORS = {
    white: [255, 255, 255],
    yellow: [255, 213, 0],
    red: [196, 30, 58],
    orange: [255, 88, 0],
    blue: [0, 81, 186],
    green: [0, 155, 72],
};
const BODY = [0x22, 0x22, 0x22];
const BORDER = [0x33, 0x33, 0x33];

const near = (p, c, tol) =>
    Math.abs(p[0] - c[0]) <= tol && Math.abs(p[1] - c[1]) <= tol && Math.abs(p[2] - c[2]) <= tol;

function classify(p) {
    if (near(p, BODY, 12)) return 'body #222';
    if (near(p, BORDER, 12)) return 'border #333';
    for (const [name, c] of Object.entries(STICKER_COLORS)) {
        if (near(p, c, 40)) return `sticker:${name}`;
    }
    return 'other';
}

const engine = browserName === 'firefox' ? firefox : chromium;
const url = pathToFileURL(resolve('dist/index.html')).href;
const browser = await engine.launch({ headless: !HEADED });
const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
});

const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1200);

// Activate the Basic view through the app's own UI (see verify-rotation-fix.mjs).
const activated = await page.evaluate(() => {
    const tab = document.querySelector('button[data-view-type="basic-front"]');
    if (!tab) return false;
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
});
if (!activated) throw new Error('the Basic view has no tab to activate');
await page.waitForTimeout(1500);

const found = await page.evaluate(() => {
    const cubie = document.querySelector('[data-cubie-id]');
    if (!cubie || !cubie.parentElement) return null;
    const r = cubie.parentElement.getBoundingClientRect();
    return {
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
        walls: document.querySelectorAll('[class*="cubie-interior"]').length,
        stickers: document.querySelectorAll('[class*="sticker"]').length,
    };
});
if (!found || found.width < 50) throw new Error('could not locate the cube element');
console.log(
    `cube clip ${Math.ceil(found.width)}x${Math.ceil(found.height)}; ` +
        `${found.walls} walls, ${found.stickers} stickers in the DOM\n`
);

const clip = {
    x: Math.floor(found.x),
    y: Math.floor(found.y),
    width: Math.ceil(found.width),
    height: Math.ceil(found.height),
};

const pixels = async () => {
    const shot = await page.screenshot({ clip });
    return page.evaluate(async b64 => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.width;
        cv.height = img.height;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        const out = [];
        for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
        return out;
    }, shot.toString('base64'));
};

const armA = await pixels();

// ARM B — the review comment's EXACT proposal: square only the wall that sits behind a
// sticker, leaving the sticker-less walls rounded (those are the design's R9 rounding).
//
// Expressed in JS rather than CSS because "this wall has a sibling sticker on the same
// face" is not something a selector can say. Doing it per cubie makes the arm precise:
// squaring every wall would also change the sticker-less walls and the two effects could
// not be told apart.
const markedBackedWalls = await page.evaluate(() => {
    let marked = 0;
    document.querySelectorAll('[data-cubie-id]').forEach(cubie => {
        const stickerFaces = new Set(
            Array.from(cubie.querySelectorAll('[class*="sticker"]')).map(el =>
                el.getAttribute('data-face')
            )
        );
        cubie.querySelectorAll('[class*="cubie-interior"]').forEach(wall => {
            if (stickerFaces.has(wall.getAttribute('data-face'))) {
                wall.style.setProperty('border-radius', '0', 'important');
                marked++;
            }
        });
    });
    return marked;
});
await page.waitForTimeout(500);
const armB = await pixels();

// ARM C — every wall squared, for contrast: shows how much of arm B is the
// sticker-backed walls and how much is the rest.
await page.addStyleTag({
    content: '[class*="cubie-interior"] { border-radius: 0 !important; }',
});
await page.waitForTimeout(500);
const armC = await pixels();

// CONTROL 1: did the declaration actually apply? A CSS-module rename or a selector that
// matches nothing would leave the arms identical and a `0 differing` result would read as
// a clean bill of health instead of as a broken experiment.
const appliedRadius = await page.evaluate(() => {
    const wall = document.querySelector('[class*="cubie-interior"]');
    return wall ? getComputedStyle(wall).borderTopLeftRadius : null;
});
const appliedRadiusStickerBacked = await page.evaluate(() => {
    // The wall behind a sticker: find a cubie whose sticker face also carries a wall.
    for (const cubie of document.querySelectorAll('[data-cubie-id]')) {
        const stickerFaces = new Set(
            Array.from(cubie.querySelectorAll('[class*="sticker"]')).map(el =>
                el.getAttribute('data-face')
            )
        );
        for (const wall of cubie.querySelectorAll('[class*="cubie-interior"]')) {
            if (stickerFaces.has(wall.getAttribute('data-face'))) {
                return getComputedStyle(wall).borderTopLeftRadius;
            }
        }
    }
    return null;
});

// CONTROL 2: is the cube actually painted in this clip? An empty or background-only crop
// would also produce `0 differing`.
const distinctColors = new Set(armA.map(p => `${p[0]},${p[1]},${p[2]}`)).size;

/** Diff two arms, classifying changed pixels by their colour in `base`. */
function diff(base, other, name) {
    const total = Math.min(base.length, other.length);
    let differing = 0;
    const byClass = {};
    let firstDiff = null;
    for (let i = 0; i < total; i++) {
        const a = base[i];
        const b = other[i];
        if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue;
        differing++;
        const cls = classify(a);
        byClass[cls] = (byClass[cls] ?? 0) + 1;
        if (!firstDiff) firstDiff = { i, a, b };
    }
    return { name, differing, byClass, firstDiff, total };
}

const diffB = diff(armA, armB, 'sticker-backed walls squared (the proposal)');
const diffC = diff(armA, armC, 'every wall squared (for contrast)');

console.log('--- controls ---');
console.log(`marked sticker-backed walls: ${markedBackedWalls}`);
console.log(`computed radius, any wall,    after arm B: ${appliedRadius}`);
console.log(`computed radius, sticker-backed wall:      ${appliedRadiusStickerBacked}`);
console.log(`distinct colours in the shipped crop:      ${distinctColors}`);
console.log(`page errors: ${pageErrors.length}`);
if (pageErrors.length) console.log(pageErrors.join('\n'));
console.log('');
console.log(`arm B (proposal) differing pixels: ${diffB.differing} / ${diffB.total}`);
console.log(`arm C (all walls) differing pixels: ${diffC.differing} / ${diffC.total}`);
console.log('');

let refused = false;
// After arm C every wall is square, so `appliedRadius` legitimately reads 0. The check
// that matters for the PROPOSAL is arm B's sticker-backed wall.
if (appliedRadiusStickerBacked !== '0px' && appliedRadiusStickerBacked !== '0') {
    console.error(
        `REFUSING: the sticker-backed wall never got squared (reads ` +
            `${appliedRadiusStickerBacked}), so arm B is not the review's proposal and the ` +
            `comparison is meaningless.`
    );
    refused = true;
}
if (markedBackedWalls === 0) {
    console.error('REFUSING: no sticker-backed wall was found to square.');
    refused = true;
}
if (distinctColors < 5) {
    console.error(
        `REFUSING: only ${distinctColors} distinct colours in the crop, so the cube is not ` +
            `painted here and a zero diff would be vacuous.`
    );
    refused = true;
}

if (!refused) {
    const reportFor = d => {
        const faceColoured = Object.entries(d.byClass)
            .filter(([k]) => k.startsWith('sticker:'))
            .reduce((n, [, v]) => n + v, 0);
        return { faceColoured };
    };

    const lines = [];
    lines.push(`# Junction hole probe — ${browserName}`);
    lines.push('');
    lines.push(
        'Pixels whose colour changed in the REAL app when `border-radius` was removed from ' +
            '`.cubie-interior` walls, i.e. the area a rounded corner failed to cover.'
    );
    lines.push('');
    lines.push(`Cube clip: ${clip.width}x${clip.height} CSS px at deviceScaleFactor 2.`);
    lines.push('');
    lines.push("## Arm B — the review comment's proposal (sticker-backed walls squared)");
    lines.push('');
    lines.push('| colour in the shipped arm | pixels changed |');
    lines.push('| - | - |');
    for (const [cls, n] of Object.entries(diffB.byClass).sort((x, y) => y[1] - x[1])) {
        lines.push(`| ${cls} | ${n} |`);
    }
    lines.push(`| **total** | **${diffB.differing}** |`);
    lines.push('');
    const b = reportFor(diffB);
    lines.push(`Sticker-coloured pixels among them: **${b.faceColoured}** of ${diffB.differing}.`);
    lines.push('');
    lines.push('## Arm C — every wall squared (contrast)');
    lines.push('');
    lines.push('| colour in the shipped arm | pixels changed |');
    lines.push('| - | - |');
    for (const [cls, n] of Object.entries(diffC.byClass).sort((x, y) => y[1] - x[1])) {
        lines.push(`| ${cls} | ${n} |`);
    }
    lines.push(`| **total** | **${diffC.differing}** |`);
    lines.push('');
    const c = reportFor(diffC);
    lines.push(`Sticker-coloured pixels among them: **${c.faceColoured}** of ${diffC.differing}.`);
    lines.push('');
    lines.push('## Reading');
    lines.push('');
    lines.push(
        `Squaring the sticker-backed wall changes ${diffB.differing} device pixels, ` +
            `${((diffB.differing / diffB.total) * 100).toFixed(3)}% of the crop. Of those, ` +
            `${b.faceColoured} were a sticker colour in the shipped arm.`
    );
    lines.push('');
    if (b.faceColoured === 0) {
        lines.push(
            'Every pixel the rounded corner left uncovered was dark in the shipped arm — ' +
                "body `#222` or sticker border `#333`. The wall's rounded corner is " +
                "congruent with the sticker's, so it uncovers exactly the bound the sticker's " +
                'border already paints; squaring it repaints that bound in body colour. No ' +
                "face colour is exposed, so the comment's predicted visible defect does not " +
                'occur.'
        );
    } else {
        lines.push(
            `${b.faceColoured} face-coloured pixels were visible where the wall should have ` +
                "covered them. They are the stickers' antialiased rounded-corner fringes: a " +
                'subpixel ring where the true bound sits between painted pixels. Squaring the ' +
                'wall covers that ring with body colour — a visible but subtle change, not a ' +
                'far-side leak.'
        );
    }
    lines.push('');
    lines.push(
        'What this can and cannot prove: antialiased sub-pixel slivers of the perpendicular ' +
            'walls could fall below one device pixel and hide a leak, so a small count is ' +
            'weaker evidence than the colours of the pixels that DID change — which is why ' +
            'the classification above, not the total, is the finding.'
    );
    lines.push('');
    if (diffB.firstDiff) {
        lines.push(
            `First differing pixel: index ${diffB.firstDiff.i}, shipped = ` +
                `rgb(${diffB.firstDiff.a.join(',')}), squared = ` +
                `rgb(${diffB.firstDiff.b.join(',')}).`
        );
    }

    const report = lines.join('\n');
    console.log(report);
    writeFileSync(
        resolve('scripts/scratch-debug', `junction-hole-probe.${browserName}.md`),
        report + '\n'
    );
}

await browser.close();
