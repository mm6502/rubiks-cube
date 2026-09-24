// Stylesheet contracts for the gesture-feedback indicators.
//
// These pin DECLARATIONS, not rendered output, because that is where the bugs were.
// The three views' indicators had drifted apart with no reason recorded: Circular's
// arms carried no drop-shadow while Basic's and Flat's did, and Circular's ring was a
// thin dashed outline while Basic and Flat drew a 2px dashed one. None of that is
// observable in jsdom (no layout, no compositing), and no rendered assertion could
// have caught it — the stylesheet is the only honest place to check.
//
// The three stylesheets are read directly, matching the convention already used by
// `touch-handler.test.ts` in each view.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { blockFor, valueOf } from '@/views/basic/css-contract-helpers';

/** Read a stylesheet with its comments stripped, so prose cannot be read as a declaration. */
function declarationsOf(path: string): string {
    return readFileSync(resolve(__dirname, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

const circularCss = declarationsOf('circular.module.css');
const basicCss = declarationsOf('../basic/basic-view.module.css');
const flatCss = declarationsOf('../flat/flat-view.module.css');

describe('Circular guide lines share one style', () => {
    it('gives the decision arms and the fretboard rails identical declarations', () => {
        // They depict different things — the arms bisect the four drag zones, the rails
        // bound the band where the ring selection may switch — but they appear at the
        // same moment, in the same place, in the same colour. Different weights or
        // dashes implied a distinction the user could not act on, and the fretboard was
        // in fact the only indicator drawn at 2px/0.7 opacity while the rest were
        // 3px/opaque.
        const arms = blockFor('.circular-drag-cross-arm', circularCss);
        const rails = blockFor('.circular-fretboard-line', circularCss);

        // Declared as one grouped rule, so both selectors resolve to the same block.
        // Comparing the blocks rather than the text is what makes this an assertion
        // about the resolved style; any per-rail override would split them.
        expect(rails).toBe(arms);
    });

    it('pins the shared weight, dash and cap', () => {
        const block = blockFor('.circular-drag-cross-arm', circularCss);

        expect(valueOf(block, 'stroke-width')).toBe('3');
        expect(valueOf(block, 'stroke-dasharray')).toBe('7 5');
        expect(valueOf(block, 'stroke-linecap')).toBe('round');
    });

    it('does not give the rails a separate opacity', () => {
        // `opacity: 0.7` on the rails was the visible half of the drift: the fretboard
        // was washed out relative to the very same gesture's cross.
        const block = blockFor('.circular-fretboard-line', circularCss);

        expect(valueOf(block, 'opacity')).toBeUndefined();
    });

    it('carries the same drop-shadow and stroke as the other two views', () => {
        // Circular was the only view whose arms had no shadow, and it is the most
        // colour-dense of the three (face colours, axis rings, ghosts), so it needed
        // the contrast more rather than less. The rule dated from the first commit; the
        // shadow was added later with the Basic view and never back-ported.
        const circular = blockFor('.circular-drag-cross-arm', circularCss);
        const basic = blockFor('.basic-drag-decision-arm', basicCss);
        const flat = blockFor('.flat-drag-decision-arm', flatCss);

        expect(valueOf(circular, 'filter')).toContain('drop-shadow');
        // The other two already agreed with each other; Circular must not be the outlier.
        expect(valueOf(basic, 'filter')).toBe(valueOf(flat, 'filter'));
        expect(valueOf(circular, 'filter')).toBe(valueOf(basic, 'filter'));
        expect(valueOf(circular, 'stroke-width')).toBe(valueOf(basic, 'stroke-width'));
        expect(valueOf(circular, 'stroke-dasharray')).toBe(valueOf(basic, 'stroke-dasharray'));
    });
});

describe('cancel-zone ring is solid and deliberately thinner than the guides', () => {
    it('draws no dash, in any view', () => {
        // The ring is a filled translucent disc. A dashed outline read as a second,
        // competing hint, because the guide lines drawn over it at that same moment are
        // themselves dashed.
        expect(
            valueOf(blockFor('.circular-cancel-zone', circularCss), 'stroke-dasharray')
        ).toBeUndefined();

        for (const [view, css] of [
            ['basic', basicCss],
            ['flat', flatCss],
        ] as const) {
            const border = valueOf(blockFor(`.${view}-halo-cancel-zone`, css), 'border') ?? '';
            expect(border, `${view} ring border`).not.toContain('dashed');
        }
    });

    it('keeps its outline thinner than the guide lines', () => {
        // Deliberate, not incidental: the ring is ground-layer context, the guides are
        // the actionable direction hint, so the ring must not compete with them.
        const ringWidth = Number(
            valueOf(blockFor('.circular-cancel-zone', circularCss), 'stroke-width')
        );
        const guideWidth = Number(
            valueOf(blockFor('.circular-drag-cross-arm', circularCss), 'stroke-width')
        );

        expect(ringWidth).toBeGreaterThan(0);
        expect(ringWidth).toBeLessThan(guideWidth);
    });

    it('stays a filled disc in every view', () => {
        // All three views draw the same indicator, so a fill in one and none in another
        // would be the same drift this file exists to catch.
        expect(valueOf(blockFor('.circular-cancel-zone', circularCss), 'fill')).toBeTruthy();
        expect(valueOf(blockFor('.basic-halo-cancel-zone', basicCss), 'background')).toBeTruthy();
        expect(valueOf(blockFor('.flat-halo-cancel-zone', flatCss), 'background')).toBeTruthy();
    });
});
