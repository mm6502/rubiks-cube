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
 * Act 3: Moves View
 *   Part 3.1 — Toggle move icons
 *   Part 3.2 — Undo
 *   Part 3.3 — Redo
 *
 * Act 4: Basic View
 *   Part 4.1 — Background drag (rotate viewpoint)
 *   Part 4.2 — Tilt (Y-axis rotation)
 *   Part 4.3 — Pitch (X-axis rotation)
 *   Part 4.4 — Sticker drag
 *   Part 4.5 — Face Mode
 *
 * Act 5: Flat View
 *   Part 5.1 — Legend drag
 *   Part 5.2 — Hover highlight
 *   Part 5.3 — Ghost hints
 *   Part 5.4 — Short & long drag
 *   Part 5.5 — Face Mode
 *
 * Act 6: Finale
 *   Part 6.1 — Keyboard shortcuts
 *   Part 6.2 — Scramble
 *   Part 6.3 — Reset Cube
 *   Part 6.4 — Epilogue
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */
import type { Page } from 'playwright';

import { shouldRunPart } from './demo-filter';
import {
    axisCircleClickPoint,
    bounds,
    caption,
    captureAtMoment,
    center,
    circularSticker,
    clickCmd,
    cwDragEndpoint,
    demoClick,
    drag,
    dragCrossDemo,
    dragFretboardDemo,
    dragLineDemo,
    dragPath,
    ellipseGeometry,
    ensureMenu,
    hideCaption,
    moveCursorTo,
    openPanelOverflow,
} from './demo-helpers';
import {
    ACT_GAP,
    CAPTION_HOLD,
    MOVE_PAUSE,
    SHORT_PAUSE,
    SNAP_CAPTION,
    SNAP_HOLD,
    awaitAnimationIdle,
    awaitSnapshotSchedule,
    logAct,
    logPart,
    reapplyDemoLayout,
    startSnapshotSchedule,
    takeSnapshot,
    wait,
} from './record-demo';

// ─── Act registry ───────────────────────────────────────────────────────────
// Single source of truth for the demo scenario order.
// record-demo.ts iterates this array — no need to update it when acts change.

export type DemoAct = { act: number; fn: (page: Page) => Promise<void> };

export const DEMO_ACTS: DemoAct[] = [
    { act: 1, fn: act1_opening },
    { act: 2, fn: act2_circularView },
    { act: 3, fn: act3_movesView },
    { act: 4, fn: act4_basicView },
    { act: 5, fn: act5_flatView },
    { act: 6, fn: act6_finale },
];

// ─── Act 1: Opening title ───────────────────────────────────────────────────

export async function act1_opening(page: Page): Promise<void> {
    logAct('Act 1: Opening title');
    startSnapshotSchedule(page, 'act1', [
        // t=0: caption appears
        { offsetMs: 150, label: 'opening-title', durationMs: SNAP_CAPTION },
        { offsetMs: 1000, label: 'opening-mid', durationMs: SNAP_CAPTION },
        { offsetMs: CAPTION_HOLD - 200, label: 'opening-hold', durationMs: SNAP_HOLD },
    ]);
    await caption(page, "Rubik's Cube", 'Interactive multi-view visualization');
    await wait(CAPTION_HOLD);
    await awaitSnapshotSchedule();
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
        startSnapshotSchedule(page, 'part2.1', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
        ]);
        await caption(page, 'Circular View', 'Drag background to rotate the cube');
        await wait(SHORT_PAUSE);
        await awaitSnapshotSchedule();

        await dragLineDemo(page, bgX, bgY, {
            deg: 45,
            dist: 100,
            onMoment: (label, dur) => takeSnapshot(page, `part2.1-${label}`, dur),
        });
        await wait(MOVE_PAUSE);
    }

    // --- Axis circle multi-select ---
    if (shouldRunPart('2.2')) {
        logPart('Part 2.2: Axis circle multi-select');
        await caption(page, 'Circular View', 'Select axis circles — rotate multiple layers');
        await takeSnapshot(page, 'part2.2-caption', SNAP_CAPTION);
        await wait(SHORT_PAUSE);

        const panel = '[data-view-panel="circular"]';
        const x2CircleSel = `${panel} #X-layer-2`;
        const x0CircleSel = `${panel} #X-layer-0`;
        const x2LabelSel = `${panel} [data-label-id="x-2"]`;
        const x0LabelSel = `${panel} [data-label-id="x-0"]`;

        if ((await page.locator(x2CircleSel).count()) > 0) {
            // Click on the X:2 axis circle — offset from label
            const x2 = await axisCircleClickPoint(page, x2CircleSel, x2LabelSel);
            await demoClick(page, x2.x, x2.y);
            await takeSnapshot(page, 'part2.2-first-selected');
            await wait(SHORT_PAUSE);

            // Click on the X:0 axis circle — offset from label
            const x0 = await axisCircleClickPoint(page, x0CircleSel, x0LabelSel);
            await demoClick(page, x0.x, x0.y);
            await takeSnapshot(page, 'part2.2-second-selected');
            await wait(SHORT_PAUSE);

            // Drag CW ~40px from the click spot on X:0
            const dragEnd = cwDragEndpoint(x0.x, x0.y, x0.angle, 40);
            await drag(page, x0.x, x0.y, dragEnd.x, dragEnd.y, {
                steps: 14,
                durationMs: 400,
            });
            await takeSnapshot(page, 'part2.2-after-drag', SNAP_HOLD);
            await wait(MOVE_PAUSE);

            // deselect
            await demoClick(page, dragEnd.x, dragEnd.y);
            await wait(SHORT_PAUSE);
        }
    }

    // --- Fretboard target switching ---
    if (shouldRunPart('2.2b')) {
        logPart('Part 2.2b: Fretboard target switching');
        // Caption snapshot via schedule, drag moments via onMoment callback
        startSnapshotSchedule(page, 'part2.2b', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
        ]);
        await caption(page, 'Circular View', 'Slide between layers — switch targets mid-drag');
        await wait(SHORT_PAUSE);
        await awaitSnapshotSchedule();

        const fretPanel = '[data-view-panel="circular"]';
        const x2Sel = `${fretPanel} #X-layer-2`;
        if ((await page.locator(x2Sel).count()) > 0) {
            await dragFretboardDemo(page, x2Sel, {
                layerPath: [2, 1, 0, -1, 1],
                dwellMs: 400,
                dipDist: 30,
                commitDeg: 90,
                commitDist: 40,
                panel: fretPanel,
                onMoment: (label, dur) => takeSnapshot(page, `part2.2b-${label}`, dur),
            });
            await wait(MOVE_PAUSE);
        }
    }

    // --- Ghost toggle ---
    if (shouldRunPart('2.3')) {
        logPart('Part 2.3: Ghost hints');
        await caption(page, 'Circular View', 'Ghost hints — see the far side of each axis');
        await takeSnapshot(page, 'part2.3-caption', SNAP_CAPTION);
        await wait(SHORT_PAUSE);

        await takeSnapshot(page, 'part2.3-before-toggle');
        await clickCmd(page, 'circular-view.ghost-hints');
        await awaitAnimationIdle(page);
        await wait(200);
        await takeSnapshot(page, 'part2.3-ghosts-visible', SNAP_HOLD);
    }

    // --- Move inference cross helper (double dip in 3 directions) ---
    if (shouldRunPart('2.4')) {
        logPart('Part 2.4: Move inference cross helper');
        startSnapshotSchedule(page, 'part2.4', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
        ]);
        await caption(page, 'Circular View', 'Move inference cross — circle around touch point');
        await wait(SHORT_PAUSE);
        await awaitSnapshotSchedule();

        const { x: sx, y: sy } = await center(page, stickerSel);

        await dragCrossDemo(page, sx, sy, {
            startDeg: -45,
            onMoment: (label, dur) => takeSnapshot(page, `part2.4-${label}`, dur),
        });
        await wait(MOVE_PAUSE);
    }

    // --- Face ellipse → select face, drag halo ---
    if (shouldRunPart('2.5')) {
        logPart('Part 2.5: Face ellipse (select face, drag halo)');
        startSnapshotSchedule(page, 'part2.5', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
        ]);
        await caption(page, 'Circular View', 'Select face — drag halo to rotate');
        await wait(SHORT_PAUSE);
        await awaitSnapshotSchedule();

        const ellipseSel = '[data-view-panel="circular"] ellipse[id$="-face-ellipse"]';
        if ((await page.locator(ellipseSel).count()) > 0) {
            const ell = await ellipseGeometry(page, ellipseSel);

            await demoClick(page, ell.clickX, ell.clickY);
            await wait(SHORT_PAUSE);
            await takeSnapshot(page, 'part2.5-face-selected', SNAP_HOLD);

            const midX = (ell.clickX + ell.haloX) / 2;
            const midY = (ell.clickY + ell.haloY) / 2;
            await dragPath(
                page,
                [
                    { x: ell.clickX, y: ell.clickY },
                    { x: midX, y: midY },
                    { x: ell.haloX, y: ell.haloY },
                ],
                {
                    segmentMs: 200,
                    steps: 7,
                    pauseMs: 300,
                    onWaypoint: async () => {
                        await takeSnapshot(page, 'part2.5-mid-drag', SNAP_HOLD);
                    },
                }
            );
            await wait(MOVE_PAUSE);
            await takeSnapshot(page, 'part2.5-after-drag', SNAP_HOLD);

            // deselect
            await demoClick(page);
            await wait(SHORT_PAUSE);
            await takeSnapshot(page, 'part2.5-deselected');
        }
    }

    // --- Face Mode ---
    if (shouldRunPart('2.6')) {
        logPart('Part 2.6: Face Mode');
        startSnapshotSchedule(page, 'part2.6', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
        ]);
        await caption(page, 'Circular View', 'Face Mode — drag any sticker to rotate its face');
        await wait(SHORT_PAUSE);
        await awaitSnapshotSchedule();

        await clickCmd(page, 'circular-view.face-direct-mode');
        await wait(200);

        const s3Box = await bounds(page, circularSticker('R', 3));
        await dragLineDemo(page, s3Box.x + s3Box.width / 2, s3Box.y + s3Box.height / 2, {
            deg: 270,
            dist: 120,
            onMoment: (label, dur) => takeSnapshot(page, `part2.6-${label}`, dur),
        });
        await wait(MOVE_PAUSE);
    }

    await hideCaption(page);
    await wait(ACT_GAP);
}

// ─── Act 3: Moves View ─────────────────────────────────────────────────────

export async function act3_movesView(page: Page): Promise<void> {
    logAct('Act 3: Moves View');

    // Focus the moves panel
    const panel = await bounds(page, '[data-view-panel="moves"]');
    await demoClick(page, panel.x + panel.width / 2, panel.y + 15);
    await wait(SHORT_PAUSE);

    // --- Toggle move icons ---
    if (shouldRunPart('3.1')) {
        logPart('Part 3.1: Toggle move icons');
        await caption(page, 'Moves View', 'Toggle icons — visual move notation');
        await takeSnapshot(page, 'part3.1-caption', SNAP_CAPTION);
        await wait(SHORT_PAUSE);

        await takeSnapshot(page, 'part3.1-before-toggle');
        await clickCmd(page, 'toggle-move-icons');
        await awaitAnimationIdle(page);
        await wait(200);
        await takeSnapshot(page, 'part3.1-icons-visible', SNAP_HOLD);
    }

    // --- Undo ---
    if (shouldRunPart('3.2')) {
        logPart('Part 3.2: Undo');
        await caption(page, 'Moves View', 'Undo — step back through move history');
        await takeSnapshot(page, 'part3.2-caption', SNAP_CAPTION);
        await wait(SHORT_PAUSE);

        await clickCmd(page, 'moves.undo');
        await awaitAnimationIdle(page);
        await takeSnapshot(page, 'part3.2-undo-1');
        await wait(SHORT_PAUSE);
        await clickCmd(page, 'moves.undo');
        await awaitAnimationIdle(page);
        await takeSnapshot(page, 'part3.2-after-undo', SNAP_HOLD);
        await wait(MOVE_PAUSE);
    }

    // --- Redo ---
    if (shouldRunPart('3.3')) {
        logPart('Part 3.3: Redo');
        await caption(page, 'Moves View', 'Redo — replay undone moves');
        await takeSnapshot(page, 'part3.3-caption', SNAP_CAPTION);
        await wait(SHORT_PAUSE);

        await clickCmd(page, 'moves.redo');
        await awaitAnimationIdle(page);
        await takeSnapshot(page, 'part3.3-redo-1');
        await wait(SHORT_PAUSE);
        await clickCmd(page, 'moves.redo');
        await awaitAnimationIdle(page);
        await takeSnapshot(page, 'part3.3-after-redo', SNAP_HOLD);
        await wait(MOVE_PAUSE);
    }

    await hideCaption(page);
    await wait(ACT_GAP);
}

// ─── Act 4: Basic View ──────────────────────────────────────────────────────

export async function act4_basicView(page: Page): Promise<void> {
    logAct('Act 4: Basic View');
    await reapplyDemoLayout(page);

    const panel = await bounds(page, '[data-view-panel="basic-front"]');
    await demoClick(page, panel.x + panel.width / 2, panel.y + 15);
    await wait(SHORT_PAUSE);

    startSnapshotSchedule(page, 'act4', [
        { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
        { offsetMs: 1000, label: 'overview-mid', durationMs: SNAP_CAPTION },
        { offsetMs: CAPTION_HOLD - 200, label: 'overview', durationMs: SNAP_HOLD },
    ]);
    await caption(page, 'Basic View', '3D perspective with CSS transforms');
    await wait(CAPTION_HOLD);
    await awaitSnapshotSchedule();

    const bSticker = '[data-view-panel="basic-front"] [data-sticker-id]';
    const bgX = panel.x + 60;
    const bgY = panel.y + panel.height - 50;

    // --- Background drag → rotate viewpoint ---
    if (shouldRunPart('4.1')) {
        logPart('Part 4.1: Background drag (rotate viewpoint)');
        startSnapshotSchedule(page, 'part4.1', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
        ]);
        await caption(page, 'Basic View', 'Drag background to rotate viewpoint');
        await wait(SHORT_PAUSE);
        await awaitSnapshotSchedule();

        await dragCrossDemo(page, bgX, bgY, {
            startDeg: 0,
            onMoment: (label, dur) => takeSnapshot(page, `part4.1-${label}`, dur),
        });
        await wait(MOVE_PAUSE);
        await reapplyDemoLayout(page);
    }

    // --- Tilt ---
    if (shouldRunPart('4.2')) {
        logPart('Part 4.2: Tilt (Y-axis rotation)');
        // Timeline: caption → SHORT_PAUSE(400) → openOverflow(~550) + clickCmd(~750)
        //   → CAPTION_HOLD(2000) ≈ 3700ms
        startSnapshotSchedule(page, 'part4.2', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
            { offsetMs: 500, label: 'before-tilt' },
            { offsetMs: 1000, label: 'clicking-tilt' },
            { offsetMs: 1500, label: 'tilted-early' },
            { offsetMs: 2000, label: 'tilted-mid' },
            { offsetMs: 2500, label: 'tilted-settled', durationMs: SNAP_HOLD },
            { offsetMs: 3200, label: 'tilted-hold', durationMs: SNAP_HOLD },
        ]);
        await caption(page, 'Basic View', 'Tilt — Y-axis rotation');
        await wait(SHORT_PAUSE);

        await openPanelOverflow(page, 'basic-front');
        await clickCmd(page, 'tilt-view');
        await wait(CAPTION_HOLD);
        await awaitSnapshotSchedule();
        await reapplyDemoLayout(page);
    }

    // --- Pitch ---
    if (shouldRunPart('4.3')) {
        logPart('Part 4.3: Pitch (X-axis rotation)');
        // Timeline: caption → SHORT_PAUSE(400) → openOverflow(~550) + clickCmd(~750)
        //   → CAPTION_HOLD(2000) ≈ 3700ms
        startSnapshotSchedule(page, 'part4.3', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
            { offsetMs: 500, label: 'before-pitch' },
            { offsetMs: 1000, label: 'clicking-pitch' },
            { offsetMs: 1500, label: 'pitched-early' },
            { offsetMs: 2000, label: 'pitched-mid' },
            { offsetMs: 2500, label: 'pitched-settled', durationMs: SNAP_HOLD },
            { offsetMs: 3200, label: 'pitched-hold', durationMs: SNAP_HOLD },
        ]);
        await caption(page, 'Basic View', 'Pitch — X-axis rotation');
        await wait(SHORT_PAUSE);

        await openPanelOverflow(page, 'basic-front');
        await clickCmd(page, 'pitch-view');
        await wait(CAPTION_HOLD);
        await awaitSnapshotSchedule();
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
    if (shouldRunPart('4.4')) {
        logPart('Part 4.4: Sticker drag');
        startSnapshotSchedule(page, 'part4.4', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
        ]);
        await caption(page, 'Basic View', 'Drag sticker to execute a move');
        await wait(SHORT_PAUSE);
        await awaitSnapshotSchedule();

        if ((await page.locator(bSticker).count()) > 0) {
            const bs = await bounds(page, bSticker);
            await dragCrossDemo(page, bs.x + bs.width / 2, bs.y + bs.height / 2, {
                startDeg: 0,
                onMoment: (label, dur) => takeSnapshot(page, `part4.4-${label}`, dur),
            });
            await wait(MOVE_PAUSE);
        }

        await reapplyDemoLayout(page);
    }

    // --- Face mode ---
    if (shouldRunPart('4.5')) {
        logPart('Part 4.5: Face Mode');
        startSnapshotSchedule(page, 'part4.5', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
        ]);
        await caption(page, 'Basic View', 'Face Mode');
        await wait(SHORT_PAUSE);
        await awaitSnapshotSchedule();

        await openPanelOverflow(page, 'basic-front');
        await clickCmd(page, 'basic-front.face-direct-mode');
        await wait(200);
        await reapplyDemoLayout(page);

        if ((await page.locator(bSticker).count()) > 0) {
            const bs2 = await bounds(page, bSticker);
            await dragLineDemo(page, bs2.x + bs2.width / 2, bs2.y + bs2.height / 2, {
                deg: 0,
                dist: 80,
                onMoment: (label, dur) => takeSnapshot(page, `part4.5-${label}`, dur),
            });
            await wait(MOVE_PAUSE);
        }

        await reapplyDemoLayout(page);
    }

    await hideCaption(page);
    await wait(ACT_GAP);
}

// ─── Act 5: Flat View ───────────────────────────────────────────────────────────

export async function act5_flatView(page: Page): Promise<void> {
    logAct('Act 5: Flat View');
    const panel = await bounds(page, '[data-view-panel="flat"]');
    await demoClick(page, panel.x + panel.width / 2, panel.y + 15);
    await wait(SHORT_PAUSE);

    startSnapshotSchedule(page, 'act4', [
        { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
        { offsetMs: 1000, label: 'overview-mid', durationMs: SNAP_CAPTION },
        { offsetMs: CAPTION_HOLD - 200, label: 'overview', durationMs: SNAP_HOLD },
    ]);
    await caption(page, 'Flat View', '2D T-cross layout');
    await wait(CAPTION_HOLD);
    await awaitSnapshotSchedule();

    const fSticker = '[data-view-panel="flat"] [data-sticker-id]';
    const hasStickers = (await page.locator(fSticker).count()) > 0;

    // --- Legend drag ---
    if (shouldRunPart('5.1')) {
        logPart('Part 5.1: Legend drag');
        await caption(page, 'Flat View', 'Drag legend to rotate the cube');
        await takeSnapshot(page, 'part5.1-caption', SNAP_CAPTION);
        await wait(SHORT_PAUSE);

        const legendSel = '[data-view-panel="flat"] [class*="legend"]';
        if ((await page.locator(legendSel).count()) > 0) {
            const leg = await bounds(page, legendSel);
            await takeSnapshot(page, 'part5.1-before-drag');
            await drag(
                page,
                leg.x + leg.width / 2,
                leg.y + leg.height / 2,
                leg.x + leg.width / 2 - 50,
                leg.y + leg.height / 2,
                { steps: 10, durationMs: 350 }
            );
            await takeSnapshot(page, 'part5.1-after-drag', SNAP_HOLD);
            await wait(MOVE_PAUSE);
        }
    }

    // --- Hover highlight ---
    if (shouldRunPart('5.2')) {
        logPart('Part 5.2: Hover highlight');
        // Timeline: caption → SHORT_PAUSE(400) → 5×(moveCursor(200)+wait(400))=3000 → SHORT_PAUSE(400) ≈ 3800ms
        startSnapshotSchedule(page, 'part5.2', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
            { offsetMs: 500, label: 'before-hover' },
            { offsetMs: 900, label: 'hover-s1' },
            { offsetMs: 1300, label: 'hover-s2' },
            { offsetMs: 1700, label: 'hover-s3' },
            { offsetMs: 2100, label: 'hover-s4' },
            { offsetMs: 2500, label: 'hover-s5' },
            { offsetMs: 2900, label: 'hover-late' },
            { offsetMs: 3300, label: 'hover-done' },
        ]);
        await caption(page, 'Flat View', 'Hover highlights across all views');
        await wait(SHORT_PAUSE);

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
        await awaitSnapshotSchedule();
    }

    // --- Ghost toggle ---
    if (shouldRunPart('5.3')) {
        logPart('Part 5.3: Ghost hints');
        await caption(page, 'Flat View', 'Ghost hints — see cube-adjacent faces');
        await takeSnapshot(page, 'part5.3-caption', SNAP_CAPTION);
        await wait(SHORT_PAUSE);

        await takeSnapshot(page, 'part5.3-before-toggle');
        await clickCmd(page, 'flat.ghost-hints');
        await awaitAnimationIdle(page);
        await wait(200);
        await takeSnapshot(page, 'part5.3-ghosts-visible', SNAP_HOLD);
    }

    // --- Short and long drag ---
    if (shouldRunPart('5.4')) {
        logPart('Part 5.4: Short & long drag');
        startSnapshotSchedule(page, 'part5.4', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
        ]);
        await caption(page, 'Flat View', 'Short drag → single move, long drag → double');
        await wait(SHORT_PAUSE);
        await awaitSnapshotSchedule();

        if (hasStickers) {
            const fs = await bounds(page, fSticker);
            const fsx = fs.x + fs.width / 2;
            const fsy = fs.y + fs.height / 2;

            await dragCrossDemo(page, fsx, fsy, {
                smallR: 25,
                largeR: 70,
                startDeg: 0,
                onMoment: (label, dur) => takeSnapshot(page, `part5.4-${label}`, dur),
            });
            await wait(MOVE_PAUSE);
        }
    }

    // --- Face mode ---
    if (shouldRunPart('5.5')) {
        logPart('Part 5.5: Face Mode');
        await caption(page, 'Flat View', 'Face Mode');
        await takeSnapshot(page, 'part5.5-caption', SNAP_CAPTION);
        await wait(SHORT_PAUSE);

        await clickCmd(page, 'flat.face-direct-mode');
        await wait(200);
        await takeSnapshot(page, 'part5.5-face-mode-on');

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
            await takeSnapshot(page, 'part5.5-after-drag', SNAP_HOLD);
            await wait(MOVE_PAUSE);
        }
    }

    await hideCaption(page);
    await wait(ACT_GAP);
}

// ─── Act 6: Finale ──────────────────────────────────────────────────────────────

export async function act6_finale(page: Page): Promise<void> {
    logAct('Act 6: Finale');

    if (shouldRunPart('6.1')) {
        logPart('Part 6.1: Keyboard shortcuts');
        // Timeline: caption → SHORT_PAUSE(400) → 4×(keypress+wait(200))=800 → MOVE_PAUSE(700) ≈ 1900ms
        startSnapshotSchedule(page, 'part6.1', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
            { offsetMs: 400, label: 'before-keys' },
            { offsetMs: 600, label: 'key-r' },
            { offsetMs: 800, label: 'key-u' },
            { offsetMs: 1000, label: 'key-R-prime' },
            { offsetMs: 1200, label: 'key-U-prime' },
            { offsetMs: 1500, label: 'keys-done' },
            { offsetMs: 1800, label: 'after-keys', durationMs: SNAP_HOLD },
        ]);
        await caption(page, 'Keyboard shortcuts', 'All moves available via single keypress');
        await wait(SHORT_PAUSE);

        await captureAtMoment(page, {
            move: 'r',
            moments: [{ at: 0.5, label: 'part6.1-mid-R', hold: true }],
        });
        await wait(200);
        await page.keyboard.press('u');
        await wait(200);
        await page.keyboard.press('Shift+r');
        await wait(200);
        await page.keyboard.press('Shift+u');
        await awaitAnimationIdle(page);
        await wait(200);
        await awaitSnapshotSchedule();
    }

    if (shouldRunPart('6.2')) {
        logPart('Part 6.2: Scramble');
        // Open the controls panel so the Scramble/Reset buttons are visible
        await ensureMenu(page, true);
        await caption(page, 'Scramble');
        await wait(SHORT_PAUSE);

        // Timeline: clickCmd scramble(~750) → SHORT_PAUSE(400) ≈ 1150ms
        startSnapshotSchedule(page, 'part6.2', [
            { offsetMs: 0, label: 'before-scramble' },
            { offsetMs: 200, label: 'scrambling-1' },
            { offsetMs: 400, label: 'scrambling-2' },
            { offsetMs: 600, label: 'scrambling-3' },
            { offsetMs: 800, label: 'scrambled' },
            { offsetMs: 1000, label: 'scrambled-settled', durationMs: SNAP_HOLD },
        ]);
        await clickCmd(page, 'scramble-cube');
        await wait(SHORT_PAUSE);
        await awaitSnapshotSchedule();
    }

    if (shouldRunPart('6.3')) {
        logPart('Part 6.3: Reset Cube');
        // Timeline: caption → SHORT_PAUSE(400) → clickCmd reset(~750) → SHORT_PAUSE(400) ≈ 1550ms
        startSnapshotSchedule(page, 'part6.3', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
            { offsetMs: 300, label: 'before-reset' },
            { offsetMs: 600, label: 'resetting' },
            { offsetMs: 900, label: 'reset-done' },
            { offsetMs: 1200, label: 'reset-settled', durationMs: SNAP_HOLD },
        ]);
        await caption(page, 'Reset Cube');
        await wait(SHORT_PAUSE);

        await clickCmd(page, 'reset-cube');
        await wait(SHORT_PAUSE);
        await awaitSnapshotSchedule();

        // Close the controls panel again
        await ensureMenu(page, false);
    }

    if (shouldRunPart('6.4')) {
        logPart('Part 6.4: Epilogue');
        // Timeline: caption → CAPTION_HOLD+1000(3000) → hideCaption → wait(500) ≈ 3500ms
        startSnapshotSchedule(page, 'part6.4', [
            { offsetMs: 0, label: 'caption', durationMs: SNAP_CAPTION },
            { offsetMs: 2500, label: 'epilogue-hold', durationMs: SNAP_HOLD },
        ]);
        await caption(page, "Rubik's Cube", 'github.com/mm6502/rubiks-cube');
        await wait(CAPTION_HOLD + 1000);

        await awaitSnapshotSchedule();
    }

    await hideCaption(page);
    await wait(500);
}
