import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ZoomPanController } from './zoom-pan';

// ── Event helpers ──────────────────────────────────────────────────────────

function fireWheel(el: HTMLElement, deltaY: number, clientX = 0, clientY = 0): WheelEvent {
    const event = new WheelEvent('wheel', {
        deltaY,
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
    });
    el.dispatchEvent(event);
    return event;
}

function firePointer(
    el: HTMLElement,
    type: string,
    pointerId: number,
    clientX: number,
    clientY: number,
    init: PointerEventInit = {}
): PointerEvent {
    const event = new PointerEvent(type, {
        pointerId,
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
        ...init,
    });
    el.dispatchEvent(event);
    return event;
}

function fireClick(el: HTMLElement): MouseEvent {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
}

function fireDblClick(el: HTMLElement): void {
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
}

// ── Assertion helpers ──────────────────────────────────────────────────────

function parseTransform(el: HTMLElement): { tx: number; ty: number; scale: number } | null {
    const m = el.style.transform.match(/translate\(([^p]+)px,\s*([^p]+)px\)\s*scale\(([^)]+)\)/);
    if (!m) return null;
    return { tx: parseFloat(m[1]), ty: parseFloat(m[2]), scale: parseFloat(m[3]) };
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('ZoomPanController', () => {
    let clipEl: HTMLElement;
    let transformEl: HTMLElement;
    let ctrl: ZoomPanController;

    beforeEach(() => {
        clipEl = document.createElement('div');
        transformEl = document.createElement('div');

        // JSDOM stubs for pointer capture APIs.
        clipEl.setPointerCapture = vi.fn();
        clipEl.releasePointerCapture = vi.fn();

        // getBoundingClientRect: position at (10, 20) so we can verify pivot offsets.
        vi.spyOn(clipEl, 'getBoundingClientRect').mockReturnValue({
            left: 10,
            top: 20,
            right: 110,
            bottom: 120,
            width: 100,
            height: 100,
            x: 10,
            y: 20,
            toJSON: () => ({}),
        } as DOMRect);

        ctrl = new ZoomPanController(clipEl, transformEl);
    });

    afterEach(() => {
        ctrl.destroy();
        vi.restoreAllMocks();
    });

    // ── Constructor ────────────────────────────────────────────────────────

    describe('constructor', () => {
        it('sets overflow:hidden on clipEl', () => {
            // Arrange & Act: ZoomPanController constructed in beforeEach

            // Assert
            expect(clipEl.style.overflow).toBe('hidden');
        });

        it('sets cursor:grab on clipEl', () => {
            // Arrange & Act: ZoomPanController constructed in beforeEach

            // Assert
            expect(clipEl.style.cursor).toBe('grab');
        });

        it('sets touch-action:none on clipEl', () => {
            // Arrange & Act: ZoomPanController constructed in beforeEach

            // Assert
            expect(clipEl.style.touchAction).toBe('none');
        });

        it('sets transform-origin:0 0 on transformEl', () => {
            // Arrange & Act: ZoomPanController constructed in beforeEach

            // Assert
            expect(transformEl.style.transformOrigin).toBe('0 0');
        });
    });

    // ── reset() ───────────────────────────────────────────────────────────

    describe('reset()', () => {
        it('writes translate(0px, 0px) scale(1) after being called fresh', () => {
            // Arrange: ZoomPanController constructed in beforeEach (scale=1, tx=0, ty=0)

            // Act
            ctrl.reset();

            // Assert
            expect(transformEl.style.transform).toBe('translate(0px, 0px) scale(1)');
        });

        it('restores identity transform after a zoom-in', () => {
            // Arrange: zoom in so scale > 1
            fireWheel(clipEl, -100, 60, 70); // deltaY=-100 → factor=1.1 → scale increases
            expect(parseTransform(transformEl)!.scale).toBeGreaterThan(1);

            // Act
            ctrl.reset();

            // Assert
            const t = parseTransform(transformEl)!;
            expect(t.scale).toBeCloseTo(1);
            expect(t.tx).toBeCloseTo(0);
            expect(t.ty).toBeCloseTo(0);
        });

        it('can be called multiple times without throwing', () => {
            // Arrange: ZoomPanController constructed in beforeEach

            // Act
            ctrl.reset();
            ctrl.reset();

            // Assert
            expect(parseTransform(transformEl)!.scale).toBeCloseTo(1);
        });
    });

    // ── destroy() ─────────────────────────────────────────────────────────

    describe('destroy()', () => {
        it('clears all inline styles on clipEl', () => {
            // Arrange: styles applied during construction in beforeEach

            // Act
            ctrl.destroy();

            // Assert
            expect(clipEl.style.overflow).toBe('');
            expect(clipEl.style.cursor).toBe('');
            expect(clipEl.style.touchAction).toBe('');
        });

        it('clears all inline styles on transformEl', () => {
            // Arrange: styles applied during construction in beforeEach

            // Act
            ctrl.destroy();

            // Assert
            expect(transformEl.style.transformOrigin).toBe('');
            expect(transformEl.style.transform).toBe('');
        });

        it('wheel events are ignored after destroy', () => {
            // Arrange
            ctrl.destroy();
            transformEl.style.transform = '';

            // Act
            fireWheel(clipEl, -100, 60, 70);

            // Assert
            expect(transformEl.style.transform).toBe('');
        });

        it('pointer events are ignored after destroy', () => {
            // Arrange
            ctrl.destroy();
            transformEl.style.transform = '';

            // Act
            firePointer(clipEl, 'pointerdown', 1, 50, 50);
            firePointer(clipEl, 'pointermove', 1, 100, 100);

            // Assert
            expect(transformEl.style.transform).toBe('');
        });

        it('dblclick is ignored after destroy', () => {
            // Arrange
            const resetSpy = vi.spyOn(ctrl, 'reset');
            ctrl.destroy();

            // Act
            fireDblClick(clipEl);

            // Assert
            expect(resetSpy).not.toHaveBeenCalled();
        });
    });

    // ── Wheel zoom ─────────────────────────────────────────────────────────

    describe('wheel zoom', () => {
        it('increases scale on negative deltaY', () => {
            // Arrange: ZoomPanController constructed in beforeEach

            // Act
            fireWheel(clipEl, -100, 60, 70); // factor = 1.1

            // Assert
            expect(parseTransform(transformEl)!.scale).toBeGreaterThan(1);
        });

        it('decreases scale on positive deltaY', () => {
            // Arrange: ZoomPanController constructed in beforeEach

            // Act
            fireWheel(clipEl, 100, 60, 70); // factor = 0.9

            // Assert
            expect(parseTransform(transformEl)!.scale).toBeLessThan(1);
        });

        it('calculates pivot offset relative to clipEl (left=10, top=20)', () => {
            // Arrange: clipEl.getBoundingClientRect() mocked to left=10, top=20 (see beforeEach)
            // clientX=60, clientY=70 → pivot=(50,50) in clipEl space
            // factor=1.1 → tx' = 50*(1-1.1)+1.1*0 = -5, ty' = same

            // Act
            fireWheel(clipEl, -100, 60, 70);

            // Assert
            const t = parseTransform(transformEl)!;
            expect(t.tx).toBeCloseTo(-5, 1);
            expect(t.ty).toBeCloseTo(-5, 1);
        });

        it('accumulates zoom correctly across multiple wheel events', () => {
            // Arrange: ZoomPanController constructed in beforeEach

            // Act
            fireWheel(clipEl, -100, 60, 70); // factor 1.1 → scale 1.1
            fireWheel(clipEl, -100, 60, 70); // factor 1.1 → scale ~1.21

            // Assert
            expect(parseTransform(transformEl)!.scale).toBeGreaterThan(1.1);
        });

        it('clamps scale to MAX_SCALE (10)', () => {
            // Arrange: ZoomPanController constructed in beforeEach

            // Act
            for (let i = 0; i < 50; i++) fireWheel(clipEl, -10000, 60, 70);

            // Assert
            expect(parseTransform(transformEl)!.scale).toBeLessThanOrEqual(10);
        });

        it('clamps scale to MIN_SCALE (0.2)', () => {
            // Arrange: ZoomPanController constructed in beforeEach

            // Act
            for (let i = 0; i < 50; i++) fireWheel(clipEl, 10000, 60, 70);

            // Assert
            expect(parseTransform(transformEl)!.scale).toBeGreaterThanOrEqual(0.2);
        });

        it('calls preventDefault on the wheel event', () => {
            // Arrange: ZoomPanController constructed in beforeEach

            // Act
            const event = fireWheel(clipEl, -100, 60, 70);

            // Assert
            expect(event.defaultPrevented).toBe(true);
        });
    });

    // ── Pointer drag (pan) ─────────────────────────────────────────────────

    describe('pointer drag (pan)', () => {
        it('does not pan when movement is below DRAG_THRESHOLD (4 px)', () => {
            // Arrange
            firePointer(clipEl, 'pointerdown', 1, 50, 50);

            // Act
            firePointer(clipEl, 'pointermove', 1, 52, 52); // ~2.8 px — below DRAG_THRESHOLD

            // Assert
            expect(transformEl.style.transform).toBe(''); // no transform written
        });

        it('starts panning once movement exceeds DRAG_THRESHOLD', () => {
            // Arrange
            firePointer(clipEl, 'pointerdown', 1, 50, 50);

            // Act
            firePointer(clipEl, 'pointermove', 1, 55, 55); // ~7 px — crosses threshold

            // Assert — first move resets lastX/Y so the initial delta is zero
            const t = parseTransform(transformEl)!;
            expect(t.tx).toBeCloseTo(0);
            expect(t.ty).toBeCloseTo(0);
            expect(t.scale).toBeCloseTo(1);
        });

        it('pans by the cumulative pointer delta after threshold', () => {
            // Arrange — cross threshold first so subsequent moves register as pan
            firePointer(clipEl, 'pointerdown', 1, 50, 50);
            firePointer(clipEl, 'pointermove', 1, 55, 55); // threshold crossed; delta=0

            // Act
            firePointer(clipEl, 'pointermove', 1, 65, 70); // delta=(10,15)

            // Assert
            const t = parseTransform(transformEl)!;
            expect(t.tx).toBeCloseTo(10);
            expect(t.ty).toBeCloseTo(15);
        });

        it('accumulates pan across multiple moves', () => {
            // Arrange — cross threshold first so subsequent moves register as pan
            firePointer(clipEl, 'pointerdown', 1, 50, 50);
            firePointer(clipEl, 'pointermove', 1, 55, 55); // threshold crossed; delta=0

            // Act
            firePointer(clipEl, 'pointermove', 1, 60, 60); // delta=(5,5)
            firePointer(clipEl, 'pointermove', 1, 70, 75); // delta=(10,15)

            // Assert
            const t = parseTransform(transformEl)!;
            expect(t.tx).toBeCloseTo(15);
            expect(t.ty).toBeCloseTo(20);
        });

        it('sets cursor to grabbing when drag starts', () => {
            // Arrange
            firePointer(clipEl, 'pointerdown', 1, 50, 50);

            // Act
            firePointer(clipEl, 'pointermove', 1, 55, 60); // drag threshold crossed

            // Assert
            expect(clipEl.style.cursor).toBe('grabbing');
        });

        it('calls setPointerCapture when drag starts', () => {
            // Arrange
            firePointer(clipEl, 'pointerdown', 1, 50, 50);

            // Act
            firePointer(clipEl, 'pointermove', 1, 55, 60); // drag threshold crossed

            // Assert
            expect(clipEl.setPointerCapture).toHaveBeenCalledWith(1);
        });

        it('ignores pointermove for an unknown pointer id', () => {
            // Arrange
            const before = transformEl.style.transform;

            // Act
            firePointer(clipEl, 'pointermove', 99, 50, 50);

            // Assert
            expect(transformEl.style.transform).toBe(before);
        });

        it('restores cursor to grab on pointerup', () => {
            // Arrange
            firePointer(clipEl, 'pointerdown', 1, 50, 50);
            firePointer(clipEl, 'pointermove', 1, 55, 60); // start drag

            // Act
            firePointer(clipEl, 'pointerup', 1, 55, 60);

            // Assert
            expect(clipEl.style.cursor).toBe('grab');
        });

        it('restores cursor to grab on pointercancel', () => {
            // Arrange
            firePointer(clipEl, 'pointerdown', 1, 50, 50);
            firePointer(clipEl, 'pointermove', 1, 55, 60); // start drag

            // Act
            firePointer(clipEl, 'pointercancel', 1, 55, 60);

            // Assert
            expect(clipEl.style.cursor).toBe('grab');
        });

        it('hasDragged is false after pointerdown without move', () => {
            // Arrange: ZoomPanController constructed in beforeEach

            // Act
            firePointer(clipEl, 'pointerdown', 1, 50, 50);

            // Assert
            expect((ctrl as any).hasDragged).toBe(false);
        });
    });

    // ── Double-click / double-tap reset ───────────────────────────────────

    describe('dblclick reset', () => {
        it('resets to identity transform on double-click', () => {
            // Arrange
            fireWheel(clipEl, -500, 60, 70); // zoom in heavily

            // Act
            fireDblClick(clipEl);

            // Assert
            const t = parseTransform(transformEl)!;
            expect(t.scale).toBeCloseTo(1);
            expect(t.tx).toBeCloseTo(0);
            expect(t.ty).toBeCloseTo(0);
        });

        it('resets after a drag as well', () => {
            // Arrange
            firePointer(clipEl, 'pointerdown', 1, 50, 50);
            firePointer(clipEl, 'pointermove', 1, 55, 55);
            firePointer(clipEl, 'pointermove', 1, 150, 150);
            firePointer(clipEl, 'pointerup', 1, 150, 150);

            // Act
            fireDblClick(clipEl);

            // Assert
            const t = parseTransform(transformEl)!;
            expect(t.tx).toBeCloseTo(0);
            expect(t.ty).toBeCloseTo(0);
        });
    });

    // ── Click suppression after drag ──────────────────────────────────────

    describe('click suppression', () => {
        it('allows click to propagate when there was no prior drag', () => {
            // Arrange
            const spy = vi.fn();
            clipEl.addEventListener('click', spy);

            // Act
            fireClick(clipEl);

            // Assert
            expect(spy).toHaveBeenCalledOnce();
        });

        it('suppresses click bubbling immediately after a drag', () => {
            // Arrange — perform a drag so hasDragged=true, then register a bubble-phase listener
            firePointer(clipEl, 'pointerdown', 1, 50, 50);
            firePointer(clipEl, 'pointermove', 1, 55, 60); // drag threshold crossed
            firePointer(clipEl, 'pointerup', 1, 55, 60);
            const spy = vi.fn();
            clipEl.addEventListener('click', spy); // bubble-phase

            // Act
            fireClick(clipEl);

            // Assert — capture-phase handler calls stopImmediatePropagation
            expect(spy).not.toHaveBeenCalled();
        });

        it('clears hasDragged so the next click propagates normally', () => {
            // Arrange — consume the first click to clear hasDragged, then register spy
            firePointer(clipEl, 'pointerdown', 1, 50, 50);
            firePointer(clipEl, 'pointermove', 1, 55, 60);
            firePointer(clipEl, 'pointerup', 1, 55, 60);
            fireClick(clipEl); // consumed by capture handler; clears hasDragged
            const spy = vi.fn();
            clipEl.addEventListener('click', spy);

            // Act
            fireClick(clipEl); // hasDragged is now false; click propagates

            // Assert
            expect(spy).toHaveBeenCalledOnce();
        });
    });

    // ── Pinch zoom ────────────────────────────────────────────────────────

    describe('pinch zoom', () => {
        it('increases scale when fingers spread apart', () => {
            // Arrange — two fingers at distance 20
            firePointer(clipEl, 'pointerdown', 1, 40, 50);
            firePointer(clipEl, 'pointerdown', 2, 60, 50);

            // Act — move pointer 1 outward: distance to (60,50) becomes 30 → factor 1.5
            firePointer(clipEl, 'pointermove', 1, 30, 50);

            // Assert
            expect(parseTransform(transformEl)!.scale).toBeGreaterThan(1);
        });

        it('decreases scale when fingers pinch together', () => {
            // Arrange — two fingers at distance 60
            firePointer(clipEl, 'pointerdown', 1, 20, 50);
            firePointer(clipEl, 'pointerdown', 2, 80, 50);

            // Act — move pointer 1 inward: distance to (80,50) becomes 40 → factor ~0.67
            firePointer(clipEl, 'pointermove', 1, 40, 50);

            // Assert
            expect(parseTransform(transformEl)!.scale).toBeLessThan(1);
        });

        it('skips pinch zoom when lastPinchDist is 0', () => {
            // Arrange — two fingers down, then force lastPinchDist to 0 to exercise the guard
            firePointer(clipEl, 'pointerdown', 1, 40, 50);
            firePointer(clipEl, 'pointerdown', 2, 60, 50);
            (ctrl as any).lastPinchDist = 0;

            // Act
            firePointer(clipEl, 'pointermove', 1, 30, 50); // new distance = 30, but guard prevents zoom

            // Assert — zoomAround not called; scale stays at 1
            const t = parseTransform(transformEl);
            const scale = t ? t.scale : 1;
            expect(scale).toBeCloseTo(1);
        });

        it('updates lastPinchDist after each pinch move', () => {
            // Arrange — two fingers at distance 20
            firePointer(clipEl, 'pointerdown', 1, 40, 50);
            firePointer(clipEl, 'pointerdown', 2, 60, 50);

            // Act
            firePointer(clipEl, 'pointermove', 1, 30, 50); // new distance from (30,50) to (60,50) = 30

            // Assert
            expect((ctrl as any).lastPinchDist).toBeCloseTo(30);
        });

        it('transitions from pinch back to single-pointer pan on second finger lift', () => {
            // Arrange
            firePointer(clipEl, 'pointerdown', 1, 40, 50);
            firePointer(clipEl, 'pointerdown', 2, 60, 50);

            // Act
            firePointer(clipEl, 'pointerup', 2, 60, 50);

            // Assert — 1 active pointer remains; pinch state reset; ready for single-finger pan
            expect((ctrl as any).lastPinchDist).toBe(0);
            expect((ctrl as any).hasDragged).toBe(false);
            expect((ctrl as any).activePointers.size).toBe(1);
        });

        it('restores correct lastX/Y for pan after second finger is lifted', () => {
            // Arrange
            firePointer(clipEl, 'pointerdown', 1, 40, 50);
            firePointer(clipEl, 'pointerdown', 2, 60, 50);

            // Act
            firePointer(clipEl, 'pointerup', 2, 60, 50);

            // Assert — lastX/Y tracks the remaining pointer at (40, 50)
            expect((ctrl as any).lastX).toBe(40);
            expect((ctrl as any).lastY).toBe(50);
        });

        it('fires pointercancel for second finger has same effect as pointerup', () => {
            // Arrange
            firePointer(clipEl, 'pointerdown', 1, 40, 50);
            firePointer(clipEl, 'pointerdown', 2, 60, 50);

            // Act
            firePointer(clipEl, 'pointercancel', 2, 60, 50);

            // Assert
            expect((ctrl as any).lastPinchDist).toBe(0);
            expect((ctrl as any).activePointers.size).toBe(1);
        });

        it('pans when both fingers move together without changing distance', () => {
            // Arrange initial two touches at distance 20.
            firePointer(clipEl, 'pointerdown', 1, 40, 50, { pointerType: 'touch' });
            firePointer(clipEl, 'pointerdown', 2, 60, 50, { pointerType: 'touch' });

            // Establish a dragged baseline with both fingers shifted to
            // (50,65) and (70,65), still distance 20.
            firePointer(clipEl, 'pointermove', 1, 50, 65, { pointerType: 'touch' });
            firePointer(clipEl, 'pointermove', 2, 70, 65, { pointerType: 'touch' });
            const before = parseTransform(transformEl)!;

            // Act: move both fingers by the same delta (+10,+15) in two events.
            firePointer(clipEl, 'pointermove', 1, 60, 80, { pointerType: 'touch' });
            firePointer(clipEl, 'pointermove', 2, 80, 80, { pointerType: 'touch' });

            // Assert: scale remains stable while translation follows the midpoint.
            const after = parseTransform(transformEl)!;
            expect(after.scale).toBeCloseTo(before.scale, 5);
            expect(after.tx).toBeCloseTo(before.tx + 10, 1);
            expect(after.ty).toBeCloseTo(before.ty + 15, 1);
        });
    });
});

describe('ZoomPanController (delegated-left-drag mode)', () => {
    let clipEl: HTMLElement;
    let transformEl: HTMLElement;

    beforeEach(() => {
        clipEl = document.createElement('div');
        transformEl = document.createElement('div');
        clipEl.setPointerCapture = vi.fn();
        clipEl.releasePointerCapture = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates left-button drags instead of panning', () => {
        // Arrange
        const delegate = {
            onPointerDown: vi.fn(),
            onPointerMove: vi.fn(),
            onPointerUp: vi.fn(),
            onPointerCancel: vi.fn(),
        };
        const ctrl = new ZoomPanController(clipEl, transformEl, {
            gestureMode: 'delegated-left-drag',
            pointerDelegate: delegate,
        });

        // Act
        firePointer(clipEl, 'pointerdown', 1, 50, 50);
        firePointer(clipEl, 'pointermove', 1, 70, 50);
        firePointer(clipEl, 'pointerup', 1, 70, 50);

        // Assert
        expect(delegate.onPointerDown).toHaveBeenCalledTimes(1);
        expect(delegate.onPointerMove).toHaveBeenCalledTimes(1);
        expect(delegate.onPointerUp).toHaveBeenCalledTimes(1);
        expect(transformEl.style.transform).toBe('');

        ctrl.destroy();
    });

    it('still pans for Ctrl+left drag in delegated mode', () => {
        // Arrange
        const ctrl = new ZoomPanController(clipEl, transformEl, {
            gestureMode: 'delegated-left-drag',
            pointerDelegate: {
                onPointerDown: vi.fn(),
                onPointerMove: vi.fn(),
                onPointerUp: vi.fn(),
                onPointerCancel: vi.fn(),
            },
        });

        // Act
        const down = new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 7,
            clientX: 50,
            clientY: 50,
            button: 0,
            ctrlKey: true,
            pointerType: 'mouse',
        });
        clipEl.dispatchEvent(down);
        firePointer(clipEl, 'pointermove', 7, 58, 58);
        firePointer(clipEl, 'pointermove', 7, 70, 80);

        // Assert
        expect(transformEl.style.transform).not.toBe('');
        const transform = parseTransform(transformEl)!;
        expect(transform.tx).toBeGreaterThan(0);
        expect(transform.ty).toBeGreaterThan(0);

        ctrl.destroy();
    });

    it('pans with middle-button drag in delegated mode', () => {
        // Regression: middle-button pan must work in both floating and tabbed layout
        // modes (delegated-left-drag is used in both). Chrome activates auto-scroll on
        // mousedown(button=1); verify that both pointerdown and mousedown suppress it
        // via preventDefault(), and that the pointermove-based pan path executes.
        const delegate = {
            onPointerDown: vi.fn(),
            onPointerMove: vi.fn(),
            onPointerUp: vi.fn(),
            onPointerCancel: vi.fn(),
        };
        const ctrl = new ZoomPanController(clipEl, transformEl, {
            gestureMode: 'delegated-left-drag',
            pointerDelegate: delegate,
        });

        // middle-button pointerdown — should NOT be delegated, should be added to activePointers
        const downEvent = new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            clientX: 50,
            clientY: 50,
            button: 1,
            pointerType: 'mouse',
        });
        clipEl.dispatchEvent(downEvent);

        // Should not reach the touch handler
        expect(delegate.onPointerDown).not.toHaveBeenCalled();
        // pointerdown should have been cancelled to suppress Chrome auto-scroll
        expect(downEvent.defaultPrevented).toBe(true);

        // middle-button mousedown — also should be cancelled
        const mouseDownEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 1,
        });
        clipEl.dispatchEvent(mouseDownEvent);
        expect(mouseDownEvent.defaultPrevented).toBe(true);

        // Now drag past the threshold
        const move1 = new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            clientX: 55,
            clientY: 55,
            pointerType: 'mouse',
        });
        clipEl.dispatchEvent(move1);

        const move2 = new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            clientX: 70,
            clientY: 80,
            pointerType: 'mouse',
        });
        clipEl.dispatchEvent(move2);

        // Pan should have occurred
        expect(transformEl.style.transform).not.toBe('');
        const transform = parseTransform(transformEl)!;
        expect(transform.tx).toBeGreaterThan(0);
        expect(transform.ty).toBeGreaterThan(0);

        ctrl.destroy();
    });

    it('promotes delegated touch gesture to two-finger pinch+pan', () => {
        // Arrange
        const delegate = {
            onPointerDown: vi.fn(),
            onPointerMove: vi.fn(),
            onPointerUp: vi.fn(),
            onPointerCancel: vi.fn(),
        };
        const ctrl = new ZoomPanController(clipEl, transformEl, {
            gestureMode: 'delegated-left-drag',
            pointerDelegate: delegate,
        });

        // First touch is delegated.
        firePointer(clipEl, 'pointerdown', 1, 40, 50, { pointerType: 'touch' });
        expect(delegate.onPointerDown).toHaveBeenCalledTimes(1);

        // Second touch should cancel delegated gesture and switch to pan/zoom tracking.
        firePointer(clipEl, 'pointerdown', 2, 60, 50, { pointerType: 'touch' });
        expect(delegate.onPointerCancel).toHaveBeenCalledTimes(1);

        // Cross threshold and establish a baseline where both fingers moved to
        // (50,65) and (70,65), still distance 20.
        firePointer(clipEl, 'pointermove', 1, 50, 65, { pointerType: 'touch' });
        firePointer(clipEl, 'pointermove', 2, 70, 65, { pointerType: 'touch' });
        const before = parseTransform(transformEl)!;

        // Move both fingers by (+10,+15) (pure pan end-state).
        firePointer(clipEl, 'pointermove', 1, 60, 80, { pointerType: 'touch' });
        firePointer(clipEl, 'pointermove', 2, 80, 80, { pointerType: 'touch' });
        const panned = parseTransform(transformEl)!;
        expect(panned.scale).toBeCloseTo(before.scale, 5);
        expect(panned.tx).toBeCloseTo(before.tx + 10, 1);
        expect(panned.ty).toBeCloseTo(before.ty + 15, 1);

        // Then spread fingers to verify pinch still zooms.
        firePointer(clipEl, 'pointermove', 2, 90, 65, { pointerType: 'touch' });
        const zoomed = parseTransform(transformEl)!;
        expect(zoomed.scale).toBeGreaterThan(panned.scale);

        ctrl.destroy();
    });
});
