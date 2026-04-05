/**
 * compute-cube-camera.cjs
 *
 * Projects the three visible Rubik's Cube faces (front, right, top) from 3D world
 * space into 2D SVG coordinates using a perspective camera, then prints the
 * resulting SVG elements (<polygon> backgrounds + <rect> stickers) to stdout.
 *
 * Writes cube-output.txt alongside this script, then run apply-cube-output.cjs to
 * splice the geometry into public/og-image.svg:
 *
 *   node scripts/og-image/compute-cube-camera.cjs
 *   node scripts/og-image/apply-cube-output.cjs
 *
 * Usage:
 *   node scripts/og-image/compute-cube-camera.cjs [camX camY camZ [tgtX tgtY tgtZ [upX upY upZ]]]
 *
 * Defaults match the Basic view camera angle (approximately rotateX(-25°) rotateY(-35°)):
 *   camera = [5, 4, -9]   target = [1.5, 1.5, 1.5]   up = [0, 1, 0]
 */

'use strict';

const args = process.argv.slice(2).map(Number);
const camera = args.length >= 3 ? [args[0], args[1], args[2]] : [8, 7, -10];
const target = args.length >= 6 ? [args[3], args[4], args[5]] : [1, 1, 1];
const up = args.length >= 9 ? [args[6], args[7], args[8]] : [0, 1, 0];

// --- vector math ---
function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a) {
    const m = Math.hypot(...a);
    return a.map(v => v / m);
}

// --- camera basis ---
const forward = norm(sub(target, camera));
const right = norm(cross(up, forward));
const trueUp = cross(forward, right);

function project(pt) {
    const p = sub(pt, camera);
    const x = dot(p, right);
    const y = dot(p, trueUp);
    const z = dot(p, forward);
    return [x / z, -y / z]; // SVG y is down
}

// --- display sizing ---
const svgCX = 315,
    svgCY = 325;
const displaySize = 260; // px wide/tall for the whole cube

// Project all face corners to compute bounding box, then derive scale/offset
const cubeCorners = [];
for (let x = 0; x <= 3; x += 3)
    for (let y = 0; y <= 3; y += 3)
        for (let z = 0; z <= 3; z += 3) cubeCorners.push(project([x, y, z]));
const pxs = cubeCorners.map(p => p[0]);
const pys = cubeCorners.map(p => p[1]);
const minX = Math.min(...pxs),
    maxX = Math.max(...pxs);
const minY = Math.min(...pys),
    maxY = Math.max(...pys);
const scale = displaySize / Math.max(maxX - minX, maxY - minY);
const tx = svgCX - ((minX + maxX) / 2) * scale;
const ty = svgCY - ((minY + maxY) / 2) * scale;

function toSVG(pt) {
    const [px, py] = project(pt);
    return [px * scale + tx, py * scale + ty];
}

// --- face definitions: TL→TR→BR→BL in world space (u=right, v=down per face) ---
// u goes 0→3, v goes 0→3 within each face
function facePoint(face, u, v) {
    switch (face) {
        case 'front':
            return [u, 3 - v, 0];
        case 'right':
            return [3, 3 - v, u];
        case 'top':
            return [u, 3, 3 - v];
    }
}

// --- sticker geometry ---
const faceSize = 3; // world units
const stickerMargin = 0.1; // world units inset from face edge
const stickerGap = 0.08; // world units between stickers
const cellSize = (faceSize - 2 * stickerMargin) / 3; // ~0.933
const stickerSize = cellSize - stickerGap;
const stickerRadius = 0.06; // world units corner radius (matches gap proportion)

function pts(corners) {
    return corners.map(c => `${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
}

// Compute affine matrix [a,b,c,d,e,f] from TL/TR/BL corners and rect w/h
// so that matrix * (0,0)=TL, matrix * (w,0)=TR, matrix * (0,h)=BL
function affineFromCorners(tl, tr, bl, w, h) {
    const a = (tr[0] - tl[0]) / w,
        b = (tr[1] - tl[1]) / w;
    const c = (bl[0] - tl[0]) / h,
        d = (bl[1] - tl[1]) / h;
    return [a, b, c, d, tl[0], tl[1]];
}

function stickerElement(face, row, col, fill) {
    const u0 = stickerMargin + col * cellSize + stickerGap / 2;
    const u1 = u0 + stickerSize;
    const v0 = stickerMargin + row * cellSize + stickerGap / 2;
    const v1 = v0 + stickerSize;
    const tl = toSVG(facePoint(face, u0, v0));
    const tr = toSVG(facePoint(face, u1, v0));
    const bl = toSVG(facePoint(face, u0, v1));
    const [a, b, c, d, e, f] = affineFromCorners(
        tl,
        tr,
        bl,
        stickerSize * scale,
        stickerSize * scale
    );
    const rx = stickerRadius * scale;
    const w = stickerSize * scale;
    const h = stickerSize * scale;
    return (
        `<rect x="0" y="0" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${rx.toFixed(2)}"` +
        ` fill="${fill}" transform="matrix(${[a, b, c, d, e, f].map(v => v.toFixed(5)).join(',')})"/>`
    );
}

// --- face background polygon ---
function faceCorners(face) {
    return [
        toSVG(facePoint(face, 0, 0)),
        toSVG(facePoint(face, 3, 0)),
        toSVG(facePoint(face, 3, 3)),
        toSVG(facePoint(face, 0, 3)),
    ];
}

// [Color.WHITE]:  '#ffffff',
// [Color.YELLOW]: '#ffd500',
// [Color.RED]:    '#c41e3a',
// [Color.ORANGE]: '#ff5800',
// [Color.BLUE]:   '#0051ba',
// [Color.GREEN]:  '#009b48',

// const frontColors = Array(9).fill('#c41e3a');
// const rightColors = Array(9).fill('#0051ba');
// const topColors   = Array(9).fill('#ffffff');

/* prettier-ignore */
const frontColors = [
    '#c41e3a', '#009b48', '#0051ba',
    '#ff5800', '#ffd500', '#ffffff',
    '#ffffff', '#ff5800', '#c41e3a',
];
/* prettier-ignore */
const rightColors = [
    '#c41e3a', '#ff5800', '#009b48',
    '#009b48', '#0051ba', '#c41e3a',
    '#ffffff', '#ffd500', '#ff5800',
];
/* prettier-ignore */
const topColors = [
    '#ffffff', '#009b48', '#ffd500',
    '#0051ba', '#c41e3a', '#ffffff',
    '#009b48', '#ff5800', '#ffd500',
];

const faces = [
    ['front', frontColors],
    ['right', rightColors],
    ['top', topColors],
];

const lines = [];
for (const [faceName, colors] of faces) {
    lines.push(`<!-- ${faceName} face -->`);
    lines.push(`<polygon points="${pts(faceCorners(faceName))}" fill="#1a1a1a"/>`);
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            lines.push(stickerElement(faceName, row, col, colors[row * 3 + col]));
        }
    }
}

const fs = require('fs');
const path = require('path');
const outPath = path.join(__dirname, 'cube-output.txt');
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`Cube geometry written to ${outPath}`);
