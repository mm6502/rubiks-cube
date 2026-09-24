// Deterministic image -> ASCII renderer, so an agent with no vision capability
// can still READ an image.
//
// This exists because the local VLM proved unreliable on Rubik screenshots: on
// docs/visuals/firefox-resize-issue.png (a single-panel screenshot) it invented
// "front face and back face" with blue/green/red/orange squares that are not in
// the image. A hallucinating judge is worse than no judge, so measurements that
// matter are taken straight from the pixels here instead.
//
// Each output cell is the average of its source block, classified into a coarse
// palette and printed as one character. Colours are matched by nearest reference
// point in RGB, which is enough to separate cube face colours from the dark
// borders (border #333, interior #222).
//
// Usage:
//   node ascii-image.mjs <image> [cols] [rows]
//   node ascii-image.mjs <image> [cols] [rows] [x y w h] [dpr]
//
// The optional region is in CSS pixels; pass the DPR used by the capture and the
// region is scaled into the image's device pixels.
import { readFileSync } from 'node:fs';

import sharp from 'sharp';

const [, , file, colsArg, rowsArg, xArg, yArg, wArg, hArg, dprArg] = process.argv;
if (!file) {
    console.error('usage: node ascii-image.mjs <image> [cols] [rows] [x y w h] [dpr]');
    process.exit(1);
}
const cols = Number(colsArg) || 96;
const rows = Number(rowsArg) || 48;
const dpr = Number(dprArg) || 1;

const meta = await sharp(file).metadata();
let region = { left: 0, top: 0, width: meta.width, height: meta.height };
if (xArg !== undefined) {
    const x = Number(xArg) * dpr,
        y = Number(yArg) * dpr;
    const w = Number(wArg) * dpr,
        h = Number(hArg) * dpr;
    region = {
        left: Math.max(0, Math.min(meta.width - 1, Math.round(x))),
        top: Math.max(0, Math.min(meta.height - 1, Math.round(y))),
        width: 0,
        height: 0,
    };
    region.width = Math.max(1, Math.min(meta.width - region.left, Math.round(w)));
    region.height = Math.max(1, Math.min(meta.height - region.top, Math.round(h)));
}

// Resize the region down to cols x rows. The default (lanczos3) kernel AVERAGES
// the source block, which is what a block-average reading requires. Do NOT use
// kernel:'nearest' here: when downscaling it samples a single source pixel per
// cell, so one dark pixel in a white block shows up as a full dark character --
// it fabricates thin dark lines that are indistinguishable from real stripes.
const { data, info } = await sharp(file)
    .extract(region)
    .resize(cols, rows, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

// Coarse palette. Letters are chosen to be readable in a terminal.
const PALETTE = [
    ['.', 0x22, 0x22, 0x22], // cube interior
    ['x', 0x33, 0x33, 0x33], // sticker border
    ['#', 0x00, 0x00, 0x00], // black
    ['W', 0xff, 0xff, 0xff], // white face
    ['R', 0xc4, 0x1e, 0x3a], // red
    ['O', 0xff, 0x58, 0x00], // orange
    ['Y', 0xff, 0xd5, 0x00], // yellow
    ['G', 0x00, 0x9b, 0x48], // green
    ['B', 0x00, 0x46, 0xad], // blue
    ['c', 0x00, 0x9e, 0xef], // cyan/light blue
    ['M', 0xff, 0x40, 0x81], // magenta
    ['s', 0x99, 0x99, 0x99], // grey
];

function classify(r, g, b) {
    let best = PALETTE[0],
        bestD = Infinity;
    for (const p of PALETTE) {
        const d = (r - p[1]) ** 2 + (g - p[2]) ** 2 + (b - p[3]) ** 2;
        if (d < bestD) {
            bestD = d;
            best = p;
        }
    }
    return best[0];
}

const lines = [];
for (let y = 0; y < info.height; y++) {
    let line = '';
    for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        line += classify(data[i], data[i + 1], data[i + 2]);
    }
    lines.push(line);
}

console.log(
    `image ${meta.width}x${meta.height}  region ${region.left},${region.top} ${region.width}x${region.height}  grid ${cols}x${rows}  (1 char = 1 block average)`
);
console.log(
    `legend: . interior#222  x border#333  # black  W white  R red  O orange  Y yellow  G green  B blue  c cyan  M magenta  s grey`
);
console.log('+' + '-'.repeat(cols) + '+');
for (const l of lines) console.log('|' + l + '|');
console.log('+' + '-'.repeat(cols) + '+');

// Colour census over the region, as percentages of the whole region.
const counts = new Map();
for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        const c = classify(data[i], data[i + 1], data[i + 2]);
        counts.set(c, (counts.get(c) || 0) + 1);
    }
}
const total = info.width * info.height;
console.log('\ncensus (% of region):');
[...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([c, n]) => console.log(`  ${c}  ${((100 * n) / total).toFixed(1)}%`));
