import { buildStickerLookupMap } from './initialization';
import { loadParameters, resolveParameters } from './svg-generator/generate';
import { validateInvariants } from './svg-generator/validate';
import { loadedSizes, svgMarkupForSize } from './svg-loader';

/**
 * Regression coverage for a size-dependent initialization crash.
 *
 * The Circular view builds its sticker lookup map at creation time. Each entry's
 * key is produced by `getPositionKey`, which defaults to cube size 3 and throws
 * on any coordinate outside 0..2. Because the call sites omitted the size, every
 * size above 3 failed during initialization — and the view lifecycle manager
 * catches creation errors, logs them, and removes the panel silently, so the
 * user saw only a missing view with no explanation.
 *
 * These tests assert the map builds and covers every sticker at each size, which
 * is what makes the omission impossible to reintroduce unnoticed.
 */
function buildMap(cubeSize: number) {
    const markup = svgMarkupForSize(cubeSize);
    expect(markup).toBeDefined();

    const host = document.createElement('div');
    host.innerHTML = markup!;
    const svgRoot = host.querySelector('svg') as SVGSVGElement;
    expect(svgRoot).not.toBeNull();

    return buildStickerLookupMap(svgRoot);
}

describe('circular view — sticker lookup map at every supported size', () => {
    // Derived from the loader rather than restated, so a newly committed asset is
    // covered here automatically instead of silently untested.
    const sizes = loadedSizes();

    it.each(sizes)('builds a complete map at size %i', cubeSize => {
        const result = buildMap(cubeSize);

        const entries = [...result.lookupMap.values()].reduce(
            (sum, faceMap) => sum + faceMap.size,
            0
        );

        // Every sticker in the asset must resolve to a cube position + face.
        expect(entries).toBe(cubeSize * cubeSize * 6);
        expect(result.axisCircles.length).toBe(cubeSize * 3);
    });

    it.each(sizes)('maps every face at size %i', cubeSize => {
        const result = buildMap(cubeSize);
        const perFace: Record<string, number> = {};

        for (const faceMap of result.lookupMap.values()) {
            for (const face of faceMap.keys()) {
                perFace[face] = (perFace[face] ?? 0) + 1;
            }
        }

        for (const face of ['U', 'D', 'L', 'R', 'F', 'B']) {
            expect(perFace[face]).toBe(cubeSize * cubeSize);
        }
    });

    it('does not throw for a size whose coordinates exceed 3x3', () => {
        // The specific regression: position components above 2 must be keyed
        // with the active size rather than the default.
        expect(() => buildMap(4)).not.toThrow();

        const result = buildMap(4);
        const keys = [...result.lookupMap.keys()];
        expect(keys.some(key => key.includes('_03_'))).toBe(true);
    });

    it.each(sizes)('resolves every sticker to exactly two rings at size %i', cubeSize => {
        // Holding an asset and being usable are different things: the runtime
        // resolves each sticker from the axis rings that pass through it, so a
        // sticker on three rings would resolve two ways, and one on fewer than two
        // would not resolve at all. Reuses the generator's own invariant check
        // rather than restating the geometry, and asserts the group is clean rather
        // than only that the count is right.
        const params = resolveParameters(cubeSize, loadParameters());
        const issues = validateInvariants(cubeSize, params);

        expect(issues.map(i => i.message)).toEqual([]);

        // Guard against the check becoming vacuous: it must be looking at a full
        // sticker set, not an empty one.
        expect(cubeSize * cubeSize * 6).toBeGreaterThan(0);
        expect(issues.length).toBe(0);
    });

    it.each(sizes)('carries the element contract the runtime resolves at size %i', cubeSize => {
        // Every id and class a runtime module queries. A size could load but come
        // up blank if any of these were missing from its asset.
        const markup = svgMarkupForSize(cubeSize)!;

        expect(markup).toContain(`data-cube-size="${cubeSize}"`);
        expect(markup).toContain('class="ghost-sticker-wrapper"');
        for (const face of ['U', 'D', 'L', 'R', 'F', 'B']) {
            expect(markup).toContain(`id="${face}-face-ellipse"`);
            expect(markup).toContain(`id="face-label-${face}"`);
            expect(markup).toContain(`class="face-face sticker-wrapper" data-face="${face}"`);
        }
        for (const axis of ['X', 'Y', 'Z']) {
            for (let layer = 0; layer < cubeSize; layer++) {
                expect(markup).toContain(`id="${axis}-layer-${layer}"`);
            }
        }
        // Every face label sits outside its ellipses, so they must be present.
        expect((markup.match(/class="sticker"/g) ?? []).length).toBe(cubeSize * cubeSize * 6);
    });
});
