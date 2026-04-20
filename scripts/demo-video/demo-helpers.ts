/**
 * Reusable helper functions for demo choreography — cursor, drag, caption,
 * UI interaction, geometry calculations, and composite drag gestures.
 */
import type { Page } from 'playwright';

import { demoMode } from './demo-filter';
import {
    DRAG_DURATION,
    SHORT_PAUSE,
    SNAP_HOLD,
    cdpFreezeAnimations,
    cdpSeekAllAnimations,
    cdpUnfreezeAnimations,
    log,
    takeSnapshot,
    wait,
} from './record-demo';

// ─── Coordinate helpers ─────────────────────────────────────────────────────

export async function center(page: Page, selector: string): Promise<{ x: number; y: number }> {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`Element not found: ${selector}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function bounds(page: Page, selector: string) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`Element not found: ${selector}`);
    return box;
}

// ─── Persistent demo cursor ─────────────────────────────────────────────────

// SVG arrow cursor (white with black outline, classic pointer shape)
const ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <path d="M2 2 L2 24 L8 18 L14 26 L18 24 L12 16 L20 16 Z"
        fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

// SVG grabbing-hand cursor
const HAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <path d="M10 14V8.5a1.5 1.5 0 0 1 3 0V13M13 12V6.5a1.5 1.5 0 0 1 3 0V13M16 12.5V8.5a1.5 1.5 0 0 1 3 0V16
           M19 11.5V10a1.5 1.5 0 0 1 3 0v6a8 8 0 0 1-8 8h-1a8 8 0 0 1-6.6-3.5L4 17a1.75 1.75 0 0 1 1-2.5
           c.8-.2 1.7.1 2.2.8L10 14"
        fill="white" stroke="black" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/**
 * Inject a persistent on-screen cursor overlay and hide the real browser cursor.
 * Call once during setup; no-op on repeat calls.
 */
export async function injectDemoCursor(page: Page): Promise<void> {
    const arrowB64 = Buffer.from(ARROW_SVG).toString('base64');
    const handB64 = Buffer.from(HAND_SVG).toString('base64');
    await page.evaluate(
        ({ arrowB64, handB64 }) => {
            if (document.getElementById('demo-cursor')) return;

            // Hide the real cursor everywhere
            const style = document.createElement('style');
            style.textContent = '*, *::before, *::after { cursor: none !important; }';
            document.head.appendChild(style);

            const el = document.createElement('img');
            el.id = 'demo-cursor';
            Object.assign(el.style, {
                position: 'fixed',
                left: '-100px',
                top: '-100px',
                width: '28px',
                height: '28px',
                pointerEvents: 'none',
                zIndex: '100000',
                opacity: '0',
                transformOrigin: '3px 1px', // tip of arrow is top-left
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.55))',
            });
            el.src = 'data:image/svg+xml;base64,' + arrowB64;
            document.body.appendChild(el);

            // Store data for later icon switching
            (window as any).__demoCursorArrow = 'data:image/svg+xml;base64,' + arrowB64;
            (window as any).__demoCursorHand = 'data:image/svg+xml;base64,' + handB64;
            (window as any).__demoCursorX = -100;
            (window as any).__demoCursorY = -100;
        },
        { arrowB64, handB64 }
    );
}

/** Switch the demo cursor between 'arrow' and 'hand'. */
async function setDemoCursorIcon(page: Page, icon: 'arrow' | 'hand'): Promise<void> {
    await page.evaluate(icon => {
        const el = document.getElementById('demo-cursor') as HTMLImageElement | null;
        if (!el) return;
        el.src =
            icon === 'hand' ? (window as any).__demoCursorHand : (window as any).__demoCursorArrow;
        // Adjust origin: arrow tip is top-left, hand grab-point is centre
        el.style.transformOrigin = icon === 'hand' ? '14px 14px' : '3px 1px';
    }, icon);
}

/** Instantly place the demo cursor at (x,y) without animation. */
async function snapCursorTo(page: Page, x: number, y: number): Promise<void> {
    await page.evaluate(
        ({ x, y }) => {
            const el = document.getElementById('demo-cursor') as HTMLElement | null;
            if (!el) return;
            // Read the transform-origin to offset so the hotspot lands on (x,y)
            const [ox, oy] = el.style.transformOrigin.split(' ').map(v => parseFloat(v) || 0);
            el.style.transition = 'none';
            el.style.left = Math.round(x - ox) + 'px';
            el.style.top = Math.round(y - oy) + 'px';
            el.style.opacity = '1';
            (window as any).__demoCursorX = x;
            (window as any).__demoCursorY = y;
        },
        { x, y }
    );
}

/**
 * Smoothly animate the demo cursor from its current position to (x,y)
 * along a slight curve. Duration scales with distance so long moves stay
 * easy to follow. Also moves the real Playwright mouse so the page
 * receives events.
 */
export async function moveCursorTo(
    page: Page,
    x: number,
    y: number,
    durationMs?: number
): Promise<void> {
    const ANIM_STEPS = 20;
    const cur = await page.evaluate(() => ({
        x: (window as any).__demoCursorX ?? -100,
        y: (window as any).__demoCursorY ?? -100,
    }));
    // If cursor hasn't been placed yet, just snap
    if (cur.x === -100 && cur.y === -100) {
        await snapCursorTo(page, x, y);
        await page.mouse.move(x, y);
        return;
    }

    // Scale duration to distance: 200ms base + 0.3ms per pixel, capped at 600ms
    const dist = Math.hypot(x - cur.x, y - cur.y);
    const duration = durationMs ?? Math.min(600, 200 + dist * 0.3);
    const stepDelay = duration / ANIM_STEPS;

    // Perpendicular offset for a subtle arc (bulge proportional to distance)
    const dx = x - cur.x;
    const dy = y - cur.y;
    const bulge = Math.min(dist * 0.12, 60); // cap so short moves stay nearly straight
    // Normal direction (rotate 90°): (-dy, dx), normalised
    const nd = dist > 0 ? bulge / dist : 0;
    const nx = -dy * nd;
    const ny = dx * nd;
    // Quadratic Bézier control point
    const cpx = (cur.x + x) / 2 + nx;
    const cpy = (cur.y + y) / 2 + ny;

    for (let i = 1; i <= ANIM_STEPS; i++) {
        const t = i / ANIM_STEPS;
        // ease-out quad on the parameter
        const e = 1 - (1 - t) * (1 - t);
        // Quadratic Bézier: B(e) = (1-e)²·P0 + 2(1-e)e·CP + e²·P1
        const inv = 1 - e;
        const cx = inv * inv * cur.x + 2 * inv * e * cpx + e * e * x;
        const cy = inv * inv * cur.y + 2 * inv * e * cpy + e * e * y;
        await snapCursorTo(page, cx, cy);
        await page.mouse.move(cx, cy);
        await wait(stepDelay);
    }
    // Ensure final position is exact
    await snapCursorTo(page, x, y);
    await page.mouse.move(x, y);
}

// ─── Drag helpers ───────────────────────────────────────────────────────────

/**
 * Smooth drag from (x1,y1) to (x2,y2) with intermediate steps.
 */
export async function drag(
    page: Page,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    opts: { steps?: number; durationMs?: number; pause?: number } = {}
): Promise<void> {
    const steps = opts.steps ?? 12;
    const duration = opts.durationMs ?? DRAG_DURATION;
    const stepDelay = duration / steps;

    // Move cursor to starting position (animated from wherever it currently is)
    await moveCursorTo(page, x1, y1);
    // Switch to hand icon for the drag
    await setDemoCursorIcon(page, 'hand');
    await wait(80);
    await page.mouse.down();
    await wait(40);

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const cx = x1 + (x2 - x1) * t;
        const cy = y1 + (y2 - y1) * t;
        await page.mouse.move(cx, cy);
        await snapCursorTo(page, cx, cy);
        await wait(stepDelay);
    }

    await wait(60);
    await page.mouse.up();
    // Switch back to arrow
    await setDemoCursorIcon(page, 'arrow');
    await wait(opts.pause ?? SHORT_PAUSE);
}

/**
 * Drag through a sequence of waypoints in a single mouse-press gesture.
 * Useful for demonstrating inference thresholds (e.g. the splitter line)
 * by advancing past the boundary, retreating, and crossing again.
 *
 * @param waypoints  Array of {x,y} positions; first is the drag start.
 * @param opts.segmentMs  Duration per segment between consecutive waypoints (default 300 ms).
 * @param opts.steps      Interpolation steps per segment (default 8).
 * @param opts.pauseMs    Extra pause injected between intermediate waypoints (default 0).
 * @param opts.onWaypoint  Async callback invoked after arriving at each intermediate waypoint
 *                         (during the pause). Receives the 0-based waypoint index.
 *                         Useful for capturing snapshots at interesting moments.
 */
export async function dragPath(
    page: Page,
    waypoints: Array<{ x: number; y: number }>,
    opts: {
        segmentMs?: number;
        steps?: number;
        pauseMs?: number;
        onWaypoint?: (waypointIndex: number) => Promise<void>;
    } = {}
): Promise<void> {
    if (waypoints.length < 2) return;
    const steps = opts.steps ?? 8;
    const segmentMs = opts.segmentMs ?? 300;
    const stepDelay = segmentMs / steps;
    const pauseMs = opts.pauseMs ?? 0;

    const [start, ...rest] = waypoints;
    await moveCursorTo(page, start.x, start.y);
    await setDemoCursorIcon(page, 'hand');
    await wait(80);
    await page.mouse.down();
    await wait(40);

    let prev = start;
    for (let wi = 0; wi < rest.length; wi++) {
        const wp = rest[wi];
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const cx = prev.x + (wp.x - prev.x) * t;
            const cy = prev.y + (wp.y - prev.y) * t;
            await page.mouse.move(cx, cy);
            await snapCursorTo(page, cx, cy);
            await wait(stepDelay);
        }
        // Pause at intermediate waypoints (not the last) to let the UI react
        if (wi < rest.length - 1) {
            if (opts.onWaypoint) await opts.onWaypoint(wi);
            if (pauseMs > 0) await wait(pauseMs);
        }
        prev = wp;
    }

    // Fire onWaypoint for the final waypoint (e.g. commit gesture) before release
    if (opts.onWaypoint && rest.length > 0) {
        await opts.onWaypoint(rest.length - 1);
    }

    await wait(60);
    await page.mouse.up();
    await setDemoCursorIcon(page, 'arrow');
    await wait(SHORT_PAUSE);
}

// ─── UI interaction helpers ─────────────────────────────────────────────────

/** Click a command button by data-cmd-id, moving the demo cursor to it first. */
export async function clickCmd(page: Page, cmdId: string): Promise<void> {
    const info = (await page.evaluate(id => {
        const btns = document.querySelectorAll<HTMLButtonElement>(`button[data-cmd-id="${id}"]`);
        // Prefer the most visible instance (largest on-screen area)
        let best: { x: number; y: number; w: number; h: number; area: number } | null = null;
        btns.forEach(btn => {
            const r = btn.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return;
            const visW = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
            const visH = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
            const area = visW * visH;
            if (!best || area > best.area) {
                best = {
                    x: r.x + r.width / 2,
                    y: r.y + r.height / 2,
                    w: r.width,
                    h: r.height,
                    area,
                };
            }
        });
        return best;
    }, cmdId)) as { x: number; y: number; w: number; h: number } | null;
    if (info) {
        await moveCursorTo(page, info.x, info.y);
        await page.mouse.click(info.x, info.y);
    }
    await wait(SHORT_PAUSE);
}

/**
 * Open the overflow ("⋯") menu for a view panel, move the demo cursor to the
 * toggle button, and click it so the hidden commands become visible.
 * Pass the data-view-panel value, e.g. "basic-front".
 * Call before clickCmd() for any button that lives in the overflow.
 * The overflow closes automatically when a command inside it is clicked.
 */
export async function openPanelOverflow(page: Page, viewPanel: string): Promise<void> {
    const info = await page.evaluate(panel => {
        const panelEl = document.querySelector(`[data-view-panel="${panel}"]`);
        if (!panelEl) return null;
        // The toggle button has aria-label="Toggle header commands"
        const toggle = panelEl.querySelector<HTMLElement>('[aria-label="Toggle header commands"]');
        if (!toggle) return null;
        const r = toggle.getBoundingClientRect();
        if (r.width < 1) return null;
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, expanded };
    }, viewPanel);
    if (info && !info.expanded) {
        await moveCursorTo(page, info.x, info.y);
        await page.mouse.click(info.x, info.y);
        await wait(200);
    }
}

// ─── Caption overlay ────────────────────────────────────────────────────────

async function injectCaptionOverlay(page: Page): Promise<void> {
    await page.addScriptTag({
        content: `
        (function() {
            var el = document.createElement('div');
            el.id = 'demo-caption';
            Object.assign(el.style, {
                position: 'fixed',
                bottom: '48px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--color-tooltip-bg)',
                color: 'var(--color-tooltip-text)',
                border: '1px solid var(--color-tooltip-border)',
                boxShadow: '0 4px 16px var(--color-shadow-primary)',
                borderRadius: '6px',
                padding: '14px 28px',
                maxWidth: '700px',
                textAlign: 'center',
                pointerEvents: 'none',
                zIndex: '10000',
                opacity: '0',
                transition: 'opacity 0.15s ease',
                lineHeight: '1.5'
            });

            var isSnapshots = ${demoMode === 'snapshots'};
            var titleEl = document.createElement('div');
            titleEl.id = 'demo-caption-title';
            Object.assign(titleEl.style, { fontSize: isSnapshots ? '42px' : '28px', fontWeight: '600' });
            el.appendChild(titleEl);

            var subEl = document.createElement('div');
            subEl.id = 'demo-caption-subtitle';
            Object.assign(subEl.style, {
                fontSize: isSnapshots ? '30px' : '20px',
                fontWeight: '400',
                opacity: '0.85',
                marginTop: isSnapshots ? '8px' : '4px'
            });
            el.appendChild(subEl);

            document.body.appendChild(el);

            window.__showCaption = function(title, subtitle) {
                titleEl.textContent = title;
                subEl.textContent = subtitle || '';
                subEl.style.display = subtitle ? '' : 'none';
                el.style.opacity = '1';
            };
            window.__hideCaption = function() {
                el.style.opacity = '0';
            };
        })();
        `,
    });
}

export async function ensureCaptionOverlay(page: Page): Promise<void> {
    const exists = await page.evaluate(`!!window.__showCaption`);
    if (!exists) {
        log('[demo] Re-injecting caption overlay…');
        await injectCaptionOverlay(page);
    }
}

export async function caption(
    page: Page,
    title: string,
    subtitle?: string,
    holdMs?: number
): Promise<void> {
    await ensureCaptionOverlay(page);
    const escapedTitle = title.replace(/'/g, "\\'");
    const escapedSub = (subtitle ?? '').replace(/'/g, "\\'");
    await page.evaluate(
        `(function() { window.__showCaption('${escapedTitle}', ${subtitle ? "'" + escapedSub + "'" : 'undefined'}); })()`
    );
    if (holdMs) await wait(holdMs);
}

export async function hideCaption(page: Page): Promise<void> {
    await page.evaluate(`(function() { window.__hideCaption(); })()`);
    await wait(200);
}

// ─── Composite drag gestures ────────────────────────────────────────────────

/**
 * Drag from (sx, sy) with a short probe, long probe, return, then short
 * commit in the indicated direction. Shows the splitter line building up.
 */
export async function dragLineDemo(
    page: Page,
    sx: number,
    sy: number,
    opts: {
        deg?: number;
        dist?: number;
        onMoment?: (label: string, durationMs?: number) => Promise<void>;
    } = {}
): Promise<void> {
    const deg = opts.deg ?? 45;
    const dist = opts.dist ?? 55;
    const rad = (deg * Math.PI) / 180;
    const dx = Math.cos(rad) * dist;
    const dy = -Math.sin(rad) * dist; // screen Y is inverted

    const shortFrac = 0.4; // short probe = 40% of dist

    const onMoment = opts.onMoment;
    const labelMap = new Map<number, { label: string; hold: boolean }>([
        [1, { label: 'short', hold: false }],
        [2, { label: 'long', hold: true }],
        [3, { label: 'back', hold: false }],
        [4, { label: 'commit', hold: true }],
    ]);
    const onWaypoint = onMoment
        ? async (wi: number) => {
              const entry = labelMap.get(wi + 1);
              if (entry) await onMoment(entry.label, entry.hold ? SNAP_HOLD : undefined);
          }
        : undefined;

    await dragPath(
        page,
        [
            { x: sx, y: sy }, // start
            { x: sx - dx * shortFrac, y: sy - dy * shortFrac }, // opposite short probe
            { x: sx - dx, y: sy - dy }, // opposite long probe
            { x: sx, y: sy }, // back to start
            { x: sx + dx * shortFrac, y: sy + dy * shortFrac }, // commit (short, forward)
        ],
        { segmentMs: 150, steps: 10, pauseMs: 150, onWaypoint }
    );
}

/**
 * Drag from (sx, sy) with double dips in 3 directions and a final commit move.
 * Demonstrates the move-inference cross helper by probing short and long
 * distances in each direction before committing the intended move.
 *
 * Dip order: startDeg+90°, startDeg+270° (opposite), startDeg+180°,
 * then final commit in startDeg direction.
 */
export async function dragCrossDemo(
    page: Page,
    sx: number,
    sy: number,
    opts: {
        smallR?: number;
        largeR?: number;
        startDeg?: number;
        onMoment?: (label: string, durationMs?: number) => Promise<void>;
    } = {}
): Promise<void> {
    const smallR = opts.smallR ?? 35;
    const largeR = opts.largeR ?? 80;
    const startDeg = opts.startDeg ?? 0;

    // Helper: point at angle and distance from (sx, sy)
    const pt = (deg: number, r: number) => {
        const rad = (deg * Math.PI) / 180;
        return { x: sx + Math.cos(rad) * r, y: sy + Math.sin(rad) * r };
    };

    // Three probe directions: +90°, +270° (opposite), +180° from start
    const probeDirs = [startDeg + 90, startDeg + 270, startDeg + 180];
    const dirLabels = ['probe-1', 'probe-2', 'probe-3'];

    // Build waypoints: start → [for each dir: short-out, long-out, back] → commit
    const waypoints: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];
    const labelMap = new Map<number, string>();

    for (let d = 0; d < probeDirs.length; d++) {
        const deg = probeDirs[d];
        labelMap.set(waypoints.length, `${dirLabels[d]}-short`);
        waypoints.push(pt(deg, smallR));
        labelMap.set(waypoints.length, `${dirLabels[d]}-long`);
        waypoints.push(pt(deg, largeR));
        waypoints.push({ x: sx, y: sy });
    }

    // Final commit move in startDeg direction
    labelMap.set(waypoints.length, 'commit');
    waypoints.push(pt(startDeg, smallR));

    const holdLabels = new Set(['commit']);
    // Also highlight the long-probe extremes (furthest reach in each direction)
    for (let d = 0; d < dirLabels.length; d++) {
        holdLabels.add(`${dirLabels[d]}-long`);
    }

    const onMoment = opts.onMoment;
    const onWaypoint = onMoment
        ? async (wi: number) => {
              const label = labelMap.get(wi + 1);
              if (label) await onMoment(label, holdLabels.has(label) ? SNAP_HOLD : undefined);
          }
        : undefined;

    await dragPath(page, waypoints, {
        segmentMs: 80,
        steps: 6,
        pauseMs: 120,
        onWaypoint,
    });
}

/**
 * Drag radially across concentric axis circles to demonstrate fretboard
 * target switching. Computes waypoints from circle geometry at runtime.
 *
 * @param startCircleSel  Selector for the starting axis circle (e.g. '#X-layer-2').
 *                        The axis is derived from the ID; all sibling circles are queried.
 * @param opts.layerPath  Layer indices to visit in order. Values in [0, cubeSize) map to
 *                        the corresponding circle's radius. Values < 0 extrapolate past the
 *                        innermost circle; values >= cubeSize extrapolate past the outermost.
 *                        Both represent the background (whole-cube) zone.
 * @param opts.dwellMs    Pause between intermediate waypoints (default 400).
 * @param opts.dipDist    If set, at each valid-layer stop a short tangential dip is inserted
 *                        (out-and-back) to show the move-inference cross changing direction.
 *                        The value is the tangential offset in pixels.
 * @param opts.onMoment   Async callback invoked at semantically interesting moments during
 *                        the drag. Receives a descriptive label (e.g. 'layer-2', 'dip-2',
 *                        'overshoot', 'settle', 'commit'). Useful for snapshots or pausing.
 * @param opts.commitDeg  Tangential direction (degrees) for the commit gesture.
 * @param opts.commitDist Distance (px) for the tangential commit gesture.
 * @param opts.panel      Panel selector prefix (default '[data-view-panel="circular"]').
 */
export async function dragFretboardDemo(
    page: Page,
    startCircleSel: string,
    opts: {
        layerPath?: number[];
        dwellMs?: number;
        dipDist?: number;
        onMoment?: (label: string, durationMs?: number) => Promise<void>;
        commitDeg?: number;
        commitDist?: number;
        panel?: string;
    } = {}
): Promise<void> {
    const CUBE_SIZE = 3;
    const panel = opts.panel ?? '[data-view-panel="circular"]';
    const layerPath = opts.layerPath ?? [2, 1, 0, 1];
    const dwellMs = opts.dwellMs ?? 400;

    // Parse axis letter from selector (e.g. '#X-layer-2' → 'X')
    const axisMatch = startCircleSel.match(/([XYZ])-layer-(\d+)/i);
    if (!axisMatch) throw new Error(`Cannot parse axis from selector: ${startCircleSel}`);
    const axisUpper = axisMatch[1].toUpperCase();
    const axisLower = axisMatch[1].toLowerCase();

    // Query all circles of this axis and get their geometry
    const circles: Array<{ layer: number; cx: number; cy: number; r: number }> = [];
    for (let layer = 0; layer < CUBE_SIZE; layer++) {
        const sel = `${panel} #${axisUpper}-layer-${layer}`;
        const box = await bounds(page, sel);
        circles.push({
            layer,
            cx: box.x + box.width / 2,
            cy: box.y + box.height / 2,
            r: box.width / 2,
        });
    }
    circles.sort((a, b) => a.r - b.r);

    // Group center (concentric circles share the same center)
    const groupCx = circles[0].cx;
    const groupCy = circles[0].cy;

    // Get the start circle's click point for radial direction
    const startLayer = Number(axisMatch[2]);
    const startLabelSel = `${panel} [data-label-id="${axisLower}-${startLayer}"]`;
    const start = await axisCircleClickPoint(page, startCircleSel, startLabelSel);

    // Radial unit vector from group center through start click point
    const rdx = start.x - groupCx;
    const rdy = start.y - groupCy;
    const rLen = Math.sqrt(rdx * rdx + rdy * rdy);
    const radialUx = rdx / rLen;
    const radialUy = rdy / rLen;

    // Tangential unit vector (perpendicular to radial, CW on screen)
    const tangentUx = -radialUy;
    const tangentUy = radialUx;

    // Inter-circle gap for extrapolation.
    // computeBiasedBoundaries already extends each outer band by ~gap, and
    // updateFretboardHighlight adds a FRETBOARD_HALF_GAP_SVG dead zone on top.
    // Overshoot must clear the full band + dead zone to reach the background,
    // so we use 1.5× gap to land well into the background zone.
    const innerR = circles[0].r;
    const outerR = circles[CUBE_SIZE - 1].r;
    const gap = CUBE_SIZE > 1 ? (outerR - innerR) / (CUBE_SIZE - 1) : 30;

    // Build radial waypoints, with optional tangential dips at each stop.
    // Track semantic labels for each waypoint (index → label) for onMoment.
    const waypoints: Array<{ x: number; y: number }> = [];
    const waypointLabels = new Map<number, string>();
    for (let i = 0; i < layerPath.length; i++) {
        const layer = layerPath[i];
        let targetR: number;
        let label: string;
        if (layer < 0) {
            // Overshoot past innermost circle — clear detection band + dead zone
            targetR = Math.max(0, innerR - gap * 1.5);
            label = 'overshoot-inner';
        } else if (layer >= CUBE_SIZE) {
            // Overshoot past outermost circle — clear detection band + dead zone
            targetR = outerR + gap * 1.5;
            label = 'overshoot-outer';
        } else {
            targetR = circles[layer].r;
            label = `layer-${layer}`;
        }
        const radialPt = {
            x: groupCx + radialUx * targetR,
            y: groupCy + radialUy * targetR,
        };
        waypointLabels.set(waypoints.length, label);
        waypoints.push(radialPt);

        // At every stop except the last (which settles before the commit gesture),
        // insert a tangential dip (out-and-back) so the viewer sees the
        // move-inference cross change direction at this radius.
        const isLast = i === layerPath.length - 1;
        if (!isLast && opts.dipDist) {
            waypointLabels.set(waypoints.length, `dip-${layer}`);
            waypoints.push({
                x: radialPt.x + tangentUx * opts.dipDist,
                y: radialPt.y + tangentUy * opts.dipDist,
            });
            // Return from dip — no separate label needed
            waypoints.push({ x: radialPt.x, y: radialPt.y });
        }
    }

    // Append commit or settle waypoint
    if (opts.commitDeg !== undefined && opts.commitDist !== undefined) {
        const last = waypoints[waypoints.length - 1];
        const commitRad = (opts.commitDeg * Math.PI) / 180;
        waypointLabels.set(waypoints.length, 'commit');
        waypoints.push({
            x: last.x + Math.cos(commitRad) * opts.commitDist,
            y: last.y + Math.sin(commitRad) * opts.commitDist,
        });
    } else {
        // Duplicate last waypoint so the settle position gets a pauseMs dwell
        // (dragPath only pauses at intermediate waypoints, not the last one)
        const last = waypoints[waypoints.length - 1];
        waypointLabels.set(waypoints.length, 'settle');
        waypoints.push({ x: last.x, y: last.y });
    }

    // Map dragPath's waypoint indices to semantic labels for onMoment.
    // dragPath's onWaypoint receives index into rest[] (waypoints[1:]),
    // so dragPath index wi corresponds to waypoints[wi + 1].
    // Labels that deserve a longer hold in snapshot output.
    // Layer stops, overshoots, commit, and settle are "absorb" moments;
    // dips and return-from-dip waypoints are transient.
    const holdLabels = new Set(['commit', 'settle', 'overshoot-inner', 'overshoot-outer']);
    for (let layer = 0; layer < CUBE_SIZE; layer++) holdLabels.add(`layer-${layer}`);

    const onMoment = opts.onMoment;
    const onWaypoint = onMoment
        ? async (wi: number) => {
              const label = waypointLabels.get(wi + 1);
              if (label) await onMoment(label, holdLabels.has(label) ? SNAP_HOLD : undefined);
          }
        : undefined;

    await dragPath(page, waypoints, {
        segmentMs: 150,
        steps: 8,
        pauseMs: dwellMs,
        onWaypoint,
    });
}

// ─── Animation capture ──────────────────────────────────────────────────────

/**
 * Default time (ms) to wait after triggering a move before the first animation
 * frame can be captured. Gives the app time to process the keypress and start
 * WAAPI animations.
 */
const DEFAULT_SETTLE_MS = 80;

/** Default Circular-view move animation duration (ms). */
const DEFAULT_ANIMATION_DURATION = 300;

export interface AnimationCapture {
    settle(waitMs?: number): Promise<void>;
    at(fraction: number, label: string, hold?: boolean): Promise<void>;
    finish(): Promise<void>;
}

/**
 * Start an animation capture session.  After triggering a move, call
 * `settle()` to let animations begin, then `at(fraction)` to freeze the
 * timeline, seek all running animations to `fraction × duration`, screenshot,
 * and unfreeze.  `finish()` unfreezes and waits for idle.
 */
export function startAnimationCapture(
    page: Page,
    durationMs = DEFAULT_ANIMATION_DURATION
): AnimationCapture {
    return {
        async settle(waitMs = DEFAULT_SETTLE_MS): Promise<void> {
            // Give the app time to process the move and start animations
            await wait(waitMs);
        },

        async at(fraction: number, label: string, hold?: boolean): Promise<void> {
            // Freeze the document timeline (playbackRate → 0)
            await cdpFreezeAnimations(page);
            // Seek every running animation to the requested fraction
            await cdpSeekAllAnimations(page, fraction * durationMs);
            await takeSnapshot(page, label, hold ? SNAP_HOLD : undefined);
            // Unfreeze — animations resume from their seeked positions
            await cdpUnfreezeAnimations();
        },

        async finish(): Promise<void> {
            // Make sure timeline is running
            await cdpUnfreezeAnimations();
            // Wait for all animations to finish
            await page
                .waitForFunction(() => document.getAnimations().length === 0, { timeout: 2000 })
                .catch(() => {});
        },
    };
}

export interface CaptureAtMomentOptions {
    move: string;
    moments: Array<{ at: number; label: string; hold?: boolean }>;
    durationMs?: number;
}

export async function captureAtMoment(page: Page, opts: CaptureAtMomentOptions): Promise<void> {
    // In video mode just press the key and let the animation play naturally
    if (demoMode === 'video') {
        await page.keyboard.press(opts.move);
        return;
    }
    const capture = startAnimationCapture(page, opts.durationMs);
    await page.keyboard.press(opts.move);
    await capture.settle();
    const sorted = [...opts.moments].sort((a, b) => a.at - b.at);
    for (const m of sorted) {
        await capture.at(m.at, m.label, m.hold);
    }
    await capture.finish();
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

/** Move the demo cursor to (x,y) then click, or click at current position if omitted. */
export async function demoClick(page: Page, x?: number, y?: number): Promise<void> {
    if (x !== undefined && y !== undefined) {
        await moveCursorTo(page, x, y);
        await page.mouse.click(x, y);
    } else {
        await page.mouse.down();
        await page.mouse.up();
    }
}

/** Return the selector for a circular-view sticker by face and position index. */
export function circularSticker(face: string, pos: number): string {
    return `[data-view-panel="circular"] circle[data-face="${face}"][data-pos="${pos}"]`;
}

/**
 * Compute a click point on an axis circle, offset ~45° away from its label.
 * Returns the circle centre, radius, the computed angle, and the (x,y) click target.
 */
export async function axisCircleClickPoint(
    page: Page,
    circleSel: string,
    labelSel: string
): Promise<{ cx: number; cy: number; r: number; angle: number; x: number; y: number }> {
    const circle = await bounds(page, circleSel);
    const label = await bounds(page, labelSel);
    const cx = circle.x + circle.width / 2;
    const cy = circle.y + circle.height / 2;
    const r = circle.width / 2;
    const lblX = label.x + label.width / 2;
    const lblY = label.y + label.height / 2;
    const angle = Math.atan2(lblY - cy, lblX - cx) - Math.PI / 4;
    return { cx, cy, r, angle, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** Compute a perpendicular clockwise drag endpoint from a point on a circle. */
export function cwDragEndpoint(
    x: number,
    y: number,
    angle: number,
    offset: number
): { x: number; y: number } {
    return { x: x - Math.sin(angle) * offset, y: y + Math.cos(angle) * offset };
}

/**
 * Compute geometry for a face ellipse: centre, radii, a click point at a given
 * angle/fraction, and the halo drag target (top of the outer ring).
 */
export async function ellipseGeometry(
    page: Page,
    selector: string,
    opts: { angleDeg?: number; fraction?: number; haloPadding?: number } = {}
): Promise<{
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    clickX: number;
    clickY: number;
    haloX: number;
    haloY: number;
}> {
    const box = await bounds(page, selector);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const rx = box.width / 2;
    const ry = box.height / 2;
    const angle = ((opts.angleDeg ?? 45) * Math.PI) / 180;
    const frac = opts.fraction ?? 0.8;
    const haloR = Math.max(box.width, box.height) / 2 + (opts.haloPadding ?? 15);
    return {
        cx,
        cy,
        rx,
        ry,
        clickX: cx + rx * frac * Math.cos(angle),
        clickY: cy - ry * frac * Math.sin(angle),
        haloX: cx,
        haloY: cy - haloR,
    };
}

/** Ensure the controls sidebar menu is open or closed. */
export async function ensureMenu(page: Page, expanded: boolean): Promise<void> {
    const info = (await page.evaluate(`(function() {
        var btn = document.querySelector('.menu-toggle');
        if (!btn) return null;
        var r = btn.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, expanded: btn.getAttribute('aria-expanded') === 'true' };
    })()`)) as { x: number; y: number; expanded: boolean } | null;
    if (info && info.expanded !== expanded) {
        await moveCursorTo(page, info.x, info.y);
        await page.mouse.click(info.x, info.y);
        await wait(SHORT_PAUSE);
    }
}
