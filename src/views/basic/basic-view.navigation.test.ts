// An arrow key that only rotates the view to reveal the selected face must not
// move the selection.
//
// `navigate` runs in two phases:
//
//   Phase 1 — the selection sits on a face that is not front. The view rotates so
//   that face comes forward and the key is fully consumed. The selection is meant
//   to be untouched: the user asked to reveal what is selected, not to move it.
//
//   Phase 2 — the selection is already on the front face, so the key moves it,
//   rotating only when the next sticker lives on a neighbouring face.
//
// The re-anchor wrapper (`preserveSelectionAcrossOrientationChange`) exists so a
// *user-initiated* view rotation keeps the selection where the user was looking.
// It preserves the screen *cell*, not the sticker. Routing Phase 1's rotation
// through it applied that rule to a rotation the user never asked for as a view
// rotation, so the selection jumped off the face centre onto whichever sticker
// occupied that cell on the newly-front face — an edge cubie, at column 0.
//
// Reported by the user, and reachable at every supported size above 2×2.
import { CubeController } from '@/cube-controller';
import { Face, SUPPORTED_SIZES, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { centerFacePosition } from '@/cube/utils/sticker-position';
import { BasicView } from '@/views/basic/basic-view';
import { viewFrontFace } from '@/views/basic/navigation';

interface Fixture {
    view: BasicView;
    model: CubeController;
    dispose: () => void;
}

function createFixture(cubeSize: number): Fixture {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 600 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    document.body.appendChild(container);

    const model = new CubeController(cubeSize);
    const view = new BasicView({ viewType: 'basic-front' });
    view.create(container, model);
    view.resize();

    return {
        view,
        model,
        dispose: () => {
            view.destroy();
            container.remove();
        },
    };
}

/** The sticker at the centre of the given face. */
function faceCentre(fixture: Fixture, face: Face): StickerId {
    const size = fixture.model.getCubeSize();
    return CubeStateUtils.getStickerAt(
        fixture.model.getCurrentState(),
        face,
        centerFacePosition(size)
    )!.id;
}

/** The face the view currently has toward the viewer. */
function front(fixture: Fixture): string {
    const state = (fixture.view as unknown as { state: unknown }).state;
    return `${viewFrontFace(state as never)}`;
}

/** Presses a plain (unmodified) arrow key — the sticker-navigation path. */
function pressArrow(view: BasicView, key: string): void {
    view.handleKeyUp(new KeyboardEvent('keyup', { key }) as KeyboardEvent);
}

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

describe('an arrow that only reveals the selected face keeps the selection', () => {
    it.each([...SUPPORTED_SIZES])(
        'leaves a non-front face centre selected at size %i, for every arrow',
        cubeSize => {
            // The reported defect, per direction and per size. Each direction gets
            // a fresh view because the reveal rotates, and a second press on the
            // same view would be a Phase 2 move rather than a reveal.
            for (const face of [Face.R, Face.U, Face.D, Face.L, Face.B]) {
                for (const key of ARROWS) {
                    const fixture = createFixture(cubeSize);
                    try {
                        const target = faceCentre(fixture, face);
                        fixture.view.updateSelected(target);
                        expect(front(fixture), 'the fixture starts on the front face').toBe('F');

                        pressArrow(fixture.view, key);

                        expect(
                            fixture.view.getSelectedSticker(),
                            `n=${cubeSize} ${key} on the ${face} centre must not move the selection`
                        ).toBe(target);
                        expect(front(fixture), `n=${cubeSize} ${key} should reveal ${face}`).toBe(
                            face
                        );
                    } finally {
                        // Dispose in a finally so a failing assertion does not
                        // leak a view (and its listeners) into the next case.
                        fixture.dispose();
                    }
                }
            }
        },
        // 20 views per size is inherently slower than a single-view test; the
        // default 5s budget is tuned for one, not for a full direction sweep.
        30000
    );

    it('still rotates the face into view (the fix must not disable the reveal)', () => {
        // Guards against a "fix" that passes the assertion above by doing nothing.
        const fixture = createFixture(5);
        fixture.view.updateSelected(faceCentre(fixture, Face.R));
        expect(front(fixture)).toBe('F');

        pressArrow(fixture.view, 'ArrowLeft');

        expect(front(fixture), 'the selected face is brought forward').toBe('R');

        fixture.dispose();
    });

    it('moves the selection on the next press, once the face is front', () => {
        // Phase 2 must keep working: the first press reveals, the second moves.
        const fixture = createFixture(5);
        const target = faceCentre(fixture, Face.R);
        fixture.view.updateSelected(target);

        pressArrow(fixture.view, 'ArrowLeft');
        expect(fixture.view.getSelectedSticker(), 'reveal keeps the centre').toBe(target);

        pressArrow(fixture.view, 'ArrowLeft');

        expect(
            fixture.view.getSelectedSticker(),
            'a move from the front face selects a different sticker'
        ).not.toBe(target);

        fixture.dispose();
    });

    it('keeps the selection visible after each arrow of a full walk', () => {
        // The invariant the reveal exists to protect: whatever the selection is at
        // each step, it is on the face the user is looking at.
        const fixture = createFixture(5);
        fixture.view.updateSelected(faceCentre(fixture, Face.U));

        for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowDown']) {
            pressArrow(fixture.view, key);
            const selected = fixture.view.getSelectedSticker();
            expect(selected, 'a selection exists after every step').toBeDefined();

            const sticker = CubeStateUtils.getStickerById(
                fixture.model.getCurrentState(),
                selected!
            )!;
            expect(
                `${sticker.currentFace}`,
                `after ${key} the selection is on the face in view`
            ).toBe(front(fixture));
        }

        fixture.dispose();
    });
});

describe('a user-initiated view rotation still re-anchors the selection', () => {
    it.each([...SUPPORTED_SIZES])(
        'keeps the selection on the face in view at size %i',
        cubeSize => {
            // The contrast that makes the fix precise: the wrapper is not removed,
            // only bypassed for the navigation reveal. A user rotation still
            // preserves the screen cell, so the selection stays on the front face.
            const fixture = createFixture(cubeSize);
            expect(fixture.view.getSelectedSticker(), 'create selects').toBeDefined();

            fixture.view.rotateViewLeft();

            const selected = fixture.view.getSelectedSticker();
            expect(selected, `n=${cubeSize} a selection survives the rotation`).toBeDefined();

            const sticker = CubeStateUtils.getStickerById(
                fixture.model.getCurrentState(),
                selected!
            )!;
            expect(`${sticker.currentFace}`, `n=${cubeSize}`).toBe(front(fixture));

            fixture.dispose();
        }
    );
});
