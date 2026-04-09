import { Application } from '@/application';
import { Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { EventName } from '@/types';

import type { BasicViewInternalData } from './basic-view';
import { BasicTouchHandler } from './touch-handler';

// -------------------------------------------------------------------------
// Style map (mirrors CSS module class names)
// -------------------------------------------------------------------------
const styles = {
    'basic-halo-hit-target': 'basic-halo-hit-target',
    'basic-halo-cancel-zone': 'basic-halo-cancel-zone',
    'basic-drag-label': 'basic-drag-label',
    'basic-drag-decision-arm': 'basic-drag-decision-arm',
    face: 'face',
    'face-selected-surface': 'face-selected-surface',
    'face-selected': 'face-selected',
    sticker: 'sticker',
} as const;

// -------------------------------------------------------------------------
// Fixture helpers
// -------------------------------------------------------------------------

type Fixture = {
    host: HTMLElement;
    cubeEl: HTMLElement;
    faceEl: HTMLElement;
    /** The first sticker element (F face, pos 0). */
    stickerEl: HTMLElement;
    cleanup: () => void;
};

function createFixture(): Fixture {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cubeEl = document.createElement('div');
    host.appendChild(cubeEl);

    // Build a face div with the required attributes
    const faceEl = document.createElement('div');
    faceEl.className = styles.face;
    faceEl.setAttribute('data-basic-face', Face.F);
    cubeEl.appendChild(faceEl);

    // Stickers for F face (3×3 = 9), needed for face-basis + hit detection
    for (let i = 0; i < 9; i++) {
        const el = document.createElement('div');
        el.className = styles.sticker;
        el.setAttribute('data-basic-face', Face.F);
        el.setAttribute('data-basic-pos', String(i));
        el.setAttribute('data-sticker-id', `F-${i}`);
        faceEl.appendChild(el);
    }

    const stickerEl = faceEl.querySelector(`.${styles.sticker}`) as HTMLElement;

    return {
        host,
        cubeEl,
        faceEl,
        stickerEl,
        cleanup: () => host.remove(),
    };
}

function createState(fixture: Fixture): BasicViewInternalData {
    return {
        model: undefined,
        container: fixture.host,
        cubeElement: fixture.cubeEl,
        cubeContainer: fixture.host,
        styles: styles as Record<string, string>,
        variant: 'front' as any,
        viewType: 'basic-front',
        viewRight: { x: 1, y: 0, z: 0 },
        viewUp: { x: 0, y: 1, z: 0 },
        viewForward: { x: 0, y: 0, z: 1 },
        isTilted: false,
        isPitched: false,
        isHovered: false,
        layoutMode: LayoutMode.Floating,
    };
}

function createHandler(
    fixture: Fixture,
    overrides: {
        onStickerSelected?: (id?: string) => void;
        onViewRotated?: (dir: 'horizontal' | 'vertical') => void;
    } = {}
): BasicTouchHandler {
    const state = createState(fixture);
    return new BasicTouchHandler({
        host: fixture.host,
        styles: styles as Record<string, string>,
        getCubeSize: () => 3,
        getState: () => state,
        onStickerSelected: overrides.onStickerSelected ?? vi.fn(),
        onViewRotated: overrides.onViewRotated ?? vi.fn(),
        viewId: 'basic-front',
        adapter: { mapDragDirection: d => d },
    });
}

function pointer(type: string, id: number, x: number, y: number): PointerEvent {
    return new PointerEvent(type, {
        pointerId: id,
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        pointerType: 'mouse',
    });
}

// -------------------------------------------------------------------------
// elementFromPoint helper (jsdom does not implement this by default)
// -------------------------------------------------------------------------

function mockElementFromPoint(el: Element | null): void {
    (document as any).elementFromPoint = () => el;
}

function resetElementFromPoint(): void {
    (document as any).elementFromPoint = () => null;
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('BasicTouchHandler', () => {
    let fixture: Fixture;

    beforeEach(() => {
        fixture = createFixture();
        // Provide a default no-op implementation so the handler never crashes
        resetElementFromPoint();
    });

    afterEach(() => {
        fixture.cleanup();
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
        resetElementFromPoint();
    });

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    it('attach() appends overlay elements to host', () => {
        const handler = createHandler(fixture);
        handler.attach();

        expect(fixture.host.querySelector('.basic-halo-hit-target')).not.toBeNull();
        expect(fixture.host.querySelector('.basic-halo-cancel-zone')).not.toBeNull();
        expect(fixture.host.querySelector('.basic-drag-label')).not.toBeNull();

        handler.destroy();
    });

    it('destroy() removes overlay elements from host', () => {
        const handler = createHandler(fixture);
        handler.attach();
        handler.destroy();

        expect(fixture.host.querySelector('.basic-halo-hit-target')).toBeNull();
        expect(fixture.host.querySelector('.basic-halo-cancel-zone')).toBeNull();
        expect(fixture.host.querySelector('.basic-drag-label')).toBeNull();
    });

    it('destroy() can be called safely before attach()', () => {
        const handler = createHandler(fixture);
        expect(() => handler.destroy()).not.toThrow();
    });

    // -----------------------------------------------------------------------
    // Mode setters / getters
    // -----------------------------------------------------------------------

    it('isFaceDirectMode() is false by default', () => {
        const handler = createHandler(fixture);
        expect(handler.isFaceDirectMode()).toBe(false);
    });

    it('setFaceDirectMode(true) enables face direct mode', () => {
        const handler = createHandler(fixture);
        handler.setFaceDirectMode(true);
        expect(handler.isFaceDirectMode()).toBe(true);
    });

    it('setFaceDirectMode toggles back to false', () => {
        const handler = createHandler(fixture);
        handler.setFaceDirectMode(true);
        handler.setFaceDirectMode(false);
        expect(handler.isFaceDirectMode()).toBe(false);
    });

    it('getSelectedFace() is undefined initially', () => {
        const handler = createHandler(fixture);
        expect(handler.getSelectedFace()).toBeUndefined();
    });

    it('setLayoutMode() does not throw', () => {
        const handler = createHandler(fixture);
        handler.attach();
        expect(() => handler.setLayoutMode(LayoutMode.Tabbed)).not.toThrow();
        expect(() => handler.setLayoutMode(LayoutMode.Floating)).not.toThrow();
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // selectFace
    // -----------------------------------------------------------------------

    it('selectFace() sets selected face', () => {
        const handler = createHandler(fixture);
        handler.attach();

        handler.selectFace(Face.F);

        expect(handler.getSelectedFace()).toBe(Face.F);
        handler.destroy();
    });

    it('selectFace(undefined) clears selection', () => {
        const handler = createHandler(fixture);
        handler.attach();

        handler.selectFace(Face.F);
        handler.selectFace(undefined);

        expect(handler.getSelectedFace()).toBeUndefined();
        handler.destroy();
    });

    it('selectFace() shows halo hit target when face element exists', () => {
        const handler = createHandler(fixture);
        handler.attach();

        handler.selectFace(Face.F);

        const halo = fixture.host.querySelector('.basic-halo-hit-target') as HTMLElement;
        expect(halo.style.display).toBe('block');
        handler.destroy();
    });

    it('selectFace(undefined) hides halo hit target', () => {
        const handler = createHandler(fixture);
        handler.attach();

        handler.selectFace(Face.F);
        handler.selectFace(undefined);

        const halo = fixture.host.querySelector('.basic-halo-hit-target') as HTMLElement;
        expect(halo.style.display).toBe('none');
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // resize
    // -----------------------------------------------------------------------

    it('resize() does not throw', () => {
        const handler = createHandler(fixture);
        handler.attach();
        handler.selectFace(Face.F);

        expect(() => handler.resize()).not.toThrow();
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Pointer events – tap on sticker
    // -----------------------------------------------------------------------

    it('tapping a sticker selects its face via onStickerSelected', () => {
        const onStickerSelected = vi.fn();
        const handler = createHandler(fixture, { onStickerSelected });
        handler.attach();

        // Make elementFromPoint return the sticker element
        mockElementFromPoint(fixture.stickerEl);

        fixture.host.dispatchEvent(pointer('pointerdown', 1, 100, 100));
        document.dispatchEvent(pointer('pointerup', 1, 100, 100));

        expect(handler.getSelectedFace()).toBe(Face.F);
        expect(onStickerSelected).toHaveBeenCalledWith('F-0');

        handler.destroy();
    });

    it('tapping same face twice deselects it', () => {
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(fixture.stickerEl);

        // First tap → selects F
        fixture.host.dispatchEvent(pointer('pointerdown', 2, 100, 100));
        document.dispatchEvent(pointer('pointerup', 2, 100, 100));
        expect(handler.getSelectedFace()).toBe(Face.F);

        // Second tap on same face → deselects
        fixture.host.dispatchEvent(pointer('pointerdown', 3, 100, 100));
        document.dispatchEvent(pointer('pointerup', 3, 100, 100));
        expect(handler.getSelectedFace()).toBeUndefined();

        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Pointer events – tap on background
    // -----------------------------------------------------------------------

    it('tapping background deselects current face', () => {
        const handler = createHandler(fixture);
        handler.attach();

        // Select a face first
        handler.selectFace(Face.F);

        // Background tap: elementFromPoint returns null → no sticker, not over cube
        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 4, 10, 10));
        document.dispatchEvent(pointer('pointerup', 4, 10, 10));

        expect(handler.getSelectedFace()).toBeUndefined();
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Pointer events – background drag → view rotation
    // -----------------------------------------------------------------------

    it('background drag right calls onViewRotated with "horizontal"', () => {
        const onViewRotated = vi.fn();
        const handler = createHandler(fixture, { onViewRotated });
        handler.attach();

        // elementFromPoint returns null → not over sticker, not over cube
        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 5, 100, 200));
        // Move 40px right (> 4px drag threshold and > 16px commit threshold)
        document.dispatchEvent(pointer('pointermove', 5, 140, 200));
        document.dispatchEvent(pointer('pointerup', 5, 140, 200));

        expect(onViewRotated).toHaveBeenCalledWith('horizontal');
        handler.destroy();
    });

    it('background drag down calls onViewRotated with "vertical"', () => {
        const onViewRotated = vi.fn();
        const handler = createHandler(fixture, { onViewRotated });
        handler.attach();

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 6, 100, 100));
        document.dispatchEvent(pointer('pointermove', 6, 100, 140));
        document.dispatchEvent(pointer('pointerup', 6, 100, 140));

        expect(onViewRotated).toHaveBeenCalledWith('vertical');
        handler.destroy();
    });

    it('background drag shorter than commit threshold does not call onViewRotated', () => {
        const onViewRotated = vi.fn();
        const handler = createHandler(fixture, { onViewRotated });
        handler.attach();

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 7, 100, 200));
        // Move only 5px — above drag threshold (4px) but below commit (16px)
        document.dispatchEvent(pointer('pointermove', 7, 105, 200));
        document.dispatchEvent(pointer('pointerup', 7, 105, 200));

        expect(onViewRotated).not.toHaveBeenCalled();
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Pointer events – sticker drag → MOVE_REQUESTED
    // -----------------------------------------------------------------------

    it('sticker drag right emits MOVE_REQUESTED', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(fixture.stickerEl);

        fixture.host.dispatchEvent(pointer('pointerdown', 8, 100, 100));
        document.dispatchEvent(pointer('pointermove', 8, 140, 100));
        document.dispatchEvent(pointer('pointerup', 8, 140, 100));

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'basic-front' })
        );
        handler.destroy();
    });

    it('sticker drag shorter than commit threshold does not emit MOVE_REQUESTED', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(fixture.stickerEl);

        fixture.host.dispatchEvent(pointer('pointerdown', 9, 100, 100));
        document.dispatchEvent(pointer('pointermove', 9, 104, 100));
        document.dispatchEvent(pointer('pointerup', 9, 104, 100));

        expect(emitSpy).not.toHaveBeenCalledWith(EventName.MOVE_REQUESTED, expect.anything());
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Pointer events – cancel zone
    // -----------------------------------------------------------------------

    it('background drag shows cancel zone on pointerdown', () => {
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 10, 100, 200));

        const cancelZone = fixture.host.querySelector('.basic-halo-cancel-zone') as HTMLElement;
        expect(cancelZone.style.display).toBe('block');

        document.dispatchEvent(pointer('pointercancel', 10, 100, 200));
        handler.destroy();
    });

    it('pointercancel hides cancel zone and drag label', () => {
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 11, 100, 200));
        document.dispatchEvent(pointer('pointermove', 11, 130, 200));
        document.dispatchEvent(pointer('pointercancel', 11, 130, 200));

        const cancelZone = fixture.host.querySelector('.basic-halo-cancel-zone') as HTMLElement;
        const dragLabel = fixture.host.querySelector('.basic-drag-label') as HTMLElement;

        expect(cancelZone.style.display).toBe('none');
        expect(dragLabel.style.display).toBe('none');

        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Multi-pointer: second pointer ignored while first is active
    // -----------------------------------------------------------------------

    it('second pointerdown is ignored while first pointer is active', () => {
        const onViewRotated = vi.fn();
        const handler = createHandler(fixture, { onViewRotated });
        handler.attach();

        mockElementFromPoint(null);

        // Start first gesture
        fixture.host.dispatchEvent(pointer('pointerdown', 12, 100, 200));

        // Second pointer should be silently ignored (no throw, no new gesture)
        expect(() => {
            fixture.host.dispatchEvent(pointer('pointerdown', 13, 120, 220));
        }).not.toThrow();

        // Finish first gesture
        document.dispatchEvent(pointer('pointermove', 12, 140, 200));
        document.dispatchEvent(pointer('pointerup', 12, 140, 200));

        // Only one call from the first gesture
        expect(onViewRotated).toHaveBeenCalledTimes(1);
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Face direct mode – sticker drag acts as face rotation
    // -----------------------------------------------------------------------

    it('face direct mode: dragging sticker emits MOVE_REQUESTED', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();
        handler.setFaceDirectMode(true);

        mockElementFromPoint(fixture.stickerEl);

        fixture.host.dispatchEvent(pointer('pointerdown', 14, 100, 100));
        document.dispatchEvent(pointer('pointermove', 14, 100, 140));
        document.dispatchEvent(pointer('pointerup', 14, 100, 140));

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'basic-front' })
        );
        handler.destroy();
    });

    it('face direct mode: selected face is restored after gesture completes', () => {
        const handler = createHandler(fixture);
        handler.attach();
        handler.setFaceDirectMode(true);

        // Pre-select a different face
        handler.selectFace(undefined);

        mockElementFromPoint(fixture.stickerEl);

        // Complete a gesture on F sticker
        fixture.host.dispatchEvent(pointer('pointerdown', 15, 100, 100));
        document.dispatchEvent(pointer('pointermove', 15, 100, 140));
        document.dispatchEvent(pointer('pointerup', 15, 100, 140));

        // After gesture, direct-mode temp face should be cleaned up (undefined restored)
        expect(handler.getSelectedFace()).toBeUndefined();
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // pointer leave
    // -----------------------------------------------------------------------

    it('pointerleave when no active pointer does not throw', () => {
        const handler = createHandler(fixture);
        handler.attach();

        expect(() => {
            fixture.host.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
        }).not.toThrow();

        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Click capture suppression
    // -----------------------------------------------------------------------

    it('click is suppressed after a drag gesture', () => {
        const clickHandler = vi.fn();
        const handler = createHandler(fixture);
        handler.attach();

        fixture.host.addEventListener('click', clickHandler);

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 16, 100, 200));
        document.dispatchEvent(pointer('pointermove', 16, 140, 200));
        document.dispatchEvent(pointer('pointerup', 16, 140, 200));

        // Simulate a click that follows the drag
        fixture.host.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
        );

        // The capture phase listener should stop the click
        expect(clickHandler).not.toHaveBeenCalled();

        fixture.host.removeEventListener('click', clickHandler);
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Cancel zone radius in tabbed mode
    // -----------------------------------------------------------------------

    it('cancel zone is larger in tabbed mode', () => {
        const handler = createHandler(fixture);
        handler.attach();
        handler.setLayoutMode(LayoutMode.Tabbed);

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 17, 100, 200));

        const cancelZone = fixture.host.querySelector('.basic-halo-cancel-zone') as HTMLElement;
        const widthTabbed = parseFloat(cancelZone.style.width);

        document.dispatchEvent(pointer('pointercancel', 17, 100, 200));

        handler.setLayoutMode(LayoutMode.Floating);

        fixture.host.dispatchEvent(pointer('pointerdown', 18, 100, 200));

        const widthFloating = parseFloat(cancelZone.style.width);

        expect(widthTabbed).toBeGreaterThan(widthFloating);

        document.dispatchEvent(pointer('pointercancel', 18, 100, 200));
        handler.destroy();
    });
});
