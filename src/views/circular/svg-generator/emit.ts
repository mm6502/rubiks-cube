import { Axis, Face } from '@/cube/types';

import {
    ALL_FACES,
    CircularSvgParameters,
    FACE_FILLS,
    FACE_RING_AXES,
    FittedParameters,
    axisCentres,
    axisCircleId,
    faceEllipseGeometry,
    labelGeometry,
    labelOrdinal,
    ringLayerFor,
    ringRadius,
    round,
    stickerId,
    stickerPosition,
    triangleCentroid,
} from './geometry';
import { labelContent } from './labels';

/**
 * Serialises a Circular view SVG for a given cube size.
 *
 * The output must satisfy the element contract the view's runtime modules
 * resolve. See `validate.ts` for the checks that assert it, and
 * `scripts/circular-svg/README.md` for the parameter table.
 */

interface Point2D {
    x: number;
    y: number;
}

/**
 * Face-label anchor coordinates, expressed relative to the triangle.
 *
 * The label sits against its face ellipse's outer edge, matching the committed
 * reference asset, whose labels touch their ellipse (3x3 measured gap 0.00).
 *
 * The reach is built from three measured pieces rather than one guessed number:
 *
 *   * `ry` carries the ellipse's extent along the outward direction. The
 *     ellipse's rotation is `angle(outward) + 90°`, which puts its LOCAL X axis
 *     perpendicular to outward and its LOCAL Y axis along it — and `rx` is the
 *     local-X semi-axis while `ry` is the local-Y one. So the relevant semi-axis
 *     is `ry`, not `max(rx, ry)`.
 *   * The label is a square of half-size `labelWidth/2` centred on the anchor,
 *     so its own extent along outward is `half * (|ux| + |uy|)`.
 *   * A `labelGap` clears the ellipse's 1.5-wide stroke, which straddles the
 *     geometric edge.
 *
 * Using `max(rx, ry)` instead put the label up to `rx - ry` too far out — about
 * 7 units at 3x3 and 33 at 7x7 — which is the gap this corrects.
 */
function faceLabelPosition(face: Face, cubeSize: number, params: CircularSvgParameters): Point2D {
    // The label sits just beyond its face's ellipse, along the direction from the
    // triangle centroid through the face's own sticker centroid.
    const ellipse = faceEllipseGeometry(face, cubeSize, params);
    const centroid = triangleCentroid(params);

    const outward = {
        x: ellipse.cx - centroid.x,
        y: ellipse.cy - centroid.y,
    };
    const length = Math.hypot(outward.x, outward.y) || 1;
    const unit = { x: outward.x / length, y: outward.y / length };

    const half = Math.max(params.labelWidth, params.labelHeight) / 2;
    const reach = ellipse.ry + half * (Math.abs(unit.x) + Math.abs(unit.y)) + params.faceLabelGap;

    return {
        x: round(ellipse.cx + unit.x * reach),
        y: round(ellipse.cy + unit.y * reach),
    };
}

/** The `<desc>` prose, parameterised by size. */
function describe(cubeSize: number): string {
    const layerIndices = Array.from({ length: cubeSize }, (_, i) => i).join(', ');
    return `Three interleaved sets of concentric circles representing X, Y, and Z axes.
    Each set has ${cubeSize} rings for layer indices ${layerIndices}. The three centers form an isosceles triangle,
    and circle intersections create slanted-square (diamond-like) regions.`;
}

/**
 * The stylesheet.
 *
 * Mirrors the reference asset's stylesheet so generated assets look like the
 * hand-authored 3x3. It previously carried a comment claiming to be "unchanged
 * from the reference asset" while stopping three rules early: `.sticker-wrapper`,
 * `.sticker` and `.ghost-sticker`. The markup those rules target was already
 * emitted correctly, so the loss was purely visual — stickers rendered without
 * their black outline and without the drop-shadow that gives them depth — and the
 * misplaced comment is what stopped anyone checking.
 *
 * The exceptions to a verbatim copy, both deliberate:
 *
 *   * `.ghost-sticker` omits `r: 7`. The reference declares a fixed radius in CSS,
 *     and CSS overrides a presentation attribute, so copying it would silently pin
 *     every ghost to 7 and make a future per-size `stickerRadius` a no-op for
 *     ghosts while the stickers still responded. The radius is emitted as an
 *     attribute from `stickerRadius` instead, which is where it belongs.
 *   * `drop-shadow` and `stroke` values are unchanged, including the CSS custom
 *     properties, which resolve from the surrounding theme exactly as they do for
 *     the reference.
 */
function styles(): string {
    return `      /* Theme-friendly: inherits text/stroke color from surrounding CSS */
      .stroke { stroke: currentColor; fill: none; vector-effect: non-scaling-stroke; }

      .axisLabelRect { fill: currentColor; stroke: currentColor; stroke-width: 0.5; opacity: 0.0; }
      .axisLabel { fill: currentColor; font: 10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      .axisX { stroke-width: 1.5; opacity: 0.66; }
      .axisY { stroke-width: 1.5; opacity: 0.66; }
      .axisZ { stroke-width: 1.5; opacity: 0.66; }

      .faceLabel text { fill: currentColor; font: bold 12px Arial, system-ui, -apple-system, sans-serif; }
      .faceLabel rect { fill: var(--color-domain-face-label-bg); stroke: var(--color-domain-face-label-border); stroke-width: 1.5; }
      .faceLabel > g { transition: transform 0.3s ease; }
      .faceEllipse { fill: currentColor; stroke: currentColor; stroke-width: 1.5; opacity: 0.2; }

      .sticker-wrapper {
        filter:
          drop-shadow(2px 2px 1.25px rgba(0,0,0,0.8))
          drop-shadow(-0.5px -0.5px 0.66px rgba(0,0,0,0.3));
      }
      .sticker {
        stroke: black;
        stroke-width: 0.8;
        cursor: grab;
        pointer-events: visiblePainted;
        /* will-change promotes stickers to their own compositing layer for smoother WAAPI animations. */
        will-change: transform;
      }

      .ghost-sticker {
        opacity: 0.75;
        pointer-events: none;
        stroke: var(--color-domain-sticker-border);
        stroke-width: 1;
        transition: fill 0.3s ease, opacity 0.3s ease;
      }`;
}

/**
 * The label mask: one hole per axis label, so labels are visible over the rings.
 *
 * Hole positions track each label's box, so a size with more rings simply gets
 * more holes — the count is derived, never hardcoded.
 *
 * The white backing rect spans the viewBox rather than a fixed rectangle. A fixed
 * 400x340 rect was correct for the reference but acts as a hidden clip for any
 * canvas larger than it or offset from the origin: the mask makes everything
 * outside the white area transparent, so rings and labels beyond it simply vanish,
 * silently and regardless of what the viewBox allows. Sizing it from the viewBox
 * keeps the drawn extent and the masked extent identical at every size.
 */
function labelMask(cubeSize: number, params: FittedParameters): string {
    const holes: string[] = [];
    for (const axis of [Axis.Z, Axis.X, Axis.Y]) {
        for (let layerIndex = 0; layerIndex < cubeSize; layerIndex++) {
            const label = labelGeometry(axis, layerIndex, cubeSize, params);
            const ordinal = labelOrdinal(axis, layerIndex, cubeSize, params);
            holes.push(
                `      <rect id="mask-${axis.toLowerCase()}-${ordinal}" x="${label.x}" y="${label.y}" width="${params.labelWidth}" height="${params.labelHeight}" fill="black" />`
            );
        }
    }

    const [vx, vy, vw, vh] = params.viewBox.split(/\s+/).map(Number);
    const total = cubeSize * 3;
    return `    <mask id="label-mask">
      <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="white" />
${holes.join('\n')}
      <!-- ${total} label holes: ${cubeSize} per axis -->
    </mask>`;
}

/** The masked concentric ring groups, one group per axis. */
function ringGroups(cubeSize: number, params: CircularSvgParameters): string {
    const groups: string[] = [];
    // Emission order matches the reference: Z, X, Y.
    for (const axis of [Axis.Z, Axis.X, Axis.Y]) {
        const centre = axisCentres(params)[axis];
        const circles: string[] = [];
        // Descending radius, so the DOM order matches the reference asset.
        for (let layerIndex = cubeSize - 1; layerIndex >= 0; layerIndex--) {
            circles.push(
                `      <circle id="${axisCircleId(axis, layerIndex)}" data-axis="${axis}" data-layer-index="${layerIndex}" cx="${centre.x}" cy="${centre.y}" r="${ringRadius(axis, layerIndex, cubeSize, params)}" />`
            );
        }
        groups.push(
            `    <g class="stroke axis${axis}" aria-label="Axis ${axis}">\n${circles.join('\n')}\n    </g>`
        );
    }

    return `  <g mask="url(#label-mask)">\n${groups.join('\n\n')}\n  </g>`;
}

/** The axis notation labels with their masks, text, and tooltips. */
function axisLabels(cubeSize: number, params: CircularSvgParameters): string {
    const groups: string[] = [];
    for (const axis of [Axis.Z, Axis.Y, Axis.X]) {
        const labels: string[] = [];
        for (let layerIndex = 0; layerIndex < cubeSize; layerIndex++) {
            const geometry = labelGeometry(axis, layerIndex, cubeSize, params);
            const ordinal = labelOrdinal(axis, layerIndex, cubeSize, params);
            const content = labelContent(axis, layerIndex, cubeSize);
            labels.push(
                `    <g data-label-id="${axis.toLowerCase()}-${ordinal}" data-axis="${axis}" data-layer-index="${layerIndex}" transform="translate(${geometry.x}, ${geometry.y})">\n` +
                    `      <rect class="axisLabelRect" width="${params.labelWidth}" height="${params.labelHeight}" />\n` +
                    `      <text x="${params.labelWidth / 2}" y="${params.labelHeight / 2}" text-anchor="middle" dominant-baseline="middle">${content.text}</text>\n` +
                    `      <title>${content.title}</title>\n` +
                    `    </g>`
            );
        }
        groups.push(labels.join('\n'));
    }

    return `  <g class="axisLabel" aria-hidden="true">\n${groups.join('\n\n')}\n  </g>`;
}

/** The six face labels. All six are emitted at every size. */
function faceLabels(cubeSize: number, params: CircularSvgParameters): string {
    const groups = ALL_FACES.map(face => {
        const position = faceLabelPosition(face, cubeSize, params);
        return (
            `    <g data-face="${face}" id="face-label-${face}" transform="translate(${position.x},${position.y})">\n` +
            `      <rect x="-10" y="-10" width="20" height="20" rx="3" />\n` +
            `      <text x="0" y="0" text-anchor="middle" dominant-baseline="middle">${face}</text>\n` +
            `    </g>`
        );
    });

    return `  <g class="faceLabel" aria-hidden="true">\n${groups.join('\n\n')}\n  </g>`;
}

/** The six face ellipses. */
function faceEllipses(cubeSize: number, params: CircularSvgParameters): string {
    const ellipses = ALL_FACES.map(face => {
        const geometry = faceEllipseGeometry(face, cubeSize, params);
        const transform =
            geometry.rotation === null || geometry.rotation === 0
                ? ''
                : ` transform="rotate(${geometry.rotation} ${geometry.cx} ${geometry.cy})"`;
        return `    <ellipse data-face="${face}" id="${face}-face-ellipse" cx="${geometry.cx}" cy="${geometry.cy}" rx="${geometry.rx}" ry="${geometry.ry}"${transform} />`;
    });

    return `  <g class="faceEllipse">\n${ellipses.join('\n')}\n  </g>`;
}

/**
 * The ring-membership tag used for authoring clarity.
 *
 * Encodes the sticker's face-local grid coordinates per ring axis. No runtime
 * code reads this — membership is computed geometrically at load — so it is
 * emitted for humans reading the asset, and comparisons against the reference
 * exclude it.
 */
function axisCirclesTag(face: Face, facePosition: number, cubeSize: number): string {
    const [axisA, axisB] = FACE_RING_AXES[face];
    const layerA = ringLayerFor(face, facePosition, axisA, cubeSize);
    const layerB = ringLayerFor(face, facePosition, axisB, cubeSize);
    return `${axisA}:${layerA} ${axisB}:${layerB}`;
}

/** The sticker groups, one wrapper per face. */
function stickerGroups(cubeSize: number, params: CircularSvgParameters): string {
    const groups = ALL_FACES.map(face => {
        const stickers: string[] = [];
        for (let facePosition = 0; facePosition < cubeSize * cubeSize; facePosition++) {
            const position = stickerPosition(face, facePosition, cubeSize, params);
            stickers.push(
                `  <circle data-face="${face}" data-pos="${facePosition}" id="${stickerId(face, facePosition)}" class="sticker" data-axis-circles="${axisCirclesTag(face, facePosition, cubeSize)}" cx="${position.x.toFixed(2)}" cy="${position.y.toFixed(2)}" r="${params.stickerRadius}" fill="${FACE_FILLS[face]}" />`
            );
        }
        return `<!-- Face ${face} -->\n<g class="face-face sticker-wrapper" data-face="${face}" aria-label="Face ${face}">\n${stickers.join('\n')}\n</g>`;
    });

    return `  <!-- Intersection Stickers -->\n${groups.join('\n')}`;
}

export interface EmitOptions {
    cubeSize: number;
    /**
     * Geometry plus the canvas it was fitted to. The caller measures the drawn
     * bounds first and passes the result, so the emitted `viewBox` and the
     * emitted drawing always agree.
     */
    params: FittedParameters;
    /** Serialised ghost wrapper markup, inserted before the stickers. */
    ghosts?: string;
}

/** Serialise a complete Circular view SVG. */
export function emitSvg(options: EmitOptions): string {
    const { cubeSize, params, ghosts } = options;

    const sections = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg`,
        `  xmlns="http://www.w3.org/2000/svg"`,
        `  viewBox="${params.viewBox}"`,
        `  preserveAspectRatio="xMidYMid meet"`,
        `  role="img"`,
        `  aria-labelledby="title desc"`,
        `  width="100%"`,
        `  height="100%"`,
        `  data-cube-size="${cubeSize}"`,
        `  style="max-width:100%; max-height:100%; display:block;"`,
        `>`,
        `  <desc id="desc">`,
        `    ${describe(cubeSize)}`,
        `  </desc>`,
        ``,
        `  <defs>`,
        `    <style>`,
        styles(),
        `    </style>`,
        ``,
        labelMask(cubeSize, params),
        `  </defs>`,
        ``,
        `  <!-- Concentric rings (${cubeSize} layers) -->`,
        ringGroups(cubeSize, params),
        ``,
        `  <!-- Labels: axis + layer index per ring -->`,
        axisLabels(cubeSize, params),
        ``,
        `  <!-- Cube face labels positioned outside ellipses -->`,
        `  <!-- Labels tilt dynamically via JS when keyboard is active to hint Arrow-Up rotation direction. -->`,
        faceLabels(cubeSize, params),
        ``,
        `  <!-- Face Ellipses -->`,
        faceEllipses(cubeSize, params),
        ``,
        ghosts ? ghosts : '',
        ``,
        stickerGroups(cubeSize, params),
        `</svg>`,
        ``,
    ];

    return sections
        .filter(line => line !== '')
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
}
