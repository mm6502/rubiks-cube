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
