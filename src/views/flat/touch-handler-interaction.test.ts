import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { DragStateMachine } from '@/interaction/drag-state-machine';
import { DragDirection, DragGesture, HitKind } from '@/interaction/types';
import { EventName } from '@/types';

import {
    buildGestureIntent,
    createInteractionContext,
    finalizeGesture,
    handleTap,
    inferMoveNotationForGesture,
    updateFromGesture,
} from './touch-handler-interaction';
import type { FlatTouchHandlerState, StickerHit } from './touch-handler-types';

// ── Helpers ────────────────────────────────────────────────────────────

function createGesture(overrides?: Partial<DragGesture>): DragGesture {
    return {
        pointerId: 1,
        start: { x: 100, y: 100 },
        current: { x: 150, y: 100 },
        deltaX: 50,
        deltaY: 0,
        distancePx: 50,
        direction: DragDirection.RIGHT,
        angularDisplacementRad: 0.5,
        ...overrides,
    };
}

function createStickerHit(overrides?: Partial<StickerHit>): StickerHit {
    return {
        stickerElement: document.createElement('div'),
        face: Face.U,
        row: 1,
        col: 1,
        stickerId: 'sticker-U-4',
        ...overrides,
    };
}

function createMockState(overrides?: Partial<FlatTouchHandlerState>): FlatTouchHandlerState {
    const host = document.createElement('div');
    const dsm = new DragStateMachine();
    return {
        host,
        styles: {} as Record<string, string>,
        getCubeSize: () => 3,
        getIsRotated: () => false,
        onStickerSelected: vi.fn(),
        adapter: {},
        dragStateMachine: dsm,
        layoutMode: LayoutMode.Floating,
        selectedFace: undefined,
        activePointerId: undefined,
        activePointerType: undefined,
        activePointerOrigin: undefined,
        activePointerAllowsDrag: false,
        startHit: undefined,
        selectedFaceGesture: false,
        suppressNextClick: false,
        activeCommitDistancePx: 16,
        faceDirectMode: false,
        directModeTempFace: undefined,
        previousSelectedFace: undefined,
        haloEl: document.createElement('div'),
        haloHitTargetEl: document.createElement('div'),
        haloCancelZoneEl: document.createElement('div'),
        dragLabelEl: document.createElement('div'),
        haloFaceCenter: undefined,
        previousTouchAction: '',
        ...overrides,
    } as FlatTouchHandlerState;
}

// ── createInteractionContext ───────────────────────────────────────────

describe('createInteractionContext', () => {
    it('returns context with cubeSize and selectedFace from state', () => {
        const s = createMockState({ selectedFace: Face.R });
        const ctx = createInteractionContext(s);
        expect(ctx.cubeSize).toBe(3);
        expect(ctx.selectedFace).toBe(Face.R);
        expect(ctx.metadata?.isRotated).toBe(false);
    });
});

// ── buildGestureIntent ─────────────────────────────────────────────────

describe('buildGestureIntent', () => {
    it('HALO intent when selectedFace && selectedFaceGesture', () => {
        const s = createMockState({ selectedFace: Face.U, selectedFaceGesture: true });
        const gesture = createGesture();
        const intent = buildGestureIntent(s, gesture);
        expect(intent.hitKind).toBe(HitKind.HALO);
        expect(intent.direction).toBe(DragDirection.RIGHT);
    });

    it('STICKER intent when startHit is set', () => {
        const s = createMockState({ startHit: createStickerHit({ face: Face.L, row: 2, col: 0 }) });
        const gesture = createGesture();
        const intent = buildGestureIntent(s, gesture);
        expect(intent.hitKind).toBe(HitKind.STICKER);
        expect(intent.face).toBe(Face.L);
        expect(intent.row).toBe(2);
        expect(intent.col).toBe(0);
    });

    it('NONE intent when neither selectedFaceGesture nor startHit', () => {
        const s = createMockState();
        const gesture = createGesture();
        const intent = buildGestureIntent(s, gesture);
        expect(intent.hitKind).toBe(HitKind.NONE);
    });
});

// ── inferMoveNotationForGesture ────────────────────────────────────────

describe('inferMoveNotationForGesture', () => {
    it('returns undefined when distance below commit threshold', () => {
        const s = createMockState({ activeCommitDistancePx: 50 });
        const gesture = createGesture({ distancePx: 10 });
        expect(inferMoveNotationForGesture(s, gesture)).toBeUndefined();
    });

    it('HALO near-center cross-product path', () => {
        const s = createMockState({
            selectedFace: Face.U,
            selectedFaceGesture: true,
            haloFaceCenter: { x: 100, y: 100, size: 40 },
            activeCommitDistancePx: 5,
        });
        const gesture = createGesture({
            start: { x: 105, y: 100 },
            current: { x: 130, y: 80 },
            deltaX: 25,
            deltaY: -20,
            distancePx: 32,
            direction: DragDirection.RIGHT,
        });
        const notation = inferMoveNotationForGesture(s, gesture);
        // Near-center cross product determines direction; expects base notation
        expect(notation).toBeDefined();
        expect(notation).toMatch(/^[A-Z][2']?$/);
    });

    it('HALO angular < 0.1 returns undefined', () => {
        const s = createMockState({
            selectedFace: Face.U,
            selectedFaceGesture: true,
            activeCommitDistancePx: 5,
        });
        const gesture = createGesture({ angularDisplacementRad: 0.05 });
        const notation = inferMoveNotationForGesture(s, gesture);
        expect(notation).toBeUndefined();
    });

    it('HALO far drag promotes to double-move notation', () => {
        const s = createMockState({
            selectedFace: Face.U,
            selectedFaceGesture: true,
            activeCommitDistancePx: 5,
            haloFaceCenter: { x: 100, y: 100, size: 40 },
        });
        const gesture = createGesture({
            start: { x: 105, y: 100 },
            current: { x: 200, y: 100 },
            deltaX: 95,
            deltaY: 0,
            distancePx: 95,
            direction: DragDirection.RIGHT,
            angularDisplacementRad: 0.3,
        });
        // Force distance > farThreshold
        const notation = inferMoveNotationForGesture(
            {
                ...s,
                activeCommitDistancePx: 5,
                dragStateMachine: { ...s.dragStateMachine, farDragThresholdPx: 50 },
            } as FlatTouchHandlerState,
            gesture
        );
        expect(notation).toBeDefined();
        // Double-move: notation ends with '2'
        expect(notation?.endsWith('2')).toBe(true);
    });

    it('STICKER with !face returns undefined', () => {
        const s = createMockState({
            startHit: createStickerHit({ face: undefined as unknown as Face }),
        });
        const gesture = createGesture({ distancePx: 50 });
        const notation = inferMoveNotationForGesture(s, gesture);
        expect(notation).toBeUndefined();
    });

    it('STICKER hitKind !== STICKER returns undefined', () => {
        const s = createMockState();
        const gesture = createGesture({ distancePx: 50 });
        const notation = inferMoveNotationForGesture(s, gesture);
        expect(notation).toBeUndefined();
    });

    it('STICKER with valid face infers move', () => {
        const s = createMockState({
            startHit: createStickerHit({ face: Face.U, row: 1, col: 1 }),
            activeCommitDistancePx: 5,
        });
        const gesture = createGesture({
            direction: DragDirection.RIGHT,
            distancePx: 50,
            deltaX: 50,
            deltaY: 0,
        });
        const notation = inferMoveNotationForGesture(s, gesture);
        // inferMoveFromDrag with valid params should return a notation
        expect(notation).toBeDefined();
        expect(typeof notation).toBe('string');
    });
});

// ── handleTap ──────────────────────────────────────────────────────────

describe('handleTap', () => {
    let s: FlatTouchHandlerState;

    beforeEach(() => {
        s = createMockState();
    });

    it('clears selection when hit is undefined', () => {
        s.selectedFace = Face.U;
        handleTap(s, undefined);
        expect(s.selectedFace).toBeUndefined();
    });

    it('deselects when tapping the same face', () => {
        s.selectedFace = Face.U;
        handleTap(s, createStickerHit({ face: Face.U }));
        expect(s.selectedFace).toBeUndefined();
    });

    it('selects new face when tapping a different face', () => {
        s.selectedFace = Face.U;
        handleTap(s, createStickerHit({ face: Face.R }));
        expect(s.selectedFace).toBe(Face.R);
    });

    it('calls onStickerSelected with the hit stickerId', () => {
        const hit = createStickerHit({ stickerId: 's-R-3' });
        handleTap(s, hit);
        expect(s.onStickerSelected).toHaveBeenCalledWith('s-R-3');
    });
});

// ── updateFromGesture ──────────────────────────────────────────────────

describe('updateFromGesture', () => {
    it('hides label when moveNotation is falsy', () => {
        const s = createMockState({ activeCommitDistancePx: 999 });
        const gesture = createGesture({ distancePx: 10 });

        updateFromGesture(s, gesture);

        // hideDragLabel sets display to 'none'
        expect(s.dragLabelEl.style.display).toBe('none');
    });
});

// ── finalizeGesture ────────────────────────────────────────────────────

describe('finalizeGesture', () => {
    beforeEach(() => {
        vi.spyOn(Application.eventBus, 'emit');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('early returns when no move notation', () => {
        const s = createMockState({ activeCommitDistancePx: 999 });
        const gesture = createGesture({ distancePx: 10 });

        finalizeGesture(s, gesture);

        expect(Application.eventBus.emit).not.toHaveBeenCalled();
    });

    it('emits MOVE_REQUESTED with valid move notation', () => {
        const s = createMockState({
            startHit: createStickerHit({ face: Face.U, row: 1, col: 1 }),
            activeCommitDistancePx: 5,
        });
        const gesture = createGesture({
            direction: DragDirection.RIGHT,
            distancePx: 50,
            deltaX: 50,
            deltaY: 0,
        });

        finalizeGesture(s, gesture);

        expect(Application.eventBus.emit).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({
                viewId: 'flat',
                tentative: false,
            })
        );
    });

    it('emitted payload contains valid move notation string', () => {
        const s = createMockState({
            startHit: createStickerHit({ face: Face.U, row: 1, col: 1 }),
            activeCommitDistancePx: 5,
        });
        const gesture = createGesture({
            direction: DragDirection.RIGHT,
            distancePx: 50,
            deltaX: 50,
            deltaY: 0,
        });

        finalizeGesture(s, gesture);

        expect(Application.eventBus.emit).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({
                moveNotation: expect.any(String),
            })
        );
    });
});
