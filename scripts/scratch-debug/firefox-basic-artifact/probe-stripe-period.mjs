// Characterizes the stripe pattern inside a face region: band count, thickness,
// spacing, and orientation. No vision involved - pure mask statistics.
//
// Why these particular statistics:
//
//  * BAND COUNT vs STICKER COUNT is the discriminator between geometry and
//    resampling. A healthy 3x3 face has exactly 2 interior borders, so a scan
//    across it crosses ~3 sticker runs. A pattern with many more alternating
//    bands than that cannot be the sticker grid - it is a beat pattern.
//
//  * ORIENTATION tells the same story a second way. A beat/moire pattern from
//    rescaling is tied to the RENDER GRID, so its bands run along the screen
//    axes. A geometric stripe is tied to the FACE and therefore runs along the
//    face's own projected axes, which are not screen-aligned once the cube is
//    tilted.
//
//  * THICKNESS consistency: a real border is a fixed number of device pixels
//    (17 here at dpr 1.7647 for a 10px authored border). Bands of wildly
//    varying thickness are a resampling artefact.
//
// Usage: node probe-stripe-period.mjs <image> <x> <y> <w> <h> [--dark <0-255>]
import sharp from 'sharp';

const args = process.argv.slice(2);
const file = args.shift();
const nums = args.filter((a) => /^-?[\d.]+$/.test(a)).map(Number);
const darkIdx = args.indexOf('--dark');
const DARK = darkIdx >= 0 ? Number(args[darkIdx + 1]) : 128;
const [x, y, w, h] = nums;

if (!file || nums.length < 4) {
  console.error('usage: node probe-stripe-period.mjs <image> <x> <y> <w> <h> [--dark N]');
  process.exit(1);
}

const meta = await sharp(file).metadata();
const left = Math.max(0, Math.min(meta.width - 1, Math.round(x)));
const top = Math.max(0, Math.min(meta.height - 1, Math.round(y)));
const width = Math.max(1, Math.min(meta.width - left, Math.round(w)));
const height = Math.max(1, Math.min(meta.height - top, Math.round(h)));

const { data, info } = await sharp(file)
  .extract({ left, top, width, height })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = info.width, H = info.height, C = info.channels;
const L = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
const isDark = (xx, yy) => L((yy * W + xx) * C) < DARK;

console.log(`${file}  crop ${left},${top} ${W}x${H}  dark threshold <${DARK}`);
let darkTotal = 0;
for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (isDark(xx, yy)) darkTotal++;
console.log(`dark share ${(100 * darkTotal / (W * H)).toFixed(1)}%`);
console.log('');

// --- scan statistics along each axis ---------------------------------------
function scan(axis) {
  const lines = axis === 'rows' ? H : W;
  const span = axis === 'rows' ? W : H;
  const runCounts = [];
  const runLengths = [];
  for (let l = 0; l < lines; l++) {
    let prev = null, n = 0, runs = 0;
    const lengths = [];
    for (let s = 0; s < span; s++) {
      const d = axis === 'rows' ? isDark(s, l) : isDark(l, s);
      if (d === prev) { n++; }
      else {
        if (prev === true) { runs++; lengths.push(n); }
        prev = d; n = 1;
      }
    }
    if (prev === true) { runs++; lengths.push(n); }
    runCounts.push(runs);
    for (const len of lengths) runLengths.push(len);
  }
  const mean = (a) => a.reduce((p, c) => p + c, 0) / (a.length || 1);
  const sorted = [...runLengths].sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  return {
    axis,
    meanDarkRunsPerLine: +mean(runCounts).toFixed(2),
    minRuns: Math.min(...runCounts),
    maxRuns: Math.max(...runCounts),
    darkRunCount: runLengths.length,
    meanRunLength: +mean(runLengths).toFixed(2),
    medianRunLength: med,
    p10: sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0,
    p90: sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 0,
  };
}

for (const axis of ['rows', 'cols']) {
  const s = scan(axis);
  const dir = axis === 'rows' ? 'horizontal scan (bands are VERTICAL)' : 'vertical scan (bands are HORIZONTAL)';
  console.log(`${dir}`);
  console.log(`  dark runs per line: mean ${s.meanDarkRunsPerLine}  range ${s.minRuns}..${s.maxRuns}`);
  console.log(`  dark run length   : mean ${s.meanRunLength}  median ${s.medianRunLength}  p10 ${s.p10}  p90 ${s.p90}`);
  console.log(`  total dark runs   : ${s.darkRunCount}`);
  console.log('');
}

// --- orientation of dark structures via the structure tensor ---------------
// Sums the squared gradients. A pattern of parallel bands has a strongly
// anisotropic gradient, so one eigenvalue dominates; the dominant direction of
// the GRADIENT is perpendicular to the bands.
let jxx = 0, jyy = 0, jxy = 0;
for (let yy = 1; yy < H - 1; yy++) {
  for (let xx = 1; xx < W - 1; xx++) {
    const gx = L((yy * W + xx + 1) * C) - L((yy * W + xx - 1) * C);
    const gy = L(((yy + 1) * W + xx) * C) - L(((yy - 1) * W + xx) * C);
    jxx += gx * gx; jyy += gy * gy; jxy += gx * gy;
  }
}
const trace = jxx + jyy;
const det = jxx * jyy - jxy * jxy;
const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
const l1 = trace / 2 + disc, l2 = trace / 2 - disc;
// Dominant gradient direction (angle from +x axis).
const gradAngle = 0.5 * Math.atan2(2 * jxy, jxx - jyy) * 180 / Math.PI;
console.log('structure tensor of the luminance gradient:');
console.log(`  eigenvalue1 ${l1.toExponential(3)}  eigenvalue2 ${l2.toExponential(3)}`);
console.log(`  anisotropy (1 - l2/l1) ${(1 - (l1 ? l2 / l1 : 0)).toFixed(3)}`);
console.log(`  dominant GRADIENT direction ${gradAngle.toFixed(1)}deg from +x  ` +
  `=> band direction ${(((gradAngle + 90) % 180) + 180) % 180 === 0 ? 'vertical (90deg mod 180)' : ((gradAngle + 90) % 180).toFixed(1) + 'deg from +x'}`);
