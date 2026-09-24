// Decides whether an image is a SCREENSHOT or a PHOTOGRAPH of a screen, and
// measures stripe structure. No vision needed - everything is numeric.
//
// Why this matters for the Basic-view artifact: a defect that only appears in a
// photograph of the screen and NOT in an API screenshot is evidence for a
// compositor/GPU-layer cause (the capture path sees different content than the
// display path). Conversely, a defect present in a real screenshot is content,
// not compositing.
//
// Two discriminators:
//
//  1. FLATNESS. A screenshot of a CSS UI contains large areas of EXACTLY one
//     colour, so 32x32 blocks reach a standard deviation of 0.0 and colours land
//     on the design tokens (#222222, #333333, #ffffff...). A camera photo of a
//     screen has sensor noise, so no block is ever that flat.
//
//  2. EXACT TOKEN MATCHES. Screenshots reproduce the authored hex values
//     byte-exactly. Photos shift every pixel slightly, so exact matches vanish.
//
// Usage: node probe-image-provenance.mjs <image> [x y w h]
import sharp from 'sharp';

const [file, xa, ya, wa, ha] = process.argv.slice(2);
if (!file) {
    console.error('usage: node probe-image-provenance.mjs <image> [x y w h]');
    process.exit(1);
}

const meta = await sharp(file).metadata();
let region = { left: 0, top: 0, width: meta.width, height: meta.height };
if (xa !== undefined) {
    region = {
        left: Math.max(0, Math.min(meta.width - 1, Number(xa))),
        top: Math.max(0, Math.min(meta.height - 1, Number(ya))),
        width: 0,
        height: 0,
    };
    region.width = Math.max(1, Math.min(meta.width - region.left, Number(wa)));
    region.height = Math.max(1, Math.min(meta.height - region.top, Number(ha)));
}

const { data, info } = await sharp(file)
    .extract(region)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

const W = info.width,
    H = info.height,
    C = info.channels;
const lum = i => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

console.log(`${file}`);
console.log(
    `file ${meta.width}x${meta.height}  channels ${C}  region ${region.left},${region.top} ${W}x${H}`
);
if (meta.density) console.log(`density (dpi) ${meta.density}`);
console.log('');

// --- 1. Block flatness ------------------------------------------------------
const B = 32;
const stds = [];
for (let by = 0; by + B <= H; by += B) {
    for (let bx = 0; bx + B <= W; bx += B) {
        let s = 0,
            s2 = 0,
            n = 0;
        for (let y = by; y < by + B; y++) {
            for (let x = bx; x < bx + B; x++) {
                const v = lum((y * W + x) * C);
                s += v;
                s2 += v * v;
                n++;
            }
        }
        const mean = s / n;
        stds.push(Math.sqrt(Math.max(0, s2 / n - mean * mean)));
    }
}
stds.sort((a, b) => a - b);
const pct = p => stds[Math.min(stds.length - 1, Math.floor(stds.length * p))];
console.log(`block flatness over ${stds.length} blocks of ${B}x${B} (luminance std):`);
console.log(`  min        ${stds[0].toFixed(4)}`);
console.log(`  p05        ${pct(0.05).toFixed(4)}`);
console.log(`  median     ${pct(0.5).toFixed(4)}`);
console.log(`  p95        ${pct(0.95).toFixed(4)}`);
console.log(`  blocks with std < 0.5 (perfectly flat): ${stds.filter(s => s < 0.5).length}`);
console.log(`  blocks with std < 2.0                 : ${stds.filter(s => s < 2.0).length}`);
console.log('');

// --- 2. Exact colour census -------------------------------------------------
const TOKENS = {
    '#222222 cube interior': [0x22, 0x22, 0x22],
    '#333333 sticker border': [0x33, 0x33, 0x33],
    '#ffffff white face': [0xff, 0xff, 0xff],
    '#000000 black': [0x00, 0x00, 0x00],
};
const counts = new Map();
let total = 0;
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        const i = (y * W + x) * C;
        const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
        counts.set(key, (counts.get(key) || 0) + 1);
        total++;
    }
}
console.log('exact-colour repeats (top 8 most common single colours):');
[...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([k, n]) =>
        console.log(
            `  ${k.padEnd(16)} ${String(n).padStart(8)}  ${((100 * n) / total).toFixed(3)}%`
        )
    );
console.log('');
console.log('exact design-token matches anywhere in the region:');
for (const [name, [r, g, b]] of Object.entries(TOKENS)) {
    const n = counts.get(`${r},${g},${b}`) || 0;
    console.log(
        `  ${name.padEnd(26)} ${String(n).padStart(8)}  ${((100 * n) / total).toFixed(3)}%`
    );
}
console.log('');

// --- 3. Stripe structure ----------------------------------------------------
// Average along each axis to get a 1D profile, then count how often the profile
// crosses its own mean. Many crossings = a periodic band/stripe pattern.
function profile(axis) {
    const len = axis === 'x' ? W : H;
    const other = axis === 'x' ? H : W;
    const out = [];
    for (let a = 0; a < len; a++) {
        let s = 0;
        for (let b = 0; b < other; b++) {
            const x = axis === 'x' ? a : b;
            const y = axis === 'x' ? b : a;
            s += lum((y * W + x) * C);
        }
        out.push(s / other);
    }
    return out;
}
for (const axis of ['x', 'y']) {
    const p = profile(axis);
    const mean = p.reduce((a, b) => a + b, 0) / p.length;
    let crossings = 0;
    for (let i = 1; i < p.length; i++) {
        if ((p[i - 1] - mean) * (p[i] - mean) < 0) crossings++;
    }
    const sd = Math.sqrt(p.reduce((a, v) => a + (v - mean) * (v - mean), 0) / p.length);
    const period = crossings > 0 ? (2 * p.length) / crossings : Infinity;
    console.log(
        `profile along ${axis}: mean ${mean.toFixed(1)}  sd ${sd.toFixed(1)}  ` +
            `mean-crossings ${crossings}  implied period ${Number.isFinite(period) ? period.toFixed(1) + 'px' : 'n/a'}`
    );
}
