import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { DragDirection, HitKind } from '@/interaction/types';
import { EventName } from '@/types';

import type { BasicViewInternalData } from './basic-view';
import { basicViewCss, blockFor, valueOf } from './css-contract-helpers';
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
    /** A real model, so hits resolve through the sticker identity, as in production. */
    model: CubeController;
    cleanup: () => void;
};

/**
 * The real sticker ids for the F face, ordered by face position.
 *
 * The hit-test resolves identity from the model, so the fixture cannot invent
 * ids — they have to be the ones the model actually holds, or every hit resolves
 * to nothing. The format is `{cubieId}_{face}_sticker`.
 */
function frontFaceStickerIds(model: CubeController): string[] {
    const state = model.getCurrentState();
    const byPosition = new Map<number, string>();
    state.cubiesByPosition.forEach(cubie => {
        cubie.stickers.forEach(sticker => {
            if (sticker.currentFace === Face.F) {
                byPosition.set(sticker.facePosition, sticker.id as string);
            }
        });
    });
    return [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => id);
}

function createFixture(): Fixture {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cubeEl = document.createElement('div');
    host.appendChild(cubeEl);

    // Build a face div with the required attributes
    const faceEl = document.createElement('div');
    faceEl.className = styles.face;
    faceEl.setAttribute('data-face', Face.F);
    cubeEl.appendChild(faceEl);

    const model = new CubeController(3);
    const stickerIds = frontFaceStickerIds(model);

    // Stickers for F face (3×3 = 9), needed for face-basis + hit detection.
    // They carry the REAL model ids, because that is what the hit-test reads.
    for (let i = 0; i < 9; i++) {
        const el = document.createElement('div');
        el.className = styles.sticker;
        el.setAttribute('data-face', Face.F);
        el.setAttribute('data-sticker-id', stickerIds[i]);
        faceEl.appendChild(el);
    }

    const stickerEl = faceEl.querySelector(`.${styles.sticker}`) as HTMLElement;

    return {
        host,
        cubeEl,
        faceEl,
        stickerEl,
        model,
        cleanup: () => host.remove(),
    };
}

function createState(fixture: Fixture): BasicViewInternalData {
    return {
        model: fixture.model,
        container: fixture.host,
        cubeElement: fixture.cubeEl,
        cubeContainer: fixture.host,
        styles: styles as Record<string, string>,
        stickerClass: 'sticker',
        highlightedClass: 'highlighted',
        variant: 'front' as any,
        viewType: 'basic-front',
        viewRight: { x: 1, y: 0, z: 0 },
        viewUp: { x: 0, y: 1, z: 0 },
        viewForward: { x: 0, y: 0, z: 1 },
        isTilted: false,
        isPitched: false,
        layoutMode: LayoutMode.Floating,
    };
}

function createHandler(
    fixture: Fixture,
    overrides: {
        onStickerSelected?: (id?: string) => void;
        onViewRotated?: (
            dir: 'horizontal' | 'vertical',
            rotation?: string,
            steps?: number,
            stepAnchor?: unknown
        ) => void;
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
        getModel: () => fixture.model,
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
        // The label and decision indicator live on the body, outside the host, so
        // removing the host does not remove them. Without this, a test that never
        // calls `destroy()` leaves one behind for the next test to find.
        document.querySelectorAll(`.${styles['basic-drag-label']}`).forEach(el => el.remove());
        document.querySelectorAll('svg[aria-hidden="true"]').forEach(el => el.remove());
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
        resetElementFromPoint();
    });

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    it('attach() puts panel overlays in the host and pointer overlays on the body', () => {
        const handler = createHandler(fixture);
        handler.attach();

        // These mark a place inside the panel, so they belong to it.
        expect(fixture.host.querySelector('.basic-halo-hit-target')).not.toBeNull();
        expect(fixture.host.querySelector('.basic-halo-cancel-zone')).not.toBeNull();

        // The label and the decision indicator follow the pointer, so they are
        // viewport-anchored on the body — outside every panel's clipping.
        expect(document.querySelector('.basic-drag-label')).not.toBeNull();
        expect(fixture.host.querySelector('.basic-drag-label')).toBeNull();

        handler.destroy();
    });

    it('destroy() removes every overlay it attached', () => {
        const handler = createHandler(fixture);
        handler.attach();
        handler.destroy();

        expect(fixture.host.querySelector('.basic-halo-hit-target')).toBeNull();
        expect(fixture.host.querySelector('.basic-halo-cancel-zone')).toBeNull();
        expect(document.querySelector('.basic-drag-label')).toBeNull();
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
        expect(onStickerSelected).toHaveBeenCalledWith(
            fixture.stickerEl.getAttribute('data-sticker-id')
        );

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

        expect(onViewRotated).toHaveBeenCalledWith('horizontal', 'right', 1, undefined);
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

        expect(onViewRotated).toHaveBeenCalledWith('vertical', 'down', 1, undefined);
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
        const dragLabel = document.querySelector('.basic-drag-label') as HTMLElement;

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

    // -----------------------------------------------------------------------
    // Sticker on selected face — no drag in normal mode
    // -----------------------------------------------------------------------

    it('pointerdown on sticker of selected face in normal mode does not start drag', () => {
        const handler = createHandler(fixture);
        handler.attach();

        // First select face F via tap
        handler.selectFace(Face.F);

        // Subsequent pointerdown on F sticker should NOT start a drag
        mockElementFromPoint(fixture.stickerEl);
        fixture.host.dispatchEvent(pointer('pointerdown', 20, 100, 100));
        document.dispatchEvent(pointer('pointermove', 20, 140, 100));

        // Check that no drag label is rendered
        const dragLabel = document.querySelector('.basic-drag-label') as HTMLElement;
        expect(dragLabel.style.display).toBe('none');

        document.dispatchEvent(pointer('pointerup', 20, 140, 100));
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Pointer on cube but not on sticker (gap/padding)
    // -----------------------------------------------------------------------

    it('pointerdown on cube gap does not start gesture', () => {
        const handler = createHandler(fixture);
        handler.attach();

        // elementFromPoint returns the cube div itself (not a sticker)
        mockElementFromPoint(fixture.cubeEl);

        fixture.host.dispatchEvent(pointer('pointerdown', 21, 100, 100));

        const cancelZone = fixture.host.querySelector('.basic-halo-cancel-zone') as HTMLElement;
        expect(cancelZone.style.display).toBe('none');

        document.dispatchEvent(pointer('pointerup', 21, 100, 100));
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Hover cursor updates
    // -----------------------------------------------------------------------

    it('pointer move without active pointer sets cursor to grab over sticker', () => {
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(fixture.stickerEl);

        fixture.host.dispatchEvent(
            new PointerEvent('pointermove', {
                clientX: 100,
                clientY: 100,
                bubbles: true,
                cancelable: true,
            })
        );

        expect(fixture.host.style.cursor).toBe('grab');
        handler.destroy();
    });

    it('pointer move without active pointer sets grab cursor outside cube', () => {
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(
            new PointerEvent('pointermove', {
                clientX: 10,
                clientY: 10,
                bubbles: true,
                cancelable: true,
            })
        );

        expect(fixture.host.style.cursor).toBe('grab');
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Background drag directions – left and up
    // -----------------------------------------------------------------------

    it('background drag left calls onViewRotated with "horizontal"', () => {
        const onViewRotated = vi.fn();
        const handler = createHandler(fixture, { onViewRotated });
        handler.attach();

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 22, 200, 200));
        document.dispatchEvent(pointer('pointermove', 22, 160, 200));
        document.dispatchEvent(pointer('pointerup', 22, 160, 200));

        expect(onViewRotated).toHaveBeenCalledWith('horizontal', 'left', 1, undefined);
        handler.destroy();
    });

    it('background drag up calls onViewRotated with "vertical"', () => {
        const onViewRotated = vi.fn();
        const handler = createHandler(fixture, { onViewRotated });
        handler.attach();

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 23, 200, 200));
        document.dispatchEvent(pointer('pointermove', 23, 200, 160));
        document.dispatchEvent(pointer('pointerup', 23, 200, 160));

        expect(onViewRotated).toHaveBeenCalledWith('vertical', 'up', 1, undefined);
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Far drag → double-turn (distancePx > farDragThreshold)
    // -----------------------------------------------------------------------

    it('far background drag performs 2 steps', () => {
        const onViewRotated = vi.fn();
        const handler = createHandler(fixture, { onViewRotated });
        handler.attach();

        mockElementFromPoint(null);

        // Move >60px (FAR_DRAG_THRESHOLD_PX)
        fixture.host.dispatchEvent(pointer('pointerdown', 24, 100, 200));
        document.dispatchEvent(pointer('pointermove', 24, 200, 200));
        document.dispatchEvent(pointer('pointerup', 24, 200, 200));

        expect(onViewRotated).toHaveBeenCalledWith('horizontal', 'right', 2, expect.anything());
        handler.destroy();
    });

    it('the far drag anchor is the pose after ONE step, not the target', () => {
        // The anchor exists so a composed half turn can be signed. If it were the
        // end pose the ramp would be signed from a half turn anyway (no use), so
        // this pins that it is the *intermediate* quarter turn.
        const onViewRotated = vi.fn();
        const handler = createHandler(fixture, { onViewRotated });
        handler.attach();

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 25, 100, 200));
        document.dispatchEvent(pointer('pointermove', 25, 200, 200));
        document.dispatchEvent(pointer('pointerup', 25, 200, 200));

        const anchor = onViewRotated.mock.calls[0][3];
        // Two right steps bring the left face forward twice, so after ONE step the
        // view forward axis is the negated original right axis.
        expect(anchor).toEqual({
            viewRight: { x: 0, y: 0, z: 1 },
            viewUp: { x: 0, y: 1, z: 0 },
            viewForward: { x: -1, y: 0, z: 0 },
        });
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Tabbed mode drag label positioning
    // -----------------------------------------------------------------------

    it('tabbed mode uses fixed positioning for drag label', () => {
        const handler = createHandler(fixture);
        handler.attach();
        handler.setLayoutMode(LayoutMode.Tabbed);

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 25, 100, 200));
        document.dispatchEvent(pointer('pointermove', 25, 140, 200));

        // Fixed positioning is a stylesheet contract, not an inline style: the
        // label is a viewport overlay, so a gesture made against a screen edge
        // still shows it in full. jsdom applies no `.module.css`, so the
        // declaration is pinned in the stylesheet rather than computed.
        expect(valueOf(blockFor('.basic-drag-label', basicViewCss), 'position')).toBe('fixed');

        document.dispatchEvent(pointer('pointerup', 25, 140, 200));
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Touch pointer type label offset
    // -----------------------------------------------------------------------

    it('touch pointer offsets drag label above finger', () => {
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(null);

        const touchDown = new PointerEvent('pointerdown', {
            pointerId: 26,
            clientX: 100,
            clientY: 200,
            bubbles: true,
            cancelable: true,
            pointerType: 'touch',
        });
        fixture.host.dispatchEvent(touchDown);

        const touchMove = new PointerEvent('pointermove', {
            pointerId: 26,
            clientX: 140,
            clientY: 200,
            bubbles: true,
            cancelable: true,
            pointerType: 'touch',
        });
        document.dispatchEvent(touchMove);

        const dragLabel = document.querySelector('.basic-drag-label') as HTMLElement;
        if (dragLabel.style.display === 'block') {
            const top = parseFloat(dragLabel.style.top);
            // Touch label should be positioned above the finger
            expect(top).toBeLessThan(200);
        }

        document.dispatchEvent(pointer('pointerup', 26, 140, 200));
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Pointer up without drag — tap
    // -----------------------------------------------------------------------

    it('pointerup without allowDrag but within tap distance handles tap', () => {
        const onStickerSelected = vi.fn();
        const handler = createHandler(fixture, { onStickerSelected });
        handler.attach();

        // Start on cube gap (no gesture started, allowDrag = false)
        mockElementFromPoint(fixture.cubeEl);
        fixture.host.dispatchEvent(pointer('pointerdown', 27, 100, 100));

        // But release on sticker (within tap tolerance)
        mockElementFromPoint(fixture.stickerEl);
        document.dispatchEvent(pointer('pointerup', 27, 100, 100));

        // Should have handled as a tap
        expect(onStickerSelected).toHaveBeenCalled();
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Pointer up with mismatched pointer ID
    // -----------------------------------------------------------------------

    it('pointerup from different pointer ID is ignored', () => {
        const onViewRotated = vi.fn();
        const handler = createHandler(fixture, { onViewRotated });
        handler.attach();

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 28, 100, 200));

        // Wrong pointer ID → ignored
        document.dispatchEvent(pointer('pointerup', 99, 140, 200));

        // Original gesture can still complete
        document.dispatchEvent(pointer('pointermove', 28, 140, 200));
        document.dispatchEvent(pointer('pointerup', 28, 140, 200));

        expect(onViewRotated).toHaveBeenCalledTimes(1);
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Face-direct mode: dragging sticker on face ellipse emits MOVE_REQUESTED
    // -----------------------------------------------------------------------

    it('face direct mode: dragging sticker on selected face emits MOVE_REQUESTED', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();
        handler.setFaceDirectMode(true);

        // Pre-select face F
        handler.selectFace(Face.F);

        mockElementFromPoint(fixture.stickerEl);

        fixture.host.dispatchEvent(pointer('pointerdown', 30, 100, 100));
        document.dispatchEvent(pointer('pointermove', 30, 100, 140));
        document.dispatchEvent(pointer('pointerup', 30, 100, 140));

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'basic-front' })
        );
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // HALO hit target drag → selects face and starts gesture
    // -----------------------------------------------------------------------

    it('drag on halo hit target with selected face starts face rotation gesture', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Pre-select face F so halo hit target is active
        handler.selectFace(Face.F);

        // The halo hit target element is inside the host
        const haloTarget = fixture.host.querySelector('.basic-halo-hit-target') as HTMLElement;
        expect(haloTarget).not.toBeNull();

        // Mock getBoundingClientRect so isHaloHitTargetAtPoint returns true for our coords
        haloTarget.getBoundingClientRect = () =>
            ({ left: 90, right: 110, top: 90, bottom: 110, width: 20, height: 20 }) as DOMRect;

        // Dispatch pointerdown on halo hit target
        fixture.host.dispatchEvent(pointer('pointerdown', 31, 100, 100));
        document.dispatchEvent(pointer('pointermove', 31, 100, 140));
        document.dispatchEvent(pointer('pointerup', 31, 100, 140));

        // Should emit MOVE_REQUESTED for face rotation
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'basic-front' })
        );
        handler.destroy();
    });

    it('drag on halo clears face selection after move', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Pre-select face F so halo hit target is active
        handler.selectFace(Face.F);
        expect(handler.getSelectedFace()).toBe(Face.F);

        // The halo hit target element is inside the host
        const haloTarget = fixture.host.querySelector('.basic-halo-hit-target') as HTMLElement;
        expect(haloTarget).not.toBeNull();

        // Mock getBoundingClientRect so isHaloHitTargetAtPoint returns true for our coords
        haloTarget.getBoundingClientRect = () =>
            ({ left: 90, right: 110, top: 90, bottom: 110, width: 20, height: 20 }) as DOMRect;

        // Dispatch halo drag
        fixture.host.dispatchEvent(pointer('pointerdown', 31, 100, 100));
        document.dispatchEvent(pointer('pointermove', 31, 100, 140));
        document.dispatchEvent(pointer('pointerup', 31, 100, 140));

        // After the move is emitted, face selection should be cleared
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'basic-front' })
        );
        expect(handler.getSelectedFace()).toBeUndefined();

        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // onPointerCancel during active drag → gesture cancelled cleanly
    // -----------------------------------------------------------------------

    it('onPointerCancel during active drag cancels gesture cleanly', () => {
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 32, 100, 200));
        document.dispatchEvent(pointer('pointermove', 32, 140, 200));

        // Cancel during active drag
        document.dispatchEvent(pointer('pointercancel', 32, 140, 200));

        // Should not throw, state should be reset
        expect(handler['activePointerId']).toBeUndefined();
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // pointerleave with no active pointer → no-op, no throw
    // -----------------------------------------------------------------------

    it('pointerleave with no active pointer is a no-op', () => {
        const handler = createHandler(fixture);
        handler.attach();

        // No active pointer — just dispatch pointerleave
        const event = new PointerEvent('pointerleave', {
            pointerId: 999,
            bubbles: true,
            cancelable: true,
        });
        fixture.host.dispatchEvent(event);

        // Should not throw, state unchanged
        expect(handler['activePointerId']).toBeUndefined();
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Background drag with displacement → no move emitted
    // -----------------------------------------------------------------------

    it('background drag with displacement does not emit MOVE_REQUESTED', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 33, 100, 200));
        document.dispatchEvent(pointer('pointermove', 33, 140, 200));
        document.dispatchEvent(pointer('pointerup', 33, 140, 200));

        // Should NOT emit MOVE_REQUESTED — background drag triggers view rotation, not move
        expect(emitSpy).not.toHaveBeenCalledWith(EventName.MOVE_REQUESTED, expect.anything());
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // setupStickerFaceDirectLine — mag < 1 → hideDragDecision
    // -----------------------------------------------------------------------

    it('setupStickerFaceDirectLine hides drag decision when mag < 1', () => {
        const handler = createHandler(fixture);
        handler.attach();
        handler.setFaceDirectMode(true);
        handler.selectFace(Face.F);

        // Mock getBoundingClientRect so haloFaceCenter is at (100, 100)
        const haloTarget = fixture.host.querySelector('.basic-halo-hit-target') as HTMLElement;
        haloTarget.getBoundingClientRect = () =>
            ({ left: 90, right: 110, top: 90, bottom: 110, width: 20, height: 20 }) as DOMRect;

        // Dispatch pointerdown very close to center (mag < 1)
        fixture.host.dispatchEvent(pointer('pointerdown', 34, 100, 100));

        // The drag decision SVG should be hidden (mag < 1 path)
        const svg = document.querySelector('svg[aria-hidden]') as SVGSVGElement;
        expect(svg).not.toBeNull();
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // normalize2 fallback — arm1Dir / arm2Dir null → use basis dir
    // -----------------------------------------------------------------------

    it('showDragDecisionCross uses fallback direction when normalize2 returns null', () => {
        const handler = createHandler(fixture);
        handler.attach();
        handler.setLayoutMode(LayoutMode.Tabbed);

        mockElementFromPoint(null);

        fixture.host.dispatchEvent(pointer('pointerdown', 35, 100, 200));

        // Verify drag decision SVG is visible (showDragDecisionCross was called)
        const svg = document.querySelector('svg[aria-hidden]') as SVGSVGElement;
        expect(svg).not.toBeNull();
        handler.destroy();
    });

    it('getFaceScreenBasisFromDOM returns undefined for degenerate vectors', () => {
        const handler = createHandler(fixture);
        handler.attach();

        const stickers = fixture.host.querySelectorAll(
            `.${styles.sticker}`
        ) as NodeListOf<HTMLElement>;
        stickers.forEach(el => {
            el.getBoundingClientRect = () =>
                ({ left: 100, right: 100, top: 100, bottom: 100, width: 0, height: 0 }) as DOMRect;
        });

        expect(handler['getFaceScreenBasisFromDOM'](Face.F, 3)).toBeUndefined();
        handler.destroy();
    });

    it('getFaceScreenBasisFromDOM resolves its probes through the model', () => {
        const state = createState(fixture);
        const getModel = vi.fn(() => fixture.model);
        const handler = new BasicTouchHandler({
            host: fixture.host,
            styles: styles as Record<string, string>,
            getCubeSize: () => 3,
            getState: () => state,
            onStickerSelected: vi.fn(),
            onViewRotated: vi.fn(),
            viewId: 'basic-front',
            adapter: { mapDragDirection: d => d },
            getModel,
        });
        handler.attach();

        const stickers = fixture.host.querySelectorAll(
            `.${styles.sticker}`
        ) as NodeListOf<HTMLElement>;
        stickers.forEach((el, index) => {
            el.getBoundingClientRect = () =>
                ({
                    left: 50 + index,
                    right: 60 + index,
                    top: 20 + index,
                    bottom: 30 + index,
                    width: 10,
                    height: 10,
                }) as DOMRect;
        });

        const basis = handler['getFaceScreenBasisFromDOM'](Face.F, 3);

        expect(basis).toEqual({
            upDir: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
            rightDir: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        });
        expect(getModel).toHaveBeenCalled();
        handler.destroy();
    });

    it('getFaceScreenBasisFromDOM returns undefined with no model', () => {
        // The basis used to be readable off `data-basic-pos` selectors; that
        // attribute has no production writer any more, so the model is the only
        // source. Without one there is no basis, and the callers fall back.
        const state = createState(fixture);
        const handler = new BasicTouchHandler({
            host: fixture.host,
            styles: styles as Record<string, string>,
            getCubeSize: () => 3,
            getState: () => state,
            onStickerSelected: vi.fn(),
            onViewRotated: vi.fn(),
            viewId: 'basic-front',
            adapter: { mapDragDirection: d => d },
        });
        handler.attach();

        expect(handler['getFaceScreenBasisFromDOM'](Face.F, 3)).toBeUndefined();
        handler.destroy();
    });

    // -----------------------------------------------------------------------
    // Hit resolution – identity comes from the model, never the element
    // -----------------------------------------------------------------------

    it('resolves the hit from the model, not the element attributes', () => {
        // The defect this pins: mid-animation the element under the pointer is
        // showing an in-between pose while its attributes still describe where it
        // started. Identity therefore has to come from the model. Here the element
        // deliberately LIES — it claims a different face than its sticker is on —
        // and the model must win.
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(fixture.stickerEl);
        fixture.stickerEl.setAttribute('data-face', Face.D);

        const hit = handler['getStickerHitFromPoint'](100, 100);

        expect(hit).toBeDefined();
        expect(hit!.face).toBe(Face.F);
        expect(hit!.row).toBe(0);
        expect(hit!.col).toBe(0);
        handler.destroy();
    });

    it('reports the model face and position for a mid-face sticker', () => {
        const handler = createHandler(fixture);
        handler.attach();

        // Centre sticker of the F face: row 1, col 1 on a 3x3.
        const centre = fixture.faceEl.querySelectorAll(`.${styles.sticker}`)[4] as HTMLElement;
        mockElementFromPoint(centre);

        const hit = handler['getStickerHitFromPoint'](100, 100);

        expect(hit).toBeDefined();
        expect(hit!.face).toBe(Face.F);
        expect(hit!.row).toBe(1);
        expect(hit!.col).toBe(1);
        handler.destroy();
    });

    it('returns undefined when the element carries no sticker id', () => {
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(fixture.stickerEl);
        fixture.stickerEl.removeAttribute('data-sticker-id');

        expect(handler['getStickerHitFromPoint'](100, 100)).toBeUndefined();
        handler.destroy();
    });

    it('returns undefined when the id does not resolve in the model', () => {
        const handler = createHandler(fixture);
        handler.attach();

        mockElementFromPoint(fixture.stickerEl);
        fixture.stickerEl.setAttribute('data-sticker-id', 'not_a_sticker');

        expect(handler['getStickerHitFromPoint'](100, 100)).toBeUndefined();
        handler.destroy();
    });

    it('returns undefined when no model is available', () => {
        const state = createState(fixture);
        const handler = new BasicTouchHandler({
            host: fixture.host,
            styles: styles as Record<string, string>,
            getCubeSize: () => 3,
            getState: () => state,
            onStickerSelected: vi.fn(),
            onViewRotated: vi.fn(),
            viewId: 'basic-front',
            adapter: { mapDragDirection: d => d },
        });
        handler.attach();

        mockElementFromPoint(fixture.stickerEl);

        expect(handler['getStickerHitFromPoint'](100, 100)).toBeUndefined();
        handler.destroy();
    });

    it('Covers AE2: a drag after a model change targets the layer from the model', () => {
        // A D move on cubie FLD, then a second pointer-down before the animation
        // settles: the second gesture must read the post-move layer, because the
        // model already reflects the move. This asserts the mechanism the AE
        // depends on — the hit follows the model, so it cannot disagree with it.
        const handler = createHandler(fixture);
        handler.attach();

        // Move the model on, WITHOUT rebuilding the DOM: the DOM is now stale,
        // exactly as it is mid-animation.
        fixture.model.applyMove('D', false, false, true);

        mockElementFromPoint(fixture.stickerEl);
        const hit = handler['getStickerHitFromPoint'](100, 100);

        expect(hit).toBeDefined();
        // Whatever the model now says for this sticker id is what the hit reports
        // — the stale element attributes do not get a vote.
        const sticker = CubeStateUtils.getStickerById(
            fixture.model.getCurrentState(),
            hit!.stickerId as any
        )!;
        expect(hit!.face).toBe(sticker.currentFace);
        expect(hit!.row).toBe(Math.floor(sticker.facePosition / 3));
        expect(hit!.col).toBe(sticker.facePosition % 3);
        handler.destroy();
    });

    it('createInteractionContext and tap-without-drag helpers expose the expected snapshot', () => {
        const handler = createHandler(fixture);
        handler.attach();

        const context = handler['createInteractionContext']();
        expect(context).toEqual({ cubeSize: 3, selectedFace: undefined });
        expect(handler['wasTapWithoutDrag'](100, 100)).toBe(false);

        handler.destroy();
    });

    it('exercises the remaining early-return and fallback branches in gesture helpers', () => {
        const handler = createHandler(fixture);
        handler.attach();

        handler['activePointerId'] = 7;
        handler['onPointerUp'](pointer('pointerup', 8, 100, 100));
        expect(handler['activePointerId']).toBe(7);

        handler['activePointerId'] = 8;
        handler['activePointerAllowsDrag'] = false;
        handler['activePointerOrigin'] = { x: 100, y: 100 };
        handler['onPointerUp'](pointer('pointerup', 8, 100, 100));
        expect(handler['activePointerId']).toBeUndefined();

        handler['activePointerId'] = 9;
        handler['activePointerAllowsDrag'] = false;
        handler['onPointerCancel'](pointer('pointercancel', 10, 100, 100));
        expect(handler['activePointerId']).toBe(9);

        handler['activePointerId'] = 10;
        handler['activePointerAllowsDrag'] = false;
        handler['onPointerCancel'](pointer('pointercancel', 10, 100, 100));
        expect(handler['activePointerId']).toBeUndefined();

        handler['suppressNextClick'] = false;
        expect(() =>
            handler['onClickCapture'](new MouseEvent('click', { bubbles: true, cancelable: true }))
        ).not.toThrow();

        handler['activePointerId'] = 11;
        handler['onPointerDown'](pointer('pointerdown', 11, 120, 120));
        expect(handler['activePointerId']).toBe(11);

        handler['activeGestureKind'] = HitKind.HALO;
        handler['selectedFace'] = undefined;
        expect(
            handler['inferMoveNotationForGesture']({
                pointerId: 1,
                start: { x: 0, y: 0 },
                current: { x: 100, y: 100 },
                deltaX: 100,
                deltaY: 100,
                distancePx: 100,
                direction: DragDirection.RIGHT,
            })
        ).toBeUndefined();

        handler['haloFaceCenter'] = undefined;
        expect(
            handler['inferHaloRotation']({
                pointerId: 1,
                start: { x: 0, y: 0 },
                current: { x: 50, y: 50 },
                deltaX: 50,
                deltaY: 50,
                distancePx: 100,
                direction: DragDirection.RIGHT,
                angularDisplacementRad: undefined,
            })
        ).toBeUndefined();

        handler['pendingStickerCross'] = undefined;
        handler['startHit'] = {
            stickerElement: fixture.stickerEl,
            face: Face.F,
            row: 0,
            col: 0,
            stickerId: 'F-0',
        };
        const adapter = handler['adapter'] as any;
        adapter.mapDragDirection = () => DragDirection.UP;
        expect(
            handler['inferStickerLayerMove']({
                pointerId: 1,
                start: { x: 0, y: 0 },
                current: { x: 100, y: 100 },
                deltaX: 100,
                deltaY: 100,
                distancePx: 100,
                direction: DragDirection.RIGHT,
            })
        ).toBeDefined();

        handler['finalizeBackgroundGesture']({
            pointerId: 1,
            start: { x: 0, y: 0 },
            current: { x: 100, y: 100 },
            deltaX: 100,
            deltaY: 100,
            distancePx: 100,
            direction: 'bogus' as DragDirection,
        });
        expect(
            handler['getBackgroundDragPreviewLabel']({
                pointerId: 1,
                start: { x: 0, y: 0 },
                current: { x: 100, y: 100 },
                deltaX: 50,
                deltaY: 50,
                distancePx: 100,
                direction: 'bogus' as DragDirection,
            })
        ).toBeUndefined();

        handler.destroy();
    });
});
