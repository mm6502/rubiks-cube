import { Axis, Face } from '@/cube/types';
import { facePositionTo3D } from '@/cube/utils/sticker-position';

import {
    ALL_FACES,
    CircularSvgParameters,
    FACE_RING_AXES,
    axisCentres,
    ringRadius,
    round,
    stickerId,
    stickerPosition,
} from './geometry';

/**
 * Ghost sticker generation.
 *
 * A ghost is a semi-transparent hint that mirrors the colour of a *different*
 * sticker sitting on the same cubie, placed just outside the target sticker so
 * the user can see what is around the edge. The rule below was derived from the
 * 72 ghosts in the committed 3x3 asset and verified against all of them.
 *
 * The rule has four parts, three of which reproduce the reference exactly:
 *
 * 1. **Multiplicity** — one ghost per other sticker on the same cubie. A corner
 *    cubie carries three stickers, so each gets two ghosts; an edge carries two,
 *    so each gets one; a face centre carries one and gets none. This yields the
 *    reference's 24×2 + 24×1 = 72.
 * 2. **Axis** — the one ring axis shared by the target's and the other sticker's
 *    ring-axis sets.
 * 3. **Ring tag** — the shared coordinate along that axis, encoded as a *radius
 *    rank* (how far out from the innermost ring the circle sits) rather than a
 *    layer index. On Z the two agree; on X and Y the rank is reversed. This
 *    distinction is what the reference's `data-ghost-layer` values encode.
 * 4. **Position** — exactly one sticker radius along the tagged circle, in the
 *    direction of the source sticker.
 *
 * Part 4 is the only approximate one: the reference asset is hand-authored and
 * its ghost offsets range from 6.99 to 7.94 rather than a constant 7.00, so a
 * generated asset lands within about one unit of the committed positions. Two
 * of the 72 ghosts are further off because their source sits almost exactly
 * opposite the target (~180°), where "toward the source" is degenerate and the
 * author chose a side by eye.
 */

/** Per-class offset as a multiple of the sticker radius, tunable per size. */
export interface GhostParameters {
    /** Offset of a ghost from its target, in sticker radii. */
    radiusOffset: number;
}

export interface GhostSpec {
    /** Axis circle the ghost sits on. */
    axis: Axis;
    /** Radius rank of that circle (0 = innermost). */
    rank: number;
    /** Face whose group the ghost is drawn in — the target's face. */
    face: Face;
    /** Draw order within the face group. */
    index: number;
    /** Target sticker this ghost sits beside. */
    target: string;
    /** Sticker whose colour this ghost mirrors. */
    source: string;
    x: number;
    y: number;
}

/**
 * Radius rank of a cylinder coordinate: how many rings sit inside it.
 *
 * Z's radius grows with the coordinate, X and Y's shrinks, so the rank is the
 * coordinate itself on Z and its complement elsewhere.
 */
export function radiusRank(axis: Axis, layerIndex: number, cubeSize: number): number {
    return axis === Axis.Z ? layerIndex : cubeSize - 1 - layerIndex;
}

/** Sticker ids for every sticker on the same cubie as the given face position. */
function cubieStickerIds(
    face: Face,
    facePosition: number,
    cubeSize: number
): Array<{ face: Face; facePosition: number; id: string }> {
    const position = facePositionTo3D(facePosition, face, cubeSize);
    const maxIndex = cubeSize - 1;
    const { x, y, z } = position;

    const stickers: Array<{ face: Face; facePosition: number }> = [];

    // A sticker exists on a face when its cubie touches that face's plane.
    if (z === 0)
        stickers.push({ face: Face.F, facePosition: toFacePosition(Face.F, x, y, z, cubeSize) });
    if (z === maxIndex)
        stickers.push({ face: Face.B, facePosition: toFacePosition(Face.B, x, y, z, cubeSize) });
    if (y === maxIndex)
        stickers.push({ face: Face.U, facePosition: toFacePosition(Face.U, x, y, z, cubeSize) });
    if (y === 0)
        stickers.push({ face: Face.D, facePosition: toFacePosition(Face.D, x, y, z, cubeSize) });
    if (x === 0)
        stickers.push({ face: Face.L, facePosition: toFacePosition(Face.L, x, y, z, cubeSize) });
    if (x === maxIndex)
        stickers.push({ face: Face.R, facePosition: toFacePosition(Face.R, x, y, z, cubeSize) });

    return stickers.map(s => ({ ...s, id: stickerId(s.face, s.facePosition) }));
}

/** Inverse of `facePositionTo3D` for a known cubie. */
function toFacePosition(face: Face, x: number, y: number, z: number, cubeSize: number): number {
    const maxIndex = cubeSize - 1;
    switch (face) {
        case Face.F:
            return (maxIndex - y) * cubeSize + x;
        case Face.B:
            return (maxIndex - y) * cubeSize + (maxIndex - x);
        case Face.U:
            return (maxIndex - z) * cubeSize + x;
        case Face.D:
            return z * cubeSize + x;
        case Face.L:
            return (maxIndex - y) * cubeSize + (maxIndex - z);
        case Face.R:
            return (maxIndex - y) * cubeSize + z;
        default:
            return 0;
    }
}

/**
 * Every ghost for a cube of the given size, in emission order.
 *
 * Ordering matches the reference asset: faces in `ALL_FACES` order, and within
 * a face, targets ascending by face position with each target's ghosts grouped
 * together. The per-face `index` restarts at zero for each face.
 */
export function allGhosts(
    cubeSize: number,
    params: CircularSvgParameters,
    ghostParams: GhostParameters
): GhostSpec[] {
    const result: GhostSpec[] = [];

    for (const face of ALL_FACES) {
        const faceGhosts: GhostSpec[] = [];

        for (let facePosition = 0; facePosition < cubeSize * cubeSize; facePosition++) {
            const target = { face, facePosition };
            const others = cubieStickerIds(face, facePosition, cubeSize).filter(
                other => other.face !== face
            );

            for (const other of others) {
                const ghost = buildGhost(
                    target,
                    other,
                    cubeSize,
                    params,
                    ghostParams,
                    faceGhosts.length
                );
                if (ghost) faceGhosts.push(ghost);
            }
        }

        result.push(...faceGhosts);
    }

    return result;
}

/** Build one ghost, or `undefined` if the two stickers share no ring axis. */
function buildGhost(
    target: { face: Face; facePosition: number },
    other: { face: Face; facePosition: number; id: string },
    cubeSize: number,
    params: CircularSvgParameters,
    ghostParams: GhostParameters,
    index: number
): GhostSpec | undefined {
    // The shared ring axis: the target lies at the intersection of its two ring
    // axes, and so does the other sticker; they share exactly one.
    const shared = FACE_RING_AXES[target.face].filter(axis =>
        FACE_RING_AXES[other.face].includes(axis)
    );
    if (shared.length !== 1) return undefined;

    const axis = shared[0];
    const targetPosition = facePositionTo3D(target.facePosition, target.face, cubeSize);
    const layerIndex = targetPosition[axis.toLowerCase() as 'x' | 'y' | 'z'];
    const rank = radiusRank(axis, layerIndex, cubeSize);

    const centre = axisCentres(params)[axis];
    const radius = ringRadius(axis, layerIndex, cubeSize, params);
    const start = stickerPosition(target.face, target.facePosition, cubeSize, params);
    const source = stickerPosition(other.face, other.facePosition, cubeSize, params);

    // Angular displacement of one sticker radius of arc, signed toward the source.
    const angleStart = Math.atan2(start.y - centre.y, start.x - centre.x);
    const angleSource = Math.atan2(source.y - centre.y, source.x - centre.x);
    const delta = wrapAngle(angleSource - angleStart);
    const step = Math.sign(delta) * ((params.stickerRadius * ghostParams.radiusOffset) / radius);

    const angle = angleStart + step;

    return {
        axis,
        rank,
        face: target.face,
        index,
        target: stickerId(target.face, target.facePosition),
        source: other.id,
        x: round(centre.x + radius * Math.cos(angle)),
        y: round(centre.y + radius * Math.sin(angle)),
    };
}

function wrapAngle(angle: number): number {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Serialise the ghost wrapper group. */
export function emitGhosts(ghosts: GhostSpec[], stickerRadius: number): string {
    let lastFace: Face | undefined;
    const lines: string[] = [];

    for (const ghost of ghosts) {
        if (ghost.face !== lastFace) {
            lines.push(`    <!-- Ghost stickers at face ${ghost.face} -->`);
            lastFace = ghost.face;
        }
        lines.push(
            `    <circle class="ghost-sticker" data-ghost-axis="${ghost.axis}" data-ghost-layer="${ghost.rank}" data-ghost-face="${ghost.face}" data-ghost-index="${ghost.index}" data-ghost-target="${ghost.target}" data-ghost-source="${ghost.source}" cx="${ghost.x.toFixed(2)}" cy="${ghost.y.toFixed(2)}" r="${stickerRadius}" />`
        );
    }

    return (
        `  <!-- Ghost hint stickers — semi-transparent, non-interactive hints showing\n` +
        `       distant stickers on the far side of each axis circle's gap. -->\n` +
        `  <g class="ghost-sticker-wrapper" aria-hidden="true">\n` +
        `${lines.join('\n')}\n` +
        `  </g>`
    );
}
