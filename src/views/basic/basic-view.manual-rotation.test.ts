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

// jsdom has no Web Animations API, so it is stubbed. The keyframe arguments are
// captured so the rotation can be asserted as what it now is — an angle ramp —
// rather than through the composed transform string, which a running animation
// holds rather than the inline style.
const animateKeyframes: Array<Array<{ transform: string }>> = [];
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');

/**
 * How far through the current ramp the stub reports the cube is, as 0..1.
 *
 * Defaults to 0, which models the case rapid input actually produces: several
 * steps arriving in one tick, before the ramp has advanced. One rotation reads
 * this to know where to continue from when it supersedes another, so a test that
 * wants to model a half-finished turn sets it explicitly.
 */
let rampProgress = 0;

/**
 * Waits for the rotation's settle path to run.
 *
 * The stubbed animation resolves immediately, so the bake in `applyRotation` has
 * only to get through its own microtask chain — there is no timer involved, which
 * is deliberate: a rotation now closes when it actually settles rather than after
 * a fixed delay.
 */
async function settleRotation(_view: BasicView): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

function installAnimationStub(): void {
    animateKeyframes.length = 0;
    rampProgress = 0;
    Object.defineProperty(HTMLElement.prototype, 'animate', {
        configurable: true,
        writable: true,
        value: (keyframes: Array<{ transform: string }>) => {
            animateKeyframes.push(keyframes);
            return {
                cancel: () => {},
                finished: Promise.resolve(),
                effect: { getComputedTiming: () => ({ progress: rampProgress }) },
            };
        },
    });
}

describe('BasicView Manual Rotation (Ctrl+Arrow)', () => {
    let view: BasicView;
    let model: CubeController;

    beforeEach(() => {
        installAnimationStub();
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-front' });
        const container = document.createElement('div');
        view.create(container, model);
    });

    afterEach(() => {
        if (originalAnimate)
            Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
        else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
        animateKeyframes.length = 0;
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
    //
    // A rotation is animated by ramping an angle through the Web Animations API,
    // so the element's inline `style.transform` only reflects the settled
    // orientation once the ramp has been baked (which is what `updateRotation`
    // does with `skipAnimation`). These assertions therefore check the *settled*
    // state, and check the animation itself separately — asserting the inline
    // string mid-flight would be asserting the wrong thing.
    // -------------------------------------------------------------------------

    describe('CSS transform (updateRotation)', () => {
        it('default state produces identity matrix3d with base angles', () => {
            updateRotation((view as unknown as { state: any }).state, true);
            const t = view.getCubeElement()!.style.transform;
            expect(t).toContain(`rotateX(${BASIC_VIEW_ANGLES.BASE_X}deg)`);
            expect(t).toContain(`rotateY(${BASIC_VIEW_ANGLES.BASE_Y}deg)`);
            expect(t).toContain('matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)');
            // No rotation slot at rest — the basis alone expresses the orientation.
            expect(t).not.toContain('rotate3d');
        });

        it('after rotateViewLeft the settled transform reflects the new orientation', async () => {
            // After left: vR=(0,0,−1), vU=(0,1,0), vF=(1,0,0)
            // column-major matrix3d(vR.x,vU.x,vF.x,0, vR.y,vU.y,vF.y,0, vR.z,vU.z,vF.z,0, 0,0,0,1)
            //   = matrix3d(0,0,1,0, 0,1,0,0, -1,0,0,0, 0,0,0,1)
            view.rotateViewLeft();
            await settleRotation(view);
            const t = view.getCubeElement()!.style.transform;
            expect(t).toContain('matrix3d(0,0,1,0, 0,1,0,0, -1,0,0,0, 0,0,0,1)');
            expect(t).not.toContain('rotate3d');
        });

        it('animates the rotation as an angle ramp about a state-derived axis', () => {
            // The defect being fixed was a CSS transition interpolating a matrix.
            // The replacement ramps a single angle, so this pins the mechanism:
            // exactly one `rotate3d` keyframe pair, and no `transition` on the cube.
            view.rotateViewLeft();
            const calls = animateKeyframes;
            expect(calls.length, 'one animation was started').toBe(1);

            const keyframes = calls[0] as Array<{ transform: string }>;
            expect(keyframes).toHaveLength(2);
            const slot = (frame: string): string =>
                frame.split(' ').find(part => part.startsWith('rotate3d(')) ?? '';
            // From the default front orientation a left turn is +90° about world Y.
            expect(slot(keyframes[0].transform)).toBe('rotate3d(0,1,0,0deg)');
            expect(slot(keyframes[1].transform)).toBe('rotate3d(0,1,0,90deg)');
            // The basis sits *inside* the rotation, so the ramp's axis is a world
            // axis rather than the tilted one.
            expect(keyframes[0].transform).toContain(
                'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)'
            );
            expect(view.getCubeElement()!.style.transition).toBe('');
        });

        it('uses the axis that belongs to the current orientation, not a fixed one', async () => {
            // R2: the correct axis depends on where the cube is, which is why it is
            // derived from state per rotation. A fixed-axis implementation passes a
            // naive single-rotation test, so this compares rotations made from
            // different orientations.
            //
            // Each rotation is settled before the next begins: they are separate
            // gestures, so they must each animate rather than tripping the
            // skip-when-overloaded rule that rapid input relies on.
            const axisOf = (keyframes: Array<{ transform: string }>): string =>
                keyframes[1].transform.split(' ').find(p => p.startsWith('rotate3d(')) ?? '';

            view.rotateViewLeft();
            await settleRotation(view);
            const firstAxis = axisOf(animateKeyframes[0]);

            view.rotateViewLeft();
            await settleRotation(view);
            const secondAxis = axisOf(animateKeyframes[1]);

            view.rotateViewUp();
            await settleRotation(view);
            const thirdAxis = axisOf(animateKeyframes[2]);

            expect(firstAxis, 'a left turn from the front orientation is about Y').toContain(
                'rotate3d(0,1,0,'
            );
            // From the orientation one left turn reaches, another left turn is still
            // about Y — so the same gesture keeps one axis, which is what lets a
            // multi-step gesture merge into a single sweep.
            expect(secondAxis, 'and it stays on Y for a repeated gesture').toContain(
                'rotate3d(0,1,0,'
            );
            // A different gesture needs a different world axis. This is the case a
            // fixed-axis implementation cannot satisfy.
            expect(thirdAxis, 'an up turn uses a different world axis').toBeDefined();
            expect(thirdAxis, 'and it is not the Y axis').not.toContain('rotate3d(0,1,0,');
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
            updateRotation((view as unknown as { state: any }).state, true);
            const t = view.getCubeElement()!.style.transform;
            expect(t.indexOf('rotateX')).toBeLessThan(t.indexOf('rotateY'));
        });

        it('a two-step gesture animates as one ramp over the full 180°', async () => {
            // The far-drag path applies two steps before calling back (the touch
            // handler loops), and `rotateViewToFace` applies two for the
            // anti-parallel case. Those must merge into a single sweep, not restart
            // as two 90° ramps — otherwise the drag stutters and a linked peer,
            // which receives two events for the one rendered gesture, drifts out of
            // step with its source.
            view.rotateViewLeft();
            // No settle between them: both steps belong to one gesture.
            view.rotateViewLeft();

            const latest = animateKeyframes[animateKeyframes.length - 1];
            const slot = (frame: string): string =>
                frame.split(' ').find(p => p.startsWith('rotate3d(')) ?? '';
            // 0 → 180 about Y, as one ramp.
            expect(slot(latest[0].transform)).toBe('rotate3d(0,1,0,0deg)');
            expect(slot(latest[1].transform)).toBe('rotate3d(0,1,0,180deg)');
            // The base is unchanged, so it really is one continuing rotation rather
            // than a re-based restart.
            expect(latest[1].transform).toContain('matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)');
        });

        it('a rotation arriving mid-flight extends the ramp instead of restarting it', async () => {
            // The core of the reported defect. Under the old matrix scheme, an
            // interrupting rotation adopted the half-blended matrix as its start, so
            // the cube unwound. The ramp must instead continue from the angle the
            // cube is actually at, keeping one axis and one base.
            view.rotateViewLeft();
            const first = animateKeyframes[0];
            // Half way through the turn when the next one arrives.
            rampProgress = 0.5;
            view.rotateViewLeft();

            const latest = animateKeyframes[animateKeyframes.length - 1];
            const slot = (frame: string): string =>
                frame.split(' ').find(p => p.startsWith('rotate3d(')) ?? '';

            // Same base as the first ramp — nothing was re-based — and the same axis.
            expect(slot(latest[0].transform)).toBe('rotate3d(0,1,0,45deg)');
            expect(slot(latest[1].transform)).toBe('rotate3d(0,1,0,180deg)');
            expect(latest[0].transform.split('matrix3d')[1]).toBe(
                first[0].transform.split('matrix3d')[1]
            );
            // The start angle is strictly inside the ramp, so the sweep is
            // continuous: 45 → 180, not 0 → 180 (which would jump back).
            expect(latest[0].transform).not.toBe(latest[1].transform);
        });

        it('the sweep never reverses or folds to a shorter arc', async () => {
            // A 180° sweep and a −180° sweep reach the same orientation. Folding to
            // the shorter arc, or emitting the destination with a negated angle,
            // travels the opposite way — the visible unwind this work removes.
            view.rotateViewLeft();
            rampProgress = 0.5;
            view.rotateViewLeft();

            const latest = animateKeyframes[animateKeyframes.length - 1];
            const angleOf = (frame: string): number => {
                const match = /rotate3d\([^)]*?,(-?\d+(?:\.\d+)?)deg\)/.exec(frame);
                expect(match, `an angle is present in ${frame}`).not.toBeNull();
                return Number(match![1]);
            };
            const from = angleOf(latest[0].transform);
            const to = angleOf(latest[1].transform);

            // Monotonic increase: the destination is ahead of the start, and the
            // end is the full intended delta from the base.
            expect(from).toBeGreaterThan(0);
            expect(to).toBeGreaterThan(from);
            expect(to).toBeCloseTo(180, 6);
            // Never the folded form.
            expect(latest[1].transform).not.toContain('-180deg');
            expect(latest[1].transform).not.toContain('-90deg');
        });

        it('rapid input past the threshold applies the orientation without animating', async () => {
            // R3, the bounded-queue rule. Animation is dropped rather than queued so
            // a burst cannot grow an unbounded backlog — but the orientation change
            // itself is always applied, so the cube still ends where the gestures
            // asked.
            view.rotateViewLeft();
            view.rotateViewLeft();
            view.rotateViewLeft();
            const countAfterThreshold = animateKeyframes.length;
            view.rotateViewLeft();

            expect(
                animateKeyframes.length,
                'a rotation past the threshold starts no further animation'
            ).toBe(countAfterThreshold);

            // Four left turns return the front face to F — the orientation landed
            // even though the last step was not animated.
            expect(viewFrontFace(view.getState() as never)).toBe(Face.F);
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

    // The tilt and pitch affordances were an untested variable for this rule.
    //
    // They change the CSS base angles *and* the visible-face set: at the same
    // orientation the default state shows U@top / F@bottom-left / R@bottom-right
    // while pitched shows F@top-left / D@middle-bottom-pitched / R@top-right,
    // because pitching turns the up face out of view and the down face into
    // view. So the visibility assertion below is genuinely per-state rather than
    // a restatement of the front-face one.
    //
    // Sequenced rotations are used, not single ones: a single rotation from the
    // default reaches only 5 of the 24 cube orientations, so a one-step sweep
    // would leave most of the space unverified.
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

        /** The face the given sticker currently occupies, per the model. */
        function faceOfSticker(stickerId?: string): Face | undefined {
            if (!stickerId) return undefined;
            for (const cubie of model.getCurrentState().cubiesById.values()) {
                if (cubie.type === CubieType.VIRTUAL_CENTER) continue;
                for (const sticker of cubie.stickers.values()) {
                    if (sticker.id === stickerId) return sticker.currentFace as Face;
                }
            }
            return undefined;
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

        it('holds across the full orientation group', () => {
            // Measured by BFS over the four rotations: the group has 24 members,
            // and one of them is only reachable at depth 4. Sweeping sequences up
            // to length 3 therefore covers 23 of 24 — which is why this goes to
            // depth 4 rather than stopping at the obvious 3.
            applyCosmetic(view);

            const rotations = [
                'rotateViewLeft',
                'rotateViewRight',
                'rotateViewUp',
                'rotateViewDown',
            ] as const;

            const sequences: Array<readonly string[]> = [];
            // All sequences up to length 4. BFS over the four rotations shows the
            // group has 24 members and that one needs depth 4, so enumerating to
            // depth 3 covers only 23 — this enumerates the depth-4 layer too.
            const build = (prefix: readonly string[]): void => {
                sequences.push(prefix);
                if (prefix.length === 4) return;
                for (const rotation of rotations) build([...prefix, rotation]);
            };
            build([]);

            const orientations = new Set<string>();

            for (const sequence of sequences) {
                // Reset each time so the sequence starts from the known default.
                view.resetView();
                applyCosmetic(view);

                for (const rotation of sequence) {
                    (view as unknown as Record<string, () => void>)[rotation]();
                }

                const label = sequence.join('>') || 'none';
                const state = (view as unknown as { state: never }).state as never;
                const front = viewFrontFace(state);
                const visible = getVisibleFacesWithPositions(state).visibleFaces.map(e => e.face);

                const vectors = (view as unknown as { state: { viewRight: object } }).state;
                orientations.add(
                    `${JSON.stringify(vectors.viewRight)}|${JSON.stringify(
                        (vectors as unknown as { viewUp: object }).viewUp
                    )}`
                );

                const selected = view.getSelectedSticker();
                expect(selected, `${label}: selection survives`).toBeDefined();
                expect(faceOfSticker(selected), `${label}: sits on the front face`).toBe(front);
                expect(visible, `${label}: front face is visible`).toContain(front);
                expect(visible, `${label}: selection is visible`).toContain(
                    faceOfSticker(selected)
                );
            }

            // 24 is the full group. If this collapsed to a handful of
            // orientations the sweep would not be covering the space it claims to.
            expect(orientations.size, 'distinct orientations reached').toBe(24);
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
