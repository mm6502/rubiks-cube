// Captures the COMPLETE observable state of a live Firefox session, so a later
// session can resume from recorded facts instead of re-deriving them.
//
// Why this exists: the Basic-view artifact is non-deterministic and position
// dependent -- the reporter cannot tie where the panel sits to which face is
// affected -- so the ONE thing that must not be lost is the exact window and
// panel geometry at the moment the artifact was on screen. A screenshot alone
// cannot be re-aligned to a panel later; geometry + screenshot together can.
//
// Notes on the connection:
//   - This drives the DESKTOP Firefox (156.0.1), not Playwright's bundled
//     Nightly (148.0.2). The desktop build has CDP disabled (port 9222 answers
//     404), so Playwright cannot attach to it. Marionette on 2828 is the only
//     channel, which is why this speaks the protocol by hand.
//   - Marionette framing is `length:json`, where length is the BYTE length.
//     Outgoing: [0, msgId, command, params]. Incoming: [1, msgId, error, result].
//   - Deliberately does NOT call WebDriver:DeleteSession: that tears the browser
//     down, and the whole point is to leave the session the user arranged intact.
//
// Usage: node capture-session-state.mjs [label]
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';

const label = process.argv[2] || 'state';
const outDir = 'd:/llms/vision/artifact';
mkdirSync(outDir, { recursive: true });

const socket = net.createConnection({ host: '127.0.0.1', port: 2828 });
let buffer = Buffer.alloc(0), msgId = 0;
const pending = new Map();

function send(m) { const j = JSON.stringify(m); socket.write(`${Buffer.byteLength(j, 'utf8')}:${j}`); }
socket.on('data', (c) => {
  buffer = Buffer.concat([buffer, c]);
  for (;;) {
    const k = buffer.indexOf(0x3a);
    if (k < 0) return;
    const n = parseInt(buffer.subarray(0, k).toString('utf8'), 10);
    if (!Number.isFinite(n) || buffer.length < k + 1 + n) return;
    const j = buffer.subarray(k + 1, k + 1 + n).toString('utf8');
    buffer = buffer.subarray(k + 1 + n);
    try {
      const o = JSON.parse(j);
      if (Array.isArray(o) && o[0] === 1) {
        const p = pending.get(o[1]);
        if (p) { pending.delete(o[1]); o[2] ? p.reject(new Error(JSON.stringify(o[2]))) : p.resolve(o[3]); }
      }
    } catch { /* ignore partial frames */ }
  }
});
function cmd(name, params = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { resolve: res, reject: rej });
    send([0, id, name, params]);
    setTimeout(() => rej(new Error('timeout ' + name)), 30000);
  });
}
socket.on('error', (e) => { console.error('socket error ' + e.message); process.exit(1); });

await new Promise((r) => socket.once('connect', r));
await new Promise((r) => setTimeout(r, 500));
await cmd('WebDriver:NewSession', { capabilities: {} }).catch(() => {});

// --- window / screen --------------------------------------------------------
let windowRect = null;
try { windowRect = await cmd('WebDriver:GetWindowRect', {}); } catch (e) { windowRect = { error: e.message.slice(0, 120) }; }

// --- DOM state --------------------------------------------------------------
// Generic discovery: the panel element and its class names have changed during
// this work, so this asks the DOM what is there instead of hard-coding a
// selector that may already be wrong.
const SCRIPT = `
  const R = (n) => Math.round(n * 100) / 100;
  const rect = (e) => {
    const r = e.getBoundingClientRect();
    return { x: R(r.x), y: R(r.y), w: R(r.width), h: R(r.height), right: R(r.right), bottom: R(r.bottom) };
  };
  const cls = (e) => (typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || '');

  const panels = [...document.querySelectorAll('[class*="panel"]')]
    .filter((e) => e.getBoundingClientRect().width > 40)
    .slice(0, 12)
    .map((e) => ({
      cls: cls(e).slice(0, 120),
      rect: rect(e),
      inline: {
        left: e.style.left || null, top: e.style.top || null,
        width: e.style.width || null, height: e.style.height || null,
      },
    }));

  const basic = document.querySelector('.basic-front-view');
  let basicDetail = null;
  if (basic) {
    const wrapper = basic.querySelector('[class*="wrapper"]');
    const cube = basic.querySelector('[class*="cube"]');
    const cubies = basic.querySelectorAll('[class*="cubie"]');
    const stickers = [...basic.querySelectorAll('[data-sticker-id]')];
    const u = stickers.filter((e) => e.getAttribute('data-face') === 'U');
    // Border width as an integer DEVICE-pixel count, which is the quantity the
    // DPR-rounding investigation turned on: Firefox lays borders out in CSS px
    // but snaps them to whole device px, so an integer CSS border is NOT an
    // integer number of painted pixels at dpr 1.7647.
    const borderSample = stickers[0] ? getComputedStyle(stickers[0]).borderTopWidth : null;
    basicDetail = {
      panelRect: rect(basic),
      cubeWrapperPerspective: wrapper ? getComputedStyle(wrapper).perspective : null,
      cubeElementSize: cube ? { w: R(cube.getBoundingClientRect().width), h: R(cube.getBoundingClientRect().height) } : null,
      cubieCount: cubies.length,
      stickerCount: stickers.length,
      uStickerCount: u.length,
      cubieBorderVar: cube ? getComputedStyle(cube).getPropertyValue('--cubie-border-width').trim() : null,
      computedStickerBorder: borderSample,
      // Distinct computed borders, so a mixed set (e.g. a selected sticker with
      // its own 5px rule) is visible rather than averaged away.
      distinctBorders: [...new Set(stickers.map((e) => getComputedStyle(e).borderTopWidth))],
      uFace: u.map((e) => ({
        id: e.getAttribute('data-sticker-id'),
        rect: rect(e),
        border: getComputedStyle(e).borderTopWidth,
        bg: getComputedStyle(e).backgroundColor,
      })),
    };
  }

  return JSON.stringify({
    url: location.href,
    title: document.title,
    dpr: devicePixelRatio,
    inner: { w: innerWidth, h: innerHeight },
    outer: { w: outerWidth, h: outerHeight },
    screen: { w: screen.width, h: screen.height, availW: screen.availWidth, availH: screen.availHeight },
    panels,
    basic: basicDetail,
  });
`;

const r = await cmd('WebDriver:ExecuteScript', { script: SCRIPT, args: [] });
const v = r?.value ?? r;
const dom = typeof v === 'string' ? JSON.parse(v) : v;

// --- screenshot -------------------------------------------------------------
const shot = await cmd('WebDriver:TakeScreenshot', { full: false });
const b64 = typeof shot === 'string' ? shot : shot?.value;
const shotPath = `${outDir}/${label}.png`;
if (b64) writeFileSync(shotPath, Buffer.from(b64, 'base64'));

const out = {
  capturedAt: new Date().toISOString(),
  label,
  windowRect,
  screenshot: b64 ? shotPath : null,
  dom,
};
const jsonPath = `${outDir}/${label}.json`;
writeFileSync(jsonPath, JSON.stringify(out, null, 1));

console.log(`saved ${shotPath}`);
console.log(`saved ${jsonPath}`);
console.log(`\nwindow (WebDriver:GetWindowRect): ${JSON.stringify(windowRect)}`);
console.log(`viewport(css) ${dom.inner.w}x${dom.inner.h}   outer ${dom.outer.w}x${dom.outer.h}   dpr ${dom.dpr}`);
console.log(`screen ${dom.screen.w}x${dom.screen.h} (avail ${dom.screen.availW}x${dom.screen.availH})`);
console.log(`url ${dom.url}`);
console.log(`\npanels (${dom.panels.length}):`);
for (const p of dom.panels) {
  console.log(`  ${p.cls.slice(0, 60)}`);
  console.log(`     rect x=${p.rect.x} y=${p.rect.y} ${p.rect.w}x${p.rect.h}   inline left=${p.inline.left} top=${p.inline.top} w=${p.inline.width} h=${p.inline.height}`);
}
if (dom.basic) {
  const b = dom.basic;
  console.log(`\nbasic view:`);
  console.log(`  panelRect x=${b.panelRect.x} y=${b.panelRect.y} ${b.panelRect.w}x${b.panelRect.h}`);
  console.log(`  perspective ${b.cubeWrapperPerspective}   cubeElement ${b.cubeElementSize?.w}x${b.cubeElementSize?.h}`);
  console.log(`  cubies ${b.cubieCount}  stickers ${b.stickerCount}  U stickers ${b.uStickerCount}`);
  console.log(`  --cubie-border-width ${b.cubieBorderVar}   computed sticker border ${b.computedStickerBorder}`);
  console.log(`  distinct computed borders: ${b.distinctBorders.join(', ')}`);
  console.log(`  border (css) x dpr ${dom.dpr.toFixed(6)} = ${(parseFloat(b.computedStickerBorder || '0') * dom.dpr).toFixed(4)} device px`);
}
socket.end();
