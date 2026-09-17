import { availableSizes, loadParameters } from './svg-generator/generate';
import defaultSvg from './view.svg?raw';

/**
 * Size-aware SVG resolution for the Circular view.
 *
 * Three deliberate choices, each guarding a specific regression:
 *
 * 1. **3x3 keeps its original static import.** The committed asset serves the
 *    default size, and routing it through the same dynamic path as the others
 *    would mean the one size with an authored reference also depends on
 *    whatever resolves size. Keeping it separate means a loader change cannot
 *    regress the shipping view.
 * 2. **The glob pattern excludes `view.old.svg`.** A dead file sits beside the
 *    real assets; `view-*` matches per-size names and not that one, because the
 *    separator differs. A test pins this so a rename cannot silently make the
 *    resolver pick up a retired asset.
 * 3. **An unknown size resolves to `undefined`, never a fallback.** Falling back
 *    to another size's markup would render a cube at the wrong size rather than
 *    reporting the view as unsupported, which is the harder failure to notice.
 */

/**
 * Per-size assets, discovered at build time.
 *
 * Vite resolves this to a static record at build time; the raw query yields the
 * file's text rather than a URL. The pattern excludes `view.old.svg` by design.
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

/** Sizes the loader can serve, ascending. 3x3 comes from the static import. */
export function loadedSizes(): number[] {
    return [3, ...registry.keys()].sort((a, b) => a - b);
}

/**
 * Raw SVG markup for a cube size, or `undefined` when the view does not support
 * that size.
 */
export function svgMarkupForSize(cubeSize: number): string | undefined {
    // 3x3 is served from the static import, so it works even if the glob finds
    // nothing (which is what happens when no other size has been generated yet).
    if (cubeSize === 3) return defaultSvg;
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
