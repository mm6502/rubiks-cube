// Reads the border pipeline end to end: authored variable -> computed border ->
// snapped DEVICE pixels. Requires desktop Firefox on Marionette 2828.
//
// Why this matters: Firefox lays borders out in CSS pixels but paints them at
// whole DEVICE pixels, then reports the snapped result back through
// getComputedStyle. At dpr 1.7647 an authored integer border therefore does NOT
// paint as an integer number of CSS pixels, and the border's real thickness can
// differ from the authored one. That mismatch is the leading explanation for the
// face-colour stripes, so the authored value, the computed value and the snapped
// device count all need to be read together.
//
// Usage: node probe-border3.mjs
import net from 'node:net';

const PORT = 2828;
const socket = net.createConnection({ host: '127.0.0.1', port: PORT });
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
            // partial frame, wait for more bytes
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
    'const r2 = (n) => Math.round(n * 100) / 100;',
    'const clsOf = (e) => (typeof e.className === "string" ? e.className : (e.className && e.className.baseVal) || "");',
    'const dpr = devicePixelRatio;',
    'const sticker = document.querySelector(".basic-front-view [data-sticker-id]");',
    'const out = { dpr: dpr, stickerFound: !!sticker };',
    'if (sticker) {',
    '  const cubie = sticker.parentElement;',
    '  const cube = sticker.closest("[class*=cube]");',
    '  const cs = getComputedStyle(sticker);',
    '  const authored = cube ? getComputedStyle(cube).getPropertyValue("--cubie-border-width").trim() : "";',
    '  const inlineAuthored = cube ? cube.style.getPropertyValue("--cubie-border-width") : "";',
    '  const b = parseFloat(cs.borderTopWidth);',
    '  const device = b * dpr;',
    '  out.cubeCls = cube ? clsOf(cube).slice(0, 80) : null;',
    '  out.cubeRect = cube ? r2(cube.getBoundingClientRect().width) : null;',
    '  out.cubieCls = clsOf(cubie).slice(0, 80);',
    '  out.cubieWidth = r2(cubie.getBoundingClientRect().width);',
    '  out.authoredVarFromCube = authored;',
    '  out.authoredVarInline = inlineAuthored;',
    '  out.computedBorder = cs.borderTopWidth;',
    '  out.impliedDevicePx = r2(device);',
    '  out.snappedDevicePx = Math.round(device);',
    '  out.impliedCssFromSnap = r2(Math.round(device) / dpr);',
    '  out.stickerRect = { w: r2(sticker.getBoundingClientRect().width), h: r2(sticker.getBoundingClientRect().height) };',
    '  const all = [...document.querySelectorAll(".basic-front-view [data-sticker-id]")];',
    '  out.stickerCount = all.length;',
    '  out.distinctComputedBorders = [...new Set(all.map((e) => getComputedStyle(e).borderTopWidth))];',
    '  out.distinctSnappedDevicePx = [...new Set(all.map((e) => Math.round(parseFloat(getComputedStyle(e).borderTopWidth) * dpr)))];',
    '}',
    'return JSON.stringify(out);',
].join('\n');

const res = await command('WebDriver:ExecuteScript', { script: SCRIPT, args: [] });
const value = res && res.value !== undefined ? res.value : res;
console.log(JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 1));

// Leave the session open on purpose; the user is driving this browser.
socket.end();
