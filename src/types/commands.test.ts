import { describe, expect, it } from 'vitest';

import { logger } from '@/diagnostics/logger';

import { Command, CommandCategory } from './commands';

describe('commands', () => {
    it('should validate Command interface', () => {
        // Arrange
        const command: Command = {
            id: 'move-f',
            label: 'Move F',
            keyBindings: [{ key: 'f' }],
            category: CommandCategory.CUBE,
            action: () => logger.debug('Move F executed'),
        };

        // Act & Assert
        expect(command.id).toBe('move-f');
        expect(command.label).toBe('Move F');
        expect(command.keyBindings?.[0].key).toBe('f');
        expect(command.category).toBe(CommandCategory.CUBE);
        expect(typeof command.action).toBe('function');
    });

    it('should allow optional keyBindings', () => {
        // Arrange
        const command: Command = {
            id: 'view-rotate',
            label: 'Rotate View',
            category: CommandCategory.VIEW,
            action: () => {},
        };

        // Act & Assert
        expect(command.keyBindings).toBeUndefined();
        expect(command.category).toBe('view');
    });

    it('should allow optional icon and tooltip', () => {
        // Arrange
        const command: Command = {
            id: 'flip-view',
            label: 'Flip View',
            category: CommandCategory.VIEW,
            icon: '⇅',
            tooltip: 'Flip the cube view upside down (180° rotation).',
            action: () => {},
        };

        // Act & Assert
        expect(command.icon).toBe('⇅');
        expect(command.tooltip).toBe('Flip the cube view upside down (180° rotation).');
    });

    it('should validate CommandCategory type', () => {
        // Arrange
        const cubeCategory: CommandCategory = CommandCategory.CUBE;
        const viewCategory: CommandCategory = 'view';

        // Act & Assert
        expect(cubeCategory).toBe(CommandCategory.CUBE);
        expect(viewCategory).toBe('view');
    });
});
