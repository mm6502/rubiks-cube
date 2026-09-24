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
//   * a sticker-backed wall loses its square corner      -> the wall's rounded bound no longer
//                                                          covers the band the sticker's border
//                                                          paints, so the seal becomes a
//                                                          function of the radius again;
//   * a sticker-less wall loses its `border-radius`      -> it stops matching the sticker
//                                                          corners, so the facelet grid's
//                                                          shape becomes uneven.
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
// The stylesheet is read with `node:fs` via `./css-contract-helpers`, not `?raw`: Vite's
// CSS-modules plugin intercepts `?raw`/`?inline` for a `.module.css` path (measured — it
// returns a class-name proxy and an empty string), so the `import.meta.glob(…, '?raw')`
// convention used by `src/types/event-catalogue.test.ts` is not available for a stylesheet.
// `node` types are pulled in for this file alone by the reference below rather than by
// widening the project's `types` array, so no other test gains an implicit Node dependency.
/// <reference types="node" />
import { describe, expect, it } from 'vitest';

import { blockFor, basicViewCss as css, valueOf } from './css-contract-helpers';

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

    it('squares the wall behind a sticker and rounds the sticker-less walls', () => {
        // A wall is a plain 100% box; a sticker is a 100% box WITH a border and
        // `box-sizing: border-box`, so its content box is `size - 2 * border`. Rounding
        // both by the same percentage therefore measures the two arcs from different
        // boxes, which puts the sticker's rounded bound outside the wall's — the wall's
        // corner then depends on the radius rather than being sealed by construction.
        //
        // Squaring the sticker-backed wall makes the cover independent of the radius.
        // The sticker-less walls keep the design's rounding, because they have nothing
        // to fill behind and their corner is what the facelet grid reads as (R9).
        const backed = valueOf(blockFor('.cubie-interior[data-sticker-backed]'), 'border-radius');
        const plain = valueOf(blockFor('.cubie-interior'), 'border-radius');

        expect(backed, 'a sticker-backed wall must be squared').toBe('0');
        expect(plain, 'a sticker-less wall keeps the rounded facelet corner').toBeDefined();
        expect(
            plain,
            'a sticker-less wall must stay rounded, or the grid loses its shape'
        ).not.toBe('0');
    });

    it('keeps the sticker corners rounded', () => {
        // The sticker's rounded corner is the shape the wall behind it must cover, and the
        // shape the sticker-less walls match. Pinning it keeps the two from drifting apart.
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

        // The body class carries no STATE variant at all — that is the invariant that keeps
        // a highlight from ever reaching the body. `css` is already comment-stripped.
        //
        // The check is on what a non-base rule would SET, not on whether an attribute
        // selector exists: `.cubie-interior[data-sticker-backed]` is a legitimate rule that
        // changes only `border-radius`, which cannot carry a highlight. A selector that
        // painted the body is the actual hazard, because the dark shape showing through a
        // sticker's rounded corner IS the body, and tinting it there would glow in that
        // colour. The base rule is skipped because it is where the body colour belongs.
        const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();
        let extraRules = 0;
        for (const [, selector, block] of css.matchAll(
            /([^{}]*\.cubie-interior[^{}]*)\{([^{}]*)\}/g
        )) {
            if (normalise(selector) === '.cubie-interior') continue;
            extraRules++;
            expect(
                valueOf(block, 'background-color') ?? valueOf(block, 'border-color'),
                `"${normalise(selector)}" may shape the body walls but must never colour them`
            ).toBeUndefined();
        }
        // Guard the guard: if the selector syntax ever changes so nothing matches, the loop
        // above would vacuously pass. The sticker-backed rule must be seen here.
        expect(extraRules, 'the sticker-backed wall rule must be found').toBeGreaterThan(0);
        // And the base rule must carry the body colour, so the seal exists at all.
        expect(
            valueOf(blockFor('.cubie-interior'), 'background-color'),
            'the base wall rule owns the body colour'
        ).toBeDefined();
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
