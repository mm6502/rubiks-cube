import { describe, expect, it } from 'vitest';

import { Map as IMap } from 'immutable';

import { Face } from '@/cube/types';
import { CubieId, CubieType } from '@/cube/types/cubie';
import { Sticker, StickerId } from '@/cube/types/sticker';
import { createVirtualCenterCubieId, isVirtualCenterCubie } from '@/cube/utils/cubie';

describe('Cubie Types', () => {
    describe('CubieType enum', () => {
        it('should have all expected cubie types', () => {
            expect(CubieType.CORNER).toBe('corner');
            expect(CubieType.EDGE).toBe('edge');
            expect(CubieType.CENTER).toBe('center');
            expect(CubieType.VIRTUAL_CENTER).toBe('virtual_center');
        });
    });

    describe('isVirtualCenterCubie', () => {
        it('should return true for virtual center cubies', () => {
            const virtualCubie = {
                id: 'virtual_center_F' as CubieId,
                type: CubieType.VIRTUAL_CENTER,
                position: { x: 1, y: 1, z: 0 },
                orientation: 0,
                canonicalIndex: 0,
                stickers: IMap<StickerId, Sticker>(),
            };

            expect(isVirtualCenterCubie(virtualCubie)).toBe(true);
        });

        it('should return false for non-virtual center cubies', () => {
            const cornerCubie = {
                id: '00_00_00' as CubieId,
                type: CubieType.CORNER,
                position: { x: 0, y: 0, z: 0 },
                orientation: 0,
                canonicalIndex: 0,
                stickers: IMap<StickerId, Sticker>(),
            };

            const edgeCubie = {
                id: '00_00_01' as CubieId,
                type: CubieType.EDGE,
                position: { x: 0, y: 0, z: 1 },
                orientation: 0,
                canonicalIndex: 0,
                stickers: IMap<StickerId, Sticker>(),
            };

            const centerCubie = {
                id: '01_01_01' as CubieId,
                type: CubieType.CENTER,
                position: { x: 1, y: 1, z: 1 },
                orientation: 0,
                canonicalIndex: 0,
                stickers: IMap<StickerId, Sticker>(),
            };

            expect(isVirtualCenterCubie(cornerCubie)).toBe(false);
            expect(isVirtualCenterCubie(edgeCubie)).toBe(false);
            expect(isVirtualCenterCubie(centerCubie)).toBe(false);
        });
    });

    describe('createVirtualCenterCubieId', () => {
        it('should generate correct virtual center cubie ID format', () => {
            expect(createVirtualCenterCubieId(Face.F)).toBe('virtual_center_F');
            expect(createVirtualCenterCubieId(Face.U)).toBe('virtual_center_U');
            expect(createVirtualCenterCubieId(Face.B)).toBe('virtual_center_B');
            expect(createVirtualCenterCubieId(Face.L)).toBe('virtual_center_L');
            expect(createVirtualCenterCubieId(Face.R)).toBe('virtual_center_R');
            expect(createVirtualCenterCubieId(Face.D)).toBe('virtual_center_D');
        });
    });
});
