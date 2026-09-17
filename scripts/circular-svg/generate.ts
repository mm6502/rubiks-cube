import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    availableSizes,
    formatIssues,
    generate,
    loadParameters,
} from '@/views/circular/svg-generator/generate';

/**
 * CLI entry point for the Circular view SVG generator.
 *
 * This is a thin argument parser around the `src/`-side orchestration — the
 * logic lives there so `tsc` and `vitest` both see it. Generation validates
 * before writing, so a violating parameter set leaves no partial file behind;
 * that ordering is what makes the failure cases testable without a separate
 * dry-run flag.
 *
 * Usage:
 *   npx tsx scripts/circular-svg/generate.ts <size> [--out <path>] [--check]
 *   npx tsx scripts/circular-svg/generate.ts --list
 */

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_ASSET_DIR = join(REPO_ROOT, 'src', 'views', 'circular');

interface CliArgs {
    size?: number;
    out?: string;
    check: boolean;
    list: boolean;
}

function parseArgs(argv: string[]): CliArgs {
    const args = argv.slice(2);
    const parsed: CliArgs = { check: false, list: false };

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--out') {
            parsed.out = args[++index];
        } else if (arg === '--check') {
            parsed.check = true;
        } else if (arg === '--list') {
            parsed.list = true;
        } else if (!arg.startsWith('--')) {
            parsed.size = Number(arg);
        }
    }

    return parsed;
}

/** Default output path for a size's asset. */
export function assetPath(cubeSize: number): string {
    return join(DEFAULT_ASSET_DIR, `view-${cubeSize}.svg`);
}

function main(): void {
    const { size, out, check, list } = parseArgs(process.argv);

    if (list) {
        console.log(`Configured sizes: ${availableSizes(loadParameters()).join(', ')}`);
        return;
    }

    if (size === undefined || Number.isNaN(size)) {
        console.error(
            'Usage: npx tsx scripts/circular-svg/generate.ts <size> [--out <path>] [--check]'
        );
        console.error('       npx tsx scripts/circular-svg/generate.ts --list');
        process.exitCode = 1;
        return;
    }

    let result;
    try {
        result = generate(size, loadParameters());
    } catch (error) {
        console.error(`Generation failed: ${(error as Error).message}`);
        process.exitCode = 1;
        return;
    }

    if (result.issues.length > 0) {
        console.error(`Validation failed for size ${size} — nothing written.`);
        console.error(formatIssues(result.issues));
        process.exitCode = 1;
        return;
    }

    console.log(
        `Size ${size}: validation passed (${result.ghosts.length} ghosts, ${result.svg.length} bytes).`
    );

    if (check) {
        console.log('--check specified; no file written.');
        return;
    }

    const target = out ?? assetPath(size);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, result.svg.endsWith('\n') ? result.svg : `${result.svg}\n`, 'utf8');
    console.log(`Wrote ${target}`);
}

main();
