/**
 * Playwright demo-video recorder for the Rubik's Cube Simulator.
 *
 * Prerequisites:
 *   1. Dev server running:  npm run dev          (http://localhost:5173)
 *   2. Playwright installed: npm install -D @playwright/test
 *   3. Browser binary:       npx playwright install chromium
 *
 * Run:
 *   npm run demo
 *
 * Output:
 *   scripts/demo-video/output/demo.webm
 *
 * Convert to MP4 (optional, requires ffmpeg):
 *   ffmpeg -i scripts/demo-video/output/demo.webm -c:v libx264 -pix_fmt yuv420p scripts/demo-video/output/demo.mp4
 */
import {
    existsSync,
    mkdirSync,
    readdirSync,
    renameSync,
    rmSync,
    unlinkSync,
    writeFileSync,
} from 'fs';
import { join } from 'path';

import type { CDPSession, Page } from 'playwright';
import { chromium } from 'playwright';
import sharp from 'sharp';

import {
    act1_opening,
    act2_circularView,
    act3_basicView,
    act4_flatView,
    act5_finale,
} from './acts';
import { shouldRunAct } from './demo-filter';

// ─── Timing constants (ms) ─────────────────────────────────────────────────
export const MOVE_PAUSE = 700; // pause after a single move
export const SHORT_PAUSE = 400;
export const CAPTION_HOLD = 2000; // how long a standalone caption stays visible
export const ACT_GAP = 600; // gap between major acts
export const DRAG_DURATION = 250; // ms for a short drag gesture
export const LONG_DRAG_DURATION = 400; // ms for a long drag gesture
const APP_SETTLE_DELAY = 1000;
const RECORDING_VIEWPORT = { width: 1920, height: 1080 };
const WINDOW_CHROME_HEIGHT = 120;

const OUTPUT_DIR = join(import.meta.dirname, 'output');
const SNAPSHOTS_DIR = join(OUTPUT_DIR, 'snapshots');
const DEV_URL = 'http://localhost:5173';

// ─── Snapshot constants ────────────────────────────────────────────────────
const SNAPSHOT_FRAME_DELAY = 2000; // ms each frame is shown in the animated output
const SNAPSHOT_SIZE = { width: 1200, height: 630 }; // OG image dimensions
const CLEANUP_SNAPSHOTS = true; // delete snapshots/ dir after assembly

// ─── Helpers ────────────────────────────────────────────────────────────────

const _t0 = performance.now();
const _snapshots: string[] = [];
let _snapshotIndex = 0;
let _cdpSession: CDPSession | null = null;

/** Format elapsed time as [mm:ss.fff]. */
function ts(): string {
    const elapsed = performance.now() - _t0;
    const totalSec = Math.floor(elapsed / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    const fff = String(Math.floor(elapsed % 1000)).padStart(3, '0');
    return `[${mm}:${ss}.${fff}]`;
}

/** Timestamped console.log. */
export function log(...args: unknown[]): void {
    console.log(ts(), ...args);
}

/** Log the start of a major act. */
export function logAct(label: string): void {
    console.log(`${ts()} ┌── ${label} ${'─'.repeat(Math.max(0, 50 - label.length))}`);
}

/** Log a part (feature showcase) within the current act. */
export function logPart(label: string): void {
    console.log(`${ts()} │ ▸ ${label}`);
}

export async function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Capture a screenshot of the current page state and save it as a numbered PNG.
 * Uses CDP (Chrome DevTools Protocol) to avoid the visual flicker that
 * Playwright's page.screenshot() causes in headed mode during video recording.
 * Reuses a single CDP session for the lifetime of the recording.
 */
export async function takeSnapshot(page: Page, label: string): Promise<void> {
    if (!existsSync(SNAPSHOTS_DIR)) {
        mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
    const padded = String(_snapshotIndex++).padStart(3, '0');
    const safeName = label.replace(/[^a-zA-Z0-9._-]/g, '-');
    const filePath = join(SNAPSHOTS_DIR, `${padded}-${safeName}.png`);

    if (!_cdpSession) {
        _cdpSession = await page.context().newCDPSession(page);
    }
    const { data } = await _cdpSession.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(filePath, Buffer.from(data, 'base64'));

    _snapshots.push(filePath);
    log(`Snapshot #${padded}: ${label}`);
}

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
 */
export async function dragPath(
    page: Page,
    waypoints: Array<{ x: number; y: number }>,
    opts: { segmentMs?: number; steps?: number; pauseMs?: number } = {}
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
        if (pauseMs > 0 && wi < rest.length - 1) {
            await wait(pauseMs);
        }
        prev = wp;
    }

    await wait(60);
    await page.mouse.up();
    await setDemoCursorIcon(page, 'arrow');
    await wait(SHORT_PAUSE);
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

            var titleEl = document.createElement('div');
            titleEl.id = 'demo-caption-title';
            Object.assign(titleEl.style, { fontSize: '28px', fontWeight: '600' });
            el.appendChild(titleEl);

            var subEl = document.createElement('div');
            subEl.id = 'demo-caption-subtitle';
            Object.assign(subEl.style, {
                fontSize: '20px',
                fontWeight: '400',
                opacity: '0.85',
                marginTop: '4px'
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

// ─── Black-screen curtain ───────────────────────────────────────────────────

/**
 * Inject a full-screen black overlay that hides the raw app during CSS loading
 * and layout setup. The video starts with a clean black frame.
 */
async function injectBlackCurtain(page: Page): Promise<void> {
    await page.addInitScript(`
        (function() {
            function ensureCurtain() {
                if (document.getElementById('demo-curtain')) return;
                if (!document.body) {
                    requestAnimationFrame(ensureCurtain);
                    return;
                }

                document.documentElement.style.background = '#000';
                document.body.style.background = '#000';

                var curtain = document.createElement('div');
                curtain.id = 'demo-curtain';
                Object.assign(curtain.style, {
                    position: 'fixed',
                    inset: '0',
                    background: '#000',
                    zIndex: '99999',
                    transition: 'opacity 0.5s ease',
                    opacity: '1',
                    pointerEvents: 'none'
                });
                document.body.appendChild(curtain);
            }

            ensureCurtain();
        })();
    `);
}

/** Fade out the black curtain to reveal the fully-initialized app. */
async function revealApp(page: Page): Promise<void> {
    await page.evaluate(`(function() {
        var curtain = document.getElementById('demo-curtain');
        if (curtain) {
            curtain.style.opacity = '0';
            setTimeout(function() { curtain.remove(); }, 600);
        }

        document.documentElement.style.background = '';
        if (document.body) {
            document.body.style.background = '';
        }
    })()`);
    await wait(700);
}

// ─── Layout & initialization ────────────────────────────────────────────────

/**
 * Collapse sidebar, reposition panels for a cinematic layout:
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │  Title bar (full width)                                      │
 *   ├─────┬──────────┬────────────────────────────┬────────────────┤
 *   │     │  Basic   │                            │                │
 *   │  M  │  Front   │                            │     Flat       │
 *   │  o  │  300×400 │       Circular             │     300×400    │
 *   │  v  ├──────────┤       ~750×750             │    (centred)   │
 *   │  e  │  Basic   │      (centred)             │                │
 *   │  s  │  Back    │                            │                │
 *   │     │  300×400 │                            │                │
 *   │ 130 │          │                            │                │
 *   ├─────┴──────────┴────────────────────────────┴────────────────┤
 *   │  ░░░░░░░░░░░░░░ caption reserve (~120px) ░░░░░░░░░░░░░░░░░░ │
 *   └─────────────────────────────────────────────────────────────────┘
 */
async function setupDemoLayout(page: Page): Promise<void> {
    // Clear any saved panel positions from localStorage so defaults don't fight us
    await page.evaluate(`(function() {
        ['moves', 'circular', 'basic-front', 'basic-back', 'flat'].forEach(function(v) {
            localStorage.removeItem('view-panel-' + v);
        });
    })()`);

    // Collapse the sidebar properly using the app's own CSS classes
    // AND make the layout fill the viewport so .visualizations gets real height.
    await page.addScriptTag({
        content: `(function() {
            document.documentElement.style.height = '100%';
            document.documentElement.style.overflow = 'hidden';
            if (document.body) {
                document.body.style.height = '100%';
                document.body.style.margin = '0';
                document.body.style.overflow = 'hidden';
            }
            var controls = document.querySelector('.controls');
            if (controls) controls.classList.add('controls--desktop-collapsed');
            var container = document.querySelector('.container');
            if (container) {
                container.classList.add('container--controls-collapsed');
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.height = '100vh';
                container.style.minHeight = '100vh';
                container.style.overflow = 'hidden';
            }
            // .main-content is a flex-row wrapper — it needs to fill remaining height
            var mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.style.flex = '1';
                mainContent.style.minHeight = '0';
                mainContent.style.overflow = 'hidden';
            }
            // .visualizations needs min-height so flex: 1 works inside main-content (flex-row)
            var viz = document.getElementById('visualizations');
            if (viz) {
                viz.style.flex = '1';
                viz.style.alignSelf = 'stretch';
                viz.style.minHeight = '0';
                viz.style.overflow = 'hidden';
                viz.style.position = 'relative';
            }
        })();`,
    });
    await wait(300); // wait for CSS transition (240ms) + reflow

    // Position all 5 panels for the configured recording viewport.
    // Reserve bottom strip for caption overlay (caption bottom:48 + ~80px height + spacer)
    // Layout: Moves (unchanged) | Basic Front/Back left of Circular | Circular centred | Flat right of Circular
    await page.addScriptTag({
        content: `
        (function() {
            var vizEl = document.getElementById('visualizations');
            var vizRect = vizEl ? vizEl.getBoundingClientRect() : null;
            var availW = vizRect ? Math.round(vizRect.width) : 1880;
            var totalH = vizRect ? Math.round(vizRect.height) : 934;

            // Reserve space at bottom for narration caption + spacer
            var captionReserve = 120; // ~80px caption + 48px bottom offset - some overlap with viz padding
            var availH = totalH - captionReserve;

            var gap = 10;
            var inset = 2;

            // Keep the circular view centered, fit equal-width left panels
            // (Moves + Basic), and let the Flat view fill the remaining right space.
            var baseFlatW = 300;
            var circSize = Math.min(availH - inset * 2, 750);

            // Circular: centered in the visualization area
            var circX = inset + Math.floor((availW - inset * 2 - circSize) / 2);
            var circY = inset + Math.max(0, Math.floor((availH - inset * 2 - circSize) / 2));

            // Left side: Moves and Basic panels share the same width and keep the same gap.
            var basicW = Math.floor((circX - inset - gap * 2) / 2);
            var movesW = basicW;
            var movesH = availH;
            var basicH = Math.floor((availH - gap) / 2);

            // Basic: keep size, align to the circular view's left edge with the same gap
            var basicX = circX - gap - basicW;
            var movesX = basicX - gap - movesW;

            // Flat: fill the remaining width to the right and scale height proportionally.
            var flatX = circX + circSize + gap;
            var flatW = availW - inset - flatX;
            var flatHeaderH = 48;
            var flatH = Math.min(
                availH - inset * 2,
                Math.round(flatW * 0.75) + flatHeaderH
            );
            var flatY = inset + Math.floor((availH - inset * 2 - flatH) / 2);

            var layout = [
                ['moves',       movesX, inset,              movesW, movesH - inset * 2],
                ['basic-front', basicX, inset,              basicW, basicH],
                ['basic-back',  basicX, inset + basicH + gap, basicW, basicH],
                ['circular',    circX,  circY,              circSize, circSize],
                ['flat',        flatX,  flatY,              flatW, flatH]
            ];

            layout.forEach(function(item) {
                var viewType = item[0];
                var x = item[1], y = item[2], w = item[3], h = item[4];
                var el = document.querySelector('[data-view-panel="' + viewType + '"]');
                if (!el) {
                    console.warn('[demo-layout] NOT FOUND:', viewType);
                    return;
                }
                el.style.cssText =
                    'position: absolute !important;' +
                    'left: ' + x + 'px !important;' +
                    'top: ' + y + 'px !important;' +
                    'width: ' + w + 'px !important;' +
                    'height: ' + h + 'px !important;' +
                    'min-width: ' + w + 'px !important;' +
                    'max-width: ' + w + 'px !important;' +
                    'min-height: ' + h + 'px !important;' +
                    'max-height: ' + h + 'px !important;' +
                    'box-sizing: border-box !important;' +
                    'z-index: ' + (layout.indexOf(item) + 10) + ' !important;';
                console.log('[demo-layout]', viewType, x, y, w, h);
            });

            window.dispatchEvent(new Event('resize'));
        })();
        `,
    });

    await wait(300);
}

export async function reapplyDemoLayout(page: Page): Promise<void> {
    await setupDemoLayout(page);
}

/** Disable ghost hints (defaults ON) so we can showcase toggling them. */
async function disableDefaultGhosts(page: Page): Promise<void> {
    await page.addScriptTag({
        content: `(function() {
            ['circular-view.ghost-hints', 'flat.ghost-hints'].forEach(function(id) {
                var btn = document.querySelector('button[data-cmd-id="' + id + '"]');
                if (btn && btn.getAttribute('aria-pressed') === 'true') btn.click();
            });
        })();`,
    });
    await wait(300);
}

// ─── Snapshot assembly ──────────────────────────────────────────────────────

/**
 * Assemble all captured snapshots into an animated GIF and APNG.
 * Each frame is held for SNAPSHOT_FRAME_DELAY ms.
 *
 * Sharp's animation support works by stacking all frames vertically into a
 * single tall image, then setting `pageHeight` so sharp knows where each
 * frame boundary is.
 */
async function assembleSnapshots(): Promise<void> {
    if (_snapshots.length === 0) {
        log('No snapshots captured — skipping assembly.');
        return;
    }
    log(`Assembling ${_snapshots.length} snapshots…`);

    const { width, height } = SNAPSHOT_SIZE;

    // Read all frames as raw RGBA buffers
    const frames: Buffer[] = [];
    for (const snap of _snapshots) {
        const buf = await sharp(snap).resize(width, height).ensureAlpha().raw().toBuffer();
        frames.push(buf);
    }

    // Stack frames vertically into a single buffer
    const stackedHeight = height * frames.length;
    const stackedBuf = Buffer.alloc(width * stackedHeight * 4);
    for (let i = 0; i < frames.length; i++) {
        frames[i].copy(stackedBuf, i * width * height * 4);
    }

    const delays = Array(frames.length).fill(SNAPSHOT_FRAME_DELAY);
    const rawOpts = {
        raw: { width, height: stackedHeight, channels: 4 as const, pageHeight: height },
    };

    // ── Animated GIF ──
    const gifPath = join(OUTPUT_DIR, 'demo-snapshots.gif');
    await sharp(stackedBuf, rawOpts).gif({ loop: 0, delay: delays }).toFile(gifPath);
    log(`GIF saved: ${gifPath}`);

    // ── Animated APNG ──
    const apngPath = join(OUTPUT_DIR, 'demo-snapshots.apng');
    await sharp(stackedBuf, rawOpts)
        .png({ loop: 0, delay: delays } as any)
        .toFile(apngPath);
    log(`APNG saved: ${apngPath}`);

    // ── Cleanup ──
    if (CLEANUP_SNAPSHOTS) {
        rmSync(SNAPSHOTS_DIR, { recursive: true, force: true });
        log('Snapshots directory cleaned up.');
    }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    if (!existsSync(OUTPUT_DIR)) {
        mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    // Clean previous snapshots
    if (existsSync(SNAPSHOTS_DIR)) {
        rmSync(SNAPSHOTS_DIR, { recursive: true, force: true });
    }

    log('Launching browser…');
    const browser = await chromium.launch({
        headless: false,
        args: [
            `--window-size=${RECORDING_VIEWPORT.width},${RECORDING_VIEWPORT.height + WINDOW_CHROME_HEIGHT}`,
            '--window-position=0,0',
        ],
    });

    const context = await browser.newContext({
        viewport: RECORDING_VIEWPORT,
        colorScheme: 'dark',
        recordVideo: {
            dir: OUTPUT_DIR,
            size: RECORDING_VIEWPORT,
        },
    });

    const page = await context.newPage();

    try {
        // Install curtain before the app loads so recording never shows startup paint/CSS.
        await injectBlackCurtain(page);

        // ── Phase 1: Load behind black curtain ──
        log('Navigating to dev server…');
        await page.goto(DEV_URL, { waitUntil: 'networkidle' });

        // Ensure dark theme
        await page.evaluate(`(function() {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.documentElement.setAttribute('data-theme-effective', 'dark');
        })()`);

        // ── Phase 2: Layout + setup behind curtain ──
        log('Setting up layout…');
        await setupDemoLayout(page);
        await disableDefaultGhosts(page);
        await injectCaptionOverlay(page);
        await injectDemoCursor(page);
        log('Letting app settle before reveal…');
        await wait(APP_SETTLE_DELAY);

        // ── Phase 3: Reveal and record ──
        log('Recording demo…');
        await revealApp(page);

        if (shouldRunAct(1)) await act1_opening(page);
        if (shouldRunAct(2)) await act2_circularView(page);
        if (shouldRunAct(3)) await act3_basicView(page);
        if (shouldRunAct(4)) await act4_flatView(page);
        if (shouldRunAct(5)) await act5_finale(page);

        log('Demo complete. Saving video…');
    } catch (err) {
        console.error('Error during recording:', err);
    } finally {
        // Detach CDP session before closing the page
        if (_cdpSession) {
            await _cdpSession.detach().catch(() => {});
            _cdpSession = null;
        }
        await page.close();
        await context.close();
        await browser.close();
    }

    // Wait briefly for the browser to fully flush the video file
    await wait(1000);

    // Rename Playwright's random video filename to demo.webm (with retry for EBUSY)
    const files = readdirSync(OUTPUT_DIR);
    const videoFile = files.find(f => f.endsWith('.webm') && f !== 'demo.webm');
    if (videoFile) {
        const src = join(OUTPUT_DIR, videoFile);
        const dest = join(OUTPUT_DIR, 'demo.webm');
        if (existsSync(dest)) unlinkSync(dest);
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                renameSync(src, dest);
                break;
            } catch (e: any) {
                if (e.code === 'EBUSY' && attempt < 4) {
                    log(`Video file busy, retrying in 1s… (${attempt + 1}/5)`);
                    await wait(1000);
                } else {
                    throw e;
                }
            }
        }
        log(`Video saved: ${dest}`);
    } else {
        log(`Video files in ${OUTPUT_DIR}:`, files);
    }

    // Assemble snapshots into animated GIF + APNG
    await assembleSnapshots();
}

main().catch(console.error);
