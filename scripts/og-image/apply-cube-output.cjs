/**
 * apply-cube-output.cjs
 *
 * Reads the SVG elements produced by compute-cube-camera.cjs (stored in
 * cube-output.txt in the same directory) and splices them into the
 * <!-- CUBE_REPLACE_START / END --> region of scripts/og-image/og-image.svg.
 *
 * A fresh random marker ID is generated on every run so the region boundaries
 * are always unique and safe to diff/grep.
 *
 * Prerequisites:
 *   node scripts/og-image/compute-cube-camera.cjs > scripts/og-image/cube-output.txt
 *
 * Usage:
 *   node scripts/og-image/apply-cube-output.cjs
 *
 * Paths (relative to project root):
 *   Template SVG : scripts/og-image/og-image.source.svg
 *   Output SVG   : scripts/og-image/og-image.svg
 *   Cube data    : scripts/og-image/cube-output.txt
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sourceSvgPath = process.argv[2] ?? path.join(__dirname, 'og-image.source.svg');
const outputSvgPath = process.argv[3] ?? path.join(__dirname, 'og-image.svg');
const dataPath = path.join(__dirname, 'cube-output.txt');

const out = fs.readFileSync(dataPath, 'utf8').trim().split(/\r?\n/);
const firstShapeIndex = out.findIndex(line => {
    const trimmed = line.trim();
    return trimmed.startsWith('<') && !trimmed.startsWith('<?xml');
});
if (firstShapeIndex === -1) throw new Error('Cannot find shape lines in cube-output.txt');

const groupLines = out.slice(firstShapeIndex);
const markerId = crypto.randomBytes(5).toString('hex');
const markerStart = `<!-- CUBE_REPLACE_START:${markerId} -->`;
const markerEnd = `<!-- CUBE_REPLACE_END:${markerId} -->`;

const cubeGroup = [markerStart, ''];
for (const line of groupLines) {
    cubeGroup.push('    ' + line);
}
cubeGroup.push(markerEnd);

let svg = fs.readFileSync(sourceSvgPath, 'utf8');
const replaceRegion =
    /<!-- CUBE_REPLACE_START:[A-Za-z0-9_-]+ -->[\s\S]*?<!-- CUBE_REPLACE_END:[A-Za-z0-9_-]+ -->/;
if (replaceRegion.test(svg)) {
    svg = svg.replace(replaceRegion, cubeGroup.join('\n'));
    fs.writeFileSync(outputSvgPath, svg, 'utf8');
} else {
    const startToken = '<g transform="translate(315, 325) scale(0.62)">';
    const titleToken = '<!-- Title -->';
    const begin = svg.indexOf(startToken);
    if (begin === -1) throw new Error('Cannot find cube <g> block in source SVG');
    const titleIndex = svg.indexOf(titleToken, begin);
    if (titleIndex === -1) throw new Error('Cannot find title marker in source SVG');
    const prefix = svg.slice(0, begin);
    const suffix = svg.slice(titleIndex);
    fs.writeFileSync(outputSvgPath, prefix + cubeGroup.join('\n') + '\n' + suffix, 'utf8');
}

fs.unlinkSync(dataPath);
console.log(`Cube output applied to ${path.resolve(outputSvgPath)}`);
console.log(`Removed temporary input file: ${dataPath}`);
