/**
 * Measuring the drawn extent of an emitted Circular view asset.
 *
 * This exists because a hand-written list of "element kinds to include" was wrong
 * twice in a row. The second time it omitted the axis circles — the outermost
 * geometry in the drawing, since a ring reaches centre ± r_max and its extreme
 * point carries no sticker. The canvas was therefore sized to the sticker and
 * ellipse span, and every size from 4 up had its outer ring's arc cropped, up to
 * ~42 degrees at 7×7.
 *
 * Deriving the extent from the markup instead makes that class of omission
 * impossible: whatever the emitter draws is measured, so a layer added later is
 * covered without anyone remembering to add it to a list.
 *
 * `markupBounds` walks every positionable element, tracking the translation of
 * enclosing groups, and unions their boxes. Elements inside `<defs>` are skipped:
 * the label mask lives there and its backing rect deliberately spans the whole
 * canvas, so including it would make the measurement circular.
 */

export interface Bounds {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

/**
 * Padding added around the measured extent when it becomes a viewBox.
 *
 * Covers stroke width, which the geometric boxes do not include. The widest
 * stroke in the asset is 2 units, drawn centred on the path, so 6 units leaves
 * clearance even for the ring and ellipse outlines.
 */
export const CANVAS_PAD = 6;

/** A viewBox large enough that anything the emitter draws falls inside it. */
export const PROBE_VIEWBOX = '-100000 -100000 200000 200000';

function parseTranslate(attrs: string): { x: number; y: number } | undefined {
    const m = /transform="translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)"/.exec(attrs);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : undefined;
}

function num(attrs: string, name: string, fallback = 0): number {
    const m = new RegExp(`\\b${name}="([-\\d.]+)"`).exec(attrs);
    return m ? Number(m[1]) : fallback;
}

/**
 * Union of every positionable element's box, in the root coordinate system.
 *
 * Handles circles, ellipses and rects, inside any depth of translated groups.
 * Text is not measured: the asset always draws a rect behind its text, and that
 * rect is the element's visible extent. A glyph wider than its box would not be
 * caught, which is a known limit rather than an oversight — the label boxes are
 * chosen to fit their content.
 */
export function markupBounds(svg: string): Bounds {
    // Drop <defs> so mask geometry does not define the canvas it masks.
    const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '');

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;

    const include = (a: number, b: number, c: number, d: number) => {
        if (a < x0) x0 = a;
        if (b < y0) y0 = b;
        if (c > x1) x1 = c;
        if (d > y1) y1 = d;
    };

    // Group translation stack, so nesting is handled rather than assumed flat.
    let tx = 0;
    let ty = 0;
    const stack: { x: number; y: number }[] = [];

    const token = /<g\b([^>]*?)(\/?)>|<\/g>|<(circle|ellipse|rect)\b([^>]*?)\/>/g;

    for (const m of body.matchAll(token)) {
        const [text, gAttrs, selfClosing, shapeKind, shapeAttrs] = m;

        if (text === '</g>') {
            const prev = stack.pop();
            if (prev) {
                tx = prev.x;
                ty = prev.y;
            }
            continue;
        }

        if (shapeKind === undefined) {
            // An opening <g>. Self-closing groups have no extent to contribute.
            if (selfClosing === '/') continue;
            stack.push({ x: tx, y: ty });
            const t = parseTranslate(gAttrs ?? '');
            if (t) {
                tx += t.x;
                ty += t.y;
            }
            continue;
        }

        const attrs = shapeAttrs ?? '';
        if (shapeKind === 'circle') {
            const cx = num(attrs, 'cx');
            const cy = num(attrs, 'cy');
            const r = num(attrs, 'r');
            include(tx + cx - r, ty + cy - r, tx + cx + r, ty + cy + r);
        } else if (shapeKind === 'ellipse') {
            const cx = num(attrs, 'cx');
            const cy = num(attrs, 'cy');
            const rx = num(attrs, 'rx');
            const ry = num(attrs, 'ry');
            // A rotated ellipse's axis-aligned box is bounded by its larger
            // semi-axis in both directions, which is exact for a circle and a
            // safe over-estimate otherwise. Over-estimating is the correct
            // direction here: too large a canvas never crops the drawing.
            const reach = Math.max(rx, ry);
            include(tx + cx - reach, ty + cy - reach, tx + cx + reach, ty + cy + reach);
        } else {
            const rx = num(attrs, 'x');
            const ry = num(attrs, 'y');
            const rw = num(attrs, 'width');
            const rh = num(attrs, 'height');
            include(tx + rx, ty + ry, tx + rx + rw, ty + ry + rh);
        }
    }

    if (!Number.isFinite(x0)) {
        throw new Error('markupBounds found no positionable elements in the asset');
    }

    return { x0, y0, x1, y1 };
}

/** A viewBox string covering `bounds` plus `pad` on every side. */
export function boundsToViewBox(bounds: Bounds, pad = CANVAS_PAD): string {
    const x = Math.floor(bounds.x0 - pad);
    const y = Math.floor(bounds.y0 - pad);
    const w = Math.ceil(bounds.x1 - bounds.x0 + 2 * pad);
    const h = Math.ceil(bounds.y1 - bounds.y0 + 2 * pad);
    return `${x} ${y} ${w} ${h}`;
}
