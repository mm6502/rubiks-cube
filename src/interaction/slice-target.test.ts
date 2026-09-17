import { describe, expect, it } from 'vitest';

import { getCubeInvariants } from '@/cube/core/cube-invariants';
import { StateManager } from '@/cube/core/state-manager';
import { Axis, Face } from '@/cube/types';
import { getAxisComponent } from '@/cube/utils/math';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { facePositionTo3D } from '@/cube/utils/sticker-position';
import {
    SliceBase,
    createSelectedLayerResolver,
    resolveSliceTarget,
    selectedLayerOnAxis,
    stickerLayerOnAxis,
} from '@/interaction/slice-target';

const AXIS_FOR_SLICE: Record<SliceBase, Axis> = {
    M: Axis.X,
    E: Axis.Y,
    S: Axis.Z,
};

describe('stickerLayerOnAxis', () => {
    it('reports the layer a sticker occupies by face and position', () => {
        // On a 5×5, an F-face sticker's position encodes its row and column.
        // F maps to z = 0, and x runs left→right, so position 0 is (x=0, z=0).
        expect(stickerLayerOnAxis({ currentFace: Face.F, facePosition: 0 }, Axis.X, 5)).toBe(0);
        // Position 2 sits two columns in, so x = 2.
        expect(stickerLayerOnAxis({ currentFace: Face.F, facePosition: 2 }, Axis.X, 5)).toBe(2);
        // Every F sticker is on the front plane, so z is always 0.
        expect(stickerLayerOnAxis({ currentFace: Face.F, facePosition: 12 }, Axis.Z, 5)).toBe(0);
    });

    it('agrees with facePositionTo3D for every sticker of every supported size', () => {
        for (let cubeSize = 2; cubeSize <= 7; cubeSize++) {
            for (const face of Object.values(Face)) {
                for (let position = 0; position < cubeSize * cubeSize; position++) {
                    const expected = facePositionTo3D(position, face, cubeSize);
                    for (const axis of Object.values(Axis)) {
                        expect(
                            stickerLayerOnAxis(
                                { currentFace: face, facePosition: position },
                                axis,
                                cubeSize
                            )
                        ).toBe(getAxisComponent(expected, axis));
                    }
                }
            }
        }
    });
});

describe('resolveSliceTarget', () => {
    const layerAt = (layerIndex: number) => () => layerIndex;

    describe('below 3×3', () => {
        it.each(['M', 'E', 'S'] as const)(
            'makes %s unavailable on a 2×2, which has no interior layer',
            base => {
                // A 2×2 has only layers 0 and 1, both of which are outer faces.
                expect(
                    resolveSliceTarget(base, AXIS_FOR_SLICE[base], 2, {
                        resolveSelectedLayer: layerAt(1),
                    })
                ).toBeUndefined();
            }
        );
    });

    describe('at 3×3', () => {
        it.each([
            ['M', Axis.X],
            ['E', Axis.Y],
            ['S', Axis.Z],
        ] as const)(
            'keeps %s as the conventional middle slice, ignoring selection',
            (base, axis) => {
                // The middle slice is layer 1, spelled bare — the notation the engine
                // has always registered for 3×3, and what history records.
                expect(resolveSliceTarget(base, axis, 3)).toEqual({
                    layerIndex: 1,
                    notation: base,
                });
                // An explicit selection must not change this; 3×3 has one answer.
                expect(
                    resolveSliceTarget(base, axis, 3, { resolveSelectedLayer: layerAt(0) })
                ).toEqual({ layerIndex: 1, notation: base });
            }
        );

        it('stays available even when the selected sticker sits on an outer layer', () => {
            // The default 3×3 selection is the F centre, whose z is 0 — an outer
            // layer for S. S must still work there rather than switching off.
            expect(
                resolveSliceTarget('S', Axis.Z, 3, { resolveSelectedLayer: layerAt(0) })
            ).toBeDefined();
        });
    });

    describe('above 3×3', () => {
        it('uses the selected layer and spells it with its layer number', () => {
            expect(
                resolveSliceTarget('M', Axis.X, 5, { resolveSelectedLayer: layerAt(2) })
            ).toEqual({ layerIndex: 2, notation: '3M' });
        });

        it('spells the second layer as 2M rather than a bare M', () => {
            // Bare M/E/S are ambiguous above 3×3 — the point of naming the layer.
            expect(
                resolveSliceTarget('E', Axis.Y, 4, { resolveSelectedLayer: layerAt(1) })
            ).toEqual({ layerIndex: 1, notation: '2E' });
        });

        it('maps the layer index to the notation the engine registers', () => {
            for (let cubeSize = 4; cubeSize <= 7; cubeSize++) {
                const invariants = getCubeInvariants(cubeSize);
                for (const base of ['M', 'E', 'S'] as const) {
                    for (let layer = 1; layer <= cubeSize - 2; layer++) {
                        const target = resolveSliceTarget(base, AXIS_FOR_SLICE[base], cubeSize, {
                            resolveSelectedLayer: layerAt(layer),
                        });
                        expect(target).toBeDefined();
                        const definition = invariants.moveDefinitions.get(target!.notation);
                        expect(definition).toBeDefined();
                        expect(definition!.layerIndices).toEqual([layer]);
                    }
                }
            }
        });

        it.each([
            ['nothing is selected', undefined],
            ['the selection is on the outer layer of that axis', layerAt(0)],
            ['the selection is on the far outer layer of that axis', layerAt(4)],
        ])('is unavailable when %s', (_reason, resolveSelectedLayer) => {
            expect(resolveSliceTarget('M', Axis.X, 5, { resolveSelectedLayer })).toBeUndefined();
        });

        it('is unavailable when no resolver is supplied at all', () => {
            expect(resolveSliceTarget('M', Axis.X, 5)).toBeUndefined();
        });

        it('treats the two outermost layers as faces, not slices, at every size', () => {
            for (let cubeSize = 4; cubeSize <= 7; cubeSize++) {
                for (const layer of [0, cubeSize - 1]) {
                    expect(
                        resolveSliceTarget('M', Axis.X, cubeSize, {
                            resolveSelectedLayer: layerAt(layer),
                        })
                    ).toBeUndefined();
                }
            }
        });
    });
});

describe('selectedLayerOnAxis', () => {
    it('reads the layer from a live sticker in the cube state', () => {
        const stateManager = new StateManager(5);
        const state = stateManager.getCurrentState();
        // The F-face centre sticker of a 5×5 sits at layer 2 on both X and Y.
        const centerRow = Math.floor((5 - 1) / 2);
        const centerPosition = centerRow * 5 + centerRow;
        const sticker = CubeStateUtils.getStickerAt(state, Face.F, centerPosition);
        expect(sticker).toBeDefined();

        expect(selectedLayerOnAxis(state, sticker!.id, Axis.X)).toBe(2);
        expect(selectedLayerOnAxis(state, sticker!.id, Axis.Y)).toBe(2);
        expect(selectedLayerOnAxis(state, sticker!.id, Axis.Z)).toBe(0);
    });

    it('returns undefined for no selection or an unknown sticker', () => {
        const stateManager = new StateManager(3);
        const state = stateManager.getCurrentState();
        expect(selectedLayerOnAxis(state, undefined, Axis.X)).toBeUndefined();
        expect(selectedLayerOnAxis(state, 'not-a-sticker' as never, Axis.X)).toBeUndefined();
    });
});

describe('createSelectedLayerResolver', () => {
    it('resolves against the model and selection supplied by its getters', () => {
        const stateManager = new StateManager(5);
        const state = stateManager.getCurrentState();
        const centerRow = Math.floor((5 - 1) / 2);
        const sticker = CubeStateUtils.getStickerAt(state, Face.F, centerRow * 5 + centerRow)!;
        const model = { getCurrentState: () => state } as never;

        const resolve = createSelectedLayerResolver(
            () => model,
            () => sticker.id
        );

        expect(resolve(Axis.X)).toBe(2);
    });

    it('re-reads its getters each call, so it survives a state swap', () => {
        const small = new StateManager(3);
        const large = new StateManager(5);
        const largeState = large.getCurrentState();
        const centerRow = Math.floor((5 - 1) / 2);
        const sticker = CubeStateUtils.getStickerAt(largeState, Face.F, centerRow * 5 + centerRow)!;

        let model = { getCurrentState: () => small.getCurrentState() } as never;
        let selection: string | undefined = undefined;
        const resolve = createSelectedLayerResolver(
            () => model,
            () => selection as never
        );
        expect(resolve(Axis.X)).toBeUndefined();

        // Simulate a size switch: both the model and the selection change.
        model = { getCurrentState: () => largeState } as never;
        selection = sticker.id;
        expect(resolve(Axis.X)).toBe(2);
    });
});
