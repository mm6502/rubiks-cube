/**
 * svg-to-png.cjs
 *
 * Converts an SVG file to PNG using @resvg/resvg-js — a WASM-based SVG renderer
 * built on Rust's `resvg` library. Handles complex CSS transforms and SVG geometry
 * that Inkscape / librsvg can sometimes drop.
 *
 * Usage:
 *   node scripts/og-image/svg-to-png.cjs [input.svg] [output.png]
 *
 * Defaults:
 *   input  → scripts/og-image/og-image.svg
 *   output → scripts/og-image/og-image.png  (same directory as input, .svg → .png)
 */

'use strict';

const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] ?? path.join(__dirname, 'og-image.svg');
const outputPath = process.argv[3] ?? inputPath.replace(/\.svg$/i, '.png');

const svgData = fs.readFileSync(inputPath);

const resvg = new Resvg(svgData, { fitTo: { mode: 'original' } });
const pngData = resvg.render().asPng();
fs.writeFileSync(outputPath, pngData);

console.log(`Converted: ${path.resolve(inputPath)} → ${path.resolve(outputPath)}`);
