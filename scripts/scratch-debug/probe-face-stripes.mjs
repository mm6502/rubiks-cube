// Locates the WHITE face in an image and measures the dark bands inside it.
//
// Why locate it automatically: the defect screenshots are cropped differently
// every time and I have no vision, so hand-picked crop rectangles have twice been
// wrong (one was 92.7% panel background, making every statistic meaningless).
// Finding the bright face by mask and reporting its bounding box removes the
// guesswork.
//
// The key discriminator it prints:
//
//   * A healthy 3x3 face has exactly TWO interior border lines, so a scan across
//     it yields ~3 bright runs separated by 2 dark runs.
//   * A band count much higher than that cannot be the sticker grid. If the extra
//     bands are THIN and their spacing is close to the border's device-pixel
//     thickness, they are resampling/moire fringes of the grid, not geometry.
//
// Usage: node probe-face-stripes.mjs <image> [--bright N] [--dark N] [--minw N]
import sharp from 'sharp';

const args = process.argv.slice(2);
const file = args.shift();
if (!file) {
  console.error('usage: node probe-face-stripes.mjs <image> [--bright N] [--dark N] [--minw N]');
  process.exit(1);
}
const numFlag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const BRIGHT = numFlag('--bright', 200);
const DARK = numFlag('--dark', 128);
const MINW = numFlag('--minw', 120);

const meta = await sharp(file).metadata();
const { data, info } = await sharp(file).removeAlpha().raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const L = (x, y) => {
  const i = (y * W + x) * C;
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
};

console.log(`${file}  ${meta.width}x${meta.height}`);

// --- find the white face ----------------------------------------------------
// Rows/columns with many bright pixels. Contiguous heavy-bright rows form the face.
const rowBright = new Array(H).fill(0);
const colBright = new Array(W).fill(0);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (L(x, y) >= BRIGHT) { rowBright[y]++; colBright[x]++; }
  }
}
const runsOf = (arr, min) => {
  const out = [];
  let start = -1;
  for (let i = 0; i < arr.length; i++) {
    const hit = arr[i] >= min;
    if (hit && start < 0) start = i;
    if (!hit && start >= 0) { out.push([start, i - 1]); start = -1; }
  }
  if (start >= 0) out.push([start, arr.length - 1]);
  return out;
};
const rowRuns = runsOf(rowBright, 20);
const colRuns = runsOf(colBright, 20);
console.log(`bright(>=${BRIGHT}) row spans: ${rowRuns.map((r) => r[0] + '..' + r[1]).join(' ') || 'none'}`);
console.log(`bright(>=${BRIGHT}) col spans: ${colRuns.map((r) => r[0] + '..' + r[1]).join(' ') || 'none'}`);

const pick = (runs) => runs.filter((r) => r[1] - r[0] >= MINW).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
const rr = pick(rowRuns), cr = pick(colRuns);
if (!rr || !cr) { console.log('\nno face-sized bright region found'); process.exit(0); }

const top = rr[0], bottom = rr[1], left = cr[0], right = cr[1];
const w = right - left + 1, h = bottom - top + 1;
console.log(`\nface box (bright region): ${left},${top} ${w}x${h}`);

// Tighten: the bright spans include the face's own white stickers only, so the
// box is the U face itself. Measure the dark bands within it.
let darkCount = 0, brightCount = 0;
for (let y = top; y <= bottom; y++) {
  for (let x = left; x <= right; x++) {
    const v = L(x, y);
    if (v < DARK) darkCount++;
    else if (v >= BRIGHT) brightCount++;
  }
}
const total = w * h;
console.log(`  dark(<${DARK})  ${(100 * darkCount / total).toFixed(1)}%`);
console.log(`  bright(>=${BRIGHT}) ${(100 * brightCount / total).toFixed(1)}%`);

// --- band structure --------------------------------------------------------
function scan(axis) {
  const lines = axis === 'rows' ? h : w;
  const span = axis === 'rows' ? w : h;
  const brightRunsPerLine = [];
  const allDarkRuns = [];
  for (let l = 0; l < lines; l++) {
    const at = (s) => (axis === 'rows' ? L(left + s, top + l) : L(left + l, top + s));
    let prev = null, n = 0, br = 0;
    const darks = [];
    for (let s = 0; s < span; s++) {
      const isB = at(s) >= BRIGHT;
      const isD = at(s) < DARK;
      const kind = isB ? 'B' : isD ? 'D' : 'M';
      if (kind === prev) n++;
      else {
        if (prev === 'B') br++;
        if (prev === 'D') darks.push(n);
        prev = kind; n = 1;
      }
    }
    if (prev === 'B') br++;
    if (prev === 'D') darks.push(n);
    brightRunsPerLine.push(br);
    for (const d of darks) allDarkRuns.push(d);
  }
  const mean = (a) => a.reduce((p, c) => p + c, 0) / (a.length || 1);
  allDarkRuns.sort((a, b) => a - b);
  const q = (p) => allDarkRuns.length ? allDarkRuns[Math.floor(allDarkRuns.length * p)] : 0;
  return {
    label: axis === 'rows' ? 'horizontal scan (bands run VERTICALLY)' : 'vertical scan (bands run HORIZONTALLY)',
    brightRunsPerLine: +mean(brightRunsPerLine).toFixed(2),
    maxBrightRuns: Math.max(...brightRunsPerLine),
    darkRunCount: allDarkRuns.length,
    darkRunMean: +mean(allDarkRuns).toFixed(1),
    darkRunP25: q(0.25), darkRunMedian: q(0.5), darkRunP75: q(0.75),
    thinDarkRuns: allDarkRuns.filter((d) => d <= 6).length,
  };
}

for (const axis of ['rows', 'cols']) {
  const s = scan(axis);
  console.log(`\n${s.label}`);
  console.log(`  bright runs per line: mean ${s.brightRunsPerLine}  max ${s.maxBrightRuns}`);
  console.log(`  dark runs: ${s.darkRunCount}  mean ${s.darkRunMean}px  p25 ${s.darkRunP25}  median ${s.darkRunMedian}  p75 ${s.darkRunP75}px`);
  console.log(`  THIN dark runs (<=6px, i.e. fringe-like): ${s.thinDarkRuns}`);
}
console.log('\nInterpretation: a healthy 3x3 face gives ~3 bright runs per line and 2 dark runs');
console.log('per line, with the dark runs being the full border thickness (17 device px at');
console.log('dpr 1.7647 for a 10px authored border). A large count of THIN dark runs means');
console.log('the extra bands are resampling fringes of the grid, not extra geometry.');
