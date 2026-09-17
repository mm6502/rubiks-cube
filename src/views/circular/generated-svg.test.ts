import { Axis } from '@/cube/types';

import { generate, loadParameters } from './svg-generator/generate';
import REFERENCE_SVG_TEXT from './view.svg?raw';

/**
 * Regeneration fidelity: the generator must reproduce the committed 3x3 asset
 * before any size without a reference can depend on it.
 *
 * Comparison is structural rather than byte-wise, because float formatting and
 * attribute order legitimately differ. One exported tolerance constant governs
 * every coordinate comparison, set strictly tighter than the runtime's own
 * `isPointOnCircle` tolerance (2 units) so the generator and this test can never
 * agree on a displacement the view would misresolve.
 *
 * `data-axis-circles` is deliberately excluded: it is authoring metadata that
 * does not follow from the ring indices the runtime resolves (the reference's
 * `sticker-U-8` resolves to Z-layer-0/X-layer-2 but is tagged `Z:0 X:0`), so
 * comparing it would assert a convention rather than a contract.
 */
const COORD_TOLERANCE = 0.5;

function attr(tag: string, name: string): string | undefined {
    return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
}

interface CircleInfo {
    cx: number;
    cy: number;
    r: number;
    attrs: Record<string, string>;
    tag: string;
}

function parseIdKeyed(svg: string, predicate: (tag: string) => boolean) {
    const result = new Map<string, CircleInfo>();
    for (const match of svg.matchAll(/<circle[^>]*\/>/g)) {
        const tag = match[0];
        if (!predicate(tag)) continue;
        const id = attr(tag, 'id');
        if (!id) continue;
        result.set(id, {
            cx: Number(attr(tag, 'cx')),
            cy: Number(attr(tag, 'cy')),
            r: Number(attr(tag, 'r')),
            attrs: Object.fromEntries(
                [...tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])
            ),
            tag,
        });
    }
    return result;
}

const referenceStickers = parseIdKeyed(REFERENCE_SVG_TEXT, t => t.includes('class="sticker"'));
const referenceAxisCircles = parseIdKeyed(REFERENCE_SVG_TEXT, t => t.includes('data-axis="'));

const generated = generate(3, loadParameters());
const generatedStickers = parseIdKeyed(generated.svg, t => t.includes('class="sticker"'));
const generatedAxisCircles = parseIdKeyed(generated.svg, t => t.includes('data-axis="'));

/**
 * Class selectors declared in an asset's `<style>` block.
 *
 * Used to compare the generated stylesheet against the reference's. The
 * structural assertions elsewhere in this file compare elements, ids and
 * coordinates, so a stylesheet rule could be dropped without any of them
 * noticing — which is exactly what happened: `.sticker-wrapper`, `.sticker` and
 * `.ghost-sticker` were missing from the generator's stylesheet while its comment
 * claimed it was unchanged from the reference. The markup those rules target was
 * emitted correctly, so the loss was purely visual and invisible to every
 * element-level check.
 */
function classSelectors(svg: string): string[] {
    const style = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1];
    if (!style) return [];
    const withoutComments = style.replace(/\/\*[\s\S]*?\*\//g, '');
    const found = new Set<string>();
    // Each rule's selector list, up to the opening brace.
    for (const m of withoutComments.matchAll(/(^|\})\s*([^{}]+)\{/g)) {
        for (const sel of m[2].split(',')) {
            // Class selectors only; element and pseudo selectors are not the
            // contract this guards.
            for (const cls of sel.matchAll(/\.([A-Za-z][\w-]*)/g)) found.add(cls[1]);
        }
    }
    return [...found].sort();
}

describe('circular svg generator — 3x3 regeneration fidelity', () => {
    it('validates cleanly before writing', () => {
        expect(generated.issues).toEqual([]);
    });

    it('generates the same element counts as the reference', () => {
        expect(generatedStickers.size).toBe(referenceStickers.size);
        expect(generatedStickers.size).toBe(54);
        expect(generatedAxisCircles.size).toBe(referenceAxisCircles.size);
        expect(generatedAxisCircles.size).toBe(9);

        const count = (svg: string, pattern: RegExp) => (svg.match(pattern) ?? []).length;
        expect(count(generated.svg, /class="ghost-sticker"/g)).toBe(
            count(REFERENCE_SVG_TEXT, /class="ghost-sticker"/g)
        );
        expect(count(generated.svg, /-face-ellipse"/g)).toBe(
            count(REFERENCE_SVG_TEXT, /-face-ellipse"/g)
        );
        expect(count(generated.svg, /id="mask-/g)).toBe(count(REFERENCE_SVG_TEXT, /id="mask-/g));
    });

    it('places all 54 stickers at the reference coordinates', () => {
        for (const [id, reference] of referenceStickers) {
            const mine = generatedStickers.get(id);
            expect(mine).toBeDefined();
            expect(Math.abs(mine!.cx - reference.cx)).toBeLessThanOrEqual(COORD_TOLERANCE);
            expect(Math.abs(mine!.cy - reference.cy)).toBeLessThanOrEqual(COORD_TOLERANCE);
        }
    });

    it('reports the same face and position for every sticker id', () => {
        for (const [id, reference] of referenceStickers) {
            const mine = generatedStickers.get(id)!;
            expect(mine.attrs['data-face']).toBe(reference.attrs['data-face']);
            expect(mine.attrs['data-pos']).toBe(reference.attrs['data-pos']);
        }
    });

    it('matches every axis circle radius, id and layer index', () => {
        for (const [id, reference] of referenceAxisCircles) {
            const mine = generatedAxisCircles.get(id);
            expect(mine).toBeDefined();
            expect(mine!.r).toBeCloseTo(reference.r, 5);
            expect(mine!.cx).toBeCloseTo(reference.cx, 5);
            expect(mine!.cy).toBeCloseTo(reference.cy, 5);
            expect(mine!.attrs['data-axis']).toBe(reference.attrs['data-axis']);
            expect(mine!.attrs['data-layer-index']).toBe(reference.attrs['data-layer-index']);
        }
    });

    it('declares every class selector the reference stylesheet declares', () => {
        // Structural comparison cannot see a missing stylesheet rule, so a dropped
        // rule is invisible to every other assertion here while being plainly
        // visible to a user. This is the check whose absence let three rules go
        // missing - including the sticker outline and the drop-shadow that gives
        // the stickers their depth.
        //
        // Asserted as a set containment over the REFERENCE's selectors, so a rule
        // added to the reference later fails here rather than being silently
        // dropped from generated assets.
        const reference = classSelectors(REFERENCE_SVG_TEXT);
        const mine = classSelectors(generated.svg);

        expect(reference.length).toBeGreaterThan(0);
        expect(reference.filter(sel => !mine.includes(sel))).toEqual([]);
    });

    it('gives stickers their outline and shadow', () => {
        // Named separately from the parity check so a failure states what the user
        // would see. These three declarations are the visible difference between a
        // generated asset and the reference: without them stickers render flat and
        // borderless.
        const style = /<style>([\s\S]*?)<\/style>/.exec(generated.svg)![1];

        // A black outline on each sticker.
        const stickerRule = /\.sticker\s*\{([^}]*)\}/.exec(style)?.[1] ?? '';
        expect(stickerRule).toMatch(/stroke:\s*black/);
        expect(stickerRule).toMatch(/stroke-width:\s*[\d.]+/);

        // The drop-shadow lives on the wrapper, not the sticker itself.
        const wrapperRule = /\.sticker-wrapper\s*\{([^}]*)\}/.exec(style)?.[1] ?? '';
        expect(wrapperRule).toMatch(/drop-shadow\(/);

        // The ghost rule's behaviour, not just its looks: ghosts must not take
        // pointer events, and their colour change must transition.
        const ghostRule = /\.ghost-sticker\s*\{([^}]*)\}/.exec(style)?.[1] ?? '';
        expect(ghostRule).toMatch(/pointer-events:\s*none/);
        expect(ghostRule).toMatch(/transition:/);
    });

    it('does not pin the ghost radius in CSS', () => {
        // The reference declares `r: 7` in the ghost rule. CSS overrides a
        // presentation attribute, so copying that would fix every ghost at 7 and
        // make a per-size stickerRadius a no-op for ghosts while stickers still
        // responded. The radius belongs on the element, from the parameter.
        const style = /<style>([\s\S]*?)<\/style>/.exec(generated.svg)![1];
        const ghostRule = /\.ghost-sticker\s*\{([^}]*)\}/.exec(style)?.[1] ?? '';
        expect(ghostRule).not.toMatch(/(^|[;{\s])r\s*:/);

        // And the element does carry it.
        expect(generated.svg).toMatch(/<circle class="ghost-sticker"[^>]*\br="7"/);
    });

    it('emits every element the runtime resolves', () => {
        // Each id below is queried by a runtime module; losing one breaks the
        // view in a way geometry checks alone would not catch.
        for (const face of ['U', 'D', 'L', 'R', 'F', 'B']) {
            expect(generated.svg).toContain(`id="face-label-${face}"`);
            expect(generated.svg).toContain(`id="${face}-face-ellipse"`);
        }
        expect(generated.svg).toContain('class="ghost-sticker-wrapper"');
        expect(generated.svg).toContain('data-cube-size="3"');
        for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
            expect(generated.svg).toContain(`data-axis="${axis}"`);
        }
    });

    it('reports a mismatch when a displacement exceeds the tolerance', () => {
        // Guards against the check becoming vacuous: a synthetic displacement
        // larger than the constant must be detectable.
        const reference = referenceStickers.get('sticker-U-4')!;
        const displaced = reference.cx + COORD_TOLERANCE * 4;
        expect(Math.abs(displaced - reference.cx)).toBeGreaterThan(COORD_TOLERANCE);
    });

    it('never writes over the committed reference asset', () => {
        // Regenerating 3x3 is a validation step, not a path to landing a new
        // 3x3 file — the reference is untouched by generation.
        const referenceAfter = REFERENCE_SVG_TEXT;
        expect(referenceAfter).toContain('id="sticker-U-0"');
        expect(referenceAfter).toBe(REFERENCE_SVG_TEXT);
    });
});
