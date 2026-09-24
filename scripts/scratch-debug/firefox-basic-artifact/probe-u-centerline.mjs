// Ground truth: the ACTUAL RGB values along a U sticker's centre lines.
//
// Every earlier attempt derived a border-vs-colour ratio by combining numbers
// that live in different coordinate spaces, and they disagreed with each other.
// This one makes no such combination: it walks the image and prints the real
// pixel runs, so "how much of the sticker is dark" is read off, not computed.
//
// Sampling through the BOUNDING BOX CENTRE is safe even for a rotated
// element: the centre of the axis-aligned box is inside the projected quad, and
// the quad is convex, so a horizontal or vertical line through that point stays
// inside the quad for the full width/height of the box. (The corners of the box
// are what fall outside, which is what corrupted measure-u-painted.mjs.)
//
// Usage: node probe-u-centerline.mjs [stickerId]
import { readFileSync } from 'node:fs';

import sharp from 'sharp';

const geom = JSON.parse(readFileSync('d:/llms/vision/artifact/u-geom.json', 'utf8')).geom;
const wanted = process.argv[2];
const dpr = geom.dpr;

const { data, info } = await sharp('d:/llms/vision/artifact/marionette-full.png')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
const W = info.width,
    H = info.height,
    C = info.channels;
const at = (x, y) => {
    const i = (y * W + x) * C;
    return [data[i], data[i + 1], data[i + 2]];
};

// Classify the actual colours we care about, from the real palette:
//   sticker border  #333333
//   cube interior   #222222
//   white face      #ffffff
const name = (r, g, b) => {
    if (r > 200 && g > 200 && b > 200) return 'WHITE';
    if (Math.abs(r - 0x33) < 12 && Math.abs(g - 0x33) < 12 && Math.abs(b - 0x33) < 12)
        return 'border#333';
    if (Math.abs(r - 0x22) < 12 && Math.abs(g - 0x22) < 12 && Math.abs(b - 0x22) < 12)
        return 'body#222';
    if (r < 96 && g < 96 && b < 96) return `dark(${r},${g},${b})`;
    return `other(${r},${g},${b})`;
};

function runs(values) {
    const out = [];
    let cur = null,
        n = 0;
    for (const v of values) {
        if (v === cur) n++;
        else {
            if (cur !== null) out.push([cur, n]);
            cur = v;
            n = 1;
        }
    }
    if (cur !== null) out.push([cur, n]);
    return out;
}

const targets = wanted ? geom.detail.filter(d => d.id === wanted) : geom.detail;

for (const s of targets) {
    // CSS -> device pixels. Centre of the axis-aligned bounding box, which is
    // inside the projected quad.
    const x0 = Math.round(s.x * dpr),
        y0 = Math.round(s.y * dpr);
    const w = Math.round(s.w * dpr),
        h = Math.round(s.h * dpr);
    const cx = x0 + Math.floor(w / 2),
        cy = y0 + Math.floor(h / 2);

    console.log(`\n=== ${s.id}`);
    console.log(
        `cssRect ${s.x},${s.y} ${s.w}x${s.h}  border(css)=${s.border}  dpr=${dpr.toFixed(4)}`
    );
    console.log(`deviceRect ${x0},${y0} ${w}x${h}   centre ${cx},${cy}`);

    const horiz = [],
        vert = [];
    for (let i = 0; i < w; i++) horiz.push(name(...at(x0 + i, cy)));
    for (let i = 0; i < h; i++) vert.push(name(...at(cx, y0 + i)));

    const show = (label, arr) => {
        console.log(`\n${label} (${arr.length} device px, left/top -> right/bottom):`);
        const r = runs(arr);
        let off = 0;
        for (const [v, n] of r) {
            const pct = ((100 * n) / arr.length).toFixed(1);
            console.log(
                `  [${String(off).padStart(4)}..${String(off + n - 1).padStart(4)}] ${String(n).padStart(4)}px ${String(pct).padStart(5)}%  ${v}`
            );
            off += n;
        }
        const white = arr.filter(v => v === 'WHITE').length;
        console.log(`  => WHITE share ${((100 * white) / arr.length).toFixed(1)}%`);
    };
    show('HORIZONTAL through centre', horiz);
    show('VERTICAL through centre', vert);
}
