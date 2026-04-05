import { describe, expect, test } from 'vitest';

import { LayerManager } from '@/cube/core/layer-manager';
import { StateManager } from '@/cube/core/state-manager';
import { ReadonlyCubie } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

import { MoveEngine } from './move-engine';

// Basic test verifying cubies are replaced (immutability) when moves are applied
describe('StateManager immutability', () => {
    test('updateCubiePositions replaces cubie objects (no in-place mutation)', () => {
        const size = 3;
        const stateManager = new StateManager(size);
        const moveEngine = new MoveEngine(stateManager.getOriginalState());

        const move = stateManager.getMoveDefinition('U');
        const moving = LayerManager.getCubiesForMove(move, stateManager.getCurrentState());
        expect(moving.length).toBeGreaterThan(0);

        // Choose a cubie id that will be moved and capture its reference
        const targetId = moving[0].id;
        const beforeRef = CubeStateUtils.getCubieById(
            stateManager.getCurrentState(),
            targetId
        ) as ReadonlyCubie;
        expect(beforeRef).toBeDefined();

        // Execute the move
        const result = moveEngine.executeMove(move, stateManager.getCurrentState());
        stateManager.applyMoveResult(result);

        // Get the cubie reference after the move
        const afterRef = CubeStateUtils.getCubieById(
            stateManager.getCurrentState(),
            targetId
        ) as ReadonlyCubie;

        // The cubie instance stored for this cubie id should be replaced because
        // immutability is enforced; no in-place mutation of cubie objects occurs.
        expect(afterRef).toBeDefined();
        expect(afterRef).not.toBe(beforeRef);
    });
});
