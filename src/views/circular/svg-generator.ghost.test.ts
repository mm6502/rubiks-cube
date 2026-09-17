import { Axis } from '@/cube/types';

import { CircularSvgParameters, axisCentres } from './svg-generator/geometry';
import { allGhosts, radiusRank } from './svg-generator/ghosts';
import REFERENCE_SVG_TEXT from './view.svg?raw';

/**
 * Ghost layer verification against the committed 3x3 reference.
 *
 * The reference is hand-authored, so two comparisons are deliberately separate:
 * structural agreement (multiplicity, axis, source, ring tag) must be exact, and
 * positional agreement is bounded by the reference's own irregularity. Folding
 * them together would hide a structural regression behind a loose tolerance.
 */
const REFERENCE_PARAMS: CircularSvgParameters = {
    triangleSide: 100,
    innerRadius: 70,
    ringStep: 15,
    stickerRadius: 7,
    viewBox: '20 0 360 350',
    centreX: 200,
    centreY: 219,
    apexHeight: 87,
    ellipseOffsetNear: 0.4225,
    ellipseOffsetFar: 0.2871,
    ellipseMargin: 2.9286,
    ellipseAspect: 1.0177,
    labelWidth: 20,
    labelHeight: 16,
};

const GHOST_PARAMS = { radiusOffset: 1 };

interface ReferenceGhost {
    axis: Axis;
    rank: number;
    face: string;
    index: number;
    target: string;
    source: string;
    x: number;
    y: number;
}

function attr(tag: string, name: string): string | undefined {
    return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
}

const referenceGhosts: ReferenceGhost[] = [];
for (const match of REFERENCE_SVG_TEXT.matchAll(/<circle class="ghost-sticker"[^>]*\/>/g)) {
    const tag = match[0];
    referenceGhosts.push({
        axis: attr(tag, 'data-ghost-axis') as Axis,
        rank: Number(attr(tag, 'data-ghost-layer')),
        face: attr(tag, 'data-ghost-face') ?? '',
        index: Number(attr(tag, 'data-ghost-index')),
        target: attr(tag, 'data-ghost-target') ?? '',
        source: attr(tag, 'data-ghost-source') ?? '',
        x: Number(attr(tag, 'cx')),
        y: Number(attr(tag, 'cy')),
    });
}

const generated = allGhosts(3, REFERENCE_PARAMS, GHOST_PARAMS);

describe('circular svg generator — ghost layer', () => {
    it('produces the reference ghost count', () => {
        expect(referenceGhosts).toHaveLength(72);
        expect(generated).toHaveLength(72);
    });

    it('matches multiplicity by cubie class', () => {
        // Corners carry 3 stickers so each gets 2 ghosts; edges carry 2 so each
        // gets 1; a face centre carries 1 and gets none.
        const byTarget = new Map<string, number>();
        for (const ghost of generated) {
            byTarget.set(ghost.target, (byTarget.get(ghost.target) ?? 0) + 1);
        }

        for (const [, count] of byTarget) {
            expect([1, 2]).toContain(count);
        }
        // 24 corners x2 + 24 edges x1 = 72, with 6 centres absent.
        expect(byTarget.size).toBe(48);
        expect([...byTarget.values()].filter(c => c === 2)).toHaveLength(24);
        expect([...byTarget.values()].filter(c => c === 1)).toHaveLength(24);
    });

    it('omits ghosts for face centres', () => {
        const centre = generated.filter(g => g.target === 'sticker-U-4');
        expect(centre).toHaveLength(0);
    });

    it('reproduces every reference target, source, axis and ring tag exactly', () => {
        const generatedKeys = new Set(
            generated.map(g => `${g.target}|${g.source}|${g.axis}|${g.rank}`)
        );

        const missing = referenceGhosts.filter(
            r => !generatedKeys.has(`${r.target}|${r.source}|${r.axis}|${r.rank}`)
        );
        expect(missing).toEqual([]);
    });

    it('restarts the per-face index at zero, as the reference does', () => {
        for (const face of ['U', 'D', 'L', 'R', 'F', 'B']) {
            const indices = generated.filter(g => g.face === face).map(g => g.index);
            expect(indices[0]).toBe(0);
            expect(indices).toHaveLength(12);
        }
    });

    it('places every ghost on its tagged axis circle', () => {
        const centres = axisCentres(REFERENCE_PARAMS);

        for (const ghost of generated) {
            const centre = centres[ghost.axis];
            const radius = REFERENCE_PARAMS.innerRadius + ghost.rank * REFERENCE_PARAMS.ringStep;
            const distance = Math.hypot(ghost.x - centre.x, ghost.y - centre.y);
            // Tolerance covers the two-decimal rounding applied at emission.
            expect(Math.abs(distance - radius)).toBeLessThanOrEqual(0.5);
        }
    });

    it('places ghosts within the reference tolerance of the hand-authored asset', () => {
        // The committed asset is hand-authored, so two effects bound agreement:
        //
        // 1. Its offsets range 6.99..7.94 rather than a constant 7.00.
        // 2. One corner cubie produces genuinely ambiguous ghosts. Its stickers
        //    sit at the same radial distance from the shared axis centre but
        //    ~180 degrees apart, so "toward the source" is a tie and the author
        //    picked a side by eye. That cubie accounts for six ghosts (three
        //    sticker pairs, two ghosts each).
        //
        // Structural agreement is asserted separately and exactly; this test
        // bounds the positional remainder so a real regression still fails.
        const ambiguous = new Set([
            'sticker-D-6|sticker-L-6',
            'sticker-D-6|sticker-B-8',
            'sticker-L-6|sticker-D-6',
            'sticker-L-6|sticker-B-8',
            'sticker-B-8|sticker-D-6',
            'sticker-B-8|sticker-L-6',
        ]);

        let withinOne = 0;
        const outliers: string[] = [];

        for (const reference of referenceGhosts) {
            const mine = generated.find(
                g =>
                    g.target === reference.target &&
                    g.source === reference.source &&
                    g.axis === reference.axis
            );
            expect(mine).toBeDefined();

            const distance = Math.hypot(mine!.x - reference.x, mine!.y - reference.y);
            if (distance <= 1) {
                withinOne++;
            } else {
                outliers.push(`${reference.target}|${reference.source}`);
            }
        }

        expect(withinOne).toBe(66);
        // Every outlier is one of the known antipodal pairs, not a stray error.
        expect(outliers.sort()).toEqual([...ambiguous].sort());
    });

    it('derives radius rank as the complement of layer index off the Z axis', () => {
        expect(radiusRank(Axis.Z, 0, 3)).toBe(0);
        expect(radiusRank(Axis.Z, 2, 3)).toBe(2);
        expect(radiusRank(Axis.X, 0, 3)).toBe(2);
        expect(radiusRank(Axis.X, 2, 3)).toBe(0);
        expect(radiusRank(Axis.Y, 1, 3)).toBe(1);
    });
});
