/**
 * Does the preview viewBox actually contain everything that must be visible?
 *
 * The preview's canvas was computed from sticker positions and ellipse extents.
 * But a Circular view asset also carries ring notation labels, whose boxes sit
 * outside the outermost ring, and six face labels. If those fall outside the
 * viewBox they are simply invisible in the app — the label mask is patched to the
 * viewBox, so anything beyond it is clipped away rather than drawn.
 *
 * This checks every visible element class against the committed asset's viewBox,
 * so a too-tight canvas shows up before it reaches the app.
 */
import { readFileSync } from 'node:fs';

interface Box {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

function parseViewBox(vb: string): Box {
    const [x, y, w, h] = vb.split(/\s+/).map(Number);
    return { x0: x, y0: y, x1: x + w, y1: y + h };
}

function inside(box: Box, x0: number, y0: number, x1: number, y1: number): boolean {
    // Small tolerance: a boundary-touching label is acceptable.
    const tol = 0.5;
    return x0 >= box.x0 - tol && y0 >= box.y0 - tol && x1 <= box.x1 + tol && y1 <= box.y1 + tol;
}

interface Found {
    kind: string;
    tag: string;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

function elements(path: string): Found[] {
    const svg = readFileSync(path, 'utf8');
    const out: Found[] = [];

    // Stickers and ghosts: circles with cx/cy/r.
    for (const m of svg.matchAll(/<circle\b[^>]*class="(sticker|ghost-sticker)"[^>]*\/>/g)) {
        const tag = m[0];
        const kind = m[1] === 'sticker' ? 'sticker' : 'ghost';
        const cx = Number(/cx="([-\d.]+)"/.exec(tag)?.[1]);
        const cy = Number(/cy="([-\d.]+)"/.exec(tag)?.[1]);
        const r = Number(/r="([-\d.]+)"/.exec(tag)?.[1]);
        out.push({ kind, tag: kind, x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r });
    }

    // Ellipses: use the larger semi-axis as a conservative square bound.
    for (const m of svg.matchAll(/<ellipse\b[^>]*data-face="[A-Z]"[^>]*\/>/g)) {
        const tag = m[0];
        const cx = Number(/cx="([-\d.]+)"/.exec(tag)?.[1]);
        const cy = Number(/cy="([-\d.]+)"/.exec(tag)?.[1]);
        const rx = Number(/rx="([-\d.]+)"/.exec(tag)?.[1]);
        const ry = Number(/ry="([-\d.]+)"/.exec(tag)?.[1]);
        const reach = Math.max(rx, ry);
        out.push({
            kind: 'ellipse',
            tag: 'ellipse',
            x0: cx - reach,
            y0: cy - reach,
            x1: cx + reach,
            y1: cy + reach,
        });
    }

    // Ring notation labels: a <g> with data-label-id and a translate, plus a
    // labelWidth x labelHeight rect at the origin of that translate.
    for (const m of svg.matchAll(
        /<g data-label-id="([^"]*)"[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"[^>]*>([\s\S]*?)<\/g>/g
    )) {
        const id = m[1];
        const x = Number(m[2]);
        const y = Number(m[3]);
        const body = m[4];
        const w = Number(/width="([-\d.]+)"/.exec(body)?.[1] ?? NaN);
        const h = Number(/height="([-\d.]+)"/.exec(body)?.[1] ?? NaN);
        if (!Number.isFinite(w) || !Number.isFinite(h)) continue;
        out.push({ kind: 'ring label', tag: id, x0: x, y0: y, x1: x + w, y1: y + h });
    }

    // Face labels: a <g> with id="face-label-X" and a translate, with a rect
    // centred on the anchor (x=-10, y=-10, 20x20).
    for (const m of svg.matchAll(
        /<g data-face="[A-Z]" id="face-label-([A-Z])"[^>]*transform="translate\(([-\d.]+),([-\d.]+)\)"[^>]*>([\s\S]*?)<\/g>/g
    )) {
        const face = m[1];
        const x = Number(m[2]);
        const y = Number(m[3]);
        const body = m[4];
        const rx = Number(/<rect x="([-\d.]+)"/.exec(body)?.[1] ?? NaN);
        const ry = Number(/<rect x="[-\d.]+" y="([-\d.]+)"/.exec(body)?.[1] ?? NaN);
        const w = Number(/width="([-\d.]+)"/.exec(body)?.[1] ?? NaN);
        const h = Number(/height="([-\d.]+)"/.exec(body)?.[1] ?? NaN);
        if (!Number.isFinite(rx) || !Number.isFinite(w)) continue;
        out.push({
            kind: 'face label',
            tag: face,
            x0: x + rx,
            y0: y + ry,
            x1: x + rx + w,
            y1: y + ry + h,
        });
    }

    return out;
}

const paths = process.argv.slice(2);
if (!paths.length) {
    console.log('usage: check-canvas.ts <svg> [svg...]');
    process.exit(1);
}

for (const path of paths) {
    const svg = readFileSync(path, 'utf8');
    const vb = /viewBox="([^"]*)"/.exec(svg)?.[1];
    if (!vb) {
        console.log(`${path}: no viewBox`);
        continue;
    }
    const box = parseViewBox(vb);
    const items = elements(path);

    const outside = items.filter(i => !inside(box, i.x0, i.y0, i.x1, i.y1));
    const byKind = new Map<string, number>();
    for (const o of outside) byKind.set(o.kind, (byKind.get(o.kind) ?? 0) + 1);

    console.log(`${path}`);
    console.log(`  viewBox ${vb}  ->  x ${box.x0}..${box.x1}, y ${box.y0}..${box.y1}`);
    console.log(`  elements checked: ${items.length}  outside the canvas: ${outside.length}`);
    if (outside.length) {
        for (const [kind, n] of byKind) console.log(`    ${kind}: ${n}`);
        for (const o of outside.slice(0, 5)) {
            console.log(
                `      ${o.kind} ${o.tag}: x ${o.x0.toFixed(1)}..${o.x1.toFixed(1)}, y ${o.y0.toFixed(1)}..${o.y1.toFixed(1)}`
            );
        }
    }
}
