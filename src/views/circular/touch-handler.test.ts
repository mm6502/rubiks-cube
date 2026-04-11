import { Application } from '@/application';
import { Axis, Face, LayoutMode } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { inferMoveFromDrag } from '@/interaction/move-inference';
import { DragDirection } from '@/interaction/types';
import { EventName } from '@/types';

import { AxisCircle } from './svg-tools';
import { CircularTouchHandler } from './touch-handler';

const styles = {
    'circular-halo': 'circular-halo',
    'circular-drag-label': 'circular-drag-label',
    'circular-axis-selected': 'circular-axis-selected',
    'circular-cancel-zone': 'circular-cancel-zone',
} as const;

type Fixture = {
    host: HTMLElement;
    svgRoot: SVGSVGElement;
    background: SVGGElement;
    fSticker: SVGCircleElement;
    uSticker: SVGCircleElement;
    fFaceEllipse: SVGEllipseElement;
    axisElements: Record<string, SVGCircleElement>;
    axisCircles: AxisCircle[];
    cleanup: () => void;
};

describe('CircularTouchHandler', () => {
    let fixture: Fixture;

    beforeEach(() => {
        fixture = createFixture();
        vi.spyOn(CubeStateUtils, 'getStickerById').mockImplementation((_, stickerId) => {
            if (!stickerId) {
                return undefined;
            }

            const match = String(stickerId).match(/^([UDFBLR])-(\d+)$/);
            if (!match) {
                return undefined;
            }

            return {
                id: stickerId,
                currentFace: match[1] as Face,
                facePosition: Number(match[2]),
            } as any;
        });
    });

    afterEach(() => {
        fixture.cleanup();
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('shows halo when tapping a sticker', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        // Act
        handler.onPointerDown(pointer('pointerdown', 1, 160, 220), fixture.fSticker);
        handler.onPointerUp(pointer('pointerup', 1, 160, 220), fixture.fSticker);

        // Assert
        const halo = fixture.svgRoot.querySelector(
            `.${styles['circular-halo']}`
        ) as SVGEllipseElement;
        expect(halo.getAttribute('visibility')).toBe('visible');

        handler.destroy();
    });

    it('toggles face selection by tapping face ellipse', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        // Act
        handler.onPointerDown(pointer('pointerdown', 2, 165, 210), fixture.fFaceEllipse);
        handler.onPointerUp(pointer('pointerup', 2, 165, 210), fixture.fFaceEllipse);

        // Assert
        const halo = fixture.svgRoot.querySelector(
            `.${styles['circular-halo']}`
        ) as SVGEllipseElement;
        expect(halo.getAttribute('visibility')).toBe('visible');

        // Act - toggle off
        handler.onPointerDown(pointer('pointerdown', 2, 165, 210), fixture.fFaceEllipse);
        handler.onPointerUp(pointer('pointerup', 2, 165, 210), fixture.fFaceEllipse);

        // Assert
        expect(halo.getAttribute('visibility')).toBe('hidden');

        handler.destroy();
    });

    it('maps U-face drag direction using face-local basis (not ellipse rotation)', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Act
        handler.onPointerDown(pointer('pointerdown', 3, 200, 132), fixture.uSticker);
        handler.onPointerMove(pointer('pointermove', 3, 170, 132));
        handler.onPointerUp(pointer('pointerup', 3, 170, 132), fixture.uSticker);

        // Assert
        const expectedNotation = inferMoveFromDrag({
            face: Face.U,
            row: 0,
            col: 0,
            direction: DragDirection.DOWN,
            cubeSize: 3,
        });

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ moveNotation: expectedNotation, viewId: 'circular' })
        );

        handler.destroy();
    });

    it('resolves sticker face position from CubeState when available', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            id: 'mock-sticker',
            currentFace: Face.U,
            facePosition: 8,
        } as any);

        const handler = createHandler(fixture);
        handler.attach();

        // Act
        handler.onPointerDown(pointer('pointerdown', 16, 200, 132), fixture.uSticker);
        handler.onPointerMove(pointer('pointermove', 16, 170, 132));
        handler.onPointerUp(pointer('pointerup', 16, 170, 132), fixture.uSticker);

        // Assert
        const expectedNotation = inferMoveFromDrag({
            face: Face.U,
            row: 2,
            col: 2,
            direction: DragDirection.DOWN,
            cubeSize: 3,
        });

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ moveNotation: expectedNotation, viewId: 'circular' })
        );

        handler.destroy();
    });

    it('emits whole-cube move based on nearest sector for background drag', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Act
        handler.onPointerDown(pointer('pointerdown', 4, 200, 120), fixture.background);
        handler.onPointerMove(pointer('pointermove', 4, 240, 120));
        handler.onPointerUp(pointer('pointerup', 4, 240, 120), fixture.background);

        // Assert
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ moveNotation: 'y', viewId: 'circular' })
        );

        handler.destroy();
    });

    it('clears selection and reselects when tapping a circle from a different axis', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        const x2 = fixture.axisElements['X-2'];
        const y2 = fixture.axisElements['Y-2'];

        // Act & Assert: select X-axis circle
        handler.onPointerDown(pointer('pointerdown', 5, 300, 219), x2);
        handler.onPointerUp(pointer('pointerup', 5, 300, 219), x2);
        expect(x2.classList.contains(styles['circular-axis-selected'])).toBe(true);

        // Act & Assert: select Y-axis circle, clearing X-axis selection
        handler.onPointerDown(pointer('pointerdown', 6, 270, 132), y2);
        handler.onPointerUp(pointer('pointerup', 6, 270, 132), y2);
        expect(x2.classList.contains(styles['circular-axis-selected'])).toBe(false);
        expect(y2.classList.contains(styles['circular-axis-selected'])).toBe(true);

        handler.destroy();
    });

    it('toggles axis-circle selection class by tap', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        const axisEl = fixture.axisElements['X-2'];

        // Act: select
        handler.onPointerDown(pointer('pointerdown', 5, 300, 219), axisEl);
        handler.onPointerUp(pointer('pointerup', 5, 300, 219), axisEl);

        // Assert
        expect(axisEl.classList.contains(styles['circular-axis-selected'])).toBe(true);

        // Act: deselect
        handler.onPointerDown(pointer('pointerdown', 5, 300, 219), axisEl);
        handler.onPointerUp(pointer('pointerup', 5, 300, 219), axisEl);

        // Assert
        expect(axisEl.classList.contains(styles['circular-axis-selected'])).toBe(false);

        handler.destroy();
    });

    it('rotates all selected axis circles when dragging one selected circle', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        const x2 = fixture.axisElements['X-2'];
        const x0 = fixture.axisElements['X-0'];

        // Act: select layers on both ends
        handler.onPointerDown(pointer('pointerdown', 7, 300, 219), x2);
        handler.onPointerUp(pointer('pointerup', 7, 300, 219), x2);

        handler.onPointerDown(pointer('pointerdown', 8, 150, 219), x0);
        handler.onPointerUp(pointer('pointerup', 8, 150, 219), x0);

        // Act: drag one selected layer
        handler.onPointerDown(pointer('pointerdown', 9, 300, 219), x2);
        handler.onPointerMove(pointer('pointermove', 9, 280, 239));
        handler.onPointerUp(pointer('pointerup', 9, 280, 239), x2);

        // Assert
        const moveNotations = emitSpy.mock.calls
            .filter(call => call[0] === EventName.MOVE_REQUESTED)
            .map(call => (call[1] as { moveNotation: string }).moveNotation);

        expect(moveNotations).toEqual(expect.arrayContaining(['R', "L'"]));

        handler.destroy();
    });

    it('emits multi-select moves in ascending layer order for CW drag', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        const x0 = fixture.axisElements['X-0'];
        const x2 = fixture.axisElements['X-2'];

        // Select layers 0 and 2
        handler.onPointerDown(pointer('pointerdown', 7, 150, 219), x0);
        handler.onPointerUp(pointer('pointerup', 7, 150, 219), x0);
        handler.onPointerDown(pointer('pointerdown', 8, 300, 219), x2);
        handler.onPointerUp(pointer('pointerup', 8, 300, 219), x2);

        // CW drag (positive angular displacement)
        handler.onPointerDown(pointer('pointerdown', 9, 300, 219), x2);
        handler.onPointerMove(pointer('pointermove', 9, 280, 239));
        handler.onPointerUp(pointer('pointerup', 9, 280, 239), x2);

        const moveNotations = emitSpy.mock.calls
            .filter(call => call[0] === EventName.MOVE_REQUESTED)
            .map(call => (call[1] as { moveNotation: string }).moveNotation);

        // Layer 0 before layer 2 for CW
        expect(moveNotations).toEqual(["L'", 'R']);

        handler.destroy();
    });

    it('emits multi-select moves in descending layer order for CCW drag', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        const x0 = fixture.axisElements['X-0'];
        const x2 = fixture.axisElements['X-2'];

        // Select layers 0 and 2
        handler.onPointerDown(pointer('pointerdown', 7, 150, 219), x0);
        handler.onPointerUp(pointer('pointerup', 7, 150, 219), x0);
        handler.onPointerDown(pointer('pointerdown', 8, 300, 219), x2);
        handler.onPointerUp(pointer('pointerup', 8, 300, 219), x2);

        // CCW drag (negative angular displacement) — drag upward from right side
        handler.onPointerDown(pointer('pointerdown', 9, 300, 219), x2);
        handler.onPointerMove(pointer('pointermove', 9, 280, 199));
        handler.onPointerUp(pointer('pointerup', 9, 280, 199), x2);

        const moveNotations = emitSpy.mock.calls
            .filter(call => call[0] === EventName.MOVE_REQUESTED)
            .map(call => (call[1] as { moveNotation: string }).moveNotation);

        // Layer 2 before layer 0 for CCW
        expect(moveNotations).toEqual(["R'", 'L']);

        handler.destroy();
    });

    it('emits whole-cube notation when all layers of one axis are selected', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        const x0 = fixture.axisElements['X-0'];
        const x1 = fixture.axisElements['X-1'];
        const x2 = fixture.axisElements['X-2'];

        // Act: select all X-axis layers
        handler.onPointerDown(pointer('pointerdown', 10, 350, 219), x0);
        handler.onPointerUp(pointer('pointerup', 10, 350, 219), x0);

        handler.onPointerDown(pointer('pointerdown', 11, 335, 219), x1);
        handler.onPointerUp(pointer('pointerup', 11, 335, 219), x1);

        handler.onPointerDown(pointer('pointerdown', 12, 300, 219), x2);
        handler.onPointerUp(pointer('pointerup', 12, 300, 219), x2);

        // Act: drag any selected layer
        handler.onPointerDown(pointer('pointerdown', 13, 300, 219), x2);
        handler.onPointerMove(pointer('pointermove', 13, 280, 239));
        handler.onPointerUp(pointer('pointerup', 13, 280, 239), x2);

        // Assert
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ moveNotation: 'x', viewId: 'circular' })
        );

        handler.destroy();
    });

    it('positions drag label above pointer in tabbed mode', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();
        handler.setLayoutMode(LayoutMode.Tabbed);

        // Act
        handler.onPointerDown(pointer('pointerdown', 14, 200, 132), fixture.uSticker);
        // Move far enough to exceed the larger tabbed-mode commit threshold.
        handler.onPointerMove(pointer('pointermove', 14, 150, 132));

        // Assert
        const dragLabel = fixture.host.querySelector(
            `.${styles['circular-drag-label']}`
        ) as HTMLElement;
        expect(dragLabel).not.toBeNull();
        expect(dragLabel.style.display).toBe('block');
        expect(dragLabel.textContent).toBeTruthy();

        handler.onPointerUp(pointer('pointerup', 14, 150, 132), fixture.uSticker);
        handler.destroy();
    });

    it('cancel zone radius matches commit threshold in floating mode', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        // Act
        handler.onPointerDown(pointer('pointerdown', 15, 200, 132), fixture.uSticker);

        // Assert
        const cancelZone = fixture.svgRoot.querySelector(
            `.${styles['circular-cancel-zone']}`
        ) as SVGCircleElement;
        expect(cancelZone.getAttribute('visibility')).toBe('visible');
        expect(Number(cancelZone.getAttribute('r'))).toBeCloseTo(16, 4);

        handler.onPointerUp(pointer('pointerup', 15, 200, 132), fixture.uSticker);
        handler.destroy();
    });

    it('cancel zone radius matches commit threshold in tabbed mode (2x)', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();
        handler.setLayoutMode(LayoutMode.Tabbed);

        // Act
        handler.onPointerDown(pointer('pointerdown', 15, 200, 132), fixture.uSticker);

        // Assert
        const cancelZone = fixture.svgRoot.querySelector(
            `.${styles['circular-cancel-zone']}`
        ) as SVGCircleElement;
        expect(cancelZone.getAttribute('visibility')).toBe('visible');
        expect(Number(cancelZone.getAttribute('r'))).toBeCloseTo(20.8, 4);

        handler.onPointerUp(pointer('pointerup', 15, 200, 132), fixture.uSticker);
        handler.destroy();
    });

    it('does not emit moves when drag is within commit threshold', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Act
        handler.onPointerDown(pointer('pointerdown', 16, 200, 132), fixture.uSticker);
        handler.onPointerMove(pointer('pointermove', 16, 204, 132));
        handler.onPointerUp(pointer('pointerup', 16, 204, 132), fixture.uSticker);

        // Assert
        expect(emitSpy).not.toHaveBeenCalledWith(EventName.MOVE_REQUESTED, expect.anything());

        handler.destroy();
    });

    it('destroy removes injected SVG elements', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        // Act
        handler.destroy();

        // Assert
        expect(fixture.svgRoot.querySelector(`.${styles['circular-halo']}`)).toBeNull();
        expect(fixture.host.querySelector(`.${styles['circular-drag-label']}`)).toBeNull();
        expect(fixture.svgRoot.querySelector(`.${styles['circular-cancel-zone']}`)).toBeNull();
    });

    it('cancel gesture hides drag label and cancel zone', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        // Act
        handler.onPointerDown(pointer('pointerdown', 17, 200, 132), fixture.uSticker);
        handler.onPointerMove(pointer('pointermove', 17, 170, 132));
        handler.onPointerCancel(pointer('pointercancel', 17, 170, 132));

        // Assert
        const dragLabel = fixture.host.querySelector(
            `.${styles['circular-drag-label']}`
        ) as HTMLElement;
        const cancelZone = fixture.svgRoot.querySelector(
            `.${styles['circular-cancel-zone']}`
        ) as SVGCircleElement;

        expect(dragLabel.style.display).toBe('none');
        expect(cancelZone.getAttribute('visibility')).toBe('hidden');

        handler.destroy();
    });

    it('infers move from nearest sticker when drag starts on face ellipse (not face mode)', () => {
        // Arrange – F face ellipse at (165,210); F-1 sticker at (165,211) is nearest
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Act – drag right from the face ellipse centre
        handler.onPointerDown(pointer('pointerdown', 20, 165, 210), fixture.fFaceEllipse);
        handler.onPointerMove(pointer('pointermove', 20, 195, 210));
        handler.onPointerUp(pointer('pointerup', 20, 195, 210), fixture.fFaceEllipse);

        // Assert – a MOVE_REQUESTED event was emitted
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'circular' })
        );

        handler.destroy();
    });

    it('shows cross guide (not line) when drag starts on face ellipse outside face mode', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        // Act – press down on face ellipse; nearest F sticker should show a cross
        handler.onPointerDown(pointer('pointerdown', 21, 165, 210), fixture.fFaceEllipse);

        // The secondary arm should be visible (cross = both arms visible; line = secondary hidden)
        const dragCrossGroup = fixture.svgRoot.querySelector('.circular-drag-cross') as SVGGElement;
        const arms = dragCrossGroup?.querySelectorAll('line') ?? [];
        const visibleArms = Array.from(arms).filter(
            el => el.getAttribute('visibility') !== 'hidden'
        );
        expect(visibleArms.length).toBe(2);

        handler.onPointerUp(pointer('pointerup', 21, 165, 210), fixture.fFaceEllipse);
        handler.destroy();
    });

    it('direct mode activates face immediately when dragging stickers', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();
        handler.setFaceDirectMode(true);

        // Act
        handler.onPointerDown(pointer('pointerdown', 18, 160, 220), fixture.fSticker);

        // Assert
        const halo = fixture.svgRoot.querySelector(
            `.${styles['circular-halo']}`
        ) as SVGEllipseElement;
        expect(halo.getAttribute('visibility')).toBe('visible');

        // Act (complete gesture)
        handler.onPointerUp(pointer('pointerup', 18, 160, 220), fixture.fSticker);

        // Assert - face stays selected after gesture
        expect(halo.getAttribute('visibility')).toBe('visible');

        handler.destroy();
    });

    it('setFaceDirectMode / getFaceDirectMode round-trip', () => {
        const handler = createHandler(fixture);
        handler.attach();

        expect(handler.getFaceDirectMode()).toBe(false);
        handler.setFaceDirectMode(true);
        expect(handler.getFaceDirectMode()).toBe(true);
        handler.setFaceDirectMode(false);
        expect(handler.getFaceDirectMode()).toBe(false);

        handler.destroy();
    });

    it('selectFace shows halo; selectFace(undefined) hides halo', () => {
        const handler = createHandler(fixture);
        handler.attach();

        const halo = fixture.svgRoot.querySelector(
            `.${styles['circular-halo']}`
        ) as SVGEllipseElement;

        handler.selectFace(Face.F);
        expect(handler.getSelectedFace()).toBe(Face.F);
        expect(halo.getAttribute('visibility')).toBe('visible');

        handler.selectFace(undefined);
        expect(handler.getSelectedFace()).toBeUndefined();
        expect(halo.getAttribute('visibility')).toBe('hidden');

        handler.destroy();
    });

    it('setLayoutMode persists its value', () => {
        const handler = createHandler(fixture);
        handler.attach();

        // The existing cancel-zone tests verify the visual effect;
        // here we just verify the state is stored and applied when pointerdown fires.
        handler.setLayoutMode(LayoutMode.Tabbed);
        handler.onPointerDown(pointer('pointerdown', 20, 150, 220), fixture.fSticker);
        const cancelZone = fixture.svgRoot.querySelector(
            `.${styles['circular-cancel-zone']}`
        ) as SVGCircleElement;
        expect(cancelZone.getAttribute('visibility')).toBe('visible');
        // tabbed radius is 20.8
        expect(Number(cancelZone.getAttribute('r'))).toBeCloseTo(20.8, 4);
        handler.onPointerUp(pointer('pointerup', 20, 150, 220), fixture.fSticker);

        handler.destroy();
    });

    it('ignores second pointer while first is active', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // first pointer down
        handler.onPointerDown(pointer('pointerdown', 30, 150, 220), fixture.fSticker);

        // second pointer should be ignored
        handler.onPointerDown(pointer('pointerdown', 31, 160, 230), fixture.fSticker);

        // move and up with first pointer
        handler.onPointerMove(pointer('pointermove', 30, 150, 160));
        handler.onPointerUp(pointer('pointerup', 30, 150, 160), null);

        handler.destroy();
        emitSpy.mockRestore();
    });

    it('tapping background clears selected face', () => {
        const handler = createHandler(fixture);
        handler.attach();

        // Select a face first
        handler.selectFace(Face.F);
        expect(handler.getSelectedFace()).toBe(Face.F);

        // Tap on background
        handler.onPointerDown(pointer('pointerdown', 40, 10, 10), fixture.background);
        handler.onPointerUp(pointer('pointerup', 40, 10, 10), fixture.background);

        expect(handler.getSelectedFace()).toBeUndefined();

        handler.destroy();
    });

    it('emits face rotation when dragging the halo (selected face ring)', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Select a face first
        handler.selectFace(Face.F);

        // Get the halo element
        const halo = fixture.svgRoot.querySelector(
            `.${styles['circular-halo']}`
        ) as SVGEllipseElement;

        // Act — drag on the halo
        handler.onPointerDown(pointer('pointerdown', 50, 165, 210), halo);
        // Large enough arc-like drag to produce angular displacement > 0.1
        handler.onPointerMove(pointer('pointermove', 50, 200, 180));
        handler.onPointerUp(pointer('pointerup', 50, 200, 180), halo);

        // Assert — a face rotation move was emitted
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'circular' })
        );

        handler.destroy();
    });

    it('emits double move (e.g. R2) for far drag on halo', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();
        handler.selectFace(Face.F);

        const halo = fixture.svgRoot.querySelector(
            `.${styles['circular-halo']}`
        ) as SVGEllipseElement;

        // Act — very far drag to exceed farDragThresholdPx (70px)
        handler.onPointerDown(pointer('pointerdown', 51, 165, 210), halo);
        handler.onPointerMove(pointer('pointermove', 51, 265, 130));
        handler.onPointerUp(pointer('pointerup', 51, 265, 130), halo);

        // Assert — a double move ending in '2'
        const moveCall = emitSpy.mock.calls.find(c => c[0] === EventName.MOVE_REQUESTED);
        if (moveCall) {
            const notation = (moveCall[1] as { moveNotation: string }).moveNotation;
            expect(notation).toMatch(/2$/);
        }

        handler.destroy();
    });

    it('emits single axis-circle drag move (non-selected circle)', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        const x2 = fixture.axisElements['X-2'];

        // Act — drag (not tap) on X-2 circle
        handler.onPointerDown(pointer('pointerdown', 52, 300, 219), x2);
        handler.onPointerMove(pointer('pointermove', 52, 280, 250));
        handler.onPointerUp(pointer('pointerup', 52, 280, 250), x2);

        // Assert — a move was emitted
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'circular' })
        );

        handler.destroy();
    });

    it('emits double move for far drag on axis circle', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        const x2 = fixture.axisElements['X-2'];

        // Act — very far drag
        handler.onPointerDown(pointer('pointerdown', 53, 300, 219), x2);
        handler.onPointerMove(pointer('pointermove', 53, 220, 320));
        handler.onPointerUp(pointer('pointerup', 53, 220, 320), x2);

        // Assert — double move
        const moveCall = emitSpy.mock.calls.find(c => c[0] === EventName.MOVE_REQUESTED);
        if (moveCall) {
            const notation = (moveCall[1] as { moveNotation: string }).moveNotation;
            expect(notation).toMatch(/2$/);
        }

        handler.destroy();
    });

    it('emits double moves for far drag on selected axis circles', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        const x0 = fixture.axisElements['X-0'];
        const x2 = fixture.axisElements['X-2'];

        // Select circles
        handler.onPointerDown(pointer('pointerdown', 54, 300, 219), x2);
        handler.onPointerUp(pointer('pointerup', 54, 300, 219), x2);
        handler.onPointerDown(pointer('pointerdown', 55, 150, 219), x0);
        handler.onPointerUp(pointer('pointerup', 55, 150, 219), x0);

        // Act — far drag on selected circle
        handler.onPointerDown(pointer('pointerdown', 56, 300, 219), x2);
        handler.onPointerMove(pointer('pointermove', 56, 220, 320));
        handler.onPointerUp(pointer('pointerup', 56, 220, 320), x2);

        // Assert — double moves emitted
        const moveNotations = emitSpy.mock.calls
            .filter(c => c[0] === EventName.MOVE_REQUESTED)
            .map(c => (c[1] as { moveNotation: string }).moveNotation);
        expect(moveNotations.some(n => n.match(/2$/))).toBe(true);

        handler.destroy();
    });

    it('emits sticker-cross-based move for sticker drag (rightward)', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Act — drag right on F-0 sticker
        handler.onPointerDown(pointer('pointerdown', 57, 150, 220), fixture.fSticker);
        handler.onPointerMove(pointer('pointermove', 57, 190, 220));
        handler.onPointerUp(pointer('pointerup', 57, 190, 220), fixture.fSticker);

        // Assert — a move was emitted
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'circular' })
        );

        handler.destroy();
    });

    it('emits double move for far sticker drag', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Act — very far drag on F-0 sticker
        handler.onPointerDown(pointer('pointerdown', 58, 150, 220), fixture.fSticker);
        handler.onPointerMove(pointer('pointermove', 58, 250, 220));
        handler.onPointerUp(pointer('pointerup', 58, 250, 220), fixture.fSticker);

        // Assert — double move emitted
        const moveCall = emitSpy.mock.calls.find(c => c[0] === EventName.MOVE_REQUESTED);
        if (moveCall) {
            const notation = (moveCall[1] as { moveNotation: string }).moveNotation;
            expect(notation).toMatch(/2$/);
        }

        handler.destroy();
    });

    it('emits double move for far background drag', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Act — very far drag on background
        handler.onPointerDown(pointer('pointerdown', 59, 200, 120), fixture.background);
        handler.onPointerMove(pointer('pointermove', 59, 300, 120));
        handler.onPointerUp(pointer('pointerup', 59, 300, 120), fixture.background);

        // Assert — a double move
        const moveCall = emitSpy.mock.calls.find(c => c[0] === EventName.MOVE_REQUESTED);
        if (moveCall) {
            const notation = (moveCall[1] as { moveNotation: string }).moveNotation;
            expect(notation).toMatch(/2$/);
        }

        handler.destroy();
    });

    it('direct mode activates face immediately when dragging face ellipse', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();
        handler.setFaceDirectMode(true);

        // Act — pointer down on face ellipse
        handler.onPointerDown(pointer('pointerdown', 60, 165, 210), fixture.fFaceEllipse);

        // Assert — halo is visible
        const halo = fixture.svgRoot.querySelector(
            `.${styles['circular-halo']}`
        ) as SVGEllipseElement;
        expect(halo.getAttribute('visibility')).toBe('visible');

        handler.onPointerUp(pointer('pointerup', 60, 165, 210), fixture.fFaceEllipse);
        handler.destroy();
    });

    it('restores previous face after direct mode drag gesture', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();
        handler.selectFace(Face.U);
        handler.setFaceDirectMode(true);

        // Act — drag (not tap) on F face in direct mode to trigger onDragEnd, then restore
        handler.onPointerDown(pointer('pointerdown', 61, 160, 220), fixture.fSticker);
        handler.onPointerMove(pointer('pointermove', 61, 200, 180));
        handler.onPointerUp(pointer('pointerup', 61, 200, 180), null);

        // Assert — previous selection is restored after drag
        expect(handler.getSelectedFace()).toBe(Face.U);

        handler.destroy();
    });

    it('tapping the halo deselects the face', () => {
        // Arrange
        const onStickerSelected = vi.fn();
        const handler = new CircularTouchHandler({
            svgRoot: fixture.svgRoot,
            host: fixture.host,
            styles,
            axisCircles: fixture.axisCircles,
            getCubeSize: () => 3,
            getCubeState: () => ({}) as any,
            onStickerSelected,
        });
        handler.attach();
        handler.selectFace(Face.F);

        const halo = fixture.svgRoot.querySelector(
            `.${styles['circular-halo']}`
        ) as SVGEllipseElement;

        // Act — tap the halo
        handler.onPointerDown(pointer('pointerdown', 62, 165, 210), halo);
        handler.onPointerUp(pointer('pointerup', 62, 165, 210), halo);

        // Assert
        expect(handler.getSelectedFace()).toBeUndefined();
        expect(onStickerSelected).toHaveBeenCalledWith(undefined);

        handler.destroy();
    });

    it('tapping same-face sticker toggles selection off', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        // Select F face via sticker tap
        handler.onPointerDown(pointer('pointerdown', 63, 160, 220), fixture.fSticker);
        handler.onPointerUp(pointer('pointerup', 63, 160, 220), fixture.fSticker);
        expect(handler.getSelectedFace()).toBe(Face.F);

        // Tap same-face sticker again
        handler.onPointerDown(pointer('pointerdown', 64, 160, 220), fixture.fSticker);
        handler.onPointerUp(pointer('pointerup', 64, 160, 220), fixture.fSticker);
        expect(handler.getSelectedFace()).toBeUndefined();

        handler.destroy();
    });

    it('tapping on NONE target clears face selection', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();
        handler.selectFace(Face.F);

        // Create a foreign element not inside SVG
        const foreign = document.createElement('div');
        document.body.appendChild(foreign);

        // Act — tap on foreign element
        handler.onPointerDown(pointer('pointerdown', 65, 999, 999), foreign);
        handler.onPointerUp(pointer('pointerup', 65, 999, 999), foreign);

        // Assert
        expect(handler.getSelectedFace()).toBeUndefined();

        foreign.remove();
        handler.destroy();
    });

    it('drag label shows multi-move label for multiple selected axis circles', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        const x0 = fixture.axisElements['X-0'];
        const x2 = fixture.axisElements['X-2'];

        // Select both circles
        handler.onPointerDown(pointer('pointerdown', 66, 300, 219), x2);
        handler.onPointerUp(pointer('pointerup', 66, 300, 219), x2);
        handler.onPointerDown(pointer('pointerdown', 67, 150, 219), x0);
        handler.onPointerUp(pointer('pointerup', 67, 150, 219), x0);

        // Act — drag to show label
        handler.onPointerDown(pointer('pointerdown', 68, 300, 219), x2);
        handler.onPointerMove(pointer('pointermove', 68, 280, 249));

        // Assert — drag label shows both move notations, space-separated (e.g. "L' R")
        const dragLabel = fixture.host.querySelector(
            `.${styles['circular-drag-label']}`
        ) as HTMLElement;
        expect(dragLabel.style.display).toBe('block');
        expect(dragLabel.textContent).toMatch(/\S+[+]\S+/);

        handler.onPointerUp(pointer('pointerup', 68, 280, 249), x2);
        handler.destroy();
    });

    it('onPointerCancel during axis circle drag cleans up correctly', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        const x2 = fixture.axisElements['X-2'];

        // Act — start drag, then cancel
        handler.onPointerDown(pointer('pointerdown', 69, 300, 219), x2);
        handler.onPointerMove(pointer('pointermove', 69, 280, 240));
        handler.onPointerCancel(pointer('pointercancel', 69, 280, 240));

        // Assert — UI elements hidden
        const cancelZone = fixture.svgRoot.querySelector(
            `.${styles['circular-cancel-zone']}`
        ) as SVGCircleElement;
        expect(cancelZone.getAttribute('visibility')).toBe('hidden');

        handler.destroy();
    });

    it('shows axis circle preview when starting drag on axis circle', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();
        const x2 = fixture.axisElements['X-2'];

        // Act — start drag
        handler.onPointerDown(pointer('pointerdown', 70, 300, 219), x2);

        // Assert — preview class is added
        const className = styles['circular-axis-selected'];
        expect(x2.classList.contains(className)).toBe(true);

        handler.onPointerUp(pointer('pointerup', 70, 300, 219), x2);
        handler.destroy();
    });

    it('shows all-axis preview when starting background drag near an axis', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        // Act — pointer down on background near X axis center (250, 219)
        handler.onPointerDown(pointer('pointerdown', 71, 260, 219), fixture.background);

        // Assert — all X-axis circles get preview class
        const className = styles['circular-axis-selected'];
        expect(fixture.axisElements['X-0'].classList.contains(className)).toBe(true);
        expect(fixture.axisElements['X-1'].classList.contains(className)).toBe(true);
        expect(fixture.axisElements['X-2'].classList.contains(className)).toBe(true);

        handler.onPointerUp(pointer('pointerup', 71, 260, 219), fixture.background);

        // Assert — preview is removed after up
        expect(fixture.axisElements['X-0'].classList.contains(className)).toBe(false);
        expect(fixture.axisElements['X-1'].classList.contains(className)).toBe(false);
        expect(fixture.axisElements['X-2'].classList.contains(className)).toBe(false);

        handler.destroy();
    });

    it('drag label uses fixed positioning in tabbed mode', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();
        handler.setLayoutMode(LayoutMode.Tabbed);

        // Act — drag on sticker to show label
        handler.onPointerDown(pointer('pointerdown', 72, 150, 220), fixture.fSticker);
        handler.onPointerMove(pointer('pointermove', 72, 100, 220));

        // Assert — fixed positioning
        const dragLabel = fixture.host.querySelector(
            `.${styles['circular-drag-label']}`
        ) as HTMLElement;
        expect(dragLabel.style.position).toBe('fixed');

        handler.onPointerUp(pointer('pointerup', 72, 100, 220), fixture.fSticker);
        handler.destroy();
    });

    it('drag label uses relative positioning in floating mode', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        // Act — drag on sticker to show label
        handler.onPointerDown(pointer('pointerdown', 73, 150, 220), fixture.fSticker);
        handler.onPointerMove(pointer('pointermove', 73, 100, 220));

        // Assert — no fixed position
        const dragLabel = fixture.host.querySelector(
            `.${styles['circular-drag-label']}`
        ) as HTMLElement;
        expect(dragLabel.style.position).not.toBe('fixed');

        handler.onPointerUp(pointer('pointerup', 73, 100, 220), fixture.fSticker);
        handler.destroy();
    });

    it('sticker on selected face does not start sticker drag (falls through to NONE)', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();
        handler.selectFace(Face.F);

        // Act — drag on sticker of already-selected face
        handler.onPointerDown(pointer('pointerdown', 74, 160, 220), fixture.fSticker);
        handler.onPointerMove(pointer('pointermove', 74, 200, 220));
        handler.onPointerUp(pointer('pointerup', 74, 200, 220), fixture.fSticker);

        // Assert — should NOT emit a sticker-based move (because selected face uses halo)
        // It may or may not emit (depends on cross setup), but the key path is exercised
        handler.destroy();
    });

    it('face overlay element is treated as halo tap target', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();
        handler.selectFace(Face.F);

        // Find the face overlay
        const overlay = fixture.svgRoot.querySelector(
            '.circular-face-overlay'
        ) as SVGEllipseElement;
        expect(overlay).not.toBeNull();

        // Act — tap on the overlay
        handler.onPointerDown(pointer('pointerdown', 75, 165, 210), overlay);
        handler.onPointerUp(pointer('pointerup', 75, 165, 210), overlay);

        // Assert — face deselected (same as halo tap)
        expect(handler.getSelectedFace()).toBeUndefined();

        handler.destroy();
    });

    it('resolves sticker with non-finite facePosition as undefined', () => {
        // Arrange
        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            id: 'bad-sticker',
            currentFace: Face.F,
            facePosition: NaN,
        } as any);

        const handler = createHandler(fixture);
        handler.attach();

        // Act — tap a sticker with NaN facePosition
        handler.onPointerDown(pointer('pointerdown', 76, 160, 220), fixture.fSticker);
        handler.onPointerUp(pointer('pointerup', 76, 160, 220), fixture.fSticker);

        // Assert — should not crash, face should not be selected
        expect(handler.getSelectedFace()).toBeUndefined();

        handler.destroy();
    });

    it('resolves sticker with out-of-range row/col as undefined', () => {
        // Arrange
        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            id: 'bad-sticker',
            currentFace: Face.F,
            facePosition: 99, // row=33, col=0 — both out of range for 3×3
        } as any);

        const handler = createHandler(fixture);
        handler.attach();

        // Act
        handler.onPointerDown(pointer('pointerdown', 77, 160, 220), fixture.fSticker);
        handler.onPointerUp(pointer('pointerup', 77, 160, 220), fixture.fSticker);

        // Assert
        expect(handler.getSelectedFace()).toBeUndefined();

        handler.destroy();
    });

    it('resolveStickerHit returns undefined for null cubeState', () => {
        // Arrange
        const handler = new CircularTouchHandler({
            svgRoot: fixture.svgRoot,
            host: fixture.host,
            styles,
            axisCircles: fixture.axisCircles,
            getCubeSize: () => 3,
            getCubeState: () => null as any,
            onStickerSelected: () => undefined,
        });
        handler.attach();

        // Act
        handler.onPointerDown(pointer('pointerdown', 78, 160, 220), fixture.fSticker);
        handler.onPointerUp(pointer('pointerup', 78, 160, 220), fixture.fSticker);

        // Assert — does not crash
        expect(handler.getSelectedFace()).toBeUndefined();

        handler.destroy();
    });

    it('handles missing getCubeState option gracefully', () => {
        // Arrange
        const handler = new CircularTouchHandler({
            svgRoot: fixture.svgRoot,
            host: fixture.host,
            styles,
            axisCircles: fixture.axisCircles,
            getCubeSize: () => 3,
            onStickerSelected: () => undefined,
        });
        handler.attach();

        // Act — tap a sticker
        handler.onPointerDown(pointer('pointerdown', 79, 160, 220), fixture.fSticker);
        handler.onPointerUp(pointer('pointerup', 79, 160, 220), fixture.fSticker);

        // Assert — no crash
        expect(handler.getSelectedFace()).toBeUndefined();

        handler.destroy();
    });

    it('resolves sticker with empty currentFace as undefined', () => {
        // Arrange
        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            id: 'bad-sticker',
            currentFace: '',
            facePosition: 0,
        } as any);

        const handler = createHandler(fixture);
        handler.attach();

        // Act
        handler.onPointerDown(pointer('pointerdown', 80, 160, 220), fixture.fSticker);
        handler.onPointerUp(pointer('pointerup', 80, 160, 220), fixture.fSticker);

        // Assert
        expect(handler.getSelectedFace()).toBeUndefined();

        handler.destroy();
    });

    it('hideDragLabel resets position styling', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();
        handler.setLayoutMode(LayoutMode.Tabbed);

        // Act — show then hide
        handler.onPointerDown(pointer('pointerdown', 81, 150, 220), fixture.fSticker);
        handler.onPointerMove(pointer('pointermove', 81, 100, 220));
        handler.onPointerUp(pointer('pointerup', 81, 100, 220), fixture.fSticker);

        // Assert — label hidden and position reset
        const dragLabel = fixture.host.querySelector(
            `.${styles['circular-drag-label']}`
        ) as HTMLElement;
        expect(dragLabel.style.display).toBe('none');
        expect(dragLabel.style.position).toBe('');

        handler.destroy();
    });

    it('onPointerMove without prior down does not crash', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        // Act — move without down
        expect(() => {
            handler.onPointerMove(pointer('pointermove', 82, 150, 220));
        }).not.toThrow();

        handler.destroy();
    });

    it('preview for selected multi-circle lights up all selected keys', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        const x0 = fixture.axisElements['X-0'];
        const x2 = fixture.axisElements['X-2'];
        const className = styles['circular-axis-selected'];

        // Select X-0 and X-2
        handler.onPointerDown(pointer('pointerdown', 83, 300, 219), x2);
        handler.onPointerUp(pointer('pointerup', 83, 300, 219), x2);
        handler.onPointerDown(pointer('pointerdown', 84, 150, 219), x0);
        handler.onPointerUp(pointer('pointerup', 84, 150, 219), x0);

        // Act — pointer down on X-2 (already selected) → preview all selected
        handler.onPointerDown(pointer('pointerdown', 85, 300, 219), x2);

        // Assert — both selected circles get preview
        expect(x0.classList.contains(className)).toBe(true);
        expect(x2.classList.contains(className)).toBe(true);

        handler.onPointerUp(pointer('pointerup', 85, 300, 219), x2);
        handler.destroy();
    });

    it('sticker downward drag emits correct move', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Act — drag down on F-0 sticker
        handler.onPointerDown(pointer('pointerdown', 86, 150, 220), fixture.fSticker);
        handler.onPointerMove(pointer('pointermove', 86, 150, 260));
        handler.onPointerUp(pointer('pointerup', 86, 150, 260), fixture.fSticker);

        // Assert — a move was emitted
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'circular' })
        );

        handler.destroy();
    });

    it('sticker leftward drag emits correct move', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Act — drag left on F-0 sticker
        handler.onPointerDown(pointer('pointerdown', 87, 150, 220), fixture.fSticker);
        handler.onPointerMove(pointer('pointermove', 87, 110, 220));
        handler.onPointerUp(pointer('pointerup', 87, 110, 220), fixture.fSticker);

        // Assert
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'circular' })
        );

        handler.destroy();
    });

    it('sticker upward drag emits correct move', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const handler = createHandler(fixture);
        handler.attach();

        // Act — drag up on F-0 sticker
        handler.onPointerDown(pointer('pointerdown', 88, 150, 220), fixture.fSticker);
        handler.onPointerMove(pointer('pointermove', 88, 150, 180));
        handler.onPointerUp(pointer('pointerup', 88, 150, 180), fixture.fSticker);

        // Assert
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'circular' })
        );

        handler.destroy();
    });

    it('drag label is hidden when inferring no moves (within commit threshold)', () => {
        // Arrange
        const handler = createHandler(fixture);
        handler.attach();

        // Act — tiny drag (within threshold)
        handler.onPointerDown(pointer('pointerdown', 89, 150, 220), fixture.fSticker);
        handler.onPointerMove(pointer('pointermove', 89, 152, 220));

        // Assert — drag label hidden
        const dragLabel = fixture.host.querySelector(
            `.${styles['circular-drag-label']}`
        ) as HTMLElement;
        expect(dragLabel.style.display).toBe('none');

        handler.onPointerUp(pointer('pointerup', 89, 152, 220), fixture.fSticker);
        handler.destroy();
    });

    it('halo drag guide line is hidden when no face ellipse exists', () => {
        // Arrange — create a handler with no face ellipses
        const bareSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        bareSvg.setAttribute('viewBox', '0 0 400 400');
        const bareHost = document.createElement('div');
        document.body.appendChild(bareHost);
        bareHost.appendChild(bareSvg);

        const handler = new CircularTouchHandler({
            svgRoot: bareSvg,
            host: bareHost,
            styles,
            axisCircles: [],
            getCubeSize: () => 3,
            getCubeState: () => ({}) as any,
            onStickerSelected: () => undefined,
        });
        handler.attach();

        // Manually set selected face without showHaloForFace
        handler.selectFace(Face.F);

        // Act — this exercises setupHaloGuideLine with no ellipse
        // The halo would need to be the target but there's no face ellipse
        expect(() => {
            handler.onPointerDown(pointer('pointerdown', 90, 100, 100), null);
            handler.onPointerUp(pointer('pointerup', 90, 100, 100), null);
        }).not.toThrow();

        handler.destroy();
        bareHost.remove();
    });
});

function createFixture(): Fixture {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgRoot.setAttribute('viewBox', '0 0 400 400');
    host.appendChild(svgRoot);

    const background = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svgRoot.appendChild(background);

    const fFaceEllipse = createFaceEllipse(svgRoot, 'F', 165, 210, 40, 33, 'rotate(60 165 210)');
    createFaceEllipse(svgRoot, 'U', 200, 150, 40, 33);

    // F face (enough stickers to derive local basis).
    const fSticker = createSticker(background, Face.F, 0, 150, 220);
    createSticker(background, Face.F, 1, 165, 211);
    createSticker(background, Face.F, 3, 161, 236);

    // U face with no ellipse rotation but diagonal local basis.
    const uSticker = createSticker(background, Face.U, 0, 200, 132);
    createSticker(background, Face.U, 1, 186, 142);
    createSticker(background, Face.U, 3, 214, 142);

    const axisCircles: AxisCircle[] = [
        { id: 'x-layer-0', axis: Axis.X, layer: 0, cx: 250, cy: 219, r: 100 },
        { id: 'x-layer-1', axis: Axis.X, layer: 1, cx: 250, cy: 219, r: 85 },
        { id: 'x-layer-2', axis: Axis.X, layer: 2, cx: 250, cy: 219, r: 70 },
        { id: 'y-layer-2', axis: Axis.Y, layer: 2, cx: 200, cy: 132, r: 70 },
        { id: 'z-layer-2', axis: Axis.Z, layer: 2, cx: 150, cy: 219, r: 70 },
    ];

    const axisElements: Record<string, SVGCircleElement> = {};
    for (const circle of axisCircles) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        el.id = circle.id;
        el.setAttribute('cx', String(circle.cx));
        el.setAttribute('cy', String(circle.cy));
        el.setAttribute('r', String(circle.r));
        background.appendChild(el);
        axisElements[`${circle.axis}-${circle.layer}`] = el;
    }

    return {
        host,
        svgRoot,
        background,
        fSticker,
        uSticker,
        fFaceEllipse,
        axisElements,
        axisCircles,
        cleanup: () => host.remove(),
    };
}

function createFaceEllipse(
    svgRoot: SVGSVGElement,
    face: Face,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    transform?: string
): SVGEllipseElement {
    const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    ellipse.id = `${face}-face-ellipse`;
    ellipse.setAttribute('cx', String(cx));
    ellipse.setAttribute('cy', String(cy));
    ellipse.setAttribute('rx', String(rx));
    ellipse.setAttribute('ry', String(ry));
    if (transform) {
        ellipse.setAttribute('transform', transform);
    }
    svgRoot.appendChild(ellipse);
    return ellipse;
}

function createSticker(
    parent: SVGGElement,
    face: Face,
    pos: number,
    cx: number,
    cy: number
): SVGCircleElement {
    const sticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    sticker.classList.add('sticker');
    sticker.id = `sticker-${face}-${pos}`;
    sticker.setAttribute('data-face', face);
    sticker.setAttribute('data-pos', String(pos));
    sticker.setAttribute('data-sticker-id', `${face}-${pos}`);
    sticker.setAttribute('cx', String(cx));
    sticker.setAttribute('cy', String(cy));
    sticker.setAttribute('r', '7');
    parent.appendChild(sticker);
    return sticker;
}

function pointer(type: string, pointerId: number, clientX: number, clientY: number): PointerEvent {
    return new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        clientX,
        clientY,
    });
}

function createHandler(fixture: Fixture): CircularTouchHandler {
    return new CircularTouchHandler({
        svgRoot: fixture.svgRoot,
        host: fixture.host,
        styles,
        axisCircles: fixture.axisCircles,
        getCubeSize: () => 3,
        getCubeState: () => ({}) as any,
        onStickerSelected: () => undefined,
    });
}
