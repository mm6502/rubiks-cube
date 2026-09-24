// Definitive geometry read for the Basic view: panel, available size, faceSize,
// cubieSize, perspective and the border derived from them.
//
// Why a second probe: `getBoundingClientRect().width` on the cube and cubie
// elements is POST-transform, so it does not report the layout sizes that
// `updateSize()` had computed. The numbers therefore have to come from inline
// style (the authored layout size) and be cross-checked against the published
// custom property, rather than measured off a 3D-transformed box.
//
// Reproduces the expected chain:
//   scale = 0.55 (not tabbed) or 0.5 (tabbed)
//   faceSize    = min(availableW, availableH) * scale
//   perspective = 1000 * (faceSize / 300)
//   cubieSize   = faceSize / n
//   border      = clamp(round(cubieSize * 0.08), 2, 16)
// and reports any step that disagrees.
//
// Usage: node probe-basic-geometry.mjs
import net from 'node:net';

const socket = net.createConnection({ host: '127.0.0.1', port: 2828 });
let buffer = Buffer.alloc(0);
let msgId = 0;
const pending = new Map();

function send(msg) {
    const json = JSON.stringify(msg);
    socket.write(Buffer.byteLength(json, 'utf8') + ':' + json);
}

socket.on('data', chunk => {
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
                const entry = pending.get(frame[1]);
                if (entry) {
                    pending.delete(frame[1]);
                    if (frame[2]) entry.reject(new Error(JSON.stringify(frame[2])));
                    else entry.resolve(frame[3]);
                }
            }
        } catch {
            // partial frame
        }
    }
});

socket.on('error', err => {
    console.error('socket error: ' + err.message);
    process.exit(1);
});

function command(name, params) {
    return new Promise((resolve, reject) => {
        const id = ++msgId;
        pending.set(id, { resolve, reject });
        send([0, id, name, params || {}]);
        setTimeout(() => reject(new Error('timeout ' + name)), 30000);
    });
}

await new Promise(resolve => socket.once('connect', resolve));
await new Promise(resolve => setTimeout(resolve, 500));
await command('WebDriver:NewSession', { capabilities: {} }).catch(() => {});

const SCRIPT = [
    'const r3 = (n) => Math.round(n * 1000) / 1000;',
    'const dpr = devicePixelRatio;',
    'const panel = document.querySelector(".basic-front-view");',
    'if (!panel) return JSON.stringify({ error: "no .basic-front-view" });',
    'const wrapper = panel.querySelector("[class*=cube-wrapper]");',
    'const cube = panel.querySelector("[class*=cube_]") || panel.querySelector("[class*=cube]");',
    'const cs = getComputedStyle(panel);',
    'const pr = panel.getBoundingClientRect();',
    'const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);',
    'const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);',
    'const availW = pr.width - padX;',
    'const availH = pr.height - padY;',
    'const stickers = [...panel.querySelectorAll("[data-sticker-id]")];',
    'const faces = new Set(stickers.map((e) => e.getAttribute("data-face")));',
    'const n = Math.round(Math.sqrt(stickers.length / 6)) || 0;',
    'const out = {',
    '  dpr, dprAsFraction: "30/17 = " + (30/17),',
    '  panelRect: { x: r3(pr.x), y: r3(pr.y), w: r3(pr.width), h: r3(pr.height) },',
    '  panelInline: { left: panel.style.left, top: panel.style.top, width: panel.style.width, height: panel.style.height },',
    '  padding: { x: r3(padX), y: r3(padY) },',
    '  avail: { w: r3(availW), h: r3(availH), min: r3(Math.min(availW, availH)) },',
    '  stickerCount: stickers.length,',
    '  faceCount: faces.size,',
    '  inferredCubeSize: n,',
    '};',
    'if (wrapper) {',
    '  out.wrapperRect = { w: r3(wrapper.getBoundingClientRect().width), h: r3(wrapper.getBoundingClientRect().height) };',
    '  out.wrapperInline = { w: wrapper.style.width, h: wrapper.style.height };',
    '  out.perspectiveComputed = getComputedStyle(wrapper).perspective;',
    '  out.perspectiveInline = wrapper.style.perspective;',
    '}',
    'if (cube) {',
    '  out.cubeInlineWidth = cube.style.width;',
    '  out.cubeInlineHeight = cube.style.height;',
    '  out.cubeClass = (typeof cube.className === "string" ? cube.className : cube.className.baseVal || "").slice(0, 60);',
    '  out.cubieBorderVar = getComputedStyle(cube).getPropertyValue("--cubie-border-width").trim();',
    '}',
    'if (stickers.length && n) {',
    '  const faceSize = parseFloat(out.cubeInlineWidth) || 0;',
    '  const cubieSize = faceSize / n;',
    '  out.derived = {',
    '    faceSizeFromInline: r3(faceSize),',
    '    cubieSizeDerived: r3(cubieSize),',
    '    rawRatio8pct: r3(cubieSize * 0.08),',
    '    borderClamped: Math.max(2, Math.min(16, Math.round(cubieSize * 0.08))),',
    '    perspectivePredicted: r3(1000 * (faceSize / 300)),',
    '    scaleImpliedByFaceSize: r3(faceSize / (out.avail.min || 1)),',
    '  };',
    '  const borders = [...new Set(stickers.map((e) => getComputedStyle(e).borderTopWidth))];',
    '  out.borders = {',
    '    distinctComputed: borders,',
    '    distinctDevice: [...new Set(borders.map((b) => Math.round(parseFloat(b) * dpr)))],',
    '    authoredVar: out.cubieBorderVar,',
    '  };',
    '  const b = parseFloat(borders[0]);',
    '  out.borders.deviceMath = {',
    '    cssTimesDpr: r3(b * dpr),',
    '    snappedDevicePx: Math.round(b * dpr),',
    '    backToCss: r3(Math.round(b * dpr) / dpr),',
    '    authoredAsDevicePx: r3(parseFloat(out.cubieBorderVar) * dpr),',
    '  };',
    '  const worst = stickers.map((e) => {',
    '    const r = e.getBoundingClientRect();',
    '    return { id: e.getAttribute("data-sticker-id"), w: r3(r.width), h: r3(r.height) };',
    '  }).sort((a, c) => a.h - c.h).slice(0, 3);',
    '  out.smallestStickers = worst;',
    '}',
    'return JSON.stringify(out);',
].join('\n');

const res = await command('WebDriver:ExecuteScript', { script: SCRIPT, args: [] });
const value = res && res.value !== undefined ? res.value : res;
console.log(JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 1));

// Session deliberately left open - the browser is the user's.
socket.end();
