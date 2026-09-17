import { loadedSizes, supportsSize, svgMarkupForSize } from './svg-loader';

/**
 * Loader spike and contract tests.
 *
 * The glob-with-raw-query mechanism is not used anywhere else in this repo, so
 * these tests exist to pin it: if Vite or Vitest changes how the eager raw
 * query resolves, this fails loudly rather than the view silently rendering
 * nothing.
 */
describe('circular view — size-aware SVG loading', () => {
    it('always serves the 3x3 asset from the static import', () => {
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

    it('never returns the retired view.old.svg for any size', () => {
        // A dead asset sits beside the real ones. The glob pattern excludes it
        // by separator, and this pins that so a rename cannot revive it.
        for (const size of [2, 3, 4, 5, 6, 7]) {
            const markup = svgMarkupForSize(size);
            if (markup === undefined) continue;
            expect(markup).not.toContain('view.old');
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
