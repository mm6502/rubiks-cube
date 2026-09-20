// Coverage for branches that were only exercised through a *copy* of production
// (U11).
//
// `visual-cell.test.ts` builds its candidate list with a `physicalStickers()`
// helper that is a verbatim copy of production's `stickerCandidates()` — the same
// virtual-centre exclusion, the same explanatory comment. Every assertion in that
// file feeds the copy, so the production filter had no coverage at all: had
// production dropped its `VIRTUAL_CENTER` exclusion, that suite would have stayed
// green while real resolution became ambiguous.
//
// These tests instead drive resolution through the view's own path. A rotation is
// what calls `reanchorSelection` → `stickerCandidates()` in production, so
// asserting on the sticker the view reports exercises the real filter.
import { CubeController } from '@/cube-controller';
import { SUPPORTED_SIZES } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { BasicView } from '@/views/basic/basic-view';
import styles from '@/views/basic/basic-view.module.css';

interface Fixture {
    view: BasicView;
    model: CubeController;
    container: HTMLElement;
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
        container,
        dispose: () => {
            view.destroy();
            container.remove();
        },
    };
}

/** The face the sticker the view reports as selected actually sits on. */
function selectedFace(fixture: Fixture): string {
    const selected = fixture.view.getSelectedSticker();
    expect(selected, 'the view reports a selection').toBeDefined();
    const sticker = CubeStateUtils.getStickerById(fixture.model.getCurrentState(), selected!);
    expect(sticker, 'the reported sticker exists in the model').toBeDefined();
    return `${sticker!.currentFace}`;
}

/** The number of DOM elements carrying the selected marker. */
function markedCount(container: HTMLElement): number {
    return container.querySelectorAll(`.${styles.selected}`).length;
}

describe('the production candidate filter is exercised through the view', () => {
    it.each([...SUPPORTED_SIZES])(
        're-anchors onto a sticker that exists and is marked, at size %i',
        cubeSize => {
            // A rotation is the production entry point into `stickerCandidates()`.
            // If that filter admitted a virtual-centre sticker, resolution could
            // pick a sticker that is not part of the visible cube surface — the
            // asserted invariants are that the reported sticker resolves in the
            // model and that exactly one element is marked for it.
            const fixture = createFixture(cubeSize);

            fixture.view.rotateViewLeft();

            const face = selectedFace(fixture);
            expect(face, `size ${cubeSize} resolves to a real face`).toMatch(/^(F|U|R|B|L|D)$/);
            expect(markedCount(fixture.container), `size ${cubeSize}`).toBe(1);

            fixture.dispose();
        }
    );

    it.each([...SUPPORTED_SIZES])(
        'keeps resolving to a real sticker across every whole-cube rotation, at size %i',
        cubeSize => {
            // Four rotations return the orientation to its start, so this walks the
            // full orientation group. Every step must resolve through the
            // production filter without landing on an unresolvable or virtual cell.
            const fixture = createFixture(cubeSize);

            for (const rotate of [
                () => fixture.view.rotateViewLeft(),
                () => fixture.view.rotateViewUp(),
                () => fixture.view.rotateViewRight(),
                () => fixture.view.rotateViewDown(),
            ]) {
                rotate();
                expect(selectedFace(fixture)).toMatch(/^(F|U|R|B|L|D)$/);
                expect(markedCount(fixture.container)).toBe(1);
            }

            fixture.dispose();
        }
    );

    it('resolves a 3×3 selection onto the newly-front face after a left rotation', () => {
        // Pins an observable outcome rather than a property, so a filter that
        // admitted the wrong candidates fails here rather than merely failing an
        // assertion about shape.
        const fixture = createFixture(3);
        expect(selectedFace(fixture), 'create selects on the front face').toBe('F');

        fixture.view.rotateViewLeft();

        // `rotateViewLeft` sets `viewForward = viewRight`, so the right face becomes
        // the front. The selection re-anchors onto whichever sticker now occupies
        // the same visual cell — the centre of the newly-front face, i.e. R.
        // (An earlier draft of this test expected 'B', which was simply wrong: the
        // re-anchor resolves against the *new* front face, not the old one's
        // opposite.)
        expect(selectedFace(fixture)).toBe('R');

        fixture.dispose();
    });

    it('does not resolve onto a virtual-centre sticker at a size that has them', () => {
        // Size 3 and above carry virtual-centre cubies (one per face, at the face
        // centre). Their stickers are excluded from the candidate list precisely
        // because they would duplicate a real sticker's cell; this asserts the
        // production filter still excludes them after a re-anchor.
        const fixture = createFixture(5);
        const model = fixture.model.getCurrentState();

        const virtualCentreStickerIds = new Set<string>();
        for (const cubie of model.cubiesById.values()) {
            if (`${cubie.type}` !== 'virtual_center') continue;
            for (const stickerId of cubie.stickers.keys()) {
                virtualCentreStickerIds.add(`${stickerId}`);
            }
        }
        expect(
            virtualCentreStickerIds.size,
            'this size has virtual-centre stickers'
        ).toBeGreaterThan(0);

        for (const rotate of [
            () => fixture.view.rotateViewLeft(),
            () => fixture.view.rotateViewUp(),
        ]) {
            rotate();
            expect(
                virtualCentreStickerIds.has(`${fixture.view.getSelectedSticker()}`),
                're-anchor must not select a virtual-centre sticker'
            ).toBe(false);
        }

        fixture.dispose();
    });
});
