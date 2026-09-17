/**
 * Does configuration D leave 3x3's STICKERS and RING RADII untouched?
 *
 * This is the contract that lets the 3x3 asset be regenerated at all. The
 * hand-authored original now lives in `fixtures/reference-3x3.svg`, outside the
 * directory the loader globs, so it stays an INDEPENDENT reference: the fidelity
 * tests in the generator suite compare generated output against it rather than
 * against the generator's own product.
 *
 * Regenerating 3x3 is only safe if the things those tests pin — sticker
 * coordinates and axis circle radii — come out identical, so the tests keep
 * testing what they were written to test.
 *
 * The face-ellipse values are free to differ (the fidelity tests do not assert
 * them), which is what lets D's larger ellipses reach size 3.
 *
 * Usage: npx tsx scripts/circular-layout/check-3x3-fidelity.ts
 */
import { readFileSync } from 'node:fs';

import { generate, loadParameters } from '@/views/circular/svg-generator/generate';
import { ALL_FACES } from '@/views/circular/svg-generator/geometry';

const REFERENCE = readFileSync('src/views/circular/fixtures/reference-3x3.svg', 'utf8');

interface Circle {
    cx: number;
    cy: number;
    r: number;
}

function parse(svg: string) {
    const stickers = new Map<string, Circle>();
    for (const m of svg.matchAll(/<circle\b[^>]*class="sticker"[^>]*\/>/g)) {
        const tag = m[0];
        const id = /id="([^"]*)"/.exec(tag)?.[1];
        if (!id) continue;
        stickers.set(id, {
            cx: Number(/cx="([-\d.]+)"/.exec(tag)?.[1]),
            cy: Number(/cy="([-\d.]+)"/.exec(tag)?.[1]),
            r: Number(/r="([-\d.]+)"/.exec(tag)?.[1]),
        });
    }

    const axisCircles = new Map<string, Circle>();
    for (const m of svg.matchAll(/<circle\b[^>]*data-axis="[XYZ]"[^>]*\/>/g)) {
        const tag = m[0];
        const id = /id="([^"]*)"/.exec(tag)?.[1];
        if (!id) continue;
        axisCircles.set(id, {
            cx: Number(/cx="([-\d.]+)"/.exec(tag)?.[1]),
            cy: Number(/cy="([-\d.]+)"/.exec(tag)?.[1]),
            r: Number(/r="([-\d.]+)"/.exec(tag)?.[1]),
        });
    }

    const ellipses = new Map<string, { rx: number; ry: number }>();
    for (const m of svg.matchAll(/<ellipse\b[^>]*data-face="([A-Z])"[^>]*\/>/g)) {
        const tag = m[0];
        ellipses.set(m[1], {
            rx: Number(/rx="([-\d.]+)"/.exec(tag)?.[1]),
            ry: Number(/ry="([-\d.]+)"/.exec(tag)?.[1]),
        });
    }

    return { stickers, axisCircles, ellipses };
}

const ref = parse(REFERENCE);
const gen = generate(3, loadParameters());
const out = parse(gen.svg);

console.log('3x3 regeneration: does it preserve what the fidelity test pins?\n');

// Stickers: the test allows 0.5 units.
const COORD_TOLERANCE = 0.5;
let stickerWorst = 0;
let stickerArg = '';
let stickerMissing = 0;
for (const [id, r] of ref.stickers) {
    const g = out.stickers.get(id);
    if (!g) {
        stickerMissing++;
        continue;
    }
    const d = Math.max(Math.abs(g.cx - r.cx), Math.abs(g.cy - r.cy));
    if (d > stickerWorst) {
        stickerWorst = d;
        stickerArg = id;
    }
}
console.log(`  stickers: reference ${ref.stickers.size}, generated ${out.stickers.size}`);
console.log(
    `    worst coordinate deviation: ${stickerWorst.toFixed(4)} (tolerance ${COORD_TOLERANCE}) [${stickerArg}]  missing: ${stickerMissing}`
);
console.log(
    `    -> ${stickerWorst <= COORD_TOLERANCE && stickerMissing === 0 ? 'PRESERVED' : 'VIOLATED'}`
);

// Axis circles: the test asserts to 5 decimal places.
let axisWorst = 0;
let axisArg = '';
for (const [id, r] of ref.axisCircles) {
    const g = out.axisCircles.get(id);
    if (!g) continue;
    const d = Math.max(Math.abs(g.r - r.r), Math.abs(g.cx - r.cx), Math.abs(g.cy - r.cy));
    if (d > axisWorst) {
        axisWorst = d;
        axisArg = id;
    }
}
console.log(`  axis circles: reference ${ref.axisCircles.size}, generated ${out.axisCircles.size}`);
console.log(
    `    worst deviation: ${axisWorst.toFixed(8)} [${axisArg}]  -> ${axisWorst < 1e-5 ? 'PRESERVED' : 'VIOLATED'}`
);

// Ellipses: explicitly NOT pinned, record the change.
console.log('  face ellipses (not pinned by the fidelity test):');
for (const face of ALL_FACES) {
    const r = ref.ellipses.get(String(face));
    const g = out.ellipses.get(String(face));
    if (!r || !g) continue;
    console.log(
        `    ${face}: reference ${r.rx.toFixed(1)}x${r.ry.toFixed(1)}  ->  generated ${g.rx.toFixed(1)}x${g.ry.toFixed(1)}`
    );
}

const safe = stickerWorst <= COORD_TOLERANCE && stickerMissing === 0 && axisWorst < 1e-5;
console.log(
    `\n  verdict: regenerating 3x3 is ${safe ? 'SAFE - stickers and rings are unchanged' : 'UNSAFE - it would break the fidelity contract'}`
);
if (safe) {
    console.log(
        '  note: the fidelity tests compare generated output against the fixture in\n' +
            '        fixtures/, which the loader glob cannot reach, so they still prove the\n' +
            '        generator reproduces an independent reference.'
    );
}
