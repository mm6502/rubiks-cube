import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LayoutMode } from '@/cube/types/view';
import { CANCEL_ZONE_RADIUS_BASE_PX, CANCEL_ZONE_TABBED_MULTIPLIER } from '@/interaction/types';

import {
    type LegendDragCallbacks,
    type LegendDragState,
    createLegendDragHandlers,
    createLegendDragState,
    inferLegendMove,
    inferLegendNotation,
} from './legend-drag';

describe('inferLegendNotation', () => {
    const FAR = 60;

    it('stays a quarter turn below the far-drag threshold', () => {
        // Covers AE3: the same drag kept short emits the plain quarter turn.
        expect(inferLegendNotation(40, 0, false, FAR)).toBe("y'");
        expect(inferLegendNotation(0, -40, false, FAR)).toBe('x');
    });

    it('promotes to the 2 variant past the threshold', () => {
        // Covers AE3: a far drag means the doubled rotation, spelled as the `2`
        // variant of the direction's quarter turn.
        expect(inferLegendNotation(100, 0, false, FAR)).toBe("y2'");
        expect(inferLegendNotation(-100, 0, false, FAR)).toBe('y2');
        expect(inferLegendNotation(0, 100, false, FAR)).toBe("x2'");
        expect(inferLegendNotation(0, -100, false, FAR)).toBe('x2');
    });

    it('promotes in the rotated orientation too', () => {
        expect(inferLegendNotation(100, 0, true, FAR)).toBe('x2');
        expect(inferLegendNotation(-100, 0, true, FAR)).toBe("x2'");
        expect(inferLegendNotation(0, -100, true, FAR)).toBe('y2');
    });

    it('measures distance, not either axis alone', () => {
        // A diagonal drag of 45/45 is ~64px, past a 60px threshold, even though
        // neither component exceeds it on its own.
        expect(inferLegendNotation(45, 45, false, FAR)).toBe("x2'");
        // And a 40/40 diagonal is ~57px, still short.
        expect(inferLegendNotation(40, 40, false, FAR)).toBe("x'");
    });

    it('is not promoted exactly at the threshold', () => {
        // The comparison is strict, matching the layer-drag path's `>` so one
        // gesture distance means one thing across the view.
        expect(inferLegendNotation(FAR, 0, false, FAR)).toBe("y'");
        expect(inferLegendNotation(FAR + 0.5, 0, false, FAR)).toBe("y2'");
    });
});

describe('inferLegendMove', () => {
    // Non-rotated (desktop):
    it('non-rotated: moves left → y', () => {
        expect(inferLegendMove(-10, 0, false)).toBe('y');
    });
    it("non-rotated: moves right → y'", () => {
        expect(inferLegendMove(10, 0, false)).toBe("y'");
    });
    it('non-rotated: moves up → x', () => {
        expect(inferLegendMove(0, -10, false)).toBe('x');
    });
    it("non-rotated: moves down → x'", () => {
        expect(inferLegendMove(0, 10, false)).toBe("x'");
    });

    // Rotated (mobile / portrait):
    it("rotated: moves left → x'", () => {
        expect(inferLegendMove(-10, 0, true)).toBe("x'");
    });
    it('rotated: moves right → x', () => {
        expect(inferLegendMove(10, 0, true)).toBe('x');
    });
    it('rotated: moves up → y', () => {
        expect(inferLegendMove(0, -10, true)).toBe('y');
    });
    it("rotated: moves down → y'", () => {
        expect(inferLegendMove(0, 10, true)).toBe("y'");
    });

    // Diagonal → falls to vertical branch:
    it("non-rotated: equal Dx/Dy → vertical branch (x')", () => {
        expect(inferLegendMove(5, 5, false)).toBe("x'");
    });
    it('non-rotated: equal Dx/Dy negative → x', () => {
        expect(inferLegendMove(-5, -5, false)).toBe('x');
    });
    it("rotated: equal Dx/Dy → vertical branch (y')", () => {
        expect(inferLegendMove(5, 5, true)).toBe("y'");
    });
    it('rotated: equal Dx/Dy negative → y', () => {
        expect(inferLegendMove(-5, -5, true)).toBe('y');
    });
});

describe('createLegendDragState', () => {
    it('returns initial state with isDragging=false', () => {
        const state = createLegendDragState();
        expect(state.isDragging).toBe(false);
        expect(state.startX).toBe(0);
        expect(state.startY).toBe(0);
    });
});

describe('createLegendDragHandlers', () => {
    let dragState: LegendDragState;
    let callbacks: Partial<LegendDragCallbacks> & Record<string, unknown>;
    let legendEl: HTMLElement;
    let handlers: ReturnType<typeof createLegendDragHandlers>;
    let setPointerCapture: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        dragState = createLegendDragState();
        setPointerCapture = vi.fn();
        legendEl = document.createElement('div');
        legendEl.setPointerCapture = setPointerCapture as unknown as (pointerId: number) => void;

        callbacks = {
            legendElement: legendEl,
            getIsRotated: vi.fn().mockReturnValue(false),
            getLayoutMode: vi.fn().mockReturnValue(LayoutMode.Floating),
            getFarDragThresholdPx: vi.fn().mockReturnValue(60),
            showCancellationZone: vi.fn(),
            showDragLabel: vi.fn(),
            hideDragLabel: vi.fn(),
            hideCancellationZone: vi.fn(),
            showDragCross: vi.fn(),
            hideDragCross: vi.fn(),
            emitMove: vi.fn(),
        };

        handlers = createLegendDragHandlers(dragState, callbacks as unknown as LegendDragCallbacks);
    });

    describe('down', () => {
        it('sets isDragging and captures pointer', () => {
            const event = new PointerEvent('pointerdown', {
                clientX: 100,
                clientY: 200,
                pointerId: 1,
                bubbles: true,
                cancelable: true,
            });
            vi.spyOn(event, 'stopPropagation');
            vi.spyOn(event, 'preventDefault');

            handlers.down(event);

            expect(event.stopPropagation).toHaveBeenCalledOnce();
            expect(event.preventDefault).toHaveBeenCalledOnce();
            expect(dragState.isDragging).toBe(true);
            expect(dragState.startX).toBe(100);
            expect(dragState.startY).toBe(200);
            expect(legendEl.style.cursor).toBe('grabbing');
            expect(setPointerCapture).toHaveBeenCalledWith(1);
        });

        it('shows cancellation zone with tabbed multiplier', () => {
            callbacks.getLayoutMode = vi.fn().mockReturnValue(LayoutMode.Tabbed);

            const event = new PointerEvent('pointerdown', {
                clientX: 50,
                clientY: 60,
                pointerId: 1,
                bubbles: true,
                cancelable: true,
            });
            handlers.down(event);

            expect(callbacks.showCancellationZone).toHaveBeenCalledWith(
                50,
                60,
                CANCEL_ZONE_RADIUS_BASE_PX * CANCEL_ZONE_TABBED_MULTIPLIER
            );
        });

        it('shows cancellation zone with base radius for Full layout', () => {
            const event = new PointerEvent('pointerdown', {
                clientX: 50,
                clientY: 60,
                pointerId: 1,
                bubbles: true,
                cancelable: true,
            });
            handlers.down(event);

            expect(callbacks.showCancellationZone).toHaveBeenCalledWith(
                50,
                60,
                CANCEL_ZONE_RADIUS_BASE_PX
            );
        });
    });

    describe('move', () => {
        it('early-returns if not dragging', () => {
            handlers.move(new PointerEvent('pointermove', { clientX: 200, clientY: 300 }));
            expect(callbacks.showDragLabel).not.toHaveBeenCalled();
            expect(callbacks.hideDragLabel).not.toHaveBeenCalled();
        });

        it('shows drag label when delta exceeds threshold', () => {
            dragState.isDragging = true;
            dragState.startX = 100;
            dragState.startY = 100;

            handlers.move(new PointerEvent('pointermove', { clientX: 200, clientY: 100 }));
            // 100px is past the 60px far-drag threshold, so the label already
            // previews the doubled rotation the release will emit.
            expect(callbacks.showDragLabel).toHaveBeenCalledWith("y2'", 200, 100);
        });

        it('previews the plain quarter turn for a short drag', () => {
            dragState.isDragging = true;
            dragState.startX = 100;
            dragState.startY = 100;

            handlers.move(new PointerEvent('pointermove', { clientX: 140, clientY: 100 }));
            expect(callbacks.showDragLabel).toHaveBeenCalledWith("y'", 140, 100);
        });

        it('hides drag label when delta is below threshold', () => {
            dragState.isDragging = true;
            dragState.startX = 100;
            dragState.startY = 100;

            handlers.move(new PointerEvent('pointermove', { clientX: 105, clientY: 103 }));
            expect(callbacks.hideDragLabel).toHaveBeenCalledOnce();
            expect(callbacks.showDragLabel).not.toHaveBeenCalled();
        });
    });

    describe('up', () => {
        it('early-returns if not dragging', () => {
            handlers.up(new PointerEvent('pointerup'));
            expect(callbacks.emitMove).not.toHaveBeenCalled();
        });

        it('emits move and resets state when drag exceeds threshold', () => {
            dragState.isDragging = true;
            dragState.startX = 100;
            dragState.startY = 100;

            handlers.up(new PointerEvent('pointerup', { clientX: 200, clientY: 100 }));

            // 100px of travel is past the 60px far-drag threshold, so the double.
            expect(callbacks.emitMove).toHaveBeenCalledWith("y2'");
            expect(dragState.isDragging).toBe(false);
            expect(callbacks.hideDragLabel).toHaveBeenCalledOnce();
            expect(callbacks.hideCancellationZone).toHaveBeenCalledOnce();
            expect(callbacks.hideDragCross).toHaveBeenCalledOnce();
            expect(legendEl.style.cursor).toBe('grab');
        });

        it('resets state without emitting when drag is below threshold', () => {
            dragState.isDragging = true;
            dragState.startX = 100;
            dragState.startY = 100;

            handlers.up(new PointerEvent('pointerup', { clientX: 105, clientY: 103 }));

            expect(callbacks.emitMove).not.toHaveBeenCalled();
            expect(dragState.isDragging).toBe(false);
            expect(callbacks.hideDragCross).toHaveBeenCalledOnce();
        });
    });

    describe('full gesture integration', () => {
        it('down → move over threshold → up emits correct notation', () => {
            const downEvent = new PointerEvent('pointerdown', {
                clientX: 100,
                clientY: 200,
                pointerId: 2,
                bubbles: true,
                cancelable: true,
            });
            handlers.down(downEvent);

            expect(dragState.isDragging).toBe(true);

            handlers.move(new PointerEvent('pointermove', { clientX: 300, clientY: 200 }));
            // 200px of travel → the doubled variant, in both label and move.
            expect(callbacks.showDragLabel).toHaveBeenCalledWith("y2'", 300, 200);

            handlers.up(new PointerEvent('pointerup', { clientX: 300, clientY: 200 }));
            expect(callbacks.emitMove).toHaveBeenCalledWith("y2'");
            expect(dragState.isDragging).toBe(false);
        });

        it('shows the decision cross on down and hides it on up', () => {
            // The legend gesture had label + cancel-zone feedback but no
            // decision indicator, while the Basic view's equivalent background
            // drag had one. This pins the gap closed.
            handlers.down(
                new PointerEvent('pointerdown', {
                    clientX: 100,
                    clientY: 200,
                    pointerId: 3,
                    bubbles: true,
                    cancelable: true,
                })
            );
            expect(callbacks.showDragCross).toHaveBeenCalledWith(100, 200);

            handlers.up(new PointerEvent('pointerup', { clientX: 100, clientY: 200 }));
            expect(callbacks.hideDragCross).toHaveBeenCalledOnce();
        });
    });
});
