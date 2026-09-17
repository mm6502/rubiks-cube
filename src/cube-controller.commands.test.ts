import { CubeController } from '@/cube-controller';
import { Axis } from '@/cube/types';
import { getEventBus } from '@/event-bus-accessor';
import { CommandGenerationOptions, EventName } from '@/types';

import { getCommands } from './cube-controller.commands';

/** Collect the commands for one slice family, keyed by command id. */
function sliceCommands(size: number, options?: CommandGenerationOptions) {
    const commands = getCommands(new CubeController(size).getReadOnlyModel(), options);
    return {
        commands,
        byId: (id: string) => commands.find(c => c.id === id)!,
    };
}

const IDS = {
    M: ['move-m-prime', 'move-m', 'move-m2'],
    E: ['move-e-prime', 'move-e', 'move-e2'],
    S: ['move-s-prime', 'move-s', 'move-s2'],
} as const;

const ALL_SLICE_IDS = [...IDS.M, ...IDS.E, ...IDS.S];

describe('controller slice commands (M/E/S)', () => {
    afterEach(() => {
        // Restore the shared event bus between tests — several cases spy on
        // `emit`, and an un-restored spy carries call history into later cases.
        vi.restoreAllMocks();
        getEventBus().removeAllListeners();
    });

    describe('command identity', () => {
        it('keeps every slice command id across all sizes', () => {
            for (const size of [2, 3, 4, 5, 6, 7]) {
                const { commands } = sliceCommands(size);
                for (const id of ALL_SLICE_IDS) {
                    expect(commands.find(c => c.id === id)).toBeDefined();
                }
            }
        });

        it('keeps each slice command in its own group', () => {
            const { byId } = sliceCommands(5, { resolveSelectedLayer: () => 1 });
            for (const id of IDS.M) expect(byId(id).group).toBe('Extended/.Middle');
            for (const id of IDS.E) expect(byId(id).group).toBe('Extended/.Equatorial');
            for (const id of IDS.S) expect(byId(id).group).toBe('Extended/.Standing');
        });

        it('keeps the per-variant icons, including the S base label position', () => {
            const { byId } = sliceCommands(3);
            expect(byId('move-m-prime').icon).toBe('move-mp');
            expect(byId('move-m').icon).toBe('move-m');
            expect(byId('move-m2').icon).toBe('move-m2');
            // The S base glyph needs an offset label so it does not collide.
            expect(byId('move-s').labelPosition).toBe('top-right');
            expect(byId('move-m').labelPosition).toBeUndefined();
        });

        it('keeps the M/E/S keyboard bindings, with Shift for the prime variants', () => {
            const { byId } = sliceCommands(3);
            expect(byId('move-m').keyBindings).toEqual([{ key: 'm' }]);
            expect(byId('move-m-prime').keyBindings).toEqual([{ key: 'm', shiftKey: true }]);
            expect(byId('move-e').keyBindings).toEqual([{ key: 'e' }]);
            expect(byId('move-e-prime').keyBindings).toEqual([{ key: 'e', shiftKey: true }]);
            expect(byId('move-s').keyBindings).toEqual([{ key: 's' }]);
            expect(byId('move-s-prime').keyBindings).toEqual([{ key: 's', shiftKey: true }]);
            // Doubles are button-only, as they were before.
            expect(byId('move-m2').keyBindings).toBeUndefined();
            expect(byId('move-e2').keyBindings).toBeUndefined();
            expect(byId('move-s2').keyBindings).toBeUndefined();
        });
    });

    describe('3×3 keeps the conventional slices', () => {
        it('leaves all nine commands available with bare labels', () => {
            const { byId } = sliceCommands(3);
            expect(byId('move-m-prime').label).toBe('M′');
            expect(byId('move-m').label).toBe('M');
            expect(byId('move-m2').label).toBe('M2');
            expect(byId('move-e').label).toBe('E');
            expect(byId('move-s').label).toBe('S');
            for (const id of ALL_SLICE_IDS) {
                expect(byId(id).isEnabled?.()).toBe(true);
            }
        });

        it('ignores any supplied selection when emitting moves', () => {
            // A 3×3 has one interior layer, so selection cannot change the target.
            const { byId } = sliceCommands(3, { resolveSelectedLayer: () => 0 });
            const emitSpy = vi.spyOn(getEventBus(), 'emit');

            byId('move-m').action();

            expect(emitSpy).toHaveBeenCalledWith(
                EventName.MOVE_REQUESTED,
                expect.objectContaining({ moveNotation: 'M' })
            );
        });
    });

    describe('2×2 disables the slices', () => {
        it('disables all nine commands and emits nothing', () => {
            const { byId } = sliceCommands(2, { resolveSelectedLayer: () => 1 });
            for (const id of ALL_SLICE_IDS) {
                expect(byId(id).isEnabled?.()).toBe(false);
            }
        });

        it('falls back to the bare letter in the label', () => {
            const { byId } = sliceCommands(2);
            expect(byId('move-m').label).toBe('M');
        });
    });

    describe('above 3×3 follows the selected layer', () => {
        it('labels the commands with the resolved layer number', () => {
            const { byId } = sliceCommands(5, { resolveSelectedLayer: () => 2 });
            expect(byId('move-m-prime').label).toBe('3M′');
            expect(byId('move-m').label).toBe('3M');
            expect(byId('move-m2').label).toBe('3M2');
            expect(byId('move-e').label).toBe('3E');
            expect(byId('move-s').label).toBe('3S');
        });

        it('emits the resolved layer notation', () => {
            const { byId } = sliceCommands(5, { resolveSelectedLayer: () => 2 });
            const emitSpy = vi.spyOn(getEventBus(), 'emit');

            byId('move-m').action();
            byId('move-m-prime').action();
            byId('move-m2').action();

            // Filter to the requested moves: dispatching a request makes the live
            // controllers apply it and emit their own MOVE_EXECUTED events, which
            // would otherwise interleave with the calls we are asserting on.
            const requested = emitSpy.mock.calls
                .filter(([event]) => event === EventName.MOVE_REQUESTED)
                .map(([, payload]) => (payload as { moveNotation: string }).moveNotation);

            // Prime uses the ASCII apostrophe the parser accepts, not the label's ′.
            expect(requested).toEqual(['3M', "3M'", '3M2']);
        });

        it('reads the layer per axis, so each family follows its own', () => {
            // A selection at X=1, Y=3, Z=2 must drive M, E and S independently.
            const layers: Record<string, number> = { [Axis.X]: 1, [Axis.Y]: 3, [Axis.Z]: 2 };
            const { byId } = sliceCommands(5, { resolveSelectedLayer: axis => layers[axis] });
            expect(byId('move-m').label).toBe('2M');
            expect(byId('move-e').label).toBe('4E');
            expect(byId('move-s').label).toBe('3S');
        });

        it('disables the slices when there is no selection', () => {
            const { byId } = sliceCommands(5);
            for (const id of ALL_SLICE_IDS) {
                expect(byId(id).isEnabled?.()).toBe(false);
            }
        });

        it('disables only the family whose axis sits on an outer layer', () => {
            // X on an outer layer disables M while E and S stay available.
            const { byId } = sliceCommands(5, {
                resolveSelectedLayer: axis => (axis === Axis.X ? 0 : 2),
            });
            expect(byId('move-m').isEnabled?.()).toBe(false);
            expect(byId('move-m2').isEnabled?.()).toBe(false);
            expect(byId('move-e').isEnabled?.()).toBe(true);
            expect(byId('move-s').isEnabled?.()).toBe(true);
        });

        it('does not emit a stale move when the layer changes after generation', () => {
            let layer = 1;
            const { byId } = sliceCommands(5, { resolveSelectedLayer: () => layer });
            expect(byId('move-m').label).toBe('2M');

            // The selection moves without the commands being regenerated.
            layer = 3;
            const emitSpy = vi.spyOn(getEventBus(), 'emit');
            byId('move-m').action();

            // The emitted move follows the live selection, never the stale label.
            expect(emitSpy).toHaveBeenCalledWith(
                EventName.MOVE_REQUESTED,
                expect.objectContaining({ moveNotation: '4M' })
            );
        });

        it('resolves against whichever cube the model currently holds', () => {
            // Guards the size-switch path: the same options object must describe
            // whatever size the model reports at resolution time.
            const options: CommandGenerationOptions = { resolveSelectedLayer: () => 1 };
            const model = new CubeController(3).getReadOnlyModel();
            const commands = getCommands(model, options);
            const moveM = commands.find(c => c.id === 'move-m')!;

            // 3×3 ignores the selection and keeps the bare middle-slice meaning.
            expect(moveM.label).toBe('M');
            // The same options describe a 5×5 as a numbered layer.
            expect(moveM.isEnabled?.()).toBe(true);
            const five = getCommands(new CubeController(5).getReadOnlyModel(), options);
            expect(five.find(c => c.id === 'move-m')!.label).toBe('2M');
        });
    });

    describe('tooltips', () => {
        it('names the slice, its faces, its direction and the face it follows', () => {
            const { byId } = sliceCommands(3);
            expect(byId('move-m').tooltip).toBe(
                'Rotate middle slice (between L and R) clockwise (follows L direction).'
            );
            expect(byId('move-m-prime').tooltip).toBe(
                'Rotate middle slice (between L and R) counter-clockwise (follows L direction).'
            );
            expect(byId('move-m2').tooltip).toBe(
                'Rotate middle slice (between L and R) 180° (follows L direction).'
            );
            expect(byId('move-e').tooltip).toBe(
                'Rotate equatorial slice (between U and D) clockwise (follows D direction).'
            );
            expect(byId('move-s').tooltip).toBe(
                'Rotate standing slice (between F and B) clockwise (follows F direction).'
            );
        });
    });
});
