/**
 * Which SHIPPED assets have ghost circles protruding from their face ellipses?
 *
 * The app does not consume the preview parameters — it loads the committed assets
 * in src/views/circular/. 3x3 comes from the static import of view.svg; the other
 * sizes come from view-<n>.svg via the loader's glob. So the question "does D need
 * applying?" has to be asked of those files, not of the preview table.
 *
 * This reads each committed asset, pairs every ghost with its target face's
 * ellipse, and reports the clearance. Negative means the ghost pokes outside its
 * ellipse, which is the reported symptom.
 */
import { readFileSync, readdirSync } from 'node:fs';

interface Ell {
    face: string;
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    rotation: number;
}

interface Circle {
    face: string;
    x: number;
    y: number;
    r: number;
    tag: string;
}

function parse(path: string) {
    const svg = readFileSync(path, 'utf8');

    const ellipses: Ell[] = [];
    for (const m of svg.matchAll(/<ellipse\b[^>]*\/>/g)) {
        const tag = m[0];
        const face = /data-face="([A-Z])"/.exec(tag)?.[1];
        if (!face) continue;
        ellipses.push({
            face,
            cx: Number(/cx="([-\d.]+)"/.exec(tag)?.[1]),
            cy: Number(/cy="([-\d.]+)"/.exec(tag)?.[1]),
            rx: Number(/rx="([-\d.]+)"/.exec(tag)?.[1]),
            ry: Number(/ry="([-\d.]+)"/.exec(tag)?.[1]),
            rotation: Number(/rotate\(([-\d.]+)/.exec(tag)?.[1] ?? 0),
        });
    }

    const ghosts: Circle[] = [];
    for (const m of svg.matchAll(/<circle\b[^>]*class="ghost-sticker"[^>]*\/>/g)) {
        const tag = m[0];
        ghosts.push({
            // A ghost is drawn in its TARGET's group, so this is the face whose
            // ellipse must contain it.
            face: /data-ghost-face="([A-Z])"/.exec(tag)?.[1] ?? '',
            x: Number(/cx="([-\d.]+)"/.exec(tag)?.[1]),
            y: Number(/cy="([-\d.]+)"/.exec(tag)?.[1]),
            r: Number(/r="([-\d.]+)"/.exec(tag)?.[1]),
            tag: /data-ghost-target="([^"]*)"/.exec(tag)?.[1] ?? '',
        });
    }

    const stickers: Circle[] = [];
    for (const m of svg.matchAll(/<circle\b[^>]*class="sticker"[^>]*\/>/g)) {
        const tag = m[0];
        stickers.push({
            face: /data-face="([A-Z])"/.exec(tag)?.[1] ?? '',
            x: Number(/cx="([-\d.]+)"/.exec(tag)?.[1]),
            y: Number(/cy="([-\d.]+)"/.exec(tag)?.[1]),
            r: Number(/r="([-\d.]+)"/.exec(tag)?.[1]),
            tag: 'sticker',
        });
    }

    return { ellipses, ghosts, stickers };
}

/** Clearance between a circle's edge and an ellipse's boundary; negative = outside. */
function clearance(e: Ell, c: Circle): number {
    const th = (-e.rotation * Math.PI) / 180;
    const dx = c.x - e.cx;
    const dy = c.y - e.cy;
    const lx = dx * Math.cos(th) - dy * Math.sin(th);
    const ly = dx * Math.sin(th) + dy * Math.cos(th);
    const r = Math.hypot(lx, ly);
    if (r === 0) return Math.min(e.rx, e.ry) - c.r;
    const boundary = 1 / Math.sqrt((lx / r / e.rx) ** 2 + (ly / r / e.ry) ** 2);
    return boundary - r - c.r;
}

console.log('Ghost enclosure in the COMMITTED assets\n');
console.log(
    '  file        | ellipse rx x ry | worst ghost clearance | offending ghost | worst sticker clearance'
);

const dir = 'src/views/circular';
const files = readdirSync(dir)
    .filter(f => /^view(-\d+)?\.svg$/.test(f))
    .sort();

for (const file of files) {
    const { ellipses, ghosts, stickers } = parse(`${dir}/${file}`);
    if (!ellipses.length) continue;

    let ghostWorst = Infinity;
    let ghostTag = '';
    let stickerWorst = Infinity;

    for (const e of ellipses) {
        for (const g of ghosts) {
            if (g.face !== e.face) continue;
            const c = clearance(e, g);
            if (c < ghostWorst) {
                ghostWorst = c;
                ghostTag = g.tag;
            }
        }
        for (const s of stickers) {
            if (s.face !== e.face) continue;
            stickerWorst = Math.min(stickerWorst, clearance(e, s));
        }
    }

    // The ellipse's own semi-axes, for context.
    const u = ellipses.find(e => e.face === 'U') ?? ellipses[0];

    const verdict = ghostWorst < 0 ? 'GHOSTS PROTRUDE' : ghostWorst < 1 ? 'tight' : 'ok';
    console.log(
        `  ${file.padEnd(11)} | ${u.rx.toFixed(1).padStart(5)} x ${u.ry.toFixed(1).padStart(5)} | ` +
            `${ghostWorst.toFixed(2).padStart(21)} | ${(ghostTag || '-').padEnd(15)} | ${stickerWorst.toFixed(2).padStart(23)}  ${verdict}`
    );
}
