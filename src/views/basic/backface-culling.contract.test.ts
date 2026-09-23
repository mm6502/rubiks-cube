// Regression guard for the Firefox backface-culling flash in the Basic view.
//
// The defect (reported as "with R on top, repeated whole-cube right rotation briefly turns
// the R face green, then back"): each face's own transform is a 90° rotation
// (`getFaceTransform`), so while the cube ramps through a view rotation every face passes
// through edge-on to the viewer. At that instant its facing sign is ~0, and Gecko resolves
// the near-zero backface test differently from Blink: Firefox transiently culls a face that
// should still be painted, exposing the face directly BEHIND it — the opposite face. With R
// on top that is L (green); with pitch on, L briefly shows R (blue). Both were reported and
// both are explained by the same culling difference.
//
// The fix removes culling from the cube's faces and makes each cubie an opaque box instead,
// so occlusion comes from the painted, depth-sorted geometry rather than from the backface
// test.
//
// The box is built from the SIX `.cubie-interior` walls, one per face (see
// `renderCubieFaces`), which is why this contract no longer pins an opaque
// `.cubie` background: a background on the cubie itself was a quad in the cubie's own XY
// plane, half an edge BEHIND the face planes where the seams are. It could not close them
// (the far side showed through) and at grazing angles it painted over the stickers — the
// defect this contract now exists to prevent. The declarations that DO carry the fix are
// therefore:
//
//   * a wall re-gains `backface-visibility: hidden`     -> the flash returns (Firefox);
//   * `.cubie` re-gains an opaque background            -> the centre quad is back, so it
//                                                          paints over stickers again and
//                                                          the seal moves off the face plane;
//   * a wall loses its `border-radius`                  -> its corner stops matching the
//                                                          sticker's, so the seam around a
//                                                          facelet becomes uneven.
//
// Why this is a CSS contract test and not a rendered assertion: jsdom implements no layout,
// no compositing and no 3D, so it can never observe a culling difference — a test that
// claimed to would be asserting the mechanism while proving nothing about the behaviour.
// Real verification of the fix is a real-browser check (the user confirmed the sealed body
// looks correct in a real Firefox, and the repo's `rotation-composition.browser.test.ts`
// covers the transform convention separately in Chromium). What IS testable here — and what
// actually regressed before — is that these declarations stay coupled. Parsing the
// stylesheet is the only honest way to pin that.
//
// The stylesheet is read with `node:fs`. Vite's CSS-modules plugin intercepts `?raw` and
// `?inline` for a `.module.css` path, returning a class-name proxy and an empty string
// respectively (both measured), so the `import.meta.glob(…, '?raw')` convention used by
// `src/types/event-catalogue.test.ts` is not available for a stylesheet. The `node` types are
// pulled in for this file alone by the reference below, rather than by widening the project's
// `types` array, so no other test gains an implicit Node dependency.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const rawCss = readFileSync(resolve(__dirname, 'basic-view.module.css'), 'utf8');

/**
 * The stylesheet with comments removed.
 *
 * Stripping first is not tidiness — it is required for correctness here. These rules carry
 * long explanatory comments that mention property names and braces in prose, and a naive
 * scan either matches a property name out of a sentence or has its `[^}]*` capture run past
 * the declaration it was meant to read. Removing comments makes the remaining text pure
 * declarations, so the scans below see exactly what the browser would.
 */
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The declaration block of a top-level rule, by selector.
 *
 * Deliberately a plain text scan rather than a CSS parser: this file has no parser
 * dependency, and the selectors below are single, unique, top-level rules. The function
 * throws when a selector is missing or ambiguous, so a rename cannot silently turn an
 * assertion into a no-op — which is the failure mode a "contains" check on the whole file
 * would have.
 */
function blockFor(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match the selector at the start of a line, then capture up to the closing brace.
    const matches = [...css.matchAll(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'gm'))];
    if (matches.length === 0) throw new Error(`no rule found for ${selector}`);
    if (matches.length > 1) throw new Error(`ambiguous: ${matches.length} rules for ${selector}`);
    return matches[0][1];
}

/** A declaration's value, normalised to lower case; `undefined` when absent. */
function valueOf(block: string, property: string): string | undefined {
    // Properties may follow `{`, `;` or a newline, so allow any of them rather than `;` alone.
    const match = new RegExp(`(?:^|[;{\\n])\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(block);
    return match?.[1].trim().toLowerCase();
}

describe('basic view CSS — backface culling contract (Firefox flash regression)', () => {
    it('does not cull the sticker faces', () => {
        const sticker = blockFor('.sticker');
        const backface = valueOf(sticker, 'backface-visibility');
        expect(
            backface,
            'Culling these is the defect: a face crossing edge-on mid-rotation is transiently ' +
                'culled in Gecko, exposing the opposite face (the reported colour flash).'
        ).not.toBe('hidden');
    });

    it('does not cull the interior body walls', () => {
        const interior = blockFor('.cubie-interior');
        const backface = valueOf(interior, 'backface-visibility');
        expect(
            backface,
            'These six walls are what make each cubie an opaque box. Culling them leaves the ' +
                'cube body open, so the far side shows through the seams between cubies.'
        ).not.toBe('hidden');
    });

    it('gives the walls the opaque body colour, so the seams are not see-through', () => {
        const interior = blockFor('.cubie-interior');
        const background = valueOf(interior, 'background-color');
        expect(
            background,
            'The walls sit ON the face planes and are what occlude the far side; an ' +
                'unpainted wall leaves the seam it is meant to close wide open.'
        ).toBeDefined();
        expect(background).not.toBe('transparent');
    });

    it('keeps the cubie element itself unpainted', () => {
        // The cubie's own background was the earlier, wrong seal: a quad in the cubie's XY
        // plane at z=0, half an edge behind the face planes. It could not close the seams,
        // and at grazing angles it painted over the stickers. Sealing happens on the walls
        // now, so this must stay absent — otherwise BOTH seals exist and the old defect is
        // back on top of the new one.
        const cubie = blockFor('.cubie');
        const background = valueOf(cubie, 'background-color');
        expect(
            background === undefined || background === 'transparent',
            'A painted .cubie is the centre-plane quad that painted over stickers.'
        ).toBe(true);
    });

    it('rounds the wall corners to match the stickers', () => {
        // Each wall behind a sticker has to fill the area the sticker's rounded corner does
        // not paint; if the wall's corner shape drifts from the sticker's, the seam around
        // each facelet becomes visibly uneven between the walls that carry a sticker and
        // the walls that do not.
        const wallRadius = valueOf(blockFor('.cubie-interior'), 'border-radius');
        const stickerRadius = valueOf(blockFor('.sticker'), 'border-radius');
        expect(wallRadius, 'the wall corner is a designed part of the facelet grid').toBeDefined();
        expect(wallRadius).not.toBe('0');
        expect(wallRadius).toBe(stickerRadius);
    });

    it('keeps the sticker corners rounded', () => {
        // The rounded corners are what the wall behind a sticker has to seal, and what the
        // sticker-less walls have to match. Pinning this keeps the two declarations from
        // drifting apart: squaring the corners would make the seal above vacuous, since
        // there would be no corner to seal.
        const sticker = blockFor('.sticker');
        const radius = valueOf(sticker, 'border-radius');
        expect(radius, 'the sticker corners are a designed part of the facelet grid').toBeDefined();
        expect(radius).not.toBe('0');
    });

    it('keeps the interaction states on the sticker, not on the body walls', () => {
        // Hover / selection restyle the sticker only. A wall must never take a highlight
        // colour: the dark shape showing through a sticker's rounded corner is the cube's
        // body, and tinting it there would make the corner glow in the highlight colour.
        //
        // Note the states carry DIFFERENT properties and all three are legitimate: hover
        // changes the fill as well as the border, while `.selected` and `.face-selected`
        // deliberately keep the face colour and change only the border / an inset ring. So
        // the assertion is not "each sets a background" — it is "each exists, and none of
        // them reaches the body walls".
        for (const state of ['.sticker:hover', '.sticker.selected', '.sticker.face-selected']) {
            const block = blockFor(state);
            expect(block.length, `${state} must carry declarations`).toBeGreaterThan(0);
            expect(
                valueOf(block, 'background-color') ??
                    valueOf(block, 'border') ??
                    valueOf(block, 'border-color'),
                `${state} must restyle the sticker in some visible way`
            ).toBeDefined();
        }

        // The body class carries no state variant at all — that is the invariant that keeps
        // a highlight from ever reaching the body.
        const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(
            /\.cubie-interior\s*[:.\[][^\s{]*\s*\{/.test(css),
            'a state selector on .cubie-interior would let a highlight reach the body'
        ).toBe(false);
    });

    it('still builds a 3D context on the cube, the cubie and the anchor wrapper', () => {
        // Guards the surrounding contract these declarations sit inside: if any of these lost
        // `preserve-3d` the tree would flatten, and the depth sorting the fix relies on for
        // occlusion would stop happening. The wrapper is the rule that carries `perspective`.
        expect(valueOf(blockFor('.cube'), 'transform-style')).toBe('preserve-3d');
        expect(valueOf(blockFor('.cubie'), 'transform-style')).toBe('preserve-3d');
        expect(valueOf(blockFor('.ghost-anchor-container'), 'transform-style')).toBe('preserve-3d');
    });
});
