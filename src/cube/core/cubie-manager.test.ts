import { describe, expect, it } from 'vitest';

import { Map as IMap } from 'immutable';

import { CubieManager } from '@/cube/core/cubie-manager';
import { CubieId, CubieType } from '@/cube/types';
import { Sticker, StickerId } from '@/cube/types/sticker';

describe('CubieManager', () => {
    describe('constructor', () => {
        it('should create manager for valid cube sizes', () => {
            // Arrange
            // (no specific setup needed)

            // Act & Assert
            expect(() => new CubieManager(2)).not.toThrow();
            expect(() => new CubieManager(3)).not.toThrow();
            expect(() => new CubieManager(5)).not.toThrow();
        });

        it('should throw for invalid cube sizes', () => {
            // Arrange
            // (no specific setup needed)

            // Act & Assert
            expect(() => new CubieManager(1)).toThrow('Cube size must be at least 2');
            expect(() => new CubieManager(0)).toThrow('Cube size must be at least 2');
            expect(() => new CubieManager(-1)).toThrow('Cube size must be at least 2');
        });
    });

    describe('createAllCubies', () => {
        it('should create correct number of cubies for cube size 2', () => {
            // Arrange
            const manager = new CubieManager(2);

            // Act
            const cubies = manager.createAllCubies();

            // Assert
            expect(cubies.size).toBe(14); // 8 physical + 6 virtual = 14 cubies

            // Check that all expected physical cubie IDs exist
            expect(cubies.has('pos_00_00_00' as CubieId)).toBe(true);
            expect(cubies.has('pos_00_00_01' as CubieId)).toBe(true);
            expect(cubies.has('pos_00_01_00' as CubieId)).toBe(true);
            expect(cubies.has('pos_00_01_01' as CubieId)).toBe(true);
            expect(cubies.has('pos_01_00_00' as CubieId)).toBe(true);
            expect(cubies.has('pos_01_00_01' as CubieId)).toBe(true);
            expect(cubies.has('pos_01_01_00' as CubieId)).toBe(true);
            expect(cubies.has('pos_01_01_01' as CubieId)).toBe(true);

            // Check that virtual center cubies exist
            expect(cubies.has('virtual_center_F' as CubieId)).toBe(true);
            expect(cubies.has('virtual_center_B' as CubieId)).toBe(true);
            expect(cubies.has('virtual_center_L' as CubieId)).toBe(true);
            expect(cubies.has('virtual_center_R' as CubieId)).toBe(true);
            expect(cubies.has('virtual_center_U' as CubieId)).toBe(true);
            expect(cubies.has('virtual_center_D' as CubieId)).toBe(true);
        });

        it('should create correct number of cubies for cube size 3 (including virtual centers)', () => {
            // Arrange
            const manager = new CubieManager(3);

            // Act
            const cubies = manager.createAllCubies();

            // Assert
            expect(cubies.size).toBe(26 + 6); // 26 physical + 6 virtual = 32 cubies
        });

        it('should create correct number of cubies for cube size 2 (including virtual centers)', () => {
            // Arrange
            const manager = new CubieManager(2);

            // Act
            const cubies = manager.createAllCubies();

            // Assert
            expect(cubies.size).toBe(8 + 6); // 8 physical + 6 virtual = 14 cubies
        });
    });

    describe('cubie creation', () => {
        it('should create corner cubies with correct properties', () => {
            // Arrange
            const manager = new CubieManager(3);

            // Act
            const cubies = manager.createAllCubies();

            // Assert
            const cornerCubie = cubies.get('pos_00_00_00' as CubieId)!;
            expect(cornerCubie.type).toBe(CubieType.CORNER);
            expect(cornerCubie.position).toEqual({ x: 0, y: 0, z: 0 });
            expect(cornerCubie.stickers.size).toBe(3); // Corners have 3 faces
            expect(cornerCubie.stickers.has('pos_00_00_00_L_sticker' as StickerId)).toBe(true);
            expect(cornerCubie.stickers.has('pos_00_00_00_D_sticker' as StickerId)).toBe(true);
            expect(cornerCubie.stickers.has('pos_00_00_00_F_sticker' as StickerId)).toBe(true);
        });

        it('should create edge cubies with correct properties', () => {
            // Arrange
            const manager = new CubieManager(3);

            // Act
            const cubies = manager.createAllCubies();

            // Assert
            const edgeCubie = cubies.get('pos_00_00_01' as CubieId)!;
            expect(edgeCubie.type).toBe(CubieType.EDGE);
            expect(edgeCubie.position).toEqual({ x: 0, y: 0, z: 1 });
            expect(edgeCubie.stickers.size).toBe(2); // Edges have 2 faces
            expect(edgeCubie.stickers.has('pos_00_00_01_L_sticker' as StickerId)).toBe(true);
            expect(edgeCubie.stickers.has('pos_00_00_01_D_sticker' as StickerId)).toBe(true);
        });

        it('should create center cubies with correct properties', () => {
            // Arrange
            const manager = new CubieManager(3);

            // Act
            const cubies = manager.createAllCubies();

            // Assert
            const faceCenterCubie = cubies.get('pos_00_01_01' as CubieId)!;
            expect(faceCenterCubie.type).toBe(CubieType.CENTER);
            expect(faceCenterCubie.position).toEqual({ x: 0, y: 1, z: 1 });
            expect(faceCenterCubie.stickers.size).toBe(1); // Face centers have 1 face
            expect(faceCenterCubie.stickers.has('pos_00_01_01_L_sticker' as StickerId)).toBe(true);
            expect(cubies.has('pos_01_01_01' as CubieId)).toBe(false); // Core cubie is not part of physical model
        });
    });

    describe('virtual center cubies', () => {
        it('should create virtual center cubies for all faces', () => {
            // Arrange
            const manager = new CubieManager(3);

            // Act
            const cubies = manager.createAllCubies();

            // Assert
            // Check all 6 virtual center cubies exist
            expect(cubies.has('virtual_center_F' as CubieId)).toBe(true);
            expect(cubies.has('virtual_center_B' as CubieId)).toBe(true);
            expect(cubies.has('virtual_center_L' as CubieId)).toBe(true);
            expect(cubies.has('virtual_center_R' as CubieId)).toBe(true);
            expect(cubies.has('virtual_center_U' as CubieId)).toBe(true);
            expect(cubies.has('virtual_center_D' as CubieId)).toBe(true);
        });

        it('should create virtual center cubies with correct properties for cube size 3', () => {
            // Arrange
            const manager = new CubieManager(3);

            // Act
            const cubies = manager.createAllCubies();

            // Test Front virtual center
            const frontVirtual = cubies.get('virtual_center_F' as CubieId)!;
            expect(frontVirtual.type).toBe(CubieType.VIRTUAL_CENTER);
            expect(frontVirtual.position).toEqual({ x: 1, y: 1, z: 0 }); // surface coordinate at z = 0
            expect(frontVirtual.orientation).toBe(0);
            expect(frontVirtual.stickers.size).toBe(1);
            expect(frontVirtual.stickers.has('virtual_center_F_F_sticker' as StickerId)).toBe(true);

            const frontSticker = frontVirtual.stickers.get(
                'virtual_center_F_F_sticker' as StickerId
            )!;
            const computedFace = frontSticker.currentFace;
            expect(computedFace).toBe('F');
            expect(frontSticker.cubieId).toBe('virtual_center_F');

            // Test Back virtual center
            const backVirtual = cubies.get('virtual_center_B' as CubieId)!;
            expect(backVirtual.position).toEqual({ x: 1, y: 1, z: 2 });

            // Test Left virtual center
            const leftVirtual = cubies.get('virtual_center_L' as CubieId)!;
            expect(leftVirtual.position).toEqual({ x: 0, y: 1, z: 1 });

            // Test Right virtual center
            const rightVirtual = cubies.get('virtual_center_R' as CubieId)!;
            expect(rightVirtual.position).toEqual({ x: 2, y: 1, z: 1 });

            // Test Down virtual center
            const downVirtual = cubies.get('virtual_center_D' as CubieId)!;
            expect(downVirtual.position).toEqual({ x: 1, y: 0, z: 1 });

            // Test Up virtual center
            const upVirtual = cubies.get('virtual_center_U' as CubieId)!;
            expect(upVirtual.position).toEqual({ x: 1, y: 2, z: 1 });
        });

        it('should create virtual center cubies with correct properties for cube size 2', () => {
            // Arrange
            const manager = new CubieManager(2);

            // Act
            const cubies = manager.createAllCubies();

            // Assert
            // For cube size 2, centerCoord = (2-1)/2 = 0.5 (fractional)
            const frontVirtual = cubies.get('virtual_center_F' as CubieId)!;
            expect(frontVirtual.position).toEqual({ x: 0.5, y: 0.5, z: 0 });

            const backVirtual = cubies.get('virtual_center_B' as CubieId)!;
            expect(backVirtual.position).toEqual({ x: 0.5, y: 0.5, z: 1 });
        });

        it('should create virtual center cubies with correct properties for cube size 4', () => {
            // Arrange
            const manager = new CubieManager(4);

            // Act
            const cubies = manager.createAllCubies();

            // Assert
            // For cube size 4, centerCoord = (4-1)/2 = 1.5 (fractional)
            const frontVirtual = cubies.get('virtual_center_F' as CubieId)!;
            expect(frontVirtual.position).toEqual({ x: 1.5, y: 1.5, z: 0 });
        });
    });

    describe('validateCubie', () => {
        it('should validate correctly created cubies', () => {
            // Arrange
            const manager = new CubieManager(3);
            const cubies = manager.createAllCubies();

            // Act & Assert
            for (const cubie of cubies.values()) {
                expect(manager.validateCubie(cubie)).toBe(true);
            }
        });

        it('should validate virtual center cubies correctly', () => {
            // Arrange
            const manager = new CubieManager(3);
            const cubies = manager.createAllCubies();

            // Act & Assert
            // Test all virtual center cubies are valid
            const virtualFront = cubies.get('virtual_center_F' as CubieId)!;
            expect(manager.validateCubie(virtualFront)).toBe(true);

            const virtualBack = cubies.get('virtual_center_B' as CubieId)!;
            expect(manager.validateCubie(virtualBack)).toBe(true);

            const virtualLeft = cubies.get('virtual_center_L' as CubieId)!;
            expect(manager.validateCubie(virtualLeft)).toBe(true);

            const virtualRight = cubies.get('virtual_center_R' as CubieId)!;
            expect(manager.validateCubie(virtualRight)).toBe(true);

            const virtualUp = cubies.get('virtual_center_U' as CubieId)!;
            expect(manager.validateCubie(virtualUp)).toBe(true);

            const virtualDown = cubies.get('virtual_center_D' as CubieId)!;
            expect(manager.validateCubie(virtualDown)).toBe(true);
        });

        it('should reject cubies with invalid positions', () => {
            // Arrange
            const manager = new CubieManager(3);
            const invalidCubie = {
                id: '00_00_00' as CubieId,
                type: CubieType.CORNER,
                position: { x: 3, y: 0, z: 0 }, // Invalid position
                orientation: 1,
                canonicalIndex: 3,
                stickers: IMap<StickerId, Sticker>(),
            };

            // Act & Assert
            expect(manager.validateCubie(invalidCubie)).toBe(false);
        });

        it('should reject cubies with mismatched IDs', () => {
            // Arrange
            const manager = new CubieManager(3);
            const invalidCubie = {
                id: '00_00_01' as CubieId, // Wrong ID
                type: CubieType.CORNER,
                position: { x: 0, y: 0, z: 0 }, // Position doesn't match ID
                orientation: 2,
                canonicalIndex: 3,
                stickers: IMap<StickerId, Sticker>(),
            };

            // Act & Assert
            expect(manager.validateCubie(invalidCubie)).toBe(false);
        });
    });
});
