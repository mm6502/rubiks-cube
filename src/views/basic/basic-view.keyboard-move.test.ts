// A `Ctrl+Arrow` slice move must turn in the **same sense** as the view rotation the
// matching `Alt+Arrow` performs. Reported by the user, at 3×3:
//
//   "Zo zakladnej pozicie Alt+Right, Alt+Down a Ctrl+Right teraz spravi S namiesto
//    ocakavaneho M." — from the base position, Alt+Right then Alt+Down then Ctrl+Right
//    produced `S` where `M` was expected.
//   "Ten tah ma byt v rovnakom smere otacania. Ak Alt+Right otoci +90, tak Ctrl+Right
//    ma tiez otocit +90." — the turn must go the same way round as the view rotation.
//
// So the contract is about the *rotation*, not about where the sticker lands on screen.
// That distinction matters, and an earlier revision of this file got it wrong: it asserted
// the selected sticker travelled along the screen direction the key points. The two rules
// disagree even at the default orientation — the shipped `Ctrl+Right` → `E` carries the
// front-centre sticker screen-LEFT while the view rotation carries it screen-right — so
// that test could only be satisfied by an implementation that broke the long-standing
// base behaviour. It was rewritten, not re-tuned.
//
// The oracle is a formula re-derived in this file rather than imported, so the
// implementation cannot vouch for itself:
//
//   With A = diag(1, −1, −1) (CSS negates model Y and Z) and M the orientation basis
//   (rows = viewRight/viewUp/viewForward), a view turn replaces M with M', and the layer
//   turn that turns the cube the same way is
//
//       Q = A · Mᵀ · M' · A
//
// A self-consistent formula can still be the wrong formula, so it is anchored to values
// fixed outside this work: the four shipped base-orientation notations, the layer
// behaviour the existing top-row test pins down, and the user's reported `M`.
import { describe, expect, it } from 'vitest';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { getCubeInvariants } from '@/cube/core/cube-invariants';
import { Axis, Face, SUPPORTED_SIZES, type Vector3 } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { facePositionTo3D } from '@/cube/utils/sticker-position';
import { EventName, type MoveRequestedEvent } from '@/types';
import { BasicView } from '@/views/basic/basic-view';

type M3 = number[][];

interface Fixture {
    view: BasicView;
    model: CubeController;
    /** Every move notation the view asked for since the last `clearMoves()`. */
    moves: string[];
    clearMoves: () => void;
    dispose: () => void;
}

/**
 * The one fixture currently alive.
 *
 * Only one at a time, and disposed before the next is created. `CubeController`
 * subscribes to the GLOBAL `MOVE_REQUESTED` bus, so a controller left behind by an
 * earlier test would also apply — and throw on — a notation its own size does not define
 * (`3M'` on a 4×4, say). Serialising the fixtures is what keeps a press reaching exactly
 * the one controller the app would have with a single view open.
 */
let liveFixture: Fixture | null = null;

function disposeLiveFixture(): void {
    liveFixture?.dispose();
    liveFixture = null;
}

function createFixture(cubeSize: number): Fixture {
    disposeLiveFixture();

    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 600 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    document.body.appendChild(container);

    const model = new CubeController(cubeSize);
    const view = new BasicView({ viewType: 'basic-front' });
    view.create(container, model);
    view.resize();

    const moves: string[] = [];
    const listener = (event: MoveRequestedEvent): void => {
        if (event.viewId === view.getViewType()) moves.push(event.moveNotation);
    };
    Application.eventBus.on(EventName.MOVE_REQUESTED, listener);

    const fixture: Fixture = {
        view,
        model,
        moves,
        clearMoves: () => {
            moves.length = 0;
        },
        dispose: () => {
            Application.eventBus.off(EventName.MOVE_REQUESTED, listener);
            // `model.dispose()` is what unsubscribes the controller from the global
            // `MOVE_REQUESTED` bus. Destroying the view is not enough — the controller
            // outlives it and would keep applying this test's moves to a cube of the
            // wrong size, throwing on notations its own size does not define.
            model.dispose();
            view.destroy();
            container.remove();
            if (liveFixture === fixture) liveFixture = null;
        },
    };
    liveFixture = fixture;
    return fixture;
}

// ---------------------------------------------------------------------------
// Orientation algebra — written here, not imported, so this file is an oracle.
// ---------------------------------------------------------------------------

const multiply = (a: M3, b: M3): M3 =>
    a.map(row => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));

const transpose = (m: M3): M3 => [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
];

/** The model→CSS flip: CSS negates model Y and Z. Its own inverse. */
const FLIP: M3 = [
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
];

/** The matrix the app's `matrix3d(...)` produces for an orientation (vectors as rows). */
function basisOf(view: BasicView): M3 {
    const state = (
        view as unknown as { state: { viewRight: Vector3; viewUp: Vector3; viewForward: Vector3 } }
    ).state;
    return [
        [state.viewRight.x, state.viewRight.y, state.viewRight.z],
        [state.viewUp.x, state.viewUp.y, state.viewUp.z],
        [state.viewForward.x, state.viewForward.y, state.viewForward.z],
    ];
}

/** The layer turn equivalent to a view turn from `M` to `Mp`. Re-derived, not imported. */
function equivalentTurn(M: M3, Mp: M3): M3 {
    return multiply(FLIP, multiply(transpose(M), multiply(Mp, FLIP)));
}

/** A rotation matrix from an axis and a signed angle, via Rodrigues' formula. */
function rodrigues(axis: Vector3, angleDeg: number): M3 {
    const r = (angleDeg * Math.PI) / 180;
    const { x, y, z } = axis;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const t = 1 - c;
    return [
        [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
        [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
        [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
    ];
}

const AXIS_VECTOR: Record<string, Vector3> = {
    [Axis.X]: { x: 1, y: 0, z: 0 },
    [Axis.Y]: { x: 0, y: 1, z: 0 },
    [Axis.Z]: { x: 0, y: 0, z: 1 },
};

/** The rotation matrix the engine's own definition of a notation performs. */
function rotationOfNotation(notation: string, cubeSize: number): M3 | undefined {
    const definition = getCubeInvariants(cubeSize).moveDefinitions.get(notation);
    /* c8 ignore next — callers assert the notation is defined first */
    if (!definition) return undefined;
    return rodrigues(AXIS_VECTOR[definition.axis], definition.angle);
}

/** Compares two rotation matrices, tolerating floating-point noise. */
function expectSameRotation(actual: M3, expected: M3, label: string): void {
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            expect(
                Math.abs(actual[i][j] - expected[i][j]),
                `${label}: matrix[${i}][${j}] — got [${actual[i].map(n => n.toFixed(3)).join(', ')}]` +
                    ` but expected [${expected[i].map(n => n.toFixed(3)).join(', ')}]`
            ).toBeLessThan(1e-6);
        }
    }
}

/** The selected sticker's position in model space, centred on the cube's centre. */
function selectedCentredPosition(fixture: Fixture): Vector3 {
    const id = fixture.view.getSelectedSticker()!;
    const sticker = CubeStateUtils.getStickerById(fixture.model.getCurrentState(), id)!;
    const cubeSize = fixture.model.getCurrentState().cubeSize;
    const raw = facePositionTo3D(sticker.facePosition, sticker.currentFace, cubeSize);
    const mid = (cubeSize - 1) / 2;
    return { x: raw.x - mid, y: raw.y - mid, z: raw.z - mid };
}

/** Sends a `Ctrl+Arrow` and returns the notation the view asked to execute. */
function ctrlArrow(fixture: Fixture, key: string, shiftKey = false): string | undefined {
    fixture.clearMoves();
    fixture.view.handleKeyUp(
        new KeyboardEvent('keyup', { key, ctrlKey: true, shiftKey }) as KeyboardEvent
    );
    return fixture.moves[fixture.moves.length - 1];
}

/** The view rotation each arrow key matches, as a real state mutation. */
const VIEW_STEP: Record<string, (view: BasicView) => void> = {
    ArrowRight: view => view.rotateViewRight(),
    ArrowLeft: view => view.rotateViewLeft(),
    ArrowUp: view => view.rotateViewUp(),
    ArrowDown: view => view.rotateViewDown(),
};

const ARROWS = Object.keys(VIEW_STEP);

const ROTATIONS: Array<[string, (view: BasicView) => void]> = [
    ['base', () => {}],
    ['after Alt+Right', view => view.rotateViewRight()],
    ['after Alt+Left', view => view.rotateViewLeft()],
    ['after Alt+Up', view => view.rotateViewUp()],
    ['after Alt+Down', view => view.rotateViewDown()],
    ['after Alt+Right then Alt+Down', view => (view.rotateViewRight(), view.rotateViewDown())],
    ['after Alt+Right then Alt+Up', view => (view.rotateViewRight(), view.rotateViewUp())],
    ['after Alt+Down then Alt+Right', view => (view.rotateViewDown(), view.rotateViewRight())],
];

/**
 * Presses one `Ctrl+Arrow` in the given orientation and asserts the emitted notation is
 * the layer turn the matching view rotation implies.
 *
 * Two fixtures are used, because the press really turns the cube and the view step has to
 * be read from a cube that has not been moved: the first is rotated into position, its
 * orientation and selection captured, and the key pressed; the second is rotated into the
 * same position and then turned by the matching view rotation, to supply the orientation
 * the required turn is derived against.
 */
function expectSliceTurnsLikeViewRotation(
    rotate: (view: BasicView) => void,
    key: string,
    label: string,
    cubeSize = 3
): void {
    const pressed = createFixture(cubeSize);
    let notation: string | undefined;
    let before: M3;
    let sticker: Vector3;
    try {
        rotate(pressed.view);
        before = basisOf(pressed.view);
        sticker = selectedCentredPosition(pressed);
        notation = ctrlArrow(pressed, key);
    } finally {
        pressed.dispose();
    }

    const reference = createFixture(cubeSize);
    let after: M3;
    try {
        rotate(reference.view);
        VIEW_STEP[key](reference.view);
        after = basisOf(reference.view);
    } finally {
        reference.dispose();
    }

    expect(notation, `${label}: ${key} should infer a move`).toBeDefined();

    const rotation = rotationOfNotation(notation!, cubeSize);
    expect(rotation, `${label}: ${notation} should be a defined move`).toBeDefined();
    expectSameRotation(rotation!, equivalentTurn(before, after), `${label} / ${notation}`);

    // The layer is a separate claim from the sense: the turn has to be the right rotation
    // *of the right slice*, or it would move a layer the sticker is not in.
    const definition = getCubeInvariants(cubeSize).moveDefinitions.get(notation!)!;
    const coordinate =
        definition.axis === Axis.X ? sticker.x : definition.axis === Axis.Y ? sticker.y : sticker.z;
    const mid = (cubeSize - 1) / 2;
    const layerIndex = Math.round(coordinate + mid);
    expect(
        definition.layerIndices.includes(layerIndex),
        `${label}: ${notation} turns layers [${definition.layerIndices.join(',')}]` +
            ` but the sticker is on layer ${layerIndex}`
    ).toBe(true);
}

describe('Ctrl+Arrow turns the slice the same way the matching view rotation turns the cube', () => {
    describe.each(ROTATIONS)('%s', (label, rotate) => {
        it.each(ARROWS)('%s', key => {
            expectSliceTurnsLikeViewRotation(
                rotate,
                key,
                `${label} / Ctrl+${key.replace('Arrow', '')}`
            );
        });
    });
});

describe('anchors: the shipped base-orientation notations', () => {
    // Externally-fixed values, hardcoded on purpose. The formula above is self-consistent
    // whether or not it is right, so these pin it to behaviour that predates this work and
    // that the user already accepted.
    it.each([
        ['ArrowRight', 'E', 'front face, screen-right'],
        ['ArrowLeft', "E'", 'front face, screen-left'],
        ['ArrowUp', "M'", 'front face, screen-up'],
        ['ArrowDown', 'M', 'front face, screen-down'],
    ])('base orientation: Ctrl+%s is still %s', (key, expected) => {
        // One fixture per arrow: each press really turns the cube, so a shared fixture
        // would be pressing on a different orientation by the second case.
        const fixture = createFixture(3);
        try {
            expect(ctrlArrow(fixture, key)).toBe(expected);
        } finally {
            fixture.dispose();
        }
    });

    it('a top-row sticker is turned as a face rather than the slice', () => {
        // Pins the layer choice independently of the rotation formula: top-left on F is
        // the same case the pre-existing `inferKeyboardMove` test covers, and it must keep
        // producing `U'` rather than the equator turn the centre sticker gets.
        const fixture = createFixture(3);
        try {
            const sticker = CubeStateUtils.getStickerAt(
                fixture.model.getCurrentState(),
                Face.F,
                0
            )!;
            fixture.view.updateSelected(sticker.id);

            expect(ctrlArrow(fixture, 'ArrowRight')).toBe("U'");
        } finally {
            fixture.dispose();
        }
    });
});

describe('the reported sequence', () => {
    it.each([
        ['ArrowRight', 'M'],
        ['ArrowLeft', "M'"],
        ['ArrowUp', 'S'],
        ['ArrowDown', "S'"],
    ])('Ctrl+%s after Alt+Right, Alt+Down is %s', (key, expected) => {
        // The exact report, with all four arrows pinned so a fix that happened to satisfy
        // only the quoted one cannot pass. Each case needs its own fixture: the press turns
        // the cube, so the next arrow would otherwise be pressed on a different model.
        const fixture = createFixture(3);
        try {
            fixture.view.rotateViewRight();
            fixture.view.rotateViewDown();

            expect(ctrlArrow(fixture, key)).toBe(expected);
        } finally {
            fixture.dispose();
        }
    });
});

describe('Ctrl+Shift+Arrow (180°) in a rotated view', () => {
    it.each(ARROWS)('%s doubles the derived quarter turn, keeping its sense', () => {
        // A half turn keeps the sense it was doubled from: a doubled clockwise turn is `2`
        // and a doubled anticlockwise turn is `2'`. Checked by composing the quarter turn
        // with itself, which catches a normalisation that collapses the prime — the failure
        // mode of reusing the face-turn double helper on a signed slice turn.
        const quarter = createFixture(3);
        let quarterNotation: string | undefined;
        try {
            quarter.view.rotateViewRight();
            quarterNotation = ctrlArrow(quarter, 'ArrowRight');
        } finally {
            quarter.dispose();
        }

        const half = createFixture(3);
        let halfNotation: string | undefined;
        try {
            half.view.rotateViewRight();
            halfNotation = ctrlArrow(half, 'ArrowRight', true);
        } finally {
            half.dispose();
        }

        expect(halfNotation, 'Shift should infer a move').toBeDefined();
        expect(halfNotation, `${halfNotation} should be a 180° move`).toMatch(/2'?$/);

        const quarterRotation = rotationOfNotation(quarterNotation!, 3)!;
        expectSameRotation(
            rotationOfNotation(halfNotation!, 3)!,
            multiply(quarterRotation, quarterRotation),
            'half turn should be the quarter turn applied twice'
        );
    });
});

describe('sizes above 3×3', () => {
    it.each(SUPPORTED_SIZES.filter(size => size >= 3))(
        'every arrow turns the selected slice the same way the view rotation does at size %i',
        cubeSize => {
            for (const key of ARROWS) {
                expectSliceTurnsLikeViewRotation(
                    view => (view.rotateViewRight(), view.rotateViewDown()),
                    key,
                    `size ${cubeSize} / Ctrl+${key.replace('Arrow', '')}`,
                    cubeSize
                );
            }
        }
    );
});

describe('guard rails', () => {
    it('does not infer a move when nothing is selected', () => {
        const fixture = createFixture(3);
        try {
            // `handleKeyboardMove` reads `state.currentSelected` directly, so the state
            // field is what has to be cleared — stubbing the getter would not reach it.
            (
                fixture.view as unknown as { state: { currentSelected?: unknown } }
            ).state.currentSelected = undefined;

            expect(ctrlArrow(fixture, 'ArrowRight')).toBeUndefined();
        } finally {
            fixture.dispose();
        }
    });

    it('ignores Alt+Arrow, which is a view rotation rather than a move', () => {
        const fixture = createFixture(3);
        try {
            fixture.clearMoves();

            fixture.view.handleKeyUp(
                new KeyboardEvent('keyup', { key: 'ArrowRight', altKey: true }) as KeyboardEvent
            );

            expect(fixture.moves, 'Alt+Arrow must not request a move').toEqual([]);
        } finally {
            fixture.dispose();
        }
    });

    it('a selected face still turns in the face’s own frame', () => {
        // With a face selected the move is a face turn, not a slice: "clockwise" is read on
        // that face, and the view orientation must not change the answer. Pinned because the
        // derived path is easy to leave switched on by accident.
        const fixture = createFixture(3);
        try {
            fixture.view.rotateViewRight();

            const toggle = fixture.view.getCommands().find(c => c.id.endsWith('face-direct-mode'));
            expect(toggle, 'the face-direct command exists').toBeDefined();
            toggle!.action();

            const notation = ctrlArrow(fixture, 'ArrowRight');
            expect(notation, 'face-direct mode still infers a move').toBeDefined();
            expect(notation, `${notation} should be a face turn`).toMatch(/^[FBRLUD]'?$/);
        } finally {
            fixture.dispose();
        }
    });
});
