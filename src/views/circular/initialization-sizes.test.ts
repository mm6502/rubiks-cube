import { buildStickerLookupMap } from './initialization';
import { svgMarkupForSize } from './svg-loader';

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
    const sizes = [2, 3, 4];

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
});
