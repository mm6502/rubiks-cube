import { describe, expect, it } from 'vitest';

import { StickerId } from '@/cube/types';

import { EventName, MoveExecutedEvent, MoveRequestedEvent, StickerSelectedEvent } from './events';

describe('events', () => {
    it('should have correct event names', () => {
        // Act & Assert
        expect(EventName.STICKER_SELECTED).toBe('stickerSelected');
        expect(EventName.MOVE_REQUESTED).toBe('moveRequested');
        expect(EventName.MOVE_EXECUTED).toBe('moveExecuted');
        expect(EventName.VIEW_INTERACTED).toBe('viewInteracted');
        expect(EventName.COMMAND_EXECUTED).toBe('commandExecuted');
    });

    it('should validate StickerSelectedEvent payload', () => {
        // Arrange
        const payload: StickerSelectedEvent = {
            stickerId: 'sticker-1' as StickerId,
            viewId: 'view-basic',
        };

        // Act & Assert
        expect(payload.stickerId).toBe('sticker-1');
        expect(payload.viewId).toBe('view-basic');
    });

    it('should validate MoveRequestedEvent payload', () => {
        // Arrange
        const payload: MoveRequestedEvent = {
            moveNotation: 'F',
            viewId: 'view-basic',
            tentative: true,
        };

        // Act & Assert
        expect(payload.moveNotation).toBe('F');
        expect(payload.tentative).toBe(true);
    });

    it('should validate MoveExecutedEvent payload', () => {
        // Arrange
        const payload: MoveExecutedEvent = {
            moveDetails: { notation: 'F' },
        } as MoveExecutedEvent;

        // Act & Assert
        expect(payload.moveDetails.notation).toBe('F');
    });
});
