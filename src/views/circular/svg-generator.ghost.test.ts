import { Axis } from '@/cube/types';

import REFERENCE_SVG_TEXT from './fixtures/reference-3x3.svg?raw';
import {
    CircularSvgParameters,
    FACE_FILLS,
    axisCentres,
    faceCentroid,
    stickerPosition,
} from './svg-generator/geometry';
import { allGhosts, emitGhosts, radiusRank } from './svg-generator/ghosts';

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
    faceLabelGap: 1,
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

    it('reproduces every reference ghost position within one unit', () => {
        // The ghost moves tangentially along its ring, away from the target's
        // own face centroid. Deriving the side from the source sticker instead
        // — an earlier attempt — leaves six ghosts on D, L and B mirrored
        // inward, because on those faces the source sits on the opposite side
        // of the arc. Splitting the two comparisons keeps a structural
        // regression from hiding behind a loose positional tolerance.
        let worst = 0;
        let measured = 0;

        for (const reference of referenceGhosts) {
            const mine = generated.find(
                g =>
                    g.target === reference.target &&
                    g.source === reference.source &&
                    g.axis === reference.axis
            );
            expect(mine).toBeDefined();

            const distance = Math.hypot(mine!.x - reference.x, mine!.y - reference.y);
            worst = Math.max(worst, distance);
            measured++;
        }

        // All 72 agree, with no degenerate cases left over.
        expect(measured).toBe(72);
        expect(worst).toBeLessThanOrEqual(1);
    });

    it('places every ghost on the outward side of its own face', () => {
        // The invariant the reference encodes on all six faces, asserted
        // directly so a future direction change cannot invert a face silently.
        const centroids = Object.fromEntries(
            ['U', 'D', 'L', 'R', 'F', 'B'].map(face => [
                face,
                faceCentroid(face as never, 3, REFERENCE_PARAMS),
            ])
        );

        for (const ghost of generated) {
            const targetPosition = Number(ghost.target.split('-')[2]);
            const target = stickerPosition(ghost.face, targetPosition, 3, REFERENCE_PARAMS);
            const centroid = centroids[ghost.face as string];

            // Distance from the face centroid must increase when moving from the
            // target to its ghost.
            const before = Math.hypot(target.x - centroid.x, target.y - centroid.y);
            const after = Math.hypot(ghost.x - centroid.x, ghost.y - centroid.y);
            expect(after).toBeGreaterThan(before);
        }
    });

    it('derives radius rank as the complement of layer index off the Z axis', () => {
        expect(radiusRank(Axis.Z, 0, 3)).toBe(0);
        expect(radiusRank(Axis.Z, 2, 3)).toBe(2);
        expect(radiusRank(Axis.X, 0, 3)).toBe(2);
        expect(radiusRank(Axis.X, 2, 3)).toBe(0);
        expect(radiusRank(Axis.Y, 1, 3)).toBe(1);
    });

    it('inherits each ghost colour from the sticker it mirrors', () => {
        // A ghost's colour is its source sticker's initial fill. Asserted against
        // the reference rather than restated, so a change to either palette
        // cannot satisfy the test by being self-consistent.
        const referenceFills = new Map<string, string>();
        for (const match of REFERENCE_SVG_TEXT.matchAll(/<circle class="ghost-sticker"[^>]*\/>/g)) {
            const tag = match[0];
            referenceFills.set(
                `${attr(tag, 'data-ghost-target')}|${attr(tag, 'data-ghost-source')}`,
                attr(tag, 'fill') ?? ''
            );
        }

        // The reference bakes a fill on every ghost; the generator must too.
        expect(referenceFills.size).toBe(72);
        expect([...referenceFills.values()].filter(f => f === '')).toEqual([]);

        const svg = emitGhosts(generated, REFERENCE_PARAMS.stickerRadius);
        let checked = 0;
        for (const match of svg.matchAll(/<circle class="ghost-sticker"[^>]*\/>/g)) {
            const tag = match[0];
            const key = `${attr(tag, 'data-ghost-target')}|${attr(tag, 'data-ghost-source')}`;
            const expected = referenceFills.get(key);
            expect(expected).toBeDefined();
            expect(attr(tag, 'fill')).toBe(expected);
            checked++;
        }
        expect(checked).toBe(72);
    });

    it('colours each ghost from its own source face, not its target face', () => {
        // Guards the ordering mistake: a ghost is drawn inside its target's face
        // group but mirrors a sticker on a *different* face — `buildGhost`
        // filters out same-face candidates — so indexing the palette by
        // `ghost.face` would paint every one of the 72 wrong.
        let differing = 0;
        for (const ghost of generated) {
            const expected = FACE_FILLS[ghost.sourceFace];
            if (ghost.sourceFace !== ghost.face) differing++;
            expect(emitGhosts([ghost], 7)).toContain(`fill="${expected}"`);
        }
        expect(differing).toBe(generated.length);
        expect(differing).toBe(72);
    });
});
