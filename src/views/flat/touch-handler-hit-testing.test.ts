import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Face } from '@/cube/types';

import {
    findFaceElement,
    getStickerHitFromPoint,
    isHaloHitTargetAtPoint,
    wasTapWithoutDrag,
} from './touch-handler-hit-testing';
import type { FlatTouchHandlerState } from './touch-handler-types';
import { DRAG_THRESHOLD_PX } from './touch-handler-types';

function createMockState(overrides?: Partial<FlatTouchHandlerState>): FlatTouchHandlerState {
    const host = document.createElement('div');
    const styles = { 'flat-sticker': 'fs-mock', 'flat-face': 'ff-mock' } as Record<string, string>;
    return {
        host,
        styles,
        selectedFace: undefined,
        haloHitTargetEl: document.createElement('div'),
        activePointerOrigin: undefined,
        getCubeSize: () => 3,
        ...overrides,
    } as unknown as FlatTouchHandlerState;
}

function addSticker(
    host: HTMLElement,
    styles: Record<string, string>,
    face: Face,
    pos: number,
    id?: string
): HTMLElement {
    const el = document.createElement('div');
    el.className = styles['flat-sticker'];
    el.setAttribute('data-face', face);
    el.setAttribute('data-pos', String(pos));
    if (id) el.setAttribute('data-sticker-id', id);
    const faceEl = document.createElement('div');
    faceEl.className = styles['flat-face'];
    faceEl.appendChild(el);
    host.appendChild(faceEl);
    return el;
}

describe('getStickerHitFromPoint', () => {
    let s: FlatTouchHandlerState;

    function mockElementFromPoint(el: HTMLElement | null): void {
        Object.defineProperty(document, 'elementFromPoint', {
            value: vi.fn().mockReturnValue(el),
            writable: true,
            configurable: true,
        });
    }

    beforeEach(() => {
        s = createMockState();
        // elementFromPoint is not directly spyable in all jsdom setups.
        // Use defineProperty to mock it since it's read-only on Document.
        Object.defineProperty(document, 'elementFromPoint', {
            value: vi.fn(),
            writable: true,
            configurable: true,
        });
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('null elementFromPoint returns undefined', () => {
        mockElementFromPoint(null);
        expect(getStickerHitFromPoint(s, 0, 0)).toBeUndefined();
    });

    it('sticker outside host returns undefined', () => {
        const el = document.createElement('div');
        el.className = s.styles['flat-sticker'];
        el.setAttribute('data-face', Face.U);
        el.setAttribute('data-pos', '4');
        document.body.appendChild(el);
        mockElementFromPoint(el);
        expect(getStickerHitFromPoint(s, 0, 0)).toBeUndefined();
        document.body.removeChild(el);
    });

    it('missing data-face returns undefined', () => {
        const el = document.createElement('div');
        el.className = s.styles['flat-sticker'];
        el.setAttribute('data-pos', '4');
        s.host.appendChild(el);
        mockElementFromPoint(el);
        expect(getStickerHitFromPoint(s, 0, 0)).toBeUndefined();
    });

    it('non-numeric data-pos returns undefined', () => {
        const el = document.createElement('div');
        el.className = s.styles['flat-sticker'];
        el.setAttribute('data-face', Face.U);
        el.setAttribute('data-pos', 'abc');
        s.host.appendChild(el);
        mockElementFromPoint(el);
        expect(getStickerHitFromPoint(s, 0, 0)).toBeUndefined();
    });

    it('valid sticker returns hit with face/row/col', () => {
        const el = addSticker(s.host, s.styles, Face.U, 4, 's-U-4');
        mockElementFromPoint(el);
        const hit = getStickerHitFromPoint(s, 0, 0);
        expect(hit).toBeDefined();
        expect(hit!.face).toBe(Face.U);
        expect(hit!.row).toBe(1);
        expect(hit!.col).toBe(1);
        expect(hit!.stickerId).toBe('s-U-4');
    });

    it('absent stickerId yields undefined stickerId field', () => {
        const el = addSticker(s.host, s.styles, Face.R, 8);
        mockElementFromPoint(el);
        expect(getStickerHitFromPoint(s, 0, 0)!.stickerId).toBeUndefined();
    });
});

describe('findFaceElement', () => {
    let s: FlatTouchHandlerState;
    beforeEach(() => {
        s = createMockState();
    });

    it('returns face ancestor from sticker', () => {
        const faceEl = document.createElement('div');
        faceEl.className = s.styles['flat-face'];
        const sticker = document.createElement('div');
        sticker.className = s.styles['flat-sticker'];
        faceEl.appendChild(sticker);
        s.host.appendChild(faceEl);
        expect(findFaceElement(s, sticker)).toBe(faceEl);
    });

    it('returns null when no face ancestor', () => {
        const sticker = document.createElement('div');
        s.host.appendChild(sticker);
        expect(findFaceElement(s, sticker)).toBeNull();
    });
});

describe('isHaloHitTargetAtPoint', () => {
    let s: FlatTouchHandlerState;
    beforeEach(() => {
        s = createMockState();
        s.haloHitTargetEl.style.display = '';
        s.haloHitTargetEl.style.position = 'absolute';
        s.haloHitTargetEl.style.left = '0';
        s.haloHitTargetEl.style.top = '0';
        s.haloHitTargetEl.style.width = '100px';
        s.haloHitTargetEl.style.height = '100px';
        document.body.appendChild(s.haloHitTargetEl);
    });
    afterEach(() => {
        document.body.removeChild(s.haloHitTargetEl);
    });

    it('false when no selectedFace', () => {
        s.selectedFace = undefined;
        expect(isHaloHitTargetAtPoint(s, 50, 50)).toBe(false);
    });

    it('false when display:none', () => {
        s.selectedFace = Face.U;
        s.haloHitTargetEl.style.display = 'none';
        expect(isHaloHitTargetAtPoint(s, 50, 50)).toBe(false);
    });

    it('true when point within bounds', () => {
        s.selectedFace = Face.U;
        vi.spyOn(s.haloHitTargetEl, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            right: 100,
            bottom: 100,
            width: 100,
            height: 100,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });
        expect(isHaloHitTargetAtPoint(s, 50, 50)).toBe(true);
    });

    it('false when point outside bounds', () => {
        s.selectedFace = Face.U;
        expect(isHaloHitTargetAtPoint(s, -10, -10)).toBe(false);
    });
});

describe('wasTapWithoutDrag', () => {
    it('false no activePointerOrigin', () => {
        expect(wasTapWithoutDrag(createMockState(), 0, 0)).toBe(false);
    });

    it('true delta < DRAG_THRESHOLD_PX', () => {
        const s = createMockState({ activePointerOrigin: { x: 100, y: 100 } });
        expect(wasTapWithoutDrag(s, 100 + DRAG_THRESHOLD_PX - 1, 100)).toBe(true);
    });

    it('false delta >= DRAG_THRESHOLD_PX', () => {
        const s = createMockState({ activePointerOrigin: { x: 100, y: 100 } });
        expect(wasTapWithoutDrag(s, 100 + DRAG_THRESHOLD_PX, 100)).toBe(false);
    });

    it('false delta far exceeds threshold', () => {
        const s = createMockState({ activePointerOrigin: { x: 100, y: 100 } });
        expect(wasTapWithoutDrag(s, 500, 500)).toBe(false);
    });
});
