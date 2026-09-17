import { availableSizes, buildSvg, loadParameters } from './svg-generator/generate';

/**
 * Size-aware SVG resolution for the Circular view.
 *
 * Three deliberate choices, each guarding a specific regression:
 *
 * 1. **Every committed size resolves through one path.** 3x3 used to be served
 *    from a hand-written static import while larger sizes came from a glob, which
 *    meant the default size depended on a file that generation did not produce
 *    and the other sizes did not. One glob now serves every committed asset, and
 *    no size can drift into being "special".
 * 2. **Assets are optional: a missing one is generated on demand.** Committing an
 *    asset is a build-time optimisation, not a requirement. If `view-<n>.svg` is
 *    absent, the loader builds that size in the browser from `parameters.json` on
 *    first request and caches the string, so a size is never "unsupported" merely
 *    because nobody committed its file. This is what lets the assets be dropped
 *    from the bundle: with none committed the build inlines no SVG at all
 *    (measured 147.4 -> 104.1 KB gzip), at the cost of one ~11 ms build the first
 *    time a size is opened.
 * 3. **A size with no parameter set is `undefined`, never a fallback.** Falling
 *    back to another size's markup would render a cube at the wrong size rather
 *    than reporting the view as unsupported, which is the harder failure to
 *    notice.
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
 * file's text rather than a URL. With no files present this is an empty record
 * and the build inlines no SVG — the runtime path below still serves every size.
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

/**
 * Markup built on demand, keyed by size.
 *
 * A cache rather than a prebuild: generating all six sizes up front would cost
 * ~37 ms before the first paint and would defeat the point of not shipping the
 * markup. Populated lazily so a session that only ever shows 3x3 only ever
 * builds 3x3.
 */
const generated = new Map<number, string>();

/** Sizes the loader can serve, ascending. */
export function loadedSizes(): number[] {
    const sizes = new Set<number>(registry.keys());
    for (const size of availableSizes(loadParameters())) sizes.add(size);
    return [...sizes].sort((a, b) => a - b);
}

/**
 * Raw SVG markup for a cube size, or `undefined` when the view does not support
 * that size.
 *
 * Serves the committed asset when there is one, otherwise builds the markup from
 * the parameter set. Returns `undefined` only when the size has no parameters at
 * all — a size that is merely ungenerated still resolves.
 */
export function svgMarkupForSize(cubeSize: number): string | undefined {
    const committed = registry.get(cubeSize);
    if (committed !== undefined) return committed;

    const cached = generated.get(cubeSize);
    if (cached !== undefined) return cached;

    if (!hasParameters(cubeSize)) return undefined;

    const markup = buildSvg(cubeSize, loadParameters());
    generated.set(cubeSize, markup);
    return markup;
}

/** Whether a size has a parameter set, i.e. whether it can be built at all. */
function hasParameters(cubeSize: number): boolean {
    return availableSizes(loadParameters()).includes(cubeSize);
}

/** Whether the view can render the given cube size. */
export function supportsSize(cubeSize: number): boolean {
    return svgMarkupForSize(cubeSize) !== undefined;
}

/**
 * Sizes that are served by building rather than from a committed asset.
 *
 * Reports which sizes would be generated on demand right now. Useful for
 * deciding whether committing an asset is worth it, and for tests that need to
 * know which path a size took.
 */
export function sizesGeneratedOnDemand(): number[] {
    return loadedSizes().filter(size => !registry.has(size));
}

/** Guard against a registry that somehow lost an axis circle set. */
export function assertLoadable(cubeSize: number): string {
    const markup = svgMarkupForSize(cubeSize);
    if (!markup) {
        throw new Error(
            `Circular view has no SVG for size ${cubeSize}. It is buildable only if parameters.json lists it.`
        );
    }
    return markup;
}
