---
title:
  Use global timeline freeze for CDP animation capture, not per-animation
  control
date: 2026-04-19
category: best-practices
module: demo-recording
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Capturing mid-animation screenshots via CDP during demo recording
  - Working with WAAPI animations that include ghost fades or multiple
    concurrent animations
  - Using CDP Animation domain to pause/seek/resume animations
tags:
  - cdp
  - animation
  - waapi
  - playwright
  - demo-recording
  - screenshot
---

# Use global timeline freeze for CDP animation capture, not per-animation control

## Context

The demo recording system (`scripts/demo-video/`) needed mid-animation
screenshots — freezing the Rubik's Cube circular view during a move to capture
stickers in a rotated state. The CDP Animation domain provides per-animation
primitives (`Animation.setPaused`, `Animation.seekAnimations`,
`animationStarted` events) that seem like the right tool.

## Guidance

Use global timeline control instead of per-animation CDP primitives:

```typescript
// Freeze all animations (global)
await cdpSession.send('Animation.setPlaybackRate', { playbackRate: 0 });
// Tick one frame so the freeze takes effect
await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

// Seek all running animations via JS (not CDP)
await page.evaluate(t => {
  document.getAnimations().forEach(a => {
    a.currentTime = t;
  });
}, targetTimeMs);
await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

// Screenshot the frozen state
await cdpSession.send('Page.captureScreenshot', { format: 'png' });

// Unfreeze
await cdpSession.send('Animation.setPlaybackRate', { playbackRate: 1 });
```

For the settle period (waiting for animations to start after triggering a move),
a simple `await wait(80)` is sufficient — no need for CDP event-based detection.

## Why This Matters

Per-animation CDP control fails in practice because:

1. **Animation count explosion** — A single Rubik's Cube move triggers ~70
   animations (sticker rotations at 300ms plus ghost fades, whose durations
   varied). Collecting IDs from `animationStarted` events and issuing
   per-animation `setPaused` on 70 IDs breaks the animation lifecycle.

2. **Duration variable corruption** — When collecting animation metadata from
   CDP events, the `duration` variable gets overwritten by the last event. Ghost
   fades overwrite the sticker rotation duration (300ms), causing seek
   calculations to target wrong positions.

3. **Leaked paused animations** — Per-animation `setPaused` + `resumeAnimations`
   doesn't cleanly resume all animations. Some remain stuck, causing
   `awaitAnimationIdle` (which waits for
   `document.getAnimations().length === 0`) to time out. Today the readiness
   predicate is `document.getAnimations().every(a => a.playState !== 'running')`
   with a 2000ms default, so the long wait this doc describes no longer applies.

The global `setPlaybackRate(0)` approach avoids all three problems — it freezes
the entire document timeline atomically, and `document.getAnimations()` via
`page.evaluate` provides clean JS-level seek without CDP animation ID
management.

## When to Apply

- Capturing screenshots of WAAPI animations mid-flight via CDP
- Any scenario where multiple animations run concurrently with different
  durations
- When ghost/fade animations coexist with primary animations

## Examples

The composable API built on this pattern (`scripts/demo-video/demo-helpers.ts`):

```typescript
// All-in-one shortcut for capturing a move at specific moments
await captureAtMoment(page, {
  move: 'r',
  moments: [{ at: 0.5, label: 'mid-R', hold: true }],
});

// Or step-by-step with the handle API
const capture = startAnimationCapture(page, 300);
await page.keyboard.press('r');
await capture.settle(); // wait 80ms for animations to start
await capture.at(0.5, 'mid'); // freeze → seek to 150ms → screenshot → unfreeze
await capture.finish(); // ensure all animations complete
```

## Related

- `scripts/demo-video/record-demo.ts` — CDP session management and animation
  primitives
- `scripts/demo-video/demo-helpers.ts` — `startAnimationCapture`,
  `captureAtMoment` API
