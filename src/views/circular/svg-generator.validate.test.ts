import { availableSizes, generate, loadParameters } from './svg-generator/generate';
import { CircularSvgParameters } from './svg-generator/geometry';
import {
    countExpectedGhosts,
    isValid,
    minimumStickerClearance,
    validate,
    validateConformance,
    validateInvariants,
} from './svg-generator/validate';

/**
 * Validation-gate tests.
 *
 * The gate exists for two failure modes that are easy to conflate: an SVG can
 * be geometrically legal and still be unusable, and it can be well-formed and
 * still be geometrically illegal. The groups are asserted separately so a gap in
 * one cannot be masked by coverage in the other.
 *
 * `BASE` is the configured GEOMETRY only — no viewBox, because the canvas is
 * derived by emission rather than configured. Anything the gate checks against a
 * canvas takes its `params` from `generate()`, which returns the FITTED values.
 */
const BASE: CircularSvgParameters = {
    triangleSide: 100,
    innerRadius: 70,
    ringStep: 15,
    stickerRadius: 7,
    centreX: 200,
    centreY: 219,
    apexHeight: 87,
    ellipseOffsetNear: 0.4225,
    ellipseOffsetFar: 0.2871,
    ellipseMargin: 2.9286,
    ellipseAspect: 1.0177,
    labelWidth: 20,
    labelHeight: 16,
    faceLabelGap: 1,
};

const parametersFile = loadParameters();

describe('circular svg generator — validation gate', () => {
    describe('invariants', () => {
        it('accepts the reference parameters at 3x3', () => {
            expect(validateInvariants(3, BASE)).toEqual([]);
        });

        it('rejects a triangle side that violates the upper bound', () => {
            // I2a: d must stay below 2 * r_min, else the inner rings never meet.
            const issues = validateInvariants(3, { ...BASE, triangleSide: 141 });
            expect(issues.some(i => i.message.includes('I2'))).toBe(true);
        });

        it('rejects a ring step that violates the lower bound', () => {
            // I2b: (N-1) * Δr must stay below d, else outer rings miss.
            const issues = validateInvariants(5, { ...BASE, ringStep: 26 });
            expect(issues.some(i => i.message.includes('I2'))).toBe(true);
        });

        it('rejects a sticker too large for its ring gap', () => {
            // I5: 2 * r_s must stay below Δr.
            const issues = validateInvariants(3, { ...BASE, stickerRadius: 8 });
            expect(issues.some(i => i.message.includes('I5'))).toBe(true);
        });

        it('treats the I5 boundary as a violation', () => {
            // Exactly equal is not "less than" — the sticker would touch.
            const issues = validateInvariants(3, { ...BASE, stickerRadius: 7.5 });
            expect(issues.some(i => i.message.includes('I5'))).toBe(true);
        });

        it('rejects a ring step that crowds adjacent stickers', () => {
            // I4 has no closed form, so it is checked numerically: a tight step
            // overlaps stickers even when the algebraic bounds still hold.
            const clearance = minimumStickerClearance(3, { ...BASE, ringStep: 15 });
            expect(clearance).toBeGreaterThan(2 * BASE.stickerRadius);

            const crowded = minimumStickerClearance(3, { ...BASE, ringStep: 14.5 });
            expect(crowded).toBeLessThan(clearance);
        });
    });

    describe('conformance contract', () => {
        it('accepts a generated size 3 asset', () => {
            const result = generate(3, parametersFile);
            expect(
                validateConformance({
                    cubeSize: 3,
                    params: result.params,
                    svg: result.svg,
                })
            ).toEqual([]);
        });

        it('rejects markup missing the cube-size declaration', () => {
            const result = generate(3, parametersFile);
            const stripped = result.svg.replace('data-cube-size="3"', '');
            const issues = validateConformance({
                cubeSize: 3,
                params: result.params,
                svg: stripped,
            });
            expect(issues.some(i => i.message.includes('data-cube-size'))).toBe(true);
        });

        it('rejects markup missing the interaction dead-zone labels', () => {
            const result = generate(3, parametersFile);
            // The dead-zone triangle is derived from exactly these three ids.
            const stripped = result.svg.replace(/id="face-label-B"/, 'id="face-label-XX"');
            const issues = validateConformance({
                cubeSize: 3,
                params: result.params,
                svg: stripped,
            });
            expect(issues.some(i => i.message.includes('face-label-B'))).toBe(true);
        });

        it('rejects markup missing the ghost wrapper class', () => {
            const result = generate(3, parametersFile);
            const stripped = result.svg.replace(
                'class="ghost-sticker-wrapper"',
                'class="not-the-wrapper"'
            );
            const issues = validateConformance({
                cubeSize: 3,
                params: result.params,
                svg: stripped,
            });
            expect(issues.some(i => i.message.includes('ghost-sticker-wrapper'))).toBe(true);
        });

        it('rejects missing label-mask holes', () => {
            const result = generate(3, parametersFile);
            // Nine holes are expected; drop one so labels paint over rings.
            const stripped = result.svg.replace(/<rect id="mask-z-0"[^>]*\/>/, '');
            const issues = validateConformance({
                cubeSize: 3,
                params: result.params,
                svg: stripped,
            });
            expect(issues.some(i => i.message.includes('mask holes'))).toBe(true);
        });
    });

    describe('layer coverage beyond the invariants', () => {
        it('rejects an ellipse that leaves the viewBox', () => {
            // I1-I5 say nothing about ellipses, so this is the check that stops
            // a legal-but-clipped asset from being written.
            //
            // The canvas is shrunk in the MARKUP, not in params: validation
            // reads the declared viewBox, so the only way to present it with a
            // canvas too small is to change what the SVG declares. Tampering
            // with params instead would leave this test asserting against a box
            // that was never emitted — the failure mode the fix removed.
            const result = generate(3, parametersFile);
            const shrunk = result.svg.replace(/viewBox="[^"]*"/, 'viewBox="180 200 40 40"');
            expect(shrunk).not.toBe(result.svg);

            const issues = validate({
                cubeSize: 3,
                params: { ...result.params, viewBox: '180 200 40 40' },
                svg: shrunk,
            });
            expect(issues.some(i => i.group === 'ellipse')).toBe(true);
        });

        it('rejects a ghost layer with the wrong ghost count', () => {
            const result = generate(3, parametersFile);
            const issues = validate({
                cubeSize: 3,
                params: result.params,
                svg: result.svg,
                ghosts: result.ghosts.slice(0, 10),
            });
            expect(issues.some(i => i.group === 'ghost')).toBe(true);
        });

        it('rejects a ghost that sits off its own ring', () => {
            const result = generate(3, parametersFile);
            const displaced = result.ghosts.map((ghost, index) =>
                index === 0 ? { ...ghost, x: ghost.x + 25 } : ghost
            );
            const issues = validate({
                cubeSize: 3,
                params: result.params,
                svg: result.svg,
                ghosts: displaced,
            });
            expect(issues.some(i => i.message.includes('off its own ring'))).toBe(true);
        });
    });

    describe('every configured size', () => {
        it('validates cleanly', () => {
            for (const size of availableSizes(parametersFile)) {
                const result = generate(size, parametersFile);
                if (result.issues.length > 0) {
                    throw new Error(
                        `size ${size} failed validation:\n${result.issues
                            .map(i => `  [${i.group}] ${i.message}`)
                            .join('\n')}`
                    );
                }
                expect(
                    isValid({
                        cubeSize: size,
                        params: generate(size, parametersFile).params,
                        svg: result.svg,
                        ghosts: result.ghosts,
                    })
                ).toBe(true);
            }
        });

        it('produces the expected ghost count for each size', () => {
            // Corners contribute 2 each, edges 1, centres none — so the total
            // scales as 6 * (4*2 + (4N-8)*1) for N >= 2.
            for (const size of availableSizes(parametersFile)) {
                const expected = countExpectedGhosts(size);
                const result = generate(size, parametersFile);
                expect(result.ghosts).toHaveLength(expected);
            }
            expect(countExpectedGhosts(2)).toBe(48);
            expect(countExpectedGhosts(3)).toBe(72);
            expect(countExpectedGhosts(4)).toBe(96);
            expect(countExpectedGhosts(5)).toBe(120);
        });

        it('emits the face and sticker counts the size implies', () => {
            for (const size of availableSizes(parametersFile)) {
                const result = generate(size, parametersFile);
                const stickers = (result.svg.match(/class="sticker"/g) ?? []).length;
                // Count axis circles by their own element, not every data-axis
                // attribute — the label groups carry that attribute too.
                const axisCircles = (
                    result.svg.match(/<circle[^>]*data-axis="[XYZ]"[^>]*\/>/g) ?? []
                ).length;
                expect(stickers).toBe(size * size * 6);
                expect(axisCircles).toBe(size * 3);
            }
        });

        it('emits slice notation only at sizes that have middle layers', () => {
            // A slice move exists only when a layer sits between the two
            // extremes, so 2x2 has none. Larger sizes do, and their labels use
            // the wide-move form (2M, 2E, 2S) from the size-aware notation rule.
            for (const size of availableSizes(parametersFile)) {
                const result = generate(size, parametersFile);
                const sliceLabels = [...result.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
                    .map(m => m[1])
                    .filter(text => /^(\d*)[MES][↻↺]$/.test(text));

                if (size === 2) {
                    expect(sliceLabels).toEqual([]);
                } else {
                    expect(sliceLabels.length).toBeGreaterThan(0);
                }
            }
        });
    });
});
