import { describe, expect, it } from 'vitest';

import { StateManager } from '@/cube/core/state-manager';
import { Color, CubeState, Cubie, CubieType } from '@/cube/types';
import { getPositionKey } from '@/cube/utils';
import { createCubieFromCubie } from '@/cube/utils/cubie';
import { LegalityIssueCode, checkStateLegality } from '@/cube/utils/state-legality';

function updateState(state: CubeState, cubies: Cubie[]): CubeState {
    let cubiesById = state.cubiesById;
    let cubiesByPosition = state.cubiesByPosition;

    for (const cubie of cubies) {
        cubiesById = cubiesById.set(cubie.id, cubie);
        if (cubie.type !== CubieType.VIRTUAL_CENTER) {
            const key = getPositionKey(cubie.position, state.cubeSize);
            cubiesByPosition = cubiesByPosition.set(key, cubie);
        }
    }

    return {
        cubeSize: state.cubeSize,
        timestamp: state.timestamp,
        cubiesById: cubiesById,
        cubiesByPosition: cubiesByPosition,
    } satisfies CubeState;
}

describe('checkStateLegality', () => {
    it('accepts the solved state as legal', () => {
        // Arrange
        const manager = new StateManager(3);

        // Act
        const report = checkStateLegality(manager.getCurrentState());

        // Assert
        expect(report.isLegal).toBe(true);
        expect(report.issues).toHaveLength(0);
    });

    it('detects invalid corner orientation sum', () => {
        // Arrange
        const manager = new StateManager(3);
        const state = manager.getCurrentState();
        const corner = Array.from(state.cubiesById.values()).find(
            cubie => cubie.type === CubieType.CORNER
        );
        expect(corner).toBeDefined();
        if (!corner) return;

        const mutatedCorner = createCubieFromCubie(
            {
                ...corner,
                orientation: (corner.orientation + 1) % 3,
                stickers: corner.stickers,
            },
            3
        );

        // Act
        const mutatedState = updateState(state, [mutatedCorner]);
        const report = checkStateLegality(mutatedState);

        // Assert
        expect(report.isLegal).toBe(false);
        expect(
            report.issues.some(issue => issue.code === LegalityIssueCode.CORNER_ORIENTATION_SUM)
        ).toBe(true);
    });

    it('detects odd edge flip parity', () => {
        // Arrange
        const manager = new StateManager(3);
        const state = manager.getCurrentState();
        const edge = Array.from(state.cubiesById.values()).find(
            cubie => cubie.type === CubieType.EDGE
        );
        expect(edge).toBeDefined();
        if (!edge) return;

        const mutatedEdge = createCubieFromCubie(
            {
                ...edge,
                orientation: (edge.orientation + 1) % 2,
                stickers: edge.stickers,
            },
            3
        );

        // Act
        const mutatedState = updateState(state, [mutatedEdge]);
        const report = checkStateLegality(mutatedState);

        // Assert
        expect(report.isLegal).toBe(false);
        expect(report.issues.some(issue => issue.code === LegalityIssueCode.EDGE_FLIP_PARITY)).toBe(
            true
        );
    });

    it('detects corner and edge parity mismatch', () => {
        // Arrange
        const manager = new StateManager(3);
        const state = manager.getCurrentState();

        const corners = Array.from(state.cubiesById.values()).filter(
            cubie => cubie.type === CubieType.CORNER
        );
        expect(corners.length).toBeGreaterThanOrEqual(2);
        if (corners.length < 2) return;

        const [cornerA, cornerB] = corners;
        const swappedA = createCubieFromCubie(
            {
                ...cornerA,
                position: { ...cornerB.position },
                stickers: cornerA.stickers,
            },
            3
        );
        const swappedB = createCubieFromCubie(
            {
                ...cornerB,
                position: { ...cornerA.position },
                stickers: cornerB.stickers,
            },
            3
        );

        // Act
        const mutatedState = updateState(state, [swappedA, swappedB]);
        const report = checkStateLegality(mutatedState);

        // Assert
        expect(report.isLegal).toBe(false);
        expect(
            report.issues.some(
                issue => issue.code === LegalityIssueCode.PERMUTATION_PARITY_MISMATCH
            )
        ).toBe(true);
    });

    it('detects incorrect center colors without disturbing counts', () => {
        // Arrange
        const manager = new StateManager(3);
        const state = manager.getCurrentState();

        const centers = Array.from(state.cubiesById.values()).filter(
            cubie => cubie.type === CubieType.CENTER
        );
        const up = centers.find(cubie => cubie.position.y === state.cubeSize - 1);
        const down = centers.find(cubie => cubie.position.y === 0);
        expect(up).toBeDefined();
        expect(down).toBeDefined();
        if (!up || !down) return;

        const upStickerEntry = up.stickers.entrySeq().first();
        const downStickerEntry = down.stickers.entrySeq().first();
        expect(upStickerEntry).toBeDefined();
        expect(downStickerEntry).toBeDefined();
        if (!upStickerEntry || !downStickerEntry) return;

        const [upStickerId, upSticker] = upStickerEntry;
        const [downStickerId, downSticker] = downStickerEntry;

        const mutatedUp = createCubieFromCubie(
            {
                ...up,
                stickers: up.stickers.set(upStickerId, { ...upSticker, color: Color.YELLOW }),
            },
            3
        );
        const mutatedDown = createCubieFromCubie(
            {
                ...down,
                stickers: down.stickers.set(downStickerId, { ...downSticker, color: Color.WHITE }),
            },
            3
        );

        // Act
        const mutatedState = updateState(state, [mutatedUp, mutatedDown]);
        const report = checkStateLegality(mutatedState);

        // Assert
        expect(report.isLegal).toBe(false);
        expect(
            report.issues.some(issue => issue.code === LegalityIssueCode.CENTER_COLOR_MISMATCH)
        ).toBe(true);
        expect(
            report.issues.some(issue => issue.code === LegalityIssueCode.COLOR_COUNT_MISMATCH)
        ).toBe(false);
    });

    it('detects incorrect color counts', () => {
        // Arrange
        const manager = new StateManager(3);
        const state = manager.getCurrentState();
        const edge = Array.from(state.cubiesById.values()).find(
            cubie => cubie.type === CubieType.EDGE
        );
        expect(edge).toBeDefined();
        if (!edge) return;

        const stickerEntry = edge.stickers.entrySeq().first();
        expect(stickerEntry).toBeDefined();
        if (!stickerEntry) return;
        const [stickerId, sticker] = stickerEntry;

        const replacementColor = sticker.color === Color.BLUE ? Color.GREEN : Color.BLUE;

        const mutatedEdge = createCubieFromCubie(
            {
                ...edge,
                stickers: edge.stickers.set(stickerId, { ...sticker, color: replacementColor }),
            },
            3
        );

        // Act
        const mutatedState = updateState(state, [mutatedEdge]);
        const report = checkStateLegality(mutatedState);

        // Assert
        expect(report.isLegal).toBe(false);
        expect(
            report.issues.some(issue => issue.code === LegalityIssueCode.COLOR_COUNT_MISMATCH)
        ).toBe(true);
    });

    // -----------------------------------------------------------------------
    // SLOT_MISMATCH — corner error paths
    // -----------------------------------------------------------------------

    it('detects SLOT_MISMATCH when a corner cubie is placed at an out-of-bounds position (catch block)', () => {
        // Assign a corner cubie the position {x:5,y:5,z:5} which is outside
        // the 3×3 cube.  getCanonicalIndex will throw, hitting the catch block
        // in buildCornerPermutation.
        const manager = new StateManager(3);
        const state = manager.getCurrentState();
        const corner = Array.from(state.cubiesById.values()).find(
            c => c.type === CubieType.CORNER
        )!;

        // Bypass createCubieFromCubie to avoid position-validation errors — we
        // deliberately want an out-of-bounds position so getCanonicalIndex throws.
        const badCorner = { ...corner, position: { x: 5, y: 5, z: 5 } };
        const badState = { ...state, cubiesById: state.cubiesById.set(corner.id, badCorner) };

        const report = checkStateLegality(badState);

        expect(report.isLegal).toBe(false);
        expect(report.issues.some(i => i.code === LegalityIssueCode.SLOT_MISMATCH)).toBe(true);
    });

    it('detects SLOT_MISMATCH (incomplete permutation) when two corners share the same slot', () => {
        // Move cornerA to cornerB's position without touching cornerB.
        // Now both cubies write to slotB; slotA stays -1 → "incomplete permutation".
        const manager = new StateManager(3);
        const state = manager.getCurrentState();
        const corners = Array.from(state.cubiesById.values()).filter(
            c => c.type === CubieType.CORNER
        );
        const [cornerA, cornerB] = corners;

        const movedA = { ...cornerA, position: { ...cornerB.position } };
        const badState = { ...state, cubiesById: state.cubiesById.set(cornerA.id, movedA) };

        const report = checkStateLegality(badState);

        expect(report.isLegal).toBe(false);
        expect(report.issues.some(i => i.code === LegalityIssueCode.SLOT_MISMATCH)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // SLOT_MISMATCH — edge error paths
    // -----------------------------------------------------------------------

    it('detects SLOT_MISMATCH when an edge cubie is placed at an out-of-bounds position (catch block)', () => {
        const manager = new StateManager(3);
        const state = manager.getCurrentState();
        const edge = Array.from(state.cubiesById.values()).find(c => c.type === CubieType.EDGE)!;

        const badEdge = { ...edge, position: { x: 5, y: 5, z: 5 } };
        const badState = { ...state, cubiesById: state.cubiesById.set(edge.id, badEdge) };

        const report = checkStateLegality(badState);

        expect(report.isLegal).toBe(false);
        expect(report.issues.some(i => i.code === LegalityIssueCode.SLOT_MISMATCH)).toBe(true);
    });

    it('detects SLOT_MISMATCH (incomplete permutation) when two edges share the same slot', () => {
        const manager = new StateManager(3);
        const state = manager.getCurrentState();
        const edges = Array.from(state.cubiesById.values()).filter(c => c.type === CubieType.EDGE);
        const [edgeA, edgeB] = edges;

        const movedA = { ...edgeA, position: { ...edgeB.position } };
        const badState = { ...state, cubiesById: state.cubiesById.set(edgeA.id, movedA) };

        const report = checkStateLegality(badState);

        expect(report.isLegal).toBe(false);
        expect(report.issues.some(i => i.code === LegalityIssueCode.SLOT_MISMATCH)).toBe(true);
    });

    it('detects SLOT_MISMATCH when an edge cubie occupies a center position (isWithinBounds false)', () => {
        // Put an edge cubie at a center position. Its slot canonical index will
        // resolve to a center index, which is outside [0, edgeCount) →
        // isWithinBounds returns false.
        const manager = new StateManager(3);
        const state = manager.getCurrentState();
        const edge = Array.from(state.cubiesById.values()).find(c => c.type === CubieType.EDGE)!;
        const center = Array.from(state.cubiesById.values()).find(
            c => c.type === CubieType.CENTER
        )!;

        const movedEdge = { ...edge, position: { ...center.position } };
        const badState = { ...state, cubiesById: state.cubiesById.set(edge.id, movedEdge) };

        const report = checkStateLegality(badState);

        expect(report.isLegal).toBe(false);
        expect(report.issues.some(i => i.code === LegalityIssueCode.SLOT_MISMATCH)).toBe(true);
    });
});
