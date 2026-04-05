import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { DragDirection } from '@/interaction/types';
import { EventName } from '@/types';

import { FlatTouchHandler } from './flat-touch-handler';

type Fixture = {
    host: HTMLElement;
    stickers: HTMLElement[];
    selectedCalls: Array<string | undefined>;
    cleanup: () => void;
};

const styles = {
    'flat-container': 'flat-container',
    'flat-face': 'flat-face',
    'flat-sticker': 'flat-sticker',
    'flat-halo': 'flat-halo',
    'flat-halo-hit-target': 'flat-halo-hit-target',
    'flat-halo-cancel-zone': 'flat-halo-cancel-zone',
    'flat-drag-label': 'flat-drag-label',
    'face-selected': 'face-selected',
} as const;

describe('FlatTouchHandler', () => {
    let fixture: Fixture;
    let elementFromPointMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        elementFromPointMock = vi.fn(() => null);
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            writable: true,
            value: elementFromPointMock,
        });

        fixture = createFixture();
    });

    afterEach(() => {
        fixture.cleanup();
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('toggles face selection and keeps sticker selection on empty-tap dismiss', () => {
        // Arrange
        const handler = new FlatTouchHandler({
            host: fixture.host,
            styles,
            getCubeSize: () => 3,
            getIsRotated: () => false,
            onStickerSelected: stickerId => fixture.selectedCalls.push(stickerId),
        });
        handler.attach();

        const firstSticker = fixture.stickers[0];
        const secondSticker = fixture.stickers[1];

        // Act
        elementFromPointMock.mockReturnValue(firstSticker);

        firePointer(fixture.host, 'pointerdown', 1, 10, 10);
        firePointer(document, 'pointerup', 1, 10, 10);

        // Assert
        expect(firstSticker.classList.contains(styles['face-selected'])).toBe(true);
        expect(secondSticker.classList.contains(styles['face-selected'])).toBe(true);
        expect(fixture.selectedCalls[fixture.selectedCalls.length - 1]).toBe('s0');

        // Act
        firePointer(fixture.host, 'pointerdown', 1, 10, 10);
        firePointer(document, 'pointerup', 1, 10, 10);

        // Assert
        expect(firstSticker.classList.contains(styles['face-selected'])).toBe(false);
        expect(secondSticker.classList.contains(styles['face-selected'])).toBe(false);

        // Act
        elementFromPointMock.mockReturnValue(null);
        const callsBeforeEmptyTap = fixture.selectedCalls.length;
        firePointer(fixture.host, 'pointerdown', 1, 10, 10);
        firePointer(document, 'pointerup', 1, 10, 10);

        // Assert
        expect(fixture.selectedCalls.length).toBe(callsBeforeEmptyTap);
        expect(fixture.selectedCalls[fixture.selectedCalls.length - 1]).toBe('s0');

        handler.destroy();
    });

    it('emits MOVE_REQUESTED after sticker drag in unselected mode', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        const handler = new FlatTouchHandler({
            host: fixture.host,
            styles,
            getCubeSize: () => 3,
            getIsRotated: () => false,
            onStickerSelected: () => undefined,
        });
        handler.attach();

        // Act
        elementFromPointMock.mockReturnValue(fixture.stickers[0]);

        firePointer(fixture.host, 'pointerdown', 2, 20, 20);
        firePointer(document, 'pointermove', 2, 20, 4);
        firePointer(document, 'pointerup', 2, 20, 4);

        // Assert
        expect(emitSpy).toHaveBeenCalledWith(EventName.MOVE_REQUESTED, {
            moveNotation: "L'",
            viewId: 'flat',
            tentative: false,
        });

        handler.destroy();
    });

    it('does not start drag from clear background', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        const handler = new FlatTouchHandler({
            host: fixture.host,
            styles,
            getCubeSize: () => 3,
            getIsRotated: () => false,
            onStickerSelected: () => undefined,
        });
        handler.attach();

        // Act
        elementFromPointMock.mockReturnValue(null);

        firePointer(fixture.host, 'pointerdown', 9, 210, 220, 'touch');
        firePointer(document, 'pointermove', 9, 210, 180, 'touch');
        firePointer(document, 'pointerup', 9, 210, 180, 'touch');

        // Assert
        expect(emitSpy).not.toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'flat' })
        );

        const cancelZone = fixture.host.querySelector(
            `.${styles['flat-halo-cancel-zone']}`
        ) as HTMLElement;
        expect(cancelZone.style.display).toBe('none');

        const label = fixture.host.querySelector(`.${styles['flat-drag-label']}`) as HTMLElement;
        expect(label.style.display).toBe('none');

        handler.destroy();
    });

    it('remaps drag direction when the flat view is rotated', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        const handler = new FlatTouchHandler({
            host: fixture.host,
            styles,
            getCubeSize: () => 3,
            getIsRotated: () => true,
            onStickerSelected: () => undefined,
        });
        handler.attach();

        // Arrange: center sticker (row=1,col=1) for deterministic direction remapping.
        elementFromPointMock.mockReturnValue(fixture.stickers[2]);

        // Act
        firePointer(fixture.host, 'pointerdown', 3, 40, 40);
        firePointer(document, 'pointermove', 3, 40, 20);
        firePointer(document, 'pointerup', 3, 40, 20);

        // Assert
        expect(emitSpy).toHaveBeenCalledWith(EventName.MOVE_REQUESTED, {
            moveNotation: "E'",
            viewId: 'flat',
            tentative: false,
        });

        handler.destroy();
    });

    it('positions drag label above touch point for touch drags', () => {
        // Arrange
        const handler = new FlatTouchHandler({
            host: fixture.host,
            styles,
            getCubeSize: () => 3,
            getIsRotated: () => false,
            onStickerSelected: () => undefined,
        });
        handler.attach();

        // Act
        elementFromPointMock.mockReturnValue(fixture.stickers[0]);

        firePointer(fixture.host, 'pointerdown', 4, 80, 120, 'touch');
        firePointer(document, 'pointermove', 4, 80, 92, 'touch');

        // Assert
        const label = fixture.host.querySelector(`.${styles['flat-drag-label']}`) as HTMLElement;
        expect(label.style.display).toBe('block');
        expect(parseFloat(label.style.top)).toBeLessThan(92);

        firePointer(document, 'pointerup', 4, 80, 92, 'touch');
        handler.destroy();
    });

    it('cancels intended move when drag returns near origin', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        const handler = new FlatTouchHandler({
            host: fixture.host,
            styles,
            getCubeSize: () => 3,
            getIsRotated: () => false,
            onStickerSelected: () => undefined,
        });
        handler.attach();

        // Act
        elementFromPointMock.mockReturnValue(fixture.stickers[0]);

        // Start drag far enough to exceed drag threshold, then return to origin.
        firePointer(fixture.host, 'pointerdown', 5, 24, 24, 'touch');
        firePointer(document, 'pointermove', 5, 24, 8, 'touch');
        firePointer(document, 'pointermove', 5, 24, 24, 'touch');
        firePointer(document, 'pointerup', 5, 24, 24, 'touch');

        // Assert
        expect(emitSpy).not.toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'flat' })
        );

        const label = fixture.host.querySelector(`.${styles['flat-drag-label']}`) as HTMLElement;
        expect(label.style.display).toBe('none');

        handler.destroy();
    });

    it('ignores drags in halo center when face is selected', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        const handler = new FlatTouchHandler({
            host: fixture.host,
            styles,
            getCubeSize: () => 3,
            getIsRotated: () => false,
            onStickerSelected: () => undefined,
        });
        handler.attach();

        // Act: select F face first so halo mode is active.
        elementFromPointMock.mockReturnValue(fixture.stickers[2]);
        firePointer(fixture.host, 'pointerdown', 6, 80, 80, 'touch');
        firePointer(document, 'pointerup', 6, 80, 80, 'touch');

        // Act: start drag from center area (inside inner invisible disc) and move.
        firePointer(fixture.host, 'pointerdown', 6, 100, 100, 'touch');
        firePointer(document, 'pointermove', 6, 100, 70, 'touch');
        firePointer(document, 'pointerup', 6, 100, 70, 'touch');

        // Assert
        expect(emitSpy).not.toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'flat' })
        );

        handler.destroy();
    });

    it('shows cancellation zone at drag origin and hides it on release', () => {
        // Arrange
        const handler = new FlatTouchHandler({
            host: fixture.host,
            styles,
            getCubeSize: () => 3,
            getIsRotated: () => false,
            onStickerSelected: () => undefined,
        });
        handler.attach();

        // Act
        elementFromPointMock.mockReturnValue(fixture.stickers[0]);

        firePointer(fixture.host, 'pointerdown', 7, 60, 90, 'touch');

        // Assert
        const cancelZone = fixture.host.querySelector(
            `.${styles['flat-halo-cancel-zone']}`
        ) as HTMLElement;
        expect(cancelZone.style.display).toBe('block');
        expect(cancelZone.style.left).toBe('44px');
        expect(cancelZone.style.top).toBe('74px');

        // Act
        firePointer(document, 'pointerup', 7, 60, 90, 'touch');

        // Assert
        expect(cancelZone.style.display).toBe('none');

        handler.destroy();
    });

    it('uses adapter direction mapping when provided', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        const handler = new FlatTouchHandler({
            host: fixture.host,
            styles,
            getCubeSize: () => 3,
            getIsRotated: () => false,
            onStickerSelected: () => undefined,
            adapter: {
                mapDragDirection: vi.fn(() => DragDirection.RIGHT),
            },
        });
        handler.attach();

        elementFromPointMock.mockReturnValue(fixture.stickers[0]);

        // Act
        firePointer(fixture.host, 'pointerdown', 8, 24, 24, 'touch');
        firePointer(document, 'pointermove', 8, 24, 8, 'touch');
        firePointer(document, 'pointerup', 8, 24, 8, 'touch');

        // Assert
        expect(emitSpy).toHaveBeenCalledWith(EventName.MOVE_REQUESTED, {
            moveNotation: "U'",
            viewId: 'flat',
            tentative: false,
        });

        handler.destroy();
    });
});

function createFixture(): Fixture {
    const host = document.createElement('div');
    host.className = styles['flat-container'];
    document.body.appendChild(host);

    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 300,
        height: 300,
        right: 300,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    });

    const face = document.createElement('div');
    face.className = styles['flat-face'];
    host.appendChild(face);

    vi.spyOn(face, 'getBoundingClientRect').mockReturnValue({
        left: 40,
        top: 40,
        width: 120,
        height: 120,
        right: 160,
        bottom: 160,
        x: 40,
        y: 40,
        toJSON: () => ({}),
    });

    const stickers: HTMLElement[] = [];
    const makeSticker = (id: string, pos: string): HTMLElement => {
        const sticker = document.createElement('div');
        sticker.className = styles['flat-sticker'];
        sticker.setAttribute('data-face', 'F');
        sticker.setAttribute('data-pos', pos);
        sticker.setAttribute('data-sticker-id', id);
        face.appendChild(sticker);
        stickers.push(sticker);
        return sticker;
    };

    // pos=0 (top-left), pos=1 (same face), pos=4 (center)
    makeSticker('s0', '0');
    makeSticker('s1', '1');
    makeSticker('s2', '4');

    const selectedCalls: Array<string | undefined> = [];

    return {
        host,
        stickers,
        selectedCalls,
        cleanup: () => {
            host.remove();
        },
    };
}

function firePointer(
    target: Document | HTMLElement,
    type: string,
    pointerId: number,
    clientX: number,
    clientY: number,
    pointerType: string = 'mouse'
): void {
    const event = new PointerEvent(type, {
        bubbles: true,
        pointerId,
        clientX,
        clientY,
        pointerType,
    });

    target.dispatchEvent(event);
}
