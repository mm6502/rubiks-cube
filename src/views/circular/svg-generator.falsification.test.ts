import { Axis, Face } from '@/cube/types';
import { facePositionTo3D } from '@/cube/utils/sticker-position';

import { generate, loadParameters, resolveParameters } from './svg-generator/generate';
import { ALL_FACES, axisCentres, ringRadius, stickerPosition } from './svg-generator/geometry';

/**
 * Ghost-rule falsification at N=5.
 *
 * This is the test the whole rule rests on. N=2 makes every sticker a corner, so
 * the 1-edge class is absent entirely; N=4 exercises it on only 8 of 16 stickers
 * per face. N=5 is the smallest size where the edge class is the unambiguous
 * majority (12 of 25 per face), so it is the size that actually probes whether
 * the rule generalises rather than merely reproducing the case it came from.
 *
 * The expected set is computed independently of the generator. The generator
 * enumerates a cubie's stickers with its own face-position inverse; this test
 * enumerates the same cubies from `facePositionTo3D` — the cube model's own
 * ground truth — and derives the expectation from that. Two independent
 * derivations agreeing is the evidence; sharing the generator's helpers would
 * make the check self-confirming.
 *
 * A mismatch here is a generator bug to fix, never a size to demote to
 * hand-tuning: demoting would hide exactly the failure this test exists to
 * detect.
 */

interface ExpectedGhost {
    target: string;
    source: string;
    axis: Axis;
    rank: number;
}

/** Faces a cubie at this 3D position carries a sticker on. */
function facesAt(position: { x: number; y: number; z: number }, cubeSize: number): Face[] {
    const last = cubeSize - 1;
    const faces: Face[] = [];
    if (position.z === 0) faces.push(Face.F);
    if (position.z === last) faces.push(Face.B);
    if (position.y === last) faces.push(Face.U);
    if (position.y === 0) faces.push(Face.D);
    if (position.x === 0) faces.push(Face.L);
    if (position.x === last) faces.push(Face.R);
    return faces;
}

/** The sticker id for a cubie's sticker on a given face, derived from the model. */
function stickerIdOn(
    face: Face,
    position: { x: number; y: number; z: number },
    cubeSize: number
): string {
    const last = cubeSize - 1;
    const { x, y, z } = position;
    let facePosition: number;
    switch (face) {
        case Face.F:
            facePosition = (last - y) * cubeSize + x;
            break;
        case Face.B:
            facePosition = (last - y) * cubeSize + (last - x);
            break;
        case Face.U:
            facePosition = (last - z) * cubeSize + x;
            break;
        case Face.D:
            facePosition = z * cubeSize + x;
            break;
        case Face.L:
            facePosition = (last - y) * cubeSize + (last - z);
            break;
        case Face.R:
            facePosition = (last - y) * cubeSize + z;
            break;
        default:
            throw new Error(`unknown face ${face}`);
    }
    return `sticker-${face}-${facePosition}`;
}

const RING_AXES: Record<Face, Axis[]> = {
    [Face.F]: [Axis.X, Axis.Y],
    [Face.B]: [Axis.X, Axis.Y],
    [Face.L]: [Axis.Y, Axis.Z],
    [Face.R]: [Axis.Y, Axis.Z],
    [Face.U]: [Axis.X, Axis.Z],
    [Face.D]: [Axis.X, Axis.Z],
};

/** Independently derived ghost set for a size. */
function expectedGhosts(cubeSize: number): ExpectedGhost[] {
    const expected: ExpectedGhost[] = [];
    const last = cubeSize - 1;

    // Enumerate every cubie in 3D and the stickers it carries.
    for (const face of ALL_FACES) {
        for (let facePosition = 0; facePosition < cubeSize * cubeSize; facePosition++) {
            const position = facePositionTo3D(facePosition, face, cubeSize);
            const cubieFaces = facesAt(position, cubeSize);

            for (const otherFace of cubieFaces) {
                if (otherFace === face) continue;

                const shared = RING_AXES[face].filter(axis => RING_AXES[otherFace].includes(axis));
                if (shared.length !== 1) {
                    throw new Error(
                        `${face} and ${otherFace} share ${shared.length} ring axes, expected 1`
                    );
                }

                const axis = shared[0];
                const coordinate = position[axis.toLowerCase() as 'x' | 'y' | 'z'];
                const rank = axis === Axis.Z ? coordinate : last - coordinate;

                expected.push({
                    target: `sticker-${face}-${facePosition}`,
                    source: stickerIdOn(otherFace, position, cubeSize),
                    axis,
                    rank,
                });
            }
        }
    }

    return expected;
}

const parametersFile = loadParameters();

describe('circular svg generator — ghost rule falsification at N=5', () => {
    it('confirms N=5 is the smallest size where edge-derived ghosts are a strict majority', () => {
        // The premise for choosing N=5. Ghosts derived from the 1-edge class are
        // 6*(4N-8) of a total 24N, so their share is 1 - 2/N — which exceeds half
        // only above N=4. At N=4 the classes split exactly 50/50, and at N=2 the
        // edge class is absent entirely. N=5 is therefore the first size that
        // actually exercises the class the rule is most likely to get wrong.
        const edgeShare = (size: number): number => {
            let corners = 0;
            let edges = 0;
            for (let position = 0; position < size * size; position++) {
                const row = Math.floor(position / size);
                const col = position % size;
                const edgeRow = row === 0 || row === size - 1;
                const edgeCol = col === 0 || col === size - 1;
                if (edgeRow && edgeCol) corners++;
                else if (edgeRow || edgeCol) edges++;
            }
            const total = corners * 2 + edges;
            return edges / total;
        };

        expect(edgeShare(2)).toBe(0);
        expect(edgeShare(3)).toBeCloseTo(1 / 3, 5);
        expect(edgeShare(4)).toBeCloseTo(0.5, 5);
        expect(edgeShare(5)).toBeCloseTo(0.6, 5);

        // Strict majority only above N=4 — which is why N=5 is the test size.
        expect(edgeShare(4)).not.toBeGreaterThan(0.5);
        expect(edgeShare(5)).toBeGreaterThan(0.5);
    });

    it('matches the independently derived ghost set exactly at N=5', () => {
        const size = 5;
        const result = generate(size, parametersFile);
        const expected = expectedGhosts(size);

        expect(result.ghosts).toHaveLength(expected.length);
        expect(expected).toHaveLength(120);

        const actualKeys = new Set(
            result.ghosts.map(g => `${g.target}|${g.source}|${g.axis}|${g.rank}`)
        );
        const missing = expected.filter(
            e => !actualKeys.has(`${e.target}|${e.source}|${e.axis}|${e.rank}`)
        );
        expect(missing).toEqual([]);

        const expectedKeys = new Set(
            expected.map(e => `${e.target}|${e.source}|${e.axis}|${e.rank}`)
        );
        const extra = result.ghosts.filter(
            g => !expectedKeys.has(`${g.target}|${g.source}|${g.axis}|${g.rank}`)
        );
        expect(extra).toEqual([]);
    });

    it('holds at N=4 as well, where the edge class is exercised on 8 of 16', () => {
        const size = 4;
        const result = generate(size, parametersFile);
        const expected = expectedGhosts(size);

        expect(result.ghosts).toHaveLength(expected.length);
        const actualKeys = new Set(
            result.ghosts.map(g => `${g.target}|${g.source}|${g.axis}|${g.rank}`)
        );
        expect(
            expected.every(e => actualKeys.has(`${e.target}|${e.source}|${e.axis}|${e.rank}`))
        ).toBe(true);
    });

    it('holds at N=2, where every sticker is a corner', () => {
        const size = 2;
        const result = generate(size, parametersFile);
        const expected = expectedGhosts(size);

        expect(result.ghosts).toHaveLength(expected.length);
        // Every sticker on a 2x2 is a corner, so every one gets two ghosts.
        const perTarget = new Map<string, number>();
        for (const ghost of result.ghosts) {
            perTarget.set(ghost.target, (perTarget.get(ghost.target) ?? 0) + 1);
        }
        expect([...perTarget.values()].every(count => count === 2)).toBe(true);
        expect(perTarget.size).toBe(24);
    });

    it('places every N=5 ghost on its tagged ring at the right offset', () => {
        const size = 5;
        const params = resolveParameters(size, parametersFile);
        const result = generate(size, parametersFile);
        const centres = axisCentres(params);

        for (const ghost of result.ghosts) {
            const centre = centres[ghost.axis];
            const radius = params.innerRadius + ghost.rank * params.ringStep;
            const distance = Math.hypot(ghost.x - centre.x, ghost.y - centre.y);
            expect(Math.abs(distance - radius)).toBeLessThanOrEqual(0.5);

            // `ringRadius` takes a layer index, and a radius rank is that index
            // complemented on the X and Y axes. Both must describe the same ring.
            const layerIndex = ghost.axis === Axis.Z ? ghost.rank : size - 1 - ghost.rank;
            expect(ringRadius(ghost.axis, layerIndex, size, params)).toBeCloseTo(radius, 5);
        }
    });

    it('offsets every N=5 ghost by one sticker radius from its target', () => {
        const size = 5;
        const params = resolveParameters(size, parametersFile);
        const result = generate(size, parametersFile);

        for (const ghost of result.ghosts) {
            const targetPosition = Number(ghost.target.split('-')[2]);
            const target = stickerPosition(ghost.face, targetPosition, size, params);
            const separation = Math.hypot(ghost.x - target.x, ghost.y - target.y);

            // Derived from arc length, so it lands within rounding of r_s.
            expect(separation).toBeGreaterThan(params.stickerRadius * 0.9);
            expect(separation).toBeLessThan(params.stickerRadius * 1.2);
        }
    });

    it('resolves every N=5 ghost source to a sticker that exists', () => {
        const size = 5;
        const result = generate(size, parametersFile);

        const validIds = new Set<string>();
        for (const face of ALL_FACES) {
            for (let position = 0; position < size * size; position++) {
                validIds.add(`sticker-${face}-${position}`);
            }
        }

        for (const ghost of result.ghosts) {
            expect(validIds.has(ghost.target)).toBe(true);
            expect(validIds.has(ghost.source)).toBe(true);
        }
    });
});
