// Tests whether the artifact lives in a CACHED COMPOSITED LAYER (compositor
// hypothesis) or in the DOM/CSS content (geometry hypothesis).
//
// The two hypotheses make opposite predictions about a forced re-raster:
//
//   Compositor cache: the layer's raster is reused while the panel is moved, so
//     the artifact lives in that cached texture. Forcing the layer to be thrown
//     away and re-rasterized -- WITHOUT changing any geometry -- clears it.
//
//   Content/geometry: the stripes are produced by the same DOM every frame, so a
//     re-raster reproduces them exactly. Only changing the CSS makes a difference.
//
// A move is an ideal probe because `handleDrag()` writes ONLY `style.left` and
// `style.top` (panel-interaction-handler.ts:284-285). It cannot alter border
// widths, cubie sizes, transforms or any painted property -- so ANY visual change
// after a pure position change is by construction a compositing effect rather
// than a content effect.
//
// The script takes a CONTROL pair first: two consecutive captures with nothing
// changed must be pixel-identical, otherwise the comparison itself is unsound and
// every later result is worthless.
//
// Usage: node probe-compositor-cache.mjs [label]
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const label = process.argv[2] || 'cc';
const outDir = 'd:/llms/vision/artifact';
mkdirSync(outDir, { recursive: true });

const socket = net.createConnection({ host: '127.0.0.1', port: 2828 });
let buffer = Buffer.alloc(0);
let msgId = 0;
const pending = new Map();

function send(msg) {
  const json = JSON.stringify(msg);
  socket.write(Buffer.byteLength(json, 'utf8') + ':' + json);
}
socket.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const colon = buffer.indexOf(0x3a);
    if (colon < 0) return;
    const len = parseInt(buffer.subarray(0, colon).toString('utf8'), 10);
    if (!Number.isFinite(len) || buffer.length < colon + 1 + len) return;
    const json = buffer.subarray(colon + 1, colon + 1 + len).toString('utf8');
    buffer = buffer.subarray(colon + 1 + len);
    try {
      const frame = JSON.parse(json);
      if (Array.isArray(frame) && frame[0] === 1) {
        const e = pending.get(frame[1]);
        if (e) {
          pending.delete(frame[1]);
          if (frame[2]) e.reject(new Error(JSON.stringify(frame[2])));
          else e.resolve(frame[3]);
        }
      }
    } catch { /* partial frame */ }
  }
});
socket.on('error', (err) => { console.error('socket error: ' + err.message); process.exit(1); });

function command(name, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    send([0, id, name, params || {}]);
    setTimeout(() => reject(new Error('timeout ' + name)), 30000);
  });
}

await new Promise((r) => socket.once('connect', r));
await new Promise((r) => setTimeout(r, 500));
await command('WebDriver:NewSession', { capabilities: {} }).catch(() => {});

async function evaluate(script) {
  const res = await command('WebDriver:ExecuteScript', { script, args: [] });
  const v = res && res.value !== undefined ? res.value : res;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

async function shoot(name) {
  const shot = await command('WebDriver:TakeScreenshot', { full: false });
  const b64 = typeof shot === 'string' ? shot : shot?.value;
  if (!b64) throw new Error('screenshot failed for ' + name);
  const p = `${outDir}/${label}-${name}.png`;
  writeFileSync(p, Buffer.from(b64, 'base64'));
  return p;
}

// Diff two images of identical size; return the differing-pixel fraction and a
// coarse map of WHERE the differences are.
async function diff(a, b) {
  const A = await sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (A.info.width !== B.info.width || A.info.height !== B.info.height) {
    return { error: `size mismatch ${A.info.width}x${A.info.height} vs ${B.info.width}x${B.info.height}` };
  }
  const { width: W, height: H, channels: C } = A.info;
  let differing = 0, big = 0;
  // 16x16 cell counters, so the location of the change is visible without vision.
  const GW = Math.ceil(W / 64), GH = Math.ceil(H / 64);
  const grid = new Array(GW * GH).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      const d = Math.abs(A.data[i] - B.data[i]) +
                Math.abs(A.data[i + 1] - B.data[i + 1]) +
                Math.abs(A.data[i + 2] - B.data[i + 2]);
      if (d > 8) {
        differing++;
        if (d > 60) big++;
        grid[Math.floor(y / 64) * GW + Math.floor(x / 64)]++;
      }
    }
  }
  const total = W * H;
  const hottest = grid
    .map((n, i) => ({ n, x: (i % GW) * 64, y: Math.floor(i / GW) * 64 }))
    .filter((c) => c.n > 0)
    .sort((p, q) => q.n - p.n)
    .slice(0, 6);
  return {
    size: `${W}x${H}`,
    differingPct: +(100 * differing / total).toFixed(3),
    stronglyDifferingPct: +(100 * big / total).toFixed(3),
    cellsWithChange: grid.filter((n) => n > 0).length,
    hottestCells: hottest,
  };
}

// Report where the cube is, in the screenshot's own pixels, so a later session
// can crop it without guessing.
const geometry = await evaluate([
  'const panel = document.querySelector(".basic-front-view");',
  'const pr = panel.getBoundingClientRect();',
  'const cube = panel.querySelector("[class*=cube_]") || panel.querySelector("[class*=cube]");',
  'const cr = cube.getBoundingClientRect();',
  'return JSON.stringify({',
  '  dpr: devicePixelRatio, innerW: innerWidth, innerH: innerHeight,',
  '  panel: { x: pr.x, y: pr.y, w: pr.width, h: pr.height },',
  '  cube: { x: cr.x, y: cr.y, w: cr.width, h: cr.height },',
  '  panelLeft: panel.style.left, panelTop: panel.style.top,',
  '});',
].join('\n'));

console.log('geometry: ' + JSON.stringify(geometry));

// ---- CONTROL: two captures, nothing changed --------------------------------
const c1 = await shoot('control1');
await new Promise((r) => setTimeout(r, 400));
const c2 = await shoot('control2');
const control = await diff(c1, c2);
console.log('\nCONTROL (nothing changed between captures):');
console.log(JSON.stringify(control, null, 1));
if (control.error || control.differingPct > 0.001) {
  console.log('\n!! control is NOT stable -- a comparison from this session would be unsound.');
  console.log('!! Stopping (a harness that cannot be seen to fail is not evidence).');
  socket.end();
  process.exit(0);
}
console.log('control stable: consecutive captures are identical.');

// ---- TREATMENT: force a re-raster without touching geometry ---------------
// `will-change: transform` promotes the element to its own compositor layer, and
// toggling it forces the layer to be re-created and re-rasterized. It changes no
// geometry, no colour and no border -- only how the content is cached.
const before = await shoot('before');

await evaluate([
  'const cube = document.querySelector(".basic-front-view [class*=cube_]")',
  '  || document.querySelector(".basic-front-view [class*=cube]");',
  'cube.style.willChange = "transform";',
  '// Read layout to force a synchronous style+layout flush.',
  'void cube.offsetWidth;',
  'return JSON.stringify({ applied: cube.style.willChange });',
].join('\n'));
await new Promise((r) => setTimeout(r, 900));
const promoted = await shoot('promoted');

await evaluate([
  'const cube = document.querySelector(".basic-front-view [class*=cube_]")',
  '  || document.querySelector(".basic-front-view [class*=cube]");',
  'cube.style.willChange = "";',
  'void cube.offsetWidth;',
  'return JSON.stringify({ applied: cube.style.willChange });',
].join('\n'));
await new Promise((r) => setTimeout(r, 900));
const demoted = await shoot('demoted');

console.log('\nTREATMENT: force re-raster via will-change toggle (no geometry change)');
console.log('  before vs promoted : ' + JSON.stringify(await diff(before, promoted)));
console.log('  before vs demoted  : ' + JSON.stringify(await diff(before, demoted)));
console.log('  promoted vs demoted: ' + JSON.stringify(await diff(promoted, demoted)));
console.log('\n  If before differs from promoted/demoted, the artifact was in a cached');
console.log('  composited layer. If all three are identical, the content is deterministic');
console.log('  and the artifact must be driven by the geometry changes themselves.');

socket.end();
