import { buildSvg, loadParameters } from './svg-generator/generate';
import {
    assertLoadable,
    loadedSizes,
    sizesGeneratedOnDemand,
    supportsSize,
    svgMarkupForSize,
} from './svg-loader';

/**
 * Loader spike and contract tests.
 *
 * The glob-with-raw-query mechanism is not used anywhere else in this repo, so
 * these tests exist to pin it: if Vite or Vitest changes how the eager raw
 * query resolves, this fails loudly rather than the view silently rendering
 * nothing.
 */
describe('circular view — size-aware SVG loading', () => {
    it('serves every supported size through one resolution path', () => {
        // 3x3 was once special-cased behind a static import; it now resolves like
        // the rest, so all six sizes arrive the same way and none is privileged.
        expect(loadedSizes()).toEqual([2, 3, 4, 5, 6, 7]);

        const markup = svgMarkupForSize(3);
        expect(markup).toBeDefined();
        expect(markup).toContain('data-cube-size="3"');
        // A raw import yields markup, not a URL.
        expect(markup!.startsWith('<?xml') || markup!.startsWith('<svg')).toBe(true);
    });

    it('resolves the raw glob to markup strings, not asset URLs', () => {
        // The spike from the plan: this repo had no prior use of a raw query
        // combined with import.meta.glob, so the mechanism is asserted directly.
        for (const size of loadedSizes()) {
            const markup = svgMarkupForSize(size);
            expect(typeof markup).toBe('string');
            expect(markup).not.toMatch(/\.svg$/);
        }
    });

    it('never serves the hand-authored fixture as a size asset', () => {
        // The fixture lives one directory below the assets, which is what keeps
        // it out of the glob. If a move ever flattened that layout the loader
        // would start serving the reference as a shipping size, and the fidelity
        // tests would silently begin comparing the generator against itself.
        for (const size of [2, 3, 4, 5, 6, 7]) {
            const markup = svgMarkupForSize(size);
            if (markup === undefined) continue;
            expect(markup).not.toContain('fixtures/');
            // The hand-authored original is fixed at 46x40 ellipses; no
            // generated asset uses that size.
            expect(markup).not.toContain('rx="46"');
        }
    });

    it('reports sizes it can actually serve', () => {
        const sizes = loadedSizes();
        expect(sizes).toContain(3);

        for (const size of sizes) {
            expect(supportsSize(size)).toBe(true);
            expect(svgMarkupForSize(size)).toBeDefined();
        }
    });

    it('treats an unsupported size as unsupported rather than falling back', () => {
        // A fallback would render a cube at the wrong size; absence is the
        // correct, detectable outcome.
        expect(svgMarkupForSize(99)).toBeUndefined();
        expect(supportsSize(99)).toBe(false);
    });

    it('serves a size whose asset declares that size', () => {
        // Guards against serving size N's asset while claiming size M.
        for (const size of loadedSizes()) {
            const markup = svgMarkupForSize(size)!;
            expect(markup).toContain(`data-cube-size="${size}"`);
        }
    });
});

/**
 * The on-demand path.
 *
 * Committing an asset is an optimisation, not a requirement: a size with a
 * parameter set must render whether or not its file was committed. These tests
 * pin that, because the failure mode is silent — the size would simply report
 * itself unsupported and disappear from the size selector.
 */
describe('circular view — sizes are buildable on demand', () => {
    /**
     * The CLI appends a trailing newline when it writes an asset; `buildSvg`
     * returns the markup itself. That newline is a file-format detail rather
     * than part of the drawing, so comparisons normalise it away.
     */
    const normalize = (markup: string): string => markup.replace(/\n$/, '');

    it('builds markup identical to the committed asset when there is one', () => {
        // The two paths must not drift. When an asset is present the loader
        // serves it, so this asserts the generator would have produced the same
        // content — which is what makes dropping the file safe.
        for (const size of loadedSizes()) {
            expect(normalize(svgMarkupForSize(size)!)).toBe(
                normalize(buildSvg(size, loadParameters()))
            );
        }
    });

    it('serves a size even when its asset was never committed', () => {
        // Every size resolves from parameters, so none is gated on a file. This
        // is what lets the assets be omitted from the bundle without shrinking
        // the set of supported sizes.
        const buildable = sizesGeneratedOnDemand();
        const served = loadedSizes();

        // Whichever path each size took, the union must be the full set.
        expect(served).toEqual([2, 3, 4, 5, 6, 7]);
        for (const size of buildable) {
            expect(served).toContain(size);
        }
    });

    it('produces the same markup through the loader and the generator', () => {
        // The loader caches built markup; a cache that returned stale or partial
        // content would still be a string, so compare a second call too.
        for (const size of loadedSizes()) {
            const first = svgMarkupForSize(size);
            const second = svgMarkupForSize(size);
            expect(second).toBe(first);
            expect(normalize(first!)).toBe(normalize(buildSvg(size, loadParameters())));
        }
    });

    it('keeps the generated markup complete, not just non-empty', () => {
        // Guards the class of bug where an asset silently loses a layer. The
        // ghost `fill` omission survived a full test suite once because nothing
        // compared attributes; assert the layers and the fills here.
        for (const size of loadedSizes()) {
            const markup = svgMarkupForSize(size)!;
            const expectedStickers = 6 * size * size;
            const expectedGhosts = 6 * (4 * 2 + (4 * size - 8) * 1);

            expect(markup.match(/class="sticker"/g) ?? []).toHaveLength(expectedStickers);
            expect(markup.match(/class="ghost-sticker"/g) ?? []).toHaveLength(expectedGhosts);

            const ghostTags = markup.match(/<circle class="ghost-sticker"[^>]*\/>/g) ?? [];
            expect(ghostTags).toHaveLength(expectedGhosts);
            // Every ghost carries the colour of the sticker it mirrors.
            for (const tag of ghostTags) {
                expect(tag).toMatch(/fill="#[0-9a-f]{6}"/);
            }
        }
    });

    it('assertLoadable returns markup for every size and throws for none', () => {
        for (const size of [2, 3, 4, 5, 6, 7]) {
            expect(assertLoadable(size)).toContain(`data-cube-size="${size}"`);
        }
        expect(() => assertLoadable(99)).toThrow(/no SVG for size 99/);
    });
});
