/**
 * Demo choreography acts — each function drives one section of the recording.
 *
 * ── Playlist ──────────────────────────────────────────────────────────────────
 *
 * Act 1: Opening title
 *
 * Act 2: Circular View
 *   Part 2.1 — Background drag (whole-cube rotation)
 *   Part 2.2 — Axis circle multi-select
 *   Part 2.3 — Ghost hints
 *   Part 2.4 — Move inference cross helper (small + large circle)
 *   Part 2.5 — Face ellipse (select face, drag halo)
 *   Part 2.6 — Face Mode
 *
 * Act 3: Basic View
 *   Part 3.1 — Background drag (rotate viewpoint)
 *   Part 3.2 — Tilt (Y-axis rotation)
 *   Part 3.3 — Pitch (X-axis rotation)
 *   Part 3.4 — Sticker drag
 *   Part 3.5 — Face Mode
 *
 * Act 4: Flat View
 *   Part 4.1 — Legend drag
 *   Part 4.2 — Hover highlight
 *   Part 4.3 — Ghost hints
 *   Part 4.4 — Short & long drag
 *   Part 4.5 — Face Mode
 *
 * Act 5: Finale
 *   Part 5.1 — Keyboard shortcuts
 *   Part 5.2 — Scramble
 *   Part 5.3 — Reset Cube
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */
import type { Page } from 'playwright';

import { shouldRunPart } from './demo-filter';
import {
    ACT_GAP,
    CAPTION_HOLD,
    DRAG_DURATION,
    LONG_DRAG_DURATION,
    MOVE_PAUSE,
    SHORT_PAUSE,
    bounds,
    caption,
    center,
    clickCmd,
    drag,
    dragPath,
    hideCaption,
    logAct,
    logPart,
    moveCursorTo,
    openPanelOverflow,
    reapplyDemoLayout,
    takeSnapshot,
    wait,
} from './record-demo';

/** Build evenly-spaced waypoints around a circle starting at `startAngle` (radians). */
function circlePoints(
    cx: number,
    cy: number,
    r: number,
    n: number,
    startAngle = 0
): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= n; i++) {
        const angle = startAngle + (2 * Math.PI * i) / n;
        pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    return pts;
}

/**
 * Drag from (sx, sy) outward in a direction, back through the origin to the
 * opposite side, then return halfway and release. Shows the splitter line.
 */
export async function dragLineDemo(
    page: Page,
    sx: number,
    sy: number,
    opts: { deg?: number; dist?: number } = {}
): Promise<void> {
    const deg = opts.deg ?? 45;
    const dist = opts.dist ?? 55;
    const rad = (deg * Math.PI) / 180;
    const dx = Math.cos(rad) * dist;
    const dy = -Math.sin(rad) * dist; // screen Y is inverted

    await dragPath(
        page,
        [
            { x: sx, y: sy }, // start
            { x: sx - dx, y: sy - dy }, // opposite direction first
            { x: sx, y: sy }, // back to start
            { x: sx + dx, y: sy + dy }, // indicated direction
            { x: sx + dx / 2, y: sy + dy / 2 }, // return halfway, finish here
        ],
        { segmentMs: 150, steps: 10, pauseMs: 150 }
    );
}

/**
 * Drag from (sx, sy), trace a small then large circle around that point,
 * and finish the move outward. Demonstrates the move-inference cross helper.
 */
export async function dragCrossDemo(
    page: Page,
    sx: number,
    sy: number,
    opts: { smallR?: number; largeR?: number; startDeg?: number } = {}
): Promise<void> {
    const smallR = opts.smallR ?? 35;
    const largeR = opts.largeR ?? 80;
    // Convert degrees (0 = right, 90 = down; negative = up) to radians
    const startAngle = ((opts.startDeg ?? 0) * Math.PI) / 180;
    const startDx = Math.cos(startAngle);
    const startDy = Math.sin(startAngle);

    // Skip first point of each circle (at startAngle) — we move there explicitly
    const smallPts = circlePoints(sx, sy, smallR, 20, startAngle).slice(1);
    const largePts = circlePoints(sx, sy, largeR, 28, startAngle).slice(1);

    await dragPath(
        page,
        [
            { x: sx, y: sy },
            { x: sx + smallR * startDx, y: sy + smallR * startDy }, // move out to begin small circle
            ...smallPts,
            { x: sx + largeR * startDx, y: sy + largeR * startDy }, // move out to begin large circle
            ...largePts,
            { x: sx + smallR * startDx, y: sy + smallR * startDy }, // finish the move outward
        ],
        { segmentMs: 50, steps: 6, pauseMs: 0 }
    );
}

/** Move the demo cursor to (x,y) then click, or click at current position if omitted. */
async function demoClick(page: Page, x?: number, y?: number): Promise<void> {
    if (x !== undefined && y !== undefined) {
        await moveCursorTo(page, x, y);
        await page.mouse.click(x, y);
    } else {
        await page.mouse.down();
        await page.mouse.up();
    }
}

/** Return the selector for a circular-view sticker by face and position index. */
function circularSticker(face: string, pos: number): string {
    return `[data-view-panel="circular"] circle[data-face="${face}"][data-pos="${pos}"]`;
}

// ─── Act 1: Opening title ───────────────────────────────────────────────────

export async function act1_opening(page: Page): Promise<void> {
    logAct('Act 1: Opening title');
    await caption(page, "Rubik's Cube Simulator", 'Interactive multi-view visualization');
    await wait(CAPTION_HOLD);
    await takeSnapshot(page, 'act1-opening');
}

// ─── Act 2: Circular View ───────────────────────────────────────────────────

export async function act2_circularView(page: Page): Promise<void> {
    logAct('Act 2: Circular View');
    // Focus circular view
    const circPanel = await bounds(page, '[data-view-panel="circular"]');
    await demoClick(page, circPanel.x + circPanel.width / 2, circPanel.y + 15);
    await wait(SHORT_PAUSE);

    // Shared selectors / coordinates used across multiple parts
    const stickerSel = '[data-view-panel="circular"] circle[id^="sticker-"]';
    const svgBox = await bounds(page, '[data-view-panel="circular"] svg');
    const bgX = svgBox.x + Math.round(svgBox.width * 0.18);
    const bgY = svgBox.y + Math.round(svgBox.height * 0.18);

    // --- Background drag → whole-cube rotation ---
    if (shouldRunPart('2.1')) {
        logPart('Part 2.1: Background drag (whole-cube rotation)');
        await caption(page, 'Circular View', 'Drag background to rotate the cube');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part2.1-bg-drag');

        await dragLineDemo(page, bgX, bgY, { deg: 45, dist: 55 });
        await wait(MOVE_PAUSE);
    }

    // --- Axis circle multi-select ---
    if (shouldRunPart('2.2')) {
        logPart('Part 2.2: Axis circle multi-select');
        await caption(page, 'Circular View', 'Select axis circles — rotate multiple layers');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part2.2-axis-select');

        const panel = '[data-view-panel="circular"]';
        const x2CircleSel = `${panel} #X-layer-2`;
        const x0CircleSel = `${panel} #X-layer-0`;
        const x2LabelSel = `${panel} [data-label-id="x-2"]`;
        const x0LabelSel = `${panel} [data-label-id="x-0"]`;

        if ((await page.locator(x2CircleSel).count()) > 0) {
            // Click on the X:2 axis circle — offset from label to show anywhere works
            const x2Label = await bounds(page, x2LabelSel);
            const x2Circle = await bounds(page, x2CircleSel);
            const x2Cx = x2Circle.x + x2Circle.width / 2;
            const x2Cy = x2Circle.y + x2Circle.height / 2;
            const x2R = x2Circle.width / 2;
            const lbl2X = x2Label.x + x2Label.width / 2;
            const lbl2Y = x2Label.y + x2Label.height / 2;
            const ang2 = Math.atan2(lbl2Y - x2Cy, lbl2X - x2Cx) - Math.PI / 4; // ~45° away from label
            await demoClick(page, x2Cx + x2R * Math.cos(ang2), x2Cy + x2R * Math.sin(ang2));
            await wait(SHORT_PAUSE);

            // Click on the X:0 axis circle — offset from label to show anywhere works
            const x0Label = await bounds(page, x0LabelSel);
            const x0Circle = await bounds(page, x0CircleSel);
            const x0Cx = x0Circle.x + x0Circle.width / 2;
            const x0Cy = x0Circle.y + x0Circle.height / 2;
            const x0R = x0Circle.width / 2;
            const lbl0X = x0Label.x + x0Label.width / 2;
            const lbl0Y = x0Label.y + x0Label.height / 2;
            const ang0 = Math.atan2(lbl0Y - x0Cy, lbl0X - x0Cx) - Math.PI / 4; // ~45° away from label
            await demoClick(page, x0Cx + x0R * Math.cos(ang0), x0Cy + x0R * Math.sin(ang0));
            await wait(SHORT_PAUSE);

            // Drag CW ~40px from the click spot on X:0
            const dragStartX = x0Cx + x0R * Math.cos(ang0);
            const dragStartY = x0Cy + x0R * Math.sin(ang0);
            const cwOffset = 40;
            // Perpendicular CW direction on the circle
            const cwDx = -Math.sin(ang0) * cwOffset;
            const cwDy = Math.cos(ang0) * cwOffset;
            const dragEndX = dragStartX + cwDx;
            const dragEndY = dragStartY + cwDy;
            await drag(page, dragStartX, dragStartY, dragEndX, dragEndY, {
                steps: 14,
                durationMs: 400,
            });
            await wait(MOVE_PAUSE);

            // deselect
            await demoClick(page, dragEndX, dragEndY);
            await wait(SHORT_PAUSE);
        }
    }

    // --- Ghost toggle ---
    if (shouldRunPart('2.3')) {
        logPart('Part 2.3: Ghost hints');
        await caption(page, 'Circular View', 'Ghost hints — see the far side of each axis');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part2.3-ghost-hints');

        await clickCmd(page, 'circular-view.ghost-hints');
        await wait(CAPTION_HOLD);
    }

    // --- Move inference cross helper (small + large circle) ---
    if (shouldRunPart('2.4')) {
        logPart('Part 2.4: Move inference cross helper (small + large circle)');
        await caption(page, 'Circular View', 'Move inference cross — circle around touch point');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part2.4-cross-helper');

        const { x: sx, y: sy } = await center(page, stickerSel);

        await dragCrossDemo(page, sx, sy, { startDeg: -45 });
        await wait(MOVE_PAUSE);
    }

    // --- Face ellipse → select face, drag halo ---
    if (shouldRunPart('2.5')) {
        logPart('Part 2.5: Face ellipse (select face, drag halo)');
        await caption(page, 'Circular View', 'Select face — drag halo to rotate');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part2.5-face-ellipse');

        const ellipseSel = '[data-view-panel="circular"] ellipse[id$="-face-ellipse"]';
        if ((await page.locator(ellipseSel).count()) > 0) {
            const eBox = await bounds(page, ellipseSel);
            const ex = eBox.x + eBox.width / 2;
            const ey = eBox.y + eBox.height / 2;
            const rx = eBox.width / 2;
            const ry = eBox.height / 2;

            // Click inside the ellipse at ~45°, about 80% of the way to the rim
            const clickAngle = (45 * Math.PI) / 180;
            const clickX = ex + rx * 0.8 * Math.cos(clickAngle);
            const clickY = ey - ry * 0.8 * Math.sin(clickAngle);

            await demoClick(page, clickX, clickY);
            await wait(SHORT_PAUSE);

            const haloR = Math.max(eBox.width, eBox.height) / 2 + 15;
            await drag(page, clickX, clickY, ex, ey - haloR, { steps: 14, durationMs: 400 });
            await wait(MOVE_PAUSE);

            // deselect
            await demoClick(page);
            await wait(SHORT_PAUSE);
        }
    }

    // --- Face Mode ---
    if (shouldRunPart('2.6')) {
        logPart('Part 2.6: Face Mode');
        await caption(page, 'Circular View', 'Face Mode — drag any sticker to rotate its face');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part2.6-face-mode');

        await clickCmd(page, 'circular-view.face-direct-mode');
        await wait(200);

        const s3Box = await bounds(page, circularSticker('R', 3));
        await drag(
            page,
            s3Box.x + s3Box.width / 2,
            s3Box.y + s3Box.height / 2,
            s3Box.x + s3Box.width / 2,
            s3Box.y + s3Box.height / 2 + 30,
            { steps: 10, durationMs: 300 }
        );
        await wait(MOVE_PAUSE);
    }

    await hideCaption(page);
    await wait(ACT_GAP);
}

// ─── Act 3: Basic View ──────────────────────────────────────────────────────

export async function act3_basicView(page: Page): Promise<void> {
    logAct('Act 3: Basic View');
    await reapplyDemoLayout(page);

    const panel = await bounds(page, '[data-view-panel="basic-front"]');
    await demoClick(page, panel.x + panel.width / 2, panel.y + 15);
    await wait(SHORT_PAUSE);

    await caption(page, 'Basic View', '3D perspective with CSS transforms');
    await wait(CAPTION_HOLD);
    await takeSnapshot(page, 'act3-basic-view');

    const bSticker = '[data-view-panel="basic-front"] [data-sticker-id]';
    const bgX = panel.x + 60;
    const bgY = panel.y + panel.height - 50;

    // --- Background drag → rotate viewpoint ---
    if (shouldRunPart('3.1')) {
        logPart('Part 3.1: Background drag (rotate viewpoint)');
        await caption(page, 'Basic View', 'Drag background to rotate viewpoint');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part3.1-bg-drag');

        await dragCrossDemo(page, bgX, bgY, { startDeg: 0 });
        await wait(MOVE_PAUSE);
        await reapplyDemoLayout(page);
    }

    // --- Tilt ---
    if (shouldRunPart('3.2')) {
        logPart('Part 3.2: Tilt (Y-axis rotation)');
        await caption(page, 'Basic View', 'Tilt — Y-axis rotation');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part3.2-tilt');

        await openPanelOverflow(page, 'basic-front');
        await clickCmd(page, 'tilt-view');
        await wait(CAPTION_HOLD);
        await reapplyDemoLayout(page);
    }

    // --- Pitch ---
    if (shouldRunPart('3.3')) {
        logPart('Part 3.3: Pitch (X-axis rotation)');
        await caption(page, 'Basic View', 'Pitch — X-axis rotation');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part3.3-pitch');

        await openPanelOverflow(page, 'basic-front');
        await clickCmd(page, 'pitch-view');
        await wait(CAPTION_HOLD);
        await reapplyDemoLayout(page);

        await openPanelOverflow(page, 'basic-front');
        await clickCmd(page, 'tilt-view'); // reset
        await openPanelOverflow(page, 'basic-front');
        await clickCmd(page, 'pitch-view');
        await wait(SHORT_PAUSE);
        await reapplyDemoLayout(page);

        await openPanelOverflow(page, 'basic-front');
        await clickCmd(page, 'reset-view');
        await wait(SHORT_PAUSE);
        await reapplyDemoLayout(page);
    }

    // --- Sticker drag ---
    if (shouldRunPart('3.4')) {
        logPart('Part 3.4: Sticker drag');
        await caption(page, 'Basic View', 'Drag sticker to execute a move');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part3.4-sticker-drag');

        if ((await page.locator(bSticker).count()) > 0) {
            const bs = await bounds(page, bSticker);
            await dragCrossDemo(page, bs.x + bs.width / 2, bs.y + bs.height / 2, { startDeg: 0 });
            await wait(MOVE_PAUSE);
        }

        await reapplyDemoLayout(page);
    }

    // --- Face mode ---
    if (shouldRunPart('3.5')) {
        logPart('Part 3.5: Face Mode');
        await caption(page, 'Basic View', 'Face Mode');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part3.5-face-mode');

        await openPanelOverflow(page, 'basic-front');
        await clickCmd(page, 'basic-front.face-direct-mode');
        await wait(200);
        await reapplyDemoLayout(page);

        if ((await page.locator(bSticker).count()) > 0) {
            const bs2 = await bounds(page, bSticker);
            await dragLineDemo(page, bs2.x + bs2.width / 2, bs2.y + bs2.height / 2, { deg: 0 });
            await wait(MOVE_PAUSE);
        }

        await reapplyDemoLayout(page);
    }

    await hideCaption(page);
    await wait(ACT_GAP);
}

// ─── Act 4: Flat View ───────────────────────────────────────────────────────

export async function act4_flatView(page: Page): Promise<void> {
    logAct('Act 4: Flat View');
    const panel = await bounds(page, '[data-view-panel="flat"]');
    await demoClick(page, panel.x + panel.width / 2, panel.y + 15);
    await wait(SHORT_PAUSE);

    await caption(page, 'Flat View', '2D T-cross layout');
    await wait(CAPTION_HOLD);
    await takeSnapshot(page, 'act4-flat-view');

    const fSticker = '[data-view-panel="flat"] [data-sticker-id]';
    const hasStickers = (await page.locator(fSticker).count()) > 0;

    // --- Legend drag ---
    if (shouldRunPart('4.1')) {
        logPart('Part 4.1: Legend drag');
        await caption(page, 'Flat View', 'Drag legend to rotate the cube');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part4.1-legend-drag');

        const legendSel = '[data-view-panel="flat"] [class*="legend"]';
        if ((await page.locator(legendSel).count()) > 0) {
            const leg = await bounds(page, legendSel);
            await drag(
                page,
                leg.x + leg.width / 2,
                leg.y + leg.height / 2,
                leg.x + leg.width / 2 + 50,
                leg.y + leg.height / 2,
                { steps: 10, durationMs: 350 }
            );
            await wait(MOVE_PAUSE);
        }
    }

    // --- Hover highlight ---
    if (shouldRunPart('4.2')) {
        logPart('Part 4.2: Hover highlight');
        await caption(page, 'Flat View', 'Hover highlights across all views');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part4.2-hover-highlight');

        const hoverStickers = [
            { face: 'U', pos: 8 },
            { face: 'U', pos: 5 },
            { face: 'U', pos: 2 },
            { face: 'U', pos: 1 },
            { face: 'U', pos: 0 },
        ];
        for (const { face, pos } of hoverStickers) {
            const sel = `[data-view-panel="flat"] [data-face="${face}"][data-pos="${pos}"]`;
            if ((await page.locator(sel).count()) > 0) {
                const box = await bounds(page, sel);
                await moveCursorTo(page, box.x + box.width / 2, box.y + box.height / 2, 200);
                await wait(400);
            }
        }
        await wait(SHORT_PAUSE);
    }

    // --- Ghost toggle ---
    if (shouldRunPart('4.3')) {
        logPart('Part 4.3: Ghost hints');
        await caption(page, 'Flat View', 'Ghost hints — see cube-adjacent faces');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part4.3-ghost-hints');

        await clickCmd(page, 'flat.ghost-hints');
        await wait(CAPTION_HOLD);
    }

    // --- Short and long drag ---
    if (shouldRunPart('4.4')) {
        logPart('Part 4.4: Short & long drag');
        await caption(page, 'Flat View', 'Short drag → single move, long drag → double');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part4.4-short-long-drag');

        if (hasStickers) {
            const fs = await bounds(page, fSticker);
            const fsx = fs.x + fs.width / 2;
            const fsy = fs.y + fs.height / 2;

            await dragCrossDemo(page, fsx, fsy, { smallR: 25, largeR: 70, startDeg: 0 });
            await wait(MOVE_PAUSE);
        }
    }

    // --- Face mode ---
    if (shouldRunPart('4.5')) {
        logPart('Part 4.5: Face Mode');
        await caption(page, 'Flat View', 'Face Mode');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part4.5-face-mode');

        await clickCmd(page, 'flat.face-direct-mode');
        await wait(200);

        if (hasStickers) {
            const fs3 = await bounds(page, fSticker);
            await drag(
                page,
                fs3.x + fs3.width / 2,
                fs3.y + fs3.height / 2,
                fs3.x + fs3.width / 2 + 30,
                fs3.y + fs3.height / 2,
                { steps: 10, durationMs: 300 }
            );
            await wait(MOVE_PAUSE);
        }
    }

    await hideCaption(page);
    await wait(ACT_GAP);
}

// ─── Act 5: Finale ──────────────────────────────────────────────────────────

export async function act5_finale(page: Page): Promise<void> {
    logAct('Act 5: Finale');

    if (shouldRunPart('5.1')) {
        logPart('Part 5.1: Keyboard shortcuts');
        await caption(page, 'Keyboard shortcuts', 'All moves available via single keypress');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part5.1-keyboard-shortcuts');

        await page.keyboard.press('r');
        await wait(200);
        await page.keyboard.press('u');
        await wait(200);
        await page.keyboard.press('Shift+r');
        await wait(200);
        await page.keyboard.press('Shift+u');
        await wait(MOVE_PAUSE);
    }

    if (shouldRunPart('5.2')) {
        logPart('Part 5.2: Scramble');
        // Open the controls panel so the Scramble/Reset buttons are visible
        const menuToggleInfo = (await page.evaluate(`(function() {
        var btn = document.querySelector('.menu-toggle');
        if (!btn) return null;
        var r = btn.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, expanded: btn.getAttribute('aria-expanded') === 'true' };
    })()`)) as { x: number; y: number; expanded: boolean } | null;
        if (menuToggleInfo && !menuToggleInfo.expanded) {
            await moveCursorTo(page, menuToggleInfo.x, menuToggleInfo.y);
            await page.mouse.click(menuToggleInfo.x, menuToggleInfo.y);
            await wait(SHORT_PAUSE);
        }
        await caption(page, 'Scramble');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part5.2-scramble');

        await clickCmd(page, 'scramble-cube');
        await wait(SHORT_PAUSE);
    }

    if (shouldRunPart('5.3')) {
        logPart('Part 5.3: Reset Cube');
        await caption(page, 'Reset Cube');
        await wait(SHORT_PAUSE);
        await takeSnapshot(page, 'part5.3-reset-cube');

        await clickCmd(page, 'reset-cube');
        await wait(SHORT_PAUSE);

        // Close the controls panel again
        const menuToggleClose = (await page.evaluate(`(function() {
        var btn = document.querySelector('.menu-toggle');
        if (!btn) return null;
        var r = btn.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, expanded: btn.getAttribute('aria-expanded') === 'true' };
    })()`)) as { x: number; y: number; expanded: boolean } | null;
        if (menuToggleClose && menuToggleClose.expanded) {
            await moveCursorTo(page, menuToggleClose.x, menuToggleClose.y);
            await page.mouse.click(menuToggleClose.x, menuToggleClose.y);
            await wait(SHORT_PAUSE);
        }
    }

    await caption(page, "Rubik's Cube", 'github.com/mm6502/rubiks-cube');
    await wait(CAPTION_HOLD + 1000);

    await hideCaption(page);
    await wait(500);
}
