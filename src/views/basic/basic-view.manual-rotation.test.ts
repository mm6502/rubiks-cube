// Tests for manual cube rotation (Ctrl+Arrow) view direction tracking.
// The orientation is stored as three orthogonal unit vectors (viewForward,
// viewRight, viewUp); each Ctrl+Arrow swaps them without any Euler angles.
//
// NOTE: Restored from git history (pre-cutover basic-view.manual-rotation.test.ts)
// and adapted to the consolidated Basic 2 view. The angle constants previously
// lived in ./constants; they are now exported from rendering.ts.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CubeController } from '@/cube-controller';
import { CubieType, Face, SUPPORTED_SIZES, StickerId } from '@/cube/types';
import { BasicView } from '@/views/basic/basic-view';
import styles from '@/views/basic/basic-view.module.css';
import { viewFrontFace } from '@/views/basic/navigation';
import {
    BASIC_VIEW_ANGLES,
    getVisibleFacesWithPositions,
    updateRotation,
} from '@/views/basic/rendering';

// Default front-variant orientation:
//   vF = (0, 0,  1)  — model +Z faces viewer
//   vR = (1, 0,  0)  — model +X is screen-right
//   vU = (0, 1,  0)  — model +Y is screen-up

describe('BasicView Manual Rotation (Ctrl+Arrow)', () => {
    let view: BasicView;
    let model: CubeController;

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-front' });
        const container = document.createElement('div');
        view.create(container, model);
    });

    // -------------------------------------------------------------------------
    // Single-axis rotations
    // -------------------------------------------------------------------------

    describe('rotateViewLeft', () => {
        it('swaps vF ← vR and vR ← −vF; vU unchanged', () => {
            view.rotateViewLeft();
            expect(view.getState().viewForward).toEqual({ x: 1, y: 0, z: 0 });
            expect(view.getState().viewRight).toEqual({ x: 0, y: 0, z: -1 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 1, z: 0 });
        });

        it('4× left is identity', () => {
            view.rotateViewLeft();
            view.rotateViewLeft();
            view.rotateViewLeft();
            view.rotateViewLeft();
            expect(view.getState().viewForward).toEqual({ x: 0, y: 0, z: 1 });
            expect(view.getState().viewRight).toEqual({ x: 1, y: 0, z: 0 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 1, z: 0 });
        });
    });

    describe('rotateViewRight', () => {
        it('swaps vF ← −vR and vR ← vF; vU unchanged', () => {
            view.rotateViewRight();
            expect(view.getState().viewForward).toEqual({ x: -1, y: 0, z: 0 });
            expect(view.getState().viewRight).toEqual({ x: 0, y: 0, z: 1 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 1, z: 0 });
        });

        it('4× right is identity', () => {
            view.rotateViewRight();
            view.rotateViewRight();
            view.rotateViewRight();
            view.rotateViewRight();
            expect(view.getState().viewForward).toEqual({ x: 0, y: 0, z: 1 });
            expect(view.getState().viewRight).toEqual({ x: 1, y: 0, z: 0 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 1, z: 0 });
        });
    });

    describe('rotateViewUp', () => {
        it('swaps vF ← vU and vU ← −vF; vR unchanged (front → visual top)', () => {
            view.rotateViewUp();
            expect(view.getState().viewForward).toEqual({ x: 0, y: 1, z: 0 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 0, z: -1 });
            expect(view.getState().viewRight).toEqual({ x: 1, y: 0, z: 0 });
        });

        it('4× up is identity', () => {
            view.rotateViewUp();
            view.rotateViewUp();
            view.rotateViewUp();
            view.rotateViewUp();
            expect(view.getState().viewForward).toEqual({ x: 0, y: 0, z: 1 });
            expect(view.getState().viewRight).toEqual({ x: 1, y: 0, z: 0 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 1, z: 0 });
        });
    });

    describe('rotateViewDown', () => {
        it('swaps vF ← −vU and vU ← vF; vR unchanged (front → visual bottom)', () => {
            view.rotateViewDown();
            expect(view.getState().viewForward).toEqual({ x: 0, y: -1, z: 0 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 0, z: 1 });
            expect(view.getState().viewRight).toEqual({ x: 1, y: 0, z: 0 });
        });

        it('4× down is identity', () => {
            view.rotateViewDown();
            view.rotateViewDown();
            view.rotateViewDown();
            view.rotateViewDown();
            expect(view.getState().viewForward).toEqual({ x: 0, y: 0, z: 1 });
            expect(view.getState().viewRight).toEqual({ x: 1, y: 0, z: 0 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 1, z: 0 });
        });
    });

    // -------------------------------------------------------------------------
    // Inverse pairs
    // -------------------------------------------------------------------------

    describe('inverse pairs', () => {
        it('left then right is identity', () => {
            view.rotateViewLeft();
            view.rotateViewRight();
            expect(view.getState().viewForward).toEqual({ x: 0, y: 0, z: 1 });
            expect(view.getState().viewRight).toEqual({ x: 1, y: 0, z: 0 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 1, z: 0 });
        });

        it('right then left is identity', () => {
            view.rotateViewRight();
            view.rotateViewLeft();
            expect(view.getState().viewForward).toEqual({ x: 0, y: 0, z: 1 });
            expect(view.getState().viewRight).toEqual({ x: 1, y: 0, z: 0 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 1, z: 0 });
        });

        it('up then down is identity', () => {
            view.rotateViewUp();
            view.rotateViewDown();
            expect(view.getState().viewForward).toEqual({ x: 0, y: 0, z: 1 });
            expect(view.getState().viewRight).toEqual({ x: 1, y: 0, z: 0 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 1, z: 0 });
        });

        it('down then up is identity', () => {
            view.rotateViewDown();
            view.rotateViewUp();
            expect(view.getState().viewForward).toEqual({ x: 0, y: 0, z: 1 });
            expect(view.getState().viewRight).toEqual({ x: 1, y: 0, z: 0 });
            expect(view.getState().viewUp).toEqual({ x: 0, y: 1, z: 0 });
        });
    });

    // -------------------------------------------------------------------------
    // Mixed rotations — the core bug scenario
    // -------------------------------------------------------------------------

    describe('mixed rotations (regression: direction swapping bug)', () => {
        it('left then up: front goes to visual top (not bottom)', () => {
            // After left:  vF=(1,0,0), vR=(0,0,−1), vU=(0,1,0)
            // After up:    vF_new=vU=(0,1,0), vU_new=−vF=(−1,0,0), vR=(0,0,−1)
            view.rotateViewLeft();
            view.rotateViewUp();
            const s = view.getState();
            expect(s.viewForward).toEqual({ x: 0, y: 1, z: 0 });
            expect(s.viewUp).toEqual({ x: -1, y: 0, z: 0 });
            expect(s.viewRight).toEqual({ x: 0, y: 0, z: -1 });
        });

        it('up then left: axes do not get swapped', () => {
            // After up:    vF=(0,1,0), vU=(0,0,−1), vR=(1,0,0)
            // After left:  vF_new=vR=(1,0,0), vR_new=−vF=(0,−1,0), vU=(0,0,−1)
            view.rotateViewUp();
            view.rotateViewLeft();
            const s = view.getState();
            expect(s.viewForward).toEqual({ x: 1, y: 0, z: 0 });
            expect(s.viewRight).toEqual({ x: 0, y: -1, z: 0 });
            expect(s.viewUp).toEqual({ x: 0, y: 0, z: -1 });
        });

        it('2× left then 2× up then 2× right then 2× down is identity', () => {
            // Each pair of the same direction composes to a 180° rotation;
            // the round-trip sequence restores the original orientation.
            view.rotateViewLeft();
            view.rotateViewLeft();
            view.rotateViewUp();
            view.rotateViewUp();
            view.rotateViewRight();
            view.rotateViewRight();
            view.rotateViewDown();
            view.rotateViewDown();
            const s = view.getState();
            expect(s.viewForward).toEqual({ x: 0, y: 0, z: 1 });
            expect(s.viewRight).toEqual({ x: 1, y: 0, z: 0 });
            expect(s.viewUp).toEqual({ x: 0, y: 1, z: 0 });
        });
    });

    // -------------------------------------------------------------------------
    // CSS transform
    // -------------------------------------------------------------------------

    describe('CSS transform (updateRotation)', () => {
        it('default state produces identity matrix3d with base angles', () => {
            updateRotation((view as unknown as { state: any }).state);
            const t = view.getCubeElement()!.style.transform;
            expect(t).toContain(`rotateX(${BASIC_VIEW_ANGLES.BASE_X}deg)`);
            expect(t).toContain(`rotateY(${BASIC_VIEW_ANGLES.BASE_Y}deg)`);
            expect(t).toContain('matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)');
        });

        it('after rotateViewLeft the matrix3d reflects new orientation', () => {
            // After left: vR=(0,0,−1), vU=(0,1,0), vF=(1,0,0)
            // column-major matrix3d(vR.x,vU.x,vF.x,0, vR.y,vU.y,vF.y,0, vR.z,vU.z,vF.z,0, 0,0,0,1)
            //   = matrix3d(0,0,1,0, 0,1,0,0, -1,0,0,0, 0,0,0,1)
            view.rotateViewLeft();
            const t = view.getCubeElement()!.style.transform;
            expect(t).toContain('matrix3d(0,0,1,0, 0,1,0,0, -1,0,0,0, 0,0,0,1)');
        });

        it('base angles update when isTilted toggles', () => {
            // Tilt command (cosmetic only — does not affect vectors)
            const tiltCmd = view.getCommands().find(c => c.id === 'tilt-view');
            tiltCmd!.action();
            const t = view.getCubeElement()!.style.transform;
            expect(t).toContain(`rotateY(${BASIC_VIEW_ANGLES.TILTED_BASE_Y}deg)`);
            // Vectors are unchanged
            expect(view.getState().viewForward).toEqual({ x: 0, y: 0, z: 1 });
        });

        it('base angles update when isPitched toggles', () => {
            const pitchCmd = view.getCommands().find(c => c.id === 'pitch-view');
            pitchCmd!.action();
            const t = view.getCubeElement()!.style.transform;
            expect(t).toContain(`rotateX(${BASIC_VIEW_ANGLES.PITCHED_BASE_X}deg)`);
            // Vectors are unchanged
            expect(view.getState().viewForward).toEqual({ x: 0, y: 0, z: 1 });
        });

        it('base rotateX comes before base rotateY in transform string', () => {
            updateRotation((view as unknown as { state: any }).state);
            const t = view.getCubeElement()!.style.transform;
            expect(t.indexOf('rotateX')).toBeLessThan(t.indexOf('rotateY'));
        });
    });
});

// The selection is stored as a sticker id, which is model-anchored: rotating the
// view does not move that sticker, so without re-anchoring a rotation can leave
// the selection on a face behind the cube — invisible, while the app still
// reports a selection. These tests pin the invariant that the selection stays on
// the face the user is looking at.
describe('BasicView selection survives view rotation', () => {
    let view: BasicView;
    let model: CubeController;
    let container: HTMLElement;

    const faceOf = (stickerId?: string): Face | undefined => {
        if (!stickerId) return undefined;
        for (const cubie of model.getCurrentState().cubiesById.values()) {
            if (cubie.type === CubieType.VIRTUAL_CENTER) continue;
            for (const sticker of cubie.stickers.values()) {
                if (sticker.id === stickerId) return sticker.currentFace as Face;
            }
        }
        return undefined;
    };

    const frontFace = (): Face =>
        viewFrontFace((view as unknown as { state: never }).state as never) as Face;

    const visibleFaces = (): Face[] =>
        getVisibleFacesWithPositions(
            (view as unknown as { state: never }).state as never
        ).visibleFaces.map(entry => entry.face);

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-front' });
        container = document.createElement('div');
        Object.defineProperty(container, 'clientWidth', { value: 600 });
        Object.defineProperty(container, 'clientHeight', { value: 600 });
        document.body.appendChild(container);
        view.create(container, model);
    });

    afterEach(() => {
        view.destroy();
        container.remove();
    });

    it('Covers AE1: stays visible after two left rotations', () => {
        // The reported case: F-face centre selected, view showing U/F/R. Two
        // rotations put B at the front, and the selection must follow onto a
        // visible face rather than staying behind on F.
        const initial = view.getSelectedSticker();
        expect(faceOf(initial)).toBe(Face.F);

        view.rotateViewLeft();
        view.rotateViewLeft();

        const selected = view.getSelectedSticker();
        expect(selected).toBeDefined();
        expect(faceOf(selected)).toBe(frontFace());
        expect(visibleFaces()).toContain(faceOf(selected));
    });

    it.each(['rotateViewLeft', 'rotateViewRight', 'rotateViewUp', 'rotateViewDown'] as const)(
        'keeps the selection on the front face after %s',
        method => {
            // Start from a non-centre cell: the centre is the easy case and can
            // pass under a rule that fails everywhere else.
            const front = frontFace();
            const corner = [...model.getCurrentState().cubiesById.values()]
                .filter(cubie => cubie.type !== CubieType.VIRTUAL_CENTER)
                .flatMap(cubie => [...cubie.stickers.values()])
                .find(sticker => sticker.currentFace === front && sticker.facePosition === 0);
            expect(corner).toBeDefined();
            view.updateSelected(corner!.id as StickerId);

            view[method]();

            const selected = view.getSelectedSticker();
            expect(selected).toBeDefined();
            expect(faceOf(selected)).toBe(frontFace());
        }
    );

    it('keeps the selection visible across a full four-rotation cycle', () => {
        // Repeated rotations must not drift the selection off the visible set at
        // any step.
        for (let step = 0; step < 4; step++) {
            view.rotateViewLeft();
            expect(visibleFaces(), `step ${step}`).toContain(faceOf(view.getSelectedSticker()));
        }
    });

    it('Covers AE5: a restored orientation resolves a selection onto the front face', () => {
        // Save an orientation, then restore it from a *different* orientation.
        // The saved state records no selection, so the point is that restoring
        // leaves a visible selection resolved against the restored orientation —
        // not one left pointing at a hidden face.
        view.rotateViewLeft();
        const saved = view.getState();

        view.rotateViewRight();
        view.rotateViewRight();
        view.rotateViewRight();

        view.setState(saved);

        const selected = view.getSelectedSticker();
        expect(selected).toBeDefined();
        expect(visibleFaces()).toContain(faceOf(selected));
        expect(faceOf(selected)).toBe(frontFace());
    });

    it('resolves a selection that the restored orientation would hide', () => {
        // Drive the real failure mode directly: put the selection on a *corner*
        // of a face that is hidden in the current orientation, then restore that
        // same orientation. Without the re-anchor the selection would stay on the
        // hidden face. A corner is used rather than the centre because the centre
        // projects to cell (0,0) on every face, which would pass trivially.
        const hiddenFace = Face.B;
        const hiddenSticker = [...model.getCurrentState().cubiesById.values()]
            .filter(cubie => cubie.type !== CubieType.VIRTUAL_CENTER)
            .flatMap(cubie => [...cubie.stickers.values()])
            .find(sticker => sticker.currentFace === hiddenFace && sticker.facePosition === 0);
        expect(hiddenSticker, 'B-face corner exists').toBeDefined();

        // Front is F here, so anything on B is behind the cube.
        expect(visibleFaces()).not.toContain(hiddenFace);

        view.updateSelected(hiddenSticker!.id as StickerId);
        expect(faceOf(view.getSelectedSticker())).toBe(hiddenFace);

        view.setState(view.getState());

        const selected = view.getSelectedSticker();
        expect(selected).toBeDefined();
        expect(faceOf(selected)).toBe(frontFace());
        expect(visibleFaces()).toContain(faceOf(selected));
    });

    it('retains the previous selection when the cell cannot be resolved', () => {
        // The documented failure mode: a resolution miss must degrade to the old
        // selection rather than clearing it, so a geometry gap does not turn into
        // a selected-nothing state.
        const before = view.getSelectedSticker();
        expect(before).toBeDefined();

        const reanchor = view as unknown as {
            reanchorSelection(cell: unknown): void;
        };
        // A cell no sticker can occupy.
        reanchor.reanchorSelection({ visualX: 99, visualY: 99 });

        expect(view.getSelectedSticker()).toBe(before);
    });

    it('marks exactly one element as selected in the DOM after rotation (U7)', () => {
        // The state accessor alone cannot catch this class of defect: the
        // selection is re-derived when the cube DOM is rebuilt, so an assertion
        // on `getSelectedSticker()` can pass while nothing on screen is marked.
        // Reading the DOM is what makes a repeat of that failure fail.
        view.rotateViewLeft();

        // Force the rebuild explicitly. Without it this test passes even with the
        // re-derivation removed, because rotation alone does not rebuild the
        // cubies — so it would be incidentally green rather than load-bearing.
        view.resize();

        // CSS-module class names are hashed, so the resolved class is required.
        const selectedElements = container.querySelectorAll(`.${styles.selected}`);
        expect(selectedElements).toHaveLength(1);

        const reported = view.getSelectedSticker();
        expect(selectedElements[0].getAttribute('data-sticker-id')).toBe(reported);
    });

    it('leaves the selection untouched when there is none', () => {
        view.updateSelected(undefined);
        expect(view.getSelectedSticker()).toBeUndefined();

        view.rotateViewLeft();

        expect(view.getSelectedSticker()).toBeUndefined();
    });

    it.each([2, 3, 4, 5, 6, 7])('keeps the selection visible at size %i', cubeSize => {
        // The invariant is asserted at every supported size rather than one
        // representative size, because the cell geometry differs per size.
        const sizeModel = new CubeController(cubeSize);
        const sizeView = new BasicView({ viewType: 'basic-front' });
        const sizeContainer = document.createElement('div');
        Object.defineProperty(sizeContainer, 'clientWidth', { value: 600 });
        Object.defineProperty(sizeContainer, 'clientHeight', { value: 600 });
        document.body.appendChild(sizeContainer);
        sizeView.create(sizeContainer, sizeModel);

        sizeView.rotateViewLeft();
        sizeView.rotateViewLeft();

        const selected = sizeView.getSelectedSticker();
        expect(selected, `size ${cubeSize}`).toBeDefined();

        let selectedFace: Face | undefined;
        for (const cubie of sizeModel.getCurrentState().cubiesById.values()) {
            if (cubie.type === CubieType.VIRTUAL_CENTER) continue;
            for (const sticker of cubie.stickers.values()) {
                if (sticker.id === selected) selectedFace = sticker.currentFace as Face;
            }
        }

        const visible = getVisibleFacesWithPositions(
            (sizeView as unknown as { state: never }).state as never
        ).visibleFaces.map(entry => entry.face);

        expect(visible, `size ${cubeSize}`).toContain(selectedFace);

        sizeView.destroy();
        sizeContainer.remove();
    });

    it('is load-bearing: the selected sticker changes when the view rotates', () => {
        // Guards against a re-anchor that silently does nothing. If the rule
        // stopped resolving, the selected id would stay pinned to the physical
        // sticker — which is exactly the pre-fix behaviour.
        const front = frontFace();
        const corner = [...model.getCurrentState().cubiesById.values()]
            .filter(cubie => cubie.type !== CubieType.VIRTUAL_CENTER)
            .flatMap(cubie => [...cubie.stickers.values()])
            .find(sticker => sticker.currentFace === front && sticker.facePosition === 0);
        view.updateSelected(corner!.id as StickerId);
        const before = view.getSelectedSticker();

        view.rotateViewLeft();

        // The physical sticker would still resolve; the point is that the
        // selection moved to a *different* sticker on the new front face.
        expect(view.getSelectedSticker()).toBeDefined();
        expect(view.getSelectedSticker()).not.toBe(before);
    });

    // The tilt and pitch affordances are cosmetic: they change the CSS base
    // angles and which label slot each face occupies, but they do not touch
    // `viewForward`/`viewRight`/`viewUp`, which is all the re-anchoring rule
    // reads. That was previously an untested assumption — the rule was only
    // verified in the default orientation, so a future change that made these
    // states affect the vectors could have broken re-anchoring unnoticed.
    describe.each([
        { isTilted: false, isPitched: false, label: 'default' },
        { isTilted: true, isPitched: false, label: 'tilted' },
        { isTilted: false, isPitched: true, label: 'pitched' },
        { isTilted: true, isPitched: true, label: 'tilted+pitched' },
    ])('cosmetic state: $label', ({ isTilted, isPitched }) => {
        /** Sets the cosmetic flags the way the tilt/pitch commands do. */
        function applyCosmetic(v: BasicView): void {
            const state = (v as unknown as { state: { isTilted: boolean; isPitched: boolean } })
                .state;
            state.isTilted = isTilted;
            state.isPitched = isPitched;
        }

        it('keeps the selection on the front face across every rotation', () => {
            applyCosmetic(view);

            for (const rotation of [
                'rotateViewLeft',
                'rotateViewRight',
                'rotateViewUp',
                'rotateViewDown',
            ] as const) {
                const selectedBefore = view.getSelectedSticker();
                expect(selectedBefore, `${rotation}: a selection exists`).toBeDefined();

                view[rotation]();

                const selected = view.getSelectedSticker();
                expect(selected, `${rotation}: selection survives`).toBeDefined();
                expect(faceOf(selected), `${rotation}: sits on the front face`).toBe(frontFace());
                expect(visibleFaces(), `${rotation}: is visible`).toContain(faceOf(selected));
            }
        });

        it.each(SUPPORTED_SIZES)('keeps the selection on the front face at size %i', cubeSize => {
            const sizeModel = new CubeController(cubeSize);
            const sizeView = new BasicView({ viewType: 'basic-front' });
            const sizeContainer = document.createElement('div');
            Object.defineProperty(sizeContainer, 'clientWidth', { value: 600 });
            Object.defineProperty(sizeContainer, 'clientHeight', { value: 600 });
            document.body.appendChild(sizeContainer);
            sizeView.create(sizeContainer, sizeModel);
            applyCosmetic(sizeView);

            const sizeState = (sizeView as unknown as { state: never }).state as never;

            try {
                sizeView.rotateViewLeft();
                sizeView.rotateViewLeft();

                const selected = sizeView.getSelectedSticker();
                expect(selected, `size ${cubeSize}`).toBeDefined();

                let selectedFace: Face | undefined;
                for (const cubie of sizeModel.getCurrentState().cubiesById.values()) {
                    if (cubie.type === CubieType.VIRTUAL_CENTER) continue;
                    for (const sticker of cubie.stickers.values()) {
                        if (sticker.id === selected) selectedFace = sticker.currentFace as Face;
                    }
                }

                expect(selectedFace, `size ${cubeSize}: on the front face`).toBe(
                    viewFrontFace(sizeState)
                );
                expect(
                    getVisibleFacesWithPositions(sizeState).visibleFaces.map(e => e.face),
                    `size ${cubeSize}: visible`
                ).toContain(selectedFace);
            } finally {
                sizeView.destroy();
                sizeContainer.remove();
            }
        });
    });
});
