import { markupBounds } from '@/views/circular/svg-generator/measure';

/**
 * Canvas containment for the committed assets.
 *
 * The property: nothing an asset draws may fall outside its own viewBox. The mask
 * makes anything beyond the canvas transparent, so an element outside it is not
 * merely off-screen — it is erased with no error, which is why this needs an
 * explicit check rather than being visible in a render.
 *
 * This was written after a regression that a sibling check failed to catch. The
 * axis circles were missing from the list of layers the canvas was sized from, so
 * every size from 4 up had its outermost ring's arc cropped — up to ~42 degrees at
 * 7×7. The canvas check shared the same omission, so it passed the cropped assets.
 * Measuring the emitted markup instead of a list of element kinds closes that gap,
 * and this test asserts the property directly on what shipped.
 *
 * Assets are loaded through Vite's raw glob rather than the filesystem, because
 * the app tsconfig has no Node types. That also makes the set of assets under test
 * exactly the set the app can serve.
 */
const assets = import.meta.glob<string>('./view*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
});

/**
 * The generated per-size assets.
 *
 * Every shipped size now comes from the generator, so the set under test is the
 * same set the loader serves. The hand-authored 3x3 original lives in
 * `fixtures/`, one level down: it is a fidelity reference, not a shipping asset,
 * and this glob must not reach it.
 */
function committedAssets(): { name: string; svg: string }[] {
    return Object.entries(assets)
        .filter(([path]) => /\/view-\d+\.svg$/.test(path))
        .map(([path, svg]) => ({ name: path.replace(/^.*\//, ''), svg }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function parseViewBox(svg: string): { vx: number; vy: number; vw: number; vh: number } {
    const raw = /viewBox="([^"]*)"/.exec(svg)?.[1];
    expect(raw).toBeDefined();
    const [vx, vy, vw, vh] = raw!.split(/\s+/).map(Number);
    return { vx, vy, vw, vh };
}

describe('circular view — committed assets fit inside their canvas', () => {
    it('finds every generated asset and no fixture', () => {
        const list = committedAssets();
        expect(list.map(a => a.name)).toEqual([
            'view-2.svg',
            'view-3.svg',
            'view-4.svg',
            'view-5.svg',
            'view-6.svg',
            'view-7.svg',
        ]);
        // The glob must not reach the fixtures directory: a fixture inside this
        // set would be checked against a canvas it was never generated for.
        expect(list.some(a => a.name.includes('reference'))).toBe(false);
    });

    it.each(committedAssets().map(a => a.name))('%s draws nothing outside its viewBox', name => {
        const svg = committedAssets().find(a => a.name === name)!.svg;
        const { vx, vy, vw, vh } = parseViewBox(svg);
        const b = markupBounds(svg);

        // A small tolerance absorbs rounding in the emitted coordinates. It is far
        // smaller than the crop this guards against, which was 1.3 units at its
        // smallest.
        const overflow = {
            left: Math.round(Math.max(0, vx - b.x0) * 10) / 10,
            top: Math.round(Math.max(0, vy - b.y0) * 10) / 10,
            right: Math.round(Math.max(0, b.x1 - (vx + vw)) * 10) / 10,
            bottom: Math.round(Math.max(0, b.y1 - (vy + vh)) * 10) / 10,
        };
        expect(overflow).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    });

    it.each(committedAssets().map(a => a.name))(
        '%s keeps every axis circle inside the canvas',
        name => {
            // The specific regression, asserted on its own so a failure names the
            // cause rather than reporting generic overflow. Rings are the outermost
            // geometry: a ring reaches centre ± r_max, and its extreme point carries
            // no sticker, so a canvas sized to the stickers and ellipses misses it.
            const svg = committedAssets().find(a => a.name === name)!.svg;
            const { vx, vy, vw, vh } = parseViewBox(svg);

            const circles: { id: string; x0: number; y0: number; x1: number; y1: number }[] = [];
            for (const m of svg.matchAll(/<circle[^>]*data-axis="[XYZ]"[^>]*\/>/g)) {
                const tag = m[0];
                const id = /id="([^"]*)"/.exec(tag)?.[1] ?? '?';
                const cx = Number(/cx="([-\d.]+)"/.exec(tag)?.[1]);
                const cy = Number(/cy="([-\d.]+)"/.exec(tag)?.[1]);
                const r = Number(/r="([-\d.]+)"/.exec(tag)?.[1]);
                circles.push({ id, x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r });
            }

            expect(circles.length).toBeGreaterThan(0);

            const cropped = circles.filter(
                c =>
                    c.x0 < vx - 0.5 ||
                    c.y0 < vy - 0.5 ||
                    c.x1 > vx + vw + 0.5 ||
                    c.y1 > vy + vh + 0.5
            );

            expect(cropped.map(c => c.id)).toEqual([]);
        }
    );
});
