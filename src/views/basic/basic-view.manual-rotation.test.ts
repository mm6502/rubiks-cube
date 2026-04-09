// Tests for manual cube rotation (Ctrl+Arrow) view direction tracking.
// The orientation is stored as three orthogonal unit vectors (viewForward,
// viewRight, viewUp); each Ctrl+Arrow swaps them without any Euler angles.
import * as rendering from '@/views/basic/rendering';
import { CubeController } from '@/cube-controller';
import { BasicView } from '@/views/basic/basic-view';
import { BASIC_VIEW_ANGLES } from '@/views/basic/constants';

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
            rendering.updateRotation((view as unknown as { state: any }).state);
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

        it('hover appends scale(1.05)', () => {
            (view as unknown as { state: { isHovered: boolean } }).state.isHovered = true;
            rendering.updateRotation((view as unknown as { state: any }).state);
            expect(view.getCubeElement()!.style.transform).toContain('scale(1.05)');
        });

        it('base rotateX comes before base rotateY in transform string', () => {
            rendering.updateRotation((view as unknown as { state: any }).state);
            const t = view.getCubeElement()!.style.transform;
            expect(t.indexOf('rotateX')).toBeLessThan(t.indexOf('rotateY'));
        });
    });
});
