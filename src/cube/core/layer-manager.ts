import { Axis, CubeState, CubieId, CubieType, Position3D, ReadonlyCubie } from '@/cube/types';
import type { MoveDefinition } from '@/cube/types/move';

/**
 * Provides layer evaluation and enumeration for the cube
 * Filters pre-created cubies by layer criteria - strictly for slicing
 * All methods are static and take cubies as a parameter for maximum flexibility
 */
export class LayerManager {
    /**
     * Check if a cubie is in a specific slice
     * @param position Position to check
     * @param axis Axis of the slice
     * @param coordinate Coordinate value
     * @returns True if position is in the slice
     */
    private static isInSlice(position: Position3D, axis: Axis, coordinate: number): boolean {
        switch (axis) {
            case Axis.X:
                return position.x === coordinate;
            case Axis.Y:
                return position.y === coordinate;
            case Axis.Z:
                return position.z === coordinate;
        }
    }

    /**
     * Get all cubies at a specific coordinate slice.
     * Filters pre-created cubies by axis and coordinate.
     * @param axis Axis (X, Y, or Z).
     * @param coordinate Coordinate value.
     * @param cubies Map of all cubies in the cube.
     * @param cubeSize Size of the cube.
     * @returns Array of cubies at the coordinate.
     */
    static getSliceCubies(axis: Axis, coordinate: number, state: CubeState): ReadonlyCubie[] {
        const sliceCubies: ReadonlyCubie[] = [];
        for (const cubie of state.cubiesById.values()) {
            // Skip virtual center cubies - they don't participate in layer operations
            if (cubie.type === CubieType.VIRTUAL_CENTER) {
                continue;
            }
            if (LayerManager.isInSlice(cubie.position, axis, coordinate)) {
                sliceCubies.push(cubie);
            }
        }
        return sliceCubies;
    }

    /**
     * Get cubies affected by a move definition, including virtual centers.
     * @param move Move definition describing the layers involved.
     * @param state Current cube state.
     */
    static getCubiesForMove(move: MoveDefinition, state: CubeState): ReadonlyCubie[] {
        const layerIndices = LayerManager.enumerateTargetLayers(move, state.cubeSize);
        const collected = new Map<CubieId, ReadonlyCubie>();

        for (const layerIndex of layerIndices) {
            const layerCubies = LayerManager.getSliceCubies(move.axis, layerIndex, state);
            for (const cubie of layerCubies) {
                collected.set(cubie.id, cubie);
            }
        }

        const virtualCubies = LayerManager.getVirtualCubiesForMove(move, state);
        for (const virtualCubie of virtualCubies) {
            collected.set(virtualCubie.id, virtualCubie);
        }

        return Array.from(collected.values());
    }

    /**
     * Enumerate target layers for a move definition.
     * @param move Move definition.
     * @param cubeSize Size of the cube.
     * @returns Array of layer indices affected by the move.
     */
    private static enumerateTargetLayers(move: MoveDefinition, cubeSize: number): number[] {
        if (move.layerIndices.length === 0 || move.layerIndices.length >= cubeSize) {
            return Array.from({ length: cubeSize }, (_, index) => index);
        }

        const unique = new Set<number>();
        for (const index of move.layerIndices) {
            if (index >= 0 && index < cubeSize) {
                unique.add(index);
            }
        }

        return Array.from(unique).sort((a, b) => a - b);
    }

    /**
     * Get virtual center cubies affected by a whole-cube rotation move.
     * @param move Move definition.
     * @param state Current cube state.
     * @returns Array of virtual center cubie IDs
     */
    private static getVirtualCubiesForMove(
        move: MoveDefinition,
        state: CubeState
    ): ReadonlyCubie[] {
        if (!LayerManager.isWholeCubeRotation(move)) return Array.from(new Set<ReadonlyCubie>());

        const result = Array.from(state.cubiesById.values()).filter(
            cubie => cubie.type === CubieType.VIRTUAL_CENTER
        );

        return result;
    }

    /**
     * Determine if a move is a whole-cube rotation.
     * @param move Move definition
     * @returns True if the move is a whole-cube rotation
     */
    public static isWholeCubeRotation(move: MoveDefinition): boolean {
        const baseName = move.name.replace(/['2]/g, '');
        return baseName === 'x' || baseName === 'y' || baseName === 'z';
    }
}
