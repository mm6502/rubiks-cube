import { availableSizes, loadParameters } from './svg-generator/generate';

/**
 * Size-aware SVG resolution for the Circular view.
 *
 * Two deliberate choices, each guarding a specific regression:
 *
 * 1. **Every size resolves through one path.** 3x3 used to be served from a
 *    hand-written static import while larger sizes came from a glob, which meant
 *    the default size depended on a file that generation did not produce and the
 *    other sizes did not. Now that 3x3 is generated like the rest, one glob
 *    serves all six, and no size can drift into being "special".
 * 2. **An unknown size resolves to `undefined`, never a fallback.** Falling back
 *    to another size's markup would render a cube at the wrong size rather than
 *    reporting the view as unsupported, which is the harder failure to notice.
 *
 * The fixtures directory holds the hand-authored 3x3 original. It sits one level
 * below the assets, so neither this glob nor the asset-canvas one reaches it —
 * which is what keeps the fidelity tests comparing against an independent
 * reference rather than against the generator's own output.
 */

/**
 * Per-size assets, discovered at build time.
 *
 * Vite resolves this to a static record at build time; the raw query yields the
 * file's text rather than a URL.
 */
const sizeAssets = import.meta.glob<string>('./view-*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
});

/**
 * Map cube size to its raw SVG markup, built from the discovered assets.
 *
 * Parsing the size out of the filename keeps the assets self-describing: the
 * file's own `data-cube-size` is authoritative for geometry, and the name only
 * says which size the loader should serve it for.
 */
function buildRegistry(): Map<number, string> {
    const registry = new Map<number, string>();

    for (const [path, markup] of Object.entries(sizeAssets)) {
        const match = /view-(\d+)\.svg$/.exec(path);
        if (!match) continue;
        registry.set(Number(match[1]), markup);
    }

    return registry;
}

const registry = buildRegistry();

/** Sizes the loader can serve, ascending. */
export function loadedSizes(): number[] {
    return [...registry.keys()].sort((a, b) => a - b);
}

/**
 * Raw SVG markup for a cube size, or `undefined` when the view does not support
 * that size.
 */
export function svgMarkupForSize(cubeSize: number): string | undefined {
    return registry.get(cubeSize);
}

/** Whether the view can render the given cube size. */
export function supportsSize(cubeSize: number): boolean {
    return svgMarkupForSize(cubeSize) !== undefined;
}

/**
 * Sizes that have a parameter set but no committed asset yet.
 *
 * Useful during generation: it distinguishes "this size has no parameters" from
 * "this size has parameters but nobody has generated its asset".
 */
export function sizesAwaitingAssets(): number[] {
    const loaded = new Set(loadedSizes());
    return availableSizes(loadParameters()).filter(size => !loaded.has(size));
}

/** Guard against a registry that somehow lost an axis circle set. */
export function assertLoadable(cubeSize: number): string {
    const markup = svgMarkupForSize(cubeSize);
    if (!markup) {
        throw new Error(
            `Circular view has no SVG asset for size ${cubeSize}. Generate one with: npm run svg:circular -- ${cubeSize}`
        );
    }
    return markup;
}
