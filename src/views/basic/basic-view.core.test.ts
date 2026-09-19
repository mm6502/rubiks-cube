import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Face, QuarterTurn, SUPPORTED_SIZES } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { centerFacePosition } from '@/cube/utils/sticker-position';
import { EventName } from '@/types';

import * as rendering from './rendering';
import { BasicView, BasicViewState } from './basic-view';

// Exercises the "core" surface of BasicView which is not covered by the
// more specialized navigation and manual-rotation suites.

describe('BasicView core API', () => {
    let view: BasicView;
    let model: CubeController;
    let container: HTMLElement;

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-back' });
        container = document.createElement('div');
        view.create(container, model);
    });

    it('should report the configured view type and expose the cube element', () => {
        // Arrange - view created in beforeEach

        // Act
        const type = view.getViewType();
        const elt = view.getCubeElement();

        // Assert
        expect(type).toBe('basic-back');
        expect(elt).toBeInstanceOf(HTMLElement);
    });

    it('makes the container focusable and claims focus when contacted (U4)', () => {
        // Arrange — focus on a control outside the view is the state the reported
        // defect occurred in. Basic had no coverage for this at all.
        //
        // The container must be in the document: a detached element cannot hold
        // focus, and `focusViewContainer` deliberately declines to try.
        document.body.appendChild(container);
        const outside = document.createElement('input');
        document.body.appendChild(outside);
        outside.focus();
        expect(document.activeElement).toBe(outside);

        // Act
        container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

        // Assert — the container is focusable *and* actually takes focus, which is
        // what stops an arrow key also reaching the outside control.
        expect(container.tabIndex).toBe(0);
        expect(document.activeElement).toBe(container);

        outside.remove();
        container.remove();
    });

    it('getCommands returns a full command list and running actions updates state', () => {
        // Arrange
        const spyEmit = vi.spyOn(Application.eventBus, 'emit');
        vi.spyOn(rendering as any, 'updateRotation').mockImplementation(() => {});
        vi.spyOn(rendering as any, 'updateFaceLabels').mockImplementation(() => {});

        // Act
        const commands = view.getCommands();
        const ids = commands.map(c => c.id);

        // Assert list properties
        expect(commands.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);

        // Undo/redo present and use view-type-scoped IDs
        expect(ids).toContain('basic-back.undo');
        expect(ids).toContain('basic-back.redo');
        const undo = commands.find(c => c.id === 'basic-back.undo')!;
        const redo = commands.find(c => c.id === 'basic-back.redo')!;
        expect(undo.showInHeader).toBe(true);
        expect(redo.showInHeader).toBe(true);
        // No moves made yet ΓÇö both should be disabled
        expect(undo.isEnabled!()).toBe(false);
        expect(redo.isEnabled!()).toBe(false);

        // Arrange further for command actions
        const tilt = commands.find(c => c.id === 'tilt-view');
        const pitch = commands.find(c => c.id === 'pitch-view');
        const reset = commands.find(c => c.id === 'reset-view');
        expect(tilt).toBeDefined();
        expect(pitch).toBeDefined();
        expect(reset).toBeDefined();

        // Act/Assert tilt
        expect((view as any).state.isTilted).toBe(false);
        tilt!.action();
        expect((view as any).state.isTilted).toBe(true);
        expect(spyEmit).toHaveBeenCalledWith(EventName.VIEW_STATE_CHANGED, {
            viewType: view.getViewType(),
        });

        // Act/Assert pitch
        expect((view as any).state.isPitched).toBe(false);
        pitch!.action();
        expect((view as any).state.isPitched).toBe(true);

        // Act/Assert reset behaviour ΓÇö rotateViewLeft changes vectors; reset restores defaults
        view.rotateViewLeft();
        reset!.action();
        // After reset, back-variant default: vF = (0,0,-1)
        expect((view as any).state.viewForward).toEqual({ x: 0, y: 0, z: -1 });
        expect((view as any).state.viewRight).toEqual({ x: -1, y: 0, z: 0 });
        expect((view as any).state.viewUp).toEqual({ x: 0, y: 1, z: 0 });
    });

    it('getState and setState allow persisting/restoring the view state', () => {
        // Arrange: rotate the view and set aesthetic flags
        view.rotateViewLeft();
        (view as any).state.isTilted = true;

        // Act: capture state
        const persisted = view.getState();

        // Assert persisted structure ΓÇö vectors reflect the rotation
        expect(persisted).toEqual<BasicViewState>({
            viewRight: { x: 0, y: 0, z: 1 }, // after rotateViewLeft from back default
            viewUp: { x: 0, y: 1, z: 0 },
            viewForward: { x: -1, y: 0, z: 0 },
            isTilted: true,
            isPitched: false,
            faceDirectMode: false,
            linked: true,
            ghostOpacityIndex: 0,
        });

        // Arrange: fresh view
        const another = new BasicView({ viewType: 'basic-back' });
        another.create(container, model);

        // Act: restore state
        another.setState(persisted);

        // Assert restoration
        expect((another as any).state.isTilted).toBe(true);
        expect((another as any).state.viewForward).toEqual({ x: -1, y: 0, z: 0 });

        // Act & Assert: garbage inputs don't throw
        another.setState(null);
        another.setState({});
        another.setState({ isTilted: 'nope' } as any);

        // Act & Assert: old-format state (xRotation present) silently resets to default
        another.setState({ xRotation: QuarterTurn.QUARTER, yRotation: 0, zRotation: 0 });
        expect((another as any).state.viewForward).toEqual({ x: 0, y: 0, z: -1 }); // back default
    });

    it('public helpers delegate to the rendering module', () => {
        // Arrange — spy on the module functions the view delegates to
        const updateSpy = vi.spyOn(rendering, 'update').mockImplementation(() => {});
        const resizeSpy = vi.spyOn(rendering, 'resize').mockImplementation(() => {});
        vi.spyOn(rendering, 'getMinimumSize').mockReturnValue({ width: 111, height: 222 });

        // Act & Assert
        view.update(model);
        expect(updateSpy).toHaveBeenCalledWith(expect.anything(), model);

        view.resize();
        expect(resizeSpy).toHaveBeenCalled();

        expect(view.getMinimumSize()).toEqual({ width: 111, height: 222 });

        vi.restoreAllMocks();
    });

    it('destroy clears references', () => {
        // Arrange
        const elt = view.getCubeElement();
        expect(elt).toBeInstanceOf(HTMLElement);

        // Act
        view.destroy();

        // Assert
        expect(view.getCubeElement()).toBeNull();
        expect((view as any).state.container).toBeNull();
        expect((view as any).state.model).toBeUndefined();
    });
});

// The default selection used to hardcode face position 4, which only exists at
// 3×3. `getStickerAt` returns undefined rather than throwing when nothing
// matches, and every call site guarded with `if (sticker)`, so at other sizes the
// view opened with nothing selected — and at 4×4+ with an off-center sticker.
// These tests pin the size-correct behavior for every supported size.
describe('BasicView default selection', () => {
    const createView = (viewType: string, cubeSize: number) => {
        const model = new CubeController(cubeSize);
        const container = document.createElement('div');
        const view = new BasicView({ viewType });
        view.create(container, model);
        return { view, model, container };
    };

    it.each(SUPPORTED_SIZES)('opens with a sticker selected at size %i', cubeSize => {
        const { view } = createView('basic-front', cubeSize);

        // The defect: this was undefined at 2×2 and every other non-3 size.
        expect(view.getSelectedSticker()).toBeDefined();
    });

    it.each(SUPPORTED_SIZES)('selects the center of the variant face at size %i', cubeSize => {
        const front = createView('basic-front', cubeSize);
        const back = createView('basic-back', cubeSize);

        // Assert exact identity, not merely definedness: a definedness-only
        // assertion would stay green if the helper were "simplified" to
        // floor(cubeSize/2), which yields an edge sticker at 3×3.
        const expectedPosition = centerFacePosition(cubeSize);

        const expectedFront = CubeStateUtils.getStickerAt(
            front.model.getCurrentState(),
            Face.F,
            expectedPosition
        );
        const expectedBack = CubeStateUtils.getStickerAt(
            back.model.getCurrentState(),
            Face.B,
            expectedPosition
        );

        expect(front.view.getSelectedSticker()).toBe(expectedFront?.id);
        expect(back.view.getSelectedSticker()).toBe(expectedBack?.id);
    });

    it.each([2, 4, 6])('back variant selects a B-face sticker at size %i', cubeSize => {
        const { view, model } = createView('basic-back', cubeSize);
        const selectedId = view.getSelectedSticker();

        expect(selectedId).toBeDefined();

        const sticker = CubeStateUtils.getStickerById(model.getCurrentState(), selectedId!);
        expect(sticker?.currentFace).toBe(Face.B);
    });

    it('keeps 3×3 on the F-centre at position 4', () => {
        // 3×3 is the size the old literal happened to be correct for, so this is
        // the regression guard for "the fix changed 3×3 too".
        const { view, model } = createView('basic-front', 3);
        const expected = CubeStateUtils.getStickerAt(model.getCurrentState(), Face.F, 4);

        expect(centerFacePosition(3)).toBe(4);
        expect(view.getSelectedSticker()).toBe(expected?.id);
    });
});
