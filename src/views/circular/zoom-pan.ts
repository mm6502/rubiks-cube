// fallow-ignore-file unused-class-member
/**
 * ZoomPanController
 *
 * Adds mouse-wheel zoom, pointer-drag pan, pinch-to-zoom, and
 * double-click/tap reset to a pair of elements:
 *
 *   clipEl        — receives events; gets `overflow:hidden` so content
 *                   outside the viewport is clipped.
 *   transformEl   — the direct child that receives the CSS transform.
 *                   Must have its layout origin at (0,0) relative to
 *                   clipEl (i.e. `position:absolute; inset:0`) so that
 *                   the zoom-around-cursor math is correct.
 *
 * The transform applied is `translate(tx, ty) scale(s)` with
 * `transform-origin: 0 0`, which means all coordinates are in clipEl
 * space and the formula is simply:
 *
 *   tx' = pivot_x * (1 - factor) + factor * tx
 *   ty' = pivot_y * (1 - factor) + factor * ty
 */

const MIN_SCALE = 0.2;
const MAX_SCALE = 10;
/** Wheel units → scale factor; tweak for feel. */
const WHEEL_SENSITIVITY = 0.001;
/** Pixels of movement before a pointer-down is treated as a drag. */
const DRAG_THRESHOLD = 4;

export type ZoomPanPointerDelegate = {
    onPointerDown: (event: PointerEvent, target: EventTarget | null) => void;
    onPointerMove: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent, target: EventTarget | null) => void;
    onPointerCancel: (event: PointerEvent) => void;
};

export type ZoomPanControllerOptions = {
    /**
     * `legacy` preserves original behavior where left-drag pans.
     * `delegated-left-drag` is used by circular touch interactions where
     * left-drag is delegated and pan is middle-mouse / Ctrl+left.
     */
    gestureMode?: 'legacy' | 'delegated-left-drag';
    pointerDelegate?: ZoomPanPointerDelegate;
    isDelegateTarget?: (target: EventTarget | null) => boolean;
};

export class ZoomPanController {
    private scale = 1;
    private tx = 0;
    private ty = 0;

    /** Start position of the current pointer gesture (for drag threshold). */
    private startX = 0;
    private startY = 0;
    /** Last known position of the primary pointer (for delta pan). */
    private lastX = 0;
    private lastY = 0;
    /** True once the pointer has moved more than DRAG_THRESHOLD pixels. */
    private hasDragged = false;

    /** All currently-active pointers (for pinch detection). */
    private readonly activePointers = new Map<number, { x: number; y: number }>();
    /** Distance between the two fingers at the last pinch sample. */
    private lastPinchDist = 0;
    /** Midpoint between the two fingers at the last pinch sample. */
    private lastPinchCenter: { x: number; y: number } | null = null;

    /** Pointers delegated to an interaction handler (move gestures). */
    private readonly delegatedPointers = new Set<number>();
    private readonly delegatedPointerPositions = new Map<number, { x: number; y: number }>();

    private gestureMode: 'legacy' | 'delegated-left-drag';
    private readonly pointerDelegate?: ZoomPanPointerDelegate;
    private readonly isDelegateTarget?: (target: EventTarget | null) => boolean;

    private readonly abort = new AbortController();

    constructor(
        private readonly clipEl: HTMLElement,
        private readonly transformEl: HTMLElement,
        options: ZoomPanControllerOptions = {}
    ) {
        this.gestureMode = options.gestureMode ?? 'legacy';
        this.pointerDelegate = options.pointerDelegate;
        this.isDelegateTarget = options.isDelegateTarget;

        // Clip overflowing content when panned/zoomed.
        clipEl.style.overflow = 'hidden';
        // Show grab cursor to hint pan is available.
        clipEl.style.cursor = 'grab';
        // Prevent native browser touch gestures (scroll, pinch) from
        // interfering so our pointer events are delivered reliably.
        clipEl.style.touchAction = 'none';
        // Transform origin at top-left so pivot math is simply
        // pixel offsets from clipEl's top-left corner.
        transformEl.style.transformOrigin = '0 0';

        this.attach();
    }

    /** Reset to 1:1, centred state. */
    reset(): void {
        this.scale = 1;
        this.tx = 0;
        this.ty = 0;
        this.applyTransform();
    }

    /**
     * Switch the gesture mode at runtime (e.g. when layout changes between
     * floating and tabbed). In `legacy` mode left-drag pans; in
     * `delegated-left-drag` mode left-drag is forwarded to the pointer delegate.
     */
    setGestureMode(mode: 'legacy' | 'delegated-left-drag'): void {
        this.gestureMode = mode;
    }

    /** Remove all event listeners and restore original inline styles. */
    destroy(): void {
        this.abort.abort();
        this.clipEl.style.overflow = '';
        this.clipEl.style.cursor = '';
        this.clipEl.style.touchAction = '';
        this.transformEl.style.transformOrigin = '';
        this.transformEl.style.transform = '';
    }

    // ─── Private helpers ────────────────────────────────────────────────────

    private applyTransform(): void {
        this.transformEl.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    }

    /**
     * Zoom by `factor`, keeping the clipEl-relative pixel (pivotX, pivotY) fixed.
     */
    private zoomAround(pivotX: number, pivotY: number, factor: number): void {
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
        const f = newScale / this.scale; // real factor after clamping
        this.tx = pivotX * (1 - f) + f * this.tx;
        this.ty = pivotY * (1 - f) + f * this.ty;
        this.scale = newScale;
        this.applyTransform();
    }

    private static dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    private static midpoint(
        a: { x: number; y: number },
        b: { x: number; y: number }
    ): { x: number; y: number } {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    /**
     * Apply a combined pinch+pan update from an old two-touch sample to a new one.
     * The previous pinch midpoint stays under the fingers while scale changes,
     * then the content follows the midpoint translation.
     */
    private applyTwoPointerGesture(
        oldCenter: { x: number; y: number },
        newCenter: { x: number; y: number },
        oldDist: number,
        newDist: number
    ): void {
        if (oldDist <= 0 || newDist <= 0) {
            return;
        }

        const unclampedScale = this.scale * (newDist / oldDist);
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, unclampedScale));
        const factor = newScale / this.scale;

        // Derived from preserving the old midpoint's content point while moving
        // the gesture midpoint from oldCenter to newCenter.
        this.tx = newCenter.x + factor * (this.tx - oldCenter.x);
        this.ty = newCenter.y + factor * (this.ty - oldCenter.y);
        this.scale = newScale;
        this.applyTransform();
    }

    // ─── Event wiring ────────────────────────────────────────────────────────

    private attach(): void {
        const { signal } = this.abort;
        const el = this.clipEl;

        el.addEventListener('wheel', this.onWheel, { signal, passive: false });
        el.addEventListener('mousedown', this.onMouseDown, { signal, capture: true });
        el.addEventListener('pointerdown', this.onPointerDown, { signal, capture: true });
        el.addEventListener('pointermove', this.onPointerMove, { signal });
        el.addEventListener('pointerup', this.onPointerEnd, { signal });
        el.addEventListener('pointercancel', this.onPointerEnd, { signal });
        el.addEventListener('dblclick', () => this.reset(), { signal });
        el.addEventListener('click', this.onClickCapture, { signal, capture: true });
    }

    /** Zoom toward/away from the cursor on each wheel tick. */
    private readonly onWheel = (e: WheelEvent): void => {
        e.preventDefault();
        const rect = this.clipEl.getBoundingClientRect();
        const factor = 1 - e.deltaY * WHEEL_SENSITIVITY;
        this.zoomAround(e.clientX - rect.left, e.clientY - rect.top, factor);
    };

    /**
     * Suppress Chrome's native middle-button auto-scroll.
     *
     * Chrome activates auto-scroll on `mousedown` with button 1, capturing all
     * subsequent pointer events before our `pointermove` listener sees them.
     * `pointerdown.preventDefault()` should suppress `mousedown` per spec, but
     * Chrome DevTools' touch-simulation layer can bypass that — so we also
     * intercept the raw `mousedown` in the capture phase as a belt-and-suspenders fix.
     */
    private readonly onMouseDown = (e: MouseEvent): void => {
        if (e.button === 1) e.preventDefault();
    };

    /** Begin a pan/pinch gesture, or delegate to the move-interaction handler. */
    private readonly onPointerDown = (e: PointerEvent): void => {
        if (this.shouldDelegatePointerDown(e)) {
            // Second touch while a move gesture is in progress: cancel the
            // gesture and promote both fingers to pan/zoom instead.
            if (this.maybeSwitchToGesturePanWithSecondTouch(e)) {
                return;
            }

            this.delegatedPointers.add(e.pointerId);
            this.delegatedPointerPositions.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this.pointerDelegate?.onPointerDown(e, e.target);
            return;
        }

        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.hasDragged = false;

        // Prevent Chrome's native middle-button auto-scroll from capturing
        // subsequent pointer events and suppressing pointermove delivery.
        if (e.button === 1) {
            e.preventDefault();
        }

        if (this.activePointers.size === 1) {
            this.startX = this.lastX = e.clientX;
            this.startY = this.lastY = e.clientY;
        } else if (this.activePointers.size === 2) {
            const pts = [...this.activePointers.values()];
            this.lastPinchDist = ZoomPanController.dist(pts[0], pts[1]);
            this.lastPinchCenter = ZoomPanController.midpoint(pts[0], pts[1]);
        }
    };

    /** Track drag/pinch deltas and apply pan or two-finger zoom. */
    private readonly onPointerMove = (e: PointerEvent): void => {
        if (this.delegatedPointers.has(e.pointerId)) {
            this.delegatedPointerPositions.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this.pointerDelegate?.onPointerMove(e);
            return;
        }

        if (!this.activePointers.has(e.pointerId)) return;
        const previousPoint = this.activePointers.get(e.pointerId);
        if (!previousPoint) return;
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Promote to drag once threshold is crossed.
        if (
            !this.hasDragged &&
            Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > DRAG_THRESHOLD
        ) {
            this.hasDragged = true;
            // Reset lastX/Y so first pan delta is zero.
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            this.clipEl.setPointerCapture(e.pointerId);
            this.clipEl.style.cursor = 'grabbing';
        }

        if (!this.hasDragged) return;

        if (this.activePointers.size >= 2) {
            // Two-finger pinch + pan.
            const pts = [...this.activePointers.values()];
            const newDist = ZoomPanController.dist(pts[0], pts[1]);
            const newCenter = ZoomPanController.midpoint(pts[0], pts[1]);

            if (this.lastPinchDist > 0 && this.lastPinchCenter) {
                this.applyTwoPointerGesture(
                    this.lastPinchCenter,
                    newCenter,
                    this.lastPinchDist,
                    newDist
                );
            }

            this.lastPinchDist = newDist;
            this.lastPinchCenter = newCenter;
        } else {
            // Single-pointer pan.
            this.tx += e.clientX - this.lastX;
            this.ty += e.clientY - this.lastY;
            this.applyTransform();
        }

        this.lastX = e.clientX;
        this.lastY = e.clientY;
    };

    /** Clean up pointer state on up/cancel; transition pinch → single-finger pan if needed. */
    private readonly onPointerEnd = (e: PointerEvent): void => {
        if (this.delegatedPointers.has(e.pointerId)) {
            this.delegatedPointers.delete(e.pointerId);
            this.delegatedPointerPositions.delete(e.pointerId);

            if (e.type === 'pointercancel') {
                this.pointerDelegate?.onPointerCancel(e);
            } else {
                this.pointerDelegate?.onPointerUp(e, e.target);
            }
            return;
        }

        this.activePointers.delete(e.pointerId);
        if (this.activePointers.size === 0) {
            this.clipEl.style.cursor = 'grab';
            this.lastPinchDist = 0;
            this.lastPinchCenter = null;
        } else if (this.activePointers.size === 1) {
            // Transition from pinch back to single-finger pan.
            const [ptr] = this.activePointers.values();
            this.lastX = ptr.x;
            this.lastY = ptr.y;
            this.startX = ptr.x;
            this.startY = ptr.y;
            this.hasDragged = false;
            this.lastPinchDist = 0;
            this.lastPinchCenter = null;
        }
    };

    /**
     * Suppress sticker click events after a drag.
     *
     * Runs in the capture phase so it fires before any bubble-phase click
     * listener, preventing accidental sticker selection after a pan gesture.
     */
    private readonly onClickCapture = (e: MouseEvent): void => {
        if (this.hasDragged) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.hasDragged = false;
        }
    };

    /**
     * Decide whether a pointer-down event should be forwarded to the delegate
     * (move-interaction handler) rather than starting a pan/zoom gesture.
     *
     * Returns `true` for left-click/touch in `delegated-left-drag` mode when
     * the target passes the delegate filter. Middle-click, Ctrl+click, and
     * non-left buttons are kept for panning.
     */
    private shouldDelegatePointerDown(event: PointerEvent): boolean {
        if (this.gestureMode !== 'delegated-left-drag') {
            return false;
        }

        if (!this.pointerDelegate) {
            return false;
        }

        if (event.pointerType === 'mouse') {
            const isPanMouseGesture = event.button === 1 || (event.button === 0 && event.ctrlKey);
            if (isPanMouseGesture) {
                return false;
            }

            if (event.button !== 0) {
                return false;
            }
        }

        if (this.isDelegateTarget && !this.isDelegateTarget(event.target)) {
            return false;
        }

        return true;
    }

    /**
     * When a second touch arrives while the first is delegated as a move gesture,
     * cancel the gesture and promote both fingers to pan/zoom.
     *
     * Returns `true` if the switch happened; the caller must then skip delegating
     * the second pointer so it lands only in `activePointers`.
     */
    private maybeSwitchToGesturePanWithSecondTouch(event: PointerEvent): boolean {
        if (this.gestureMode !== 'delegated-left-drag') {
            return false;
        }

        if (event.pointerType !== 'touch') {
            return false;
        }

        if (this.delegatedPointers.size !== 1 || this.activePointers.size > 0) {
            return false;
        }

        const [existingPointerId] = this.delegatedPointers.values();
        const existingPointer = this.delegatedPointerPositions.get(existingPointerId);
        if (!existingPointer) {
            return false;
        }

        // Cancel the in-progress move gesture for the first finger.
        const syntheticCancel = {
            ...event,
            pointerId: existingPointerId,
            clientX: existingPointer.x,
            clientY: existingPointer.y,
        } as PointerEvent;
        this.pointerDelegate?.onPointerCancel(syntheticCancel);

        this.delegatedPointers.clear();
        this.delegatedPointerPositions.clear();

        // Both fingers join activePointers for pan/zoom tracking.
        this.activePointers.set(existingPointerId, existingPointer);
        this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        // Anchor pan tracking to the first finger's last known position.
        this.startX = this.lastX = existingPointer.x;
        this.startY = this.lastY = existingPointer.y;

        const pts = [...this.activePointers.values()];
        this.lastPinchDist = ZoomPanController.dist(pts[0], pts[1]);
        this.lastPinchCenter = ZoomPanController.midpoint(pts[0], pts[1]);
        this.hasDragged = false;
        return true;
    }
}
