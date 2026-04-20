/**
 * Playwright demo-video recorder for the Rubik's Cube Simulator.
 *
 * Prerequisites:
 *   1. Dev server running:   npm run dev        # @ http://localhost:5173
 *   2. Playwright installed: npm install -D @playwright/test
 *   3. Browser binary:       npx playwright install chromium
 *
 * Run:
 *   npm run demo                  # full (video + snapshots + assemble)
 *   npm run demo:video            # video only (no snapshots)
 *   npm run demo:snapshots        # snapshots only (no video, no assemble)
 *   npm run demo:assemble         # assemble existing snapshots into gif/apng
 *   npm run demo -- --mode video  # same via explicit flag
 *
 * Output:
 *   scripts/demo-video/output/demo.webm
 *
 * Convert to MP4 (optional, requires ffmpeg):
 *   ffmpeg -i scripts/demo-video/output/demo.webm -c:v libx264 -pix_fmt yuv420p scripts/demo-video/output/demo.mp4
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, unlinkSync } from 'fs';
import { writeFile } from 'fs/promises';
import { basename, join } from 'path';

import type { CDPSession, Page } from 'playwright';
import { chromium } from 'playwright';
import sharp from 'sharp';

import { DEMO_ACTS } from './acts';
import { demoMode, shouldRunAct } from './demo-filter';
import { ensureCaptionOverlay, injectDemoCursor } from './demo-helpers';

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
const SNAPSHOT_FRAME_DELAY = 100; // ms default per-frame duration in the animated output
const SNAPSHOT_FIRST_FRAME_DELAY = 1000; // ms to hold the first frame
const SNAPSHOT_LAST_FRAME_DELAY = 2000; // ms to hold the last frame
export const SNAP_CAPTION = 400; // ms for frames where the viewer reads caption text
export const SNAP_HOLD = 250; // ms for hold/settled/after frames where the viewer absorbs a result
const SNAPSHOT_SIZE = { width: 1200, height: 630 }; // OG image dimensions

// ─── Logging ────────────────────────────────────────────────────────────────

/** Timestamp (ms) when the script process started — used for absolute log timestamps. */
const _scriptStartMs = performance.now();

/** Timestamp (ms) of the current part's start — reset by each `startSnapshotSchedule`. */
let _partStartMs = _scriptStartMs;

/** Format a millisecond delta as [mm:ss.fff]. */
function fmtMs(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    const fff = String(Math.floor(ms % 1000)).padStart(3, '0');
    return `[${mm}:${ss}.${fff}]`;
}

/** Absolute timestamp (since script start). */
function ts(): string {
    return fmtMs(performance.now() - _scriptStartMs);
}

/** Absolute + relative (since current part start) timestamp pair. */
function tsRel(): string {
    const now = performance.now();
    return `${fmtMs(now - _scriptStartMs)} ${fmtMs(now - _partStartMs)}`;
}

/** Reset the relative timer (called at the start of each snapshot schedule). */
export function resetDemoTimer(): void {
    _partStartMs = performance.now();
}

/** Timestamped console.log. */
export function log(...args: unknown[]): void {
    console.log(ts(), ...args);
}

/** Log the start of a major act. */
export function logAct(label: string): void {
    console.log(`${tsRel()} ┌── ${label} ${'─'.repeat(Math.max(0, 50 - label.length))}`);
}

/** Log a part (feature showcase) within the current act. */
export function logPart(label: string): void {
    console.log(`${tsRel()} │ ▸ ${label}`);
}

export async function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── CDP session ────────────────────────────────────────────────────────────

const _snapshots: string[] = [];
let _snapshotIndex = 0;
let _cdpSession: CDPSession | null = null;
const _pendingWrites: Promise<void>[] = [];

async function ensureCdpSession(page: Page): Promise<CDPSession> {
    if (!_cdpSession) {
        _cdpSession = await page.context().newCDPSession(page);
    }
    return _cdpSession;
}

// ─── CDP Animation domain ───────────────────────────────────────────────────

export async function enableAnimationDomain(page: Page): Promise<void> {
    if (demoMode === 'video') return;
    const session = await ensureCdpSession(page);
    await session.send('Animation.enable');
    log('CDP Animation domain enabled');
}

export async function disableAnimationDomain(): Promise<void> {
    if (_cdpSession) {
        await _cdpSession.send('Animation.disable').catch(() => {});
    }
}

export async function cdpFreezeAnimations(page: Page): Promise<void> {
    if (demoMode === 'video' || !_cdpSession) return;
    await _cdpSession.send('Animation.setPlaybackRate', { playbackRate: 0 });
    // Let the compositor render the frozen frame
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => r())));
}

export async function cdpUnfreezeAnimations(): Promise<void> {
    if (demoMode === 'video' || !_cdpSession) return;
    await _cdpSession.send('Animation.setPlaybackRate', { playbackRate: 1 });
}

export async function cdpSeekAllAnimations(page: Page, timeMs: number): Promise<void> {
    if (demoMode === 'video') return;
    await page.evaluate(t => {
        for (const a of document.getAnimations()) {
            a.currentTime = t;
        }
    }, timeMs);
    // Let the compositor render the seeked state
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => r())));
}

// ─── Animation idle detection ───────────────────────────────────────────────

export async function awaitAnimationIdle(page: Page, timeoutMs = 2000): Promise<void> {
    if (demoMode === 'video') return;
    try {
        // Check for running animations only — CSS animations with fill:forwards
        // persist in getAnimations() after completing but are not actually active.
        await page.waitForFunction(
            () => document.getAnimations().every(a => a.playState !== 'running'),
            undefined,
            { timeout: timeoutMs }
        );
    } catch {
        log('⚠ awaitAnimationIdle timed out — continuing');
    }
}

// ─── Snapshot system ────────────────────────────────────────────────────────

/**
 * Capture a screenshot of the current page state and save it as a numbered PNG.
 * Uses CDP (Chrome DevTools Protocol) to avoid the visual flicker that
 * Playwright's page.screenshot() causes in headed mode during video recording.
 * Reuses a single CDP session for the lifetime of the recording.
 *
 * The CDP capture is awaited (fast, ~20-50ms) but the file write is deferred
 * to a background promise so it doesn't block choreography timing.
 * Call `flushSnapshotWrites()` before assembly to ensure all files are written.
 */
export async function takeSnapshot(page: Page, label: string, durationMs?: number): Promise<void> {
    if (demoMode === 'video') return;
    if (!existsSync(SNAPSHOTS_DIR)) {
        mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
    const padded = String(_snapshotIndex++).padStart(3, '0');
    const safeName = label.replace(/[^a-zA-Z0-9._-]/g, '-');
    const dur = durationMs ?? _currentSnapshotDuration ?? SNAPSHOT_FRAME_DELAY;
    const filePath = join(SNAPSHOTS_DIR, `${padded}-${safeName}_${dur}ms.png`);

    const session = await ensureCdpSession(page);
    const { data } = await session.send('Page.captureScreenshot', { format: 'png' });

    // Defer file write so it doesn't block choreography
    const buf = Buffer.from(data, 'base64');
    _pendingWrites.push(writeFile(filePath, buf));

    _snapshots.push(filePath);
    console.log(`${tsRel()} │   📸 #${padded} ${label}`);
}

/** Flush all pending snapshot file writes. */
async function flushSnapshotWrites(): Promise<void> {
    if (_pendingWrites.length > 0) {
        await Promise.all(_pendingWrites);
        _pendingWrites.length = 0;
        log(`Flushed ${_snapshots.length} snapshot writes.`);
    }
}

// ─── Scheduled snapshots ────────────────────────────────────────────────────

/**
 * A snapshot to be taken at a specific time offset from the start of a part.
 * @example { offsetMs: 800, label: 'mid-drag' }
 */
export interface ScheduledSnapshot {
    offsetMs: number;
    label: string;
    /** Per-frame display duration in ms. Encoded into the filename for assembly. */
    durationMs?: number;
}

let _currentSnapshotDuration: number | undefined;
let _schedulePromise: Promise<void> | null = null;

/**
 * Start a background snapshot schedule. Snapshots are captured via CDP at the
 * specified offsets (ms from now) without blocking the main choreography.
 * Call `awaitSnapshotSchedule()` at the end of the part to ensure all captures
 * complete before proceeding.
 *
 * @example
 *   startSnapshotSchedule(page, 'part2.1', [
 *       { offsetMs: 0,    label: 'caption' },
 *       { offsetMs: 800,  label: 'mid-drag' },
 *       { offsetMs: 1400, label: 'after-drag' },
 *   ]);
 *   // … run actions …
 *   await awaitSnapshotSchedule();
 */
export function startSnapshotSchedule(
    page: Page,
    partId: string,
    schedule: ScheduledSnapshot[]
): void {
    if (demoMode === 'video' || schedule.length === 0) return;

    resetDemoTimer();
    const t0 = performance.now();
    const sorted = [...schedule].sort((a, b) => a.offsetMs - b.offsetMs);

    let cancelled = false;
    _cancelSchedule = () => {
        cancelled = true;
    };

    _schedulePromise = (async () => {
        for (const snap of sorted) {
            if (cancelled) break;
            const elapsed = performance.now() - t0;
            const remaining = snap.offsetMs - elapsed;
            if (remaining > 0) await wait(remaining);
            if (cancelled) break;
            try {
                _currentSnapshotDuration = snap.durationMs;
                await takeSnapshot(page, `${partId}-${snap.label}`);
                _currentSnapshotDuration = undefined;
            } catch (err: any) {
                // Page/browser closed — stop silently
                if (/closed|disposed|destroyed/i.test(err?.message ?? '')) break;
                throw err;
            }
        }
    })();
}

let _cancelSchedule: (() => void) | null = null;

/** Cancel any running snapshot schedule (call before closing the browser). */
export function cancelSnapshotSchedule(): void {
    if (_cancelSchedule) {
        _cancelSchedule();
        _cancelSchedule = null;
    }
    _schedulePromise = null;
}

/** Wait for any running snapshot schedule to finish. */
export async function awaitSnapshotSchedule(): Promise<void> {
    if (_schedulePromise) {
        await _schedulePromise;
        _schedulePromise = null;
        _cancelSchedule = null;
    }
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
    // In assemble mode, discover snapshots from disk
    let snapshotPaths = _snapshots;
    if (snapshotPaths.length === 0 && existsSync(SNAPSHOTS_DIR)) {
        snapshotPaths = readdirSync(SNAPSHOTS_DIR)
            .filter(f => f.endsWith('.png'))
            .sort()
            .map(f => join(SNAPSHOTS_DIR, f));
    }
    if (snapshotPaths.length === 0) {
        log('No snapshots found — skipping assembly.');
        return;
    }
    log(`Assembling ${snapshotPaths.length} snapshots…`);

    const { width, height } = SNAPSHOT_SIZE;

    // Read all frames as raw RGBA buffers (parallel, bounded concurrency)
    const t0 = performance.now();
    const CONCURRENCY = 8;
    const frames: Buffer[] = new Array(snapshotPaths.length);
    for (let start = 0; start < snapshotPaths.length; start += CONCURRENCY) {
        const batch = snapshotPaths.slice(start, start + CONCURRENCY);
        const results = await Promise.all(
            batch.map(snap => sharp(snap).resize(width, height).ensureAlpha().raw().toBuffer())
        );
        for (let j = 0; j < results.length; j++) {
            frames[start + j] = results[j];
        }
    }
    log(`  Frames decoded in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

    // Stack frames vertically into a single buffer
    const t1 = performance.now();
    const stackedHeight = height * frames.length;
    const stackedBuf = Buffer.alloc(width * stackedHeight * 4);
    for (let i = 0; i < frames.length; i++) {
        frames[i].copy(stackedBuf, i * width * height * 4);
    }
    log(`  Frames stacked in ${((performance.now() - t1) / 1000).toFixed(1)}s`);

    const delays = snapshotPaths.map(p => {
        const m = basename(p).match(/_(\d+)ms\.png$/);
        return m ? Number(m[1]) : SNAPSHOT_FRAME_DELAY;
    });
    if (delays.length > 0) delays[0] = Math.max(delays[0], SNAPSHOT_FIRST_FRAME_DELAY);
    if (delays.length > 1)
        delays[delays.length - 1] = Math.max(delays[delays.length - 1], SNAPSHOT_LAST_FRAME_DELAY);
    const rawOpts = {
        raw: { width, height: stackedHeight, channels: 4 as const, pageHeight: height },
    };

    // ── Animated GIF + APNG (encode in parallel) ──
    const t2 = performance.now();
    const gifPath = join(OUTPUT_DIR, 'demo-snapshots.gif');
    const apngPath = join(OUTPUT_DIR, 'demo-snapshots.apng');
    await Promise.all([
        sharp(stackedBuf, rawOpts).gif({ loop: 0, delay: delays }).toFile(gifPath),
        sharp(stackedBuf, rawOpts)
            .png({ loop: 0, delay: delays } as any)
            .toFile(apngPath),
    ]);
    log(`  Encoded GIF + APNG in ${((performance.now() - t2) / 1000).toFixed(1)}s`);
    log(`GIF saved: ${gifPath}`);
    log(`APNG saved: ${apngPath}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    if (!existsSync(OUTPUT_DIR)) {
        mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Assemble-only mode: just assemble existing snapshots and exit
    if (demoMode === 'assemble') {
        await assembleSnapshots();
        return;
    }

    // Clean previous snapshots before a new recording run
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

    const contextOptions: any = {
        viewport: RECORDING_VIEWPORT,
        colorScheme: 'dark',
    };
    if (demoMode === 'full' || demoMode === 'video') {
        contextOptions.recordVideo = {
            dir: OUTPUT_DIR,
            size: RECORDING_VIEWPORT,
        };
    }

    const context = await browser.newContext(contextOptions);

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
        await ensureCaptionOverlay(page);
        await injectDemoCursor(page);
        log('Letting app settle before reveal…');
        await wait(APP_SETTLE_DELAY);

        // ── Phase 3: Reveal and record ──
        log(demoMode === 'snapshots' ? 'Running demo (snapshots only)…' : 'Recording demo…');
        await revealApp(page);
        await enableAnimationDomain(page);
        resetDemoTimer();

        for (const { act, fn } of DEMO_ACTS) {
            if (shouldRunAct(act)) await fn(page);
        }

        // Drain any remaining snapshot schedule before teardown
        await awaitSnapshotSchedule();

        log(demoMode === 'snapshots' ? 'Demo complete.' : 'Demo complete. Saving video…');
    } catch (err) {
        console.error('Error during recording:', err);
    } finally {
        // Cancel any in-flight snapshot schedule before tearing down
        cancelSnapshotSchedule();
        // Detach CDP session before closing the page
        await disableAnimationDomain();
        if (_cdpSession) {
            await _cdpSession.detach().catch(() => {});
            _cdpSession = null;
        }
        await page.close();
        await context.close();
        await browser.close();
    }

    // ── Save video ──
    if (demoMode === 'full' || demoMode === 'video') {
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
    }

    // ── Flush snapshot writes ──
    if (demoMode !== 'video') {
        await flushSnapshotWrites();
    }

    // ── Assemble snapshots (skip in snapshots-only mode) ──
    if (demoMode === 'full') {
        await assembleSnapshots();
    }
}

main().catch(console.error);
