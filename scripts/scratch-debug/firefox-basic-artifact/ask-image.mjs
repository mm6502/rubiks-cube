// Asks the local VLM an INVENTORY question about a screenshot (facts, not a verdict).
//
// Why inventory framing: a "find the defect" prompt produced 3/3 false positives
// AND missed a 180x180 magenta block. Asking for plain observable facts
// ("what colours, how many regions, where") scored 5/5 clean.
//
// Usage: node ask-image.mjs <image> "<question>" [cropX cropY cropW cropH]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BIN = 'd:/llms/bin/llama.cpp-turboquant-mtp/llama-mtmd-cli.exe';
const MODEL = 'd:/llms/vision/Qwen2.5-VL-7B-Instruct-Q8_0.gguf';
const MMPROJ = 'd:/llms/vision/mmproj-F16.gguf';

const [image, question, ...cropArgs] = process.argv.slice(2);
if (!image || !question) {
    console.error('usage: node ask-image.mjs <image> "<question>" [x y w h]');
    process.exit(1);
}
if (!existsSync(BIN)) {
    console.error(`missing binary: ${BIN}`);
    process.exit(1);
}

const outDir = 'd:/llms/vision/artifact';
mkdirSync(outDir, { recursive: true });

// Crop with sharp if available, else pass through (the VLM downsizes anyway).
let target = image;
if (cropArgs.length === 4) {
    const [x, y, w, h] = cropArgs.map(Number);
    const { default: sharp } = await import('sharp');
    const meta = await sharp(image).metadata();
    const cx = Math.max(0, Math.min(meta.width - 1, x));
    const cy = Math.max(0, Math.min(meta.height - 1, y));
    const cw = Math.max(1, Math.min(meta.width - cx, w));
    const ch = Math.max(1, Math.min(meta.height - cy, h));
    target = path.join(outDir, 'ask-crop.png');
    await sharp(image).extract({ left: cx, top: cy, width: cw, height: ch }).toFile(target);
    console.log(
        `cropped ${cx},${cy} ${cw}x${ch} (source ${meta.width}x${meta.height}) -> ${target}`
    );
}

// Single-shot: passing -p makes llama-mtmd-cli answer once and exit.
// NOTE: -f (prompt file) silently produces no output on this build; -p is required.
const args = [
    '-m',
    MODEL,
    '--mmproj',
    MMPROJ,
    '--image',
    target,
    '-p',
    question,
    '-ngl',
    '999',
    '-c',
    '8192',
    '--image-min-tokens',
    '1024',
    '--temp',
    '0.1',
    '-n',
    '400',
    '--no-warmup',
];

console.log(`\n--- question ---\n${question}\n--- answer ---`);
const stdout = execFileSync(BIN, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
});
// The CLI prints logs first; the model answer is after the last prompt block.
const cleaned = stdout
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .filter(
        l =>
            !/^(llama_|load_|print_info|init:|build:|main:|system_info|sampler|generate:|slot |ggml_|clip_)/.test(
                l.trim()
            )
    )
    .join('\n')
    .trim();
console.log(cleaned);
writeFileSync(path.join(outDir, 'ask-image.log'), stdout);
