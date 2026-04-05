import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventName, EventPayload } from '@/types';

import { EventBus } from './event-bus';

describe('EventBus', () => {
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
    });

    it('should emit and receive events', () => {
        // arrange
        const listener = vi.fn();
        eventBus.on(EventName.STICKER_SELECTED, listener);

        const payload = { stickerId: 'test', viewId: 'view1' };

        // act
        eventBus.emit(EventName.STICKER_SELECTED, payload);

        // assert
        expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit and receive highlight change events', () => {
        const listener = vi.fn();
        eventBus.on(EventName.HIGHLIGHT_CHANGED, listener);

        const payload = { stickerId: 's1', viewId: 'flat' };

        eventBus.emit(EventName.HIGHLIGHT_CHANGED, payload as EventPayload);

        expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should allow multiple listeners for the same event', () => {
        // arrange
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        eventBus.on(EventName.MOVE_EXECUTED, listener1);
        eventBus.on(EventName.MOVE_EXECUTED, listener2);

        const payload = {
            moveDetails: { notation: 'F' },
        } as EventPayload;

        // act
        eventBus.emit(EventName.MOVE_EXECUTED, payload);

        // assert
        expect(listener1).toHaveBeenCalledWith(payload);
        expect(listener2).toHaveBeenCalledWith(payload);
    });

    it('should emit event with no listeners without error', () => {
        // act & assert
        expect(() => {
            eventBus.emit(EventName.STICKER_SELECTED, { stickerId: 'test' });
        }).not.toThrow();
    });

    it('should unsubscribe listeners', () => {
        // arrange
        const listener = vi.fn();
        eventBus.on(EventName.VIEW_INTERACTED, listener);

        // act
        eventBus.off(EventName.VIEW_INTERACTED, listener);

        const payload = { viewId: 'view1' };
        eventBus.emit(EventName.VIEW_INTERACTED, payload);

        // assert
        expect(listener).not.toHaveBeenCalled();
    });

    it('should handle off when no listeners exist for the event', () => {
        // arrange
        const listener = vi.fn();

        // act
        eventBus.off(EventName.VIEW_INTERACTED, listener);

        // assert - should not throw, and listener count remains 0
        expect(eventBus.listenerCount(EventName.VIEW_INTERACTED)).toBe(0);
    });

    it('should handle off when listener is not registered', () => {
        // arrange
        const registeredListener = vi.fn();
        const unregisteredListener = vi.fn();
        eventBus.on(EventName.VIEW_INTERACTED, registeredListener);

        // act
        eventBus.off(EventName.VIEW_INTERACTED, unregisteredListener);

        // assert - should not throw, registered listener still there
        expect(eventBus.listenerCount(EventName.VIEW_INTERACTED)).toBe(1);
    });

    it('should count listeners', () => {
        // arrange
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        eventBus.on(EventName.COMMAND_EXECUTED, listener1);
        eventBus.on(EventName.COMMAND_EXECUTED, listener2);

        // act & assert
        expect(eventBus.listenerCount(EventName.COMMAND_EXECUTED)).toBe(2);
    });

    it('should remove all listeners', () => {
        // arrange
        const listener = vi.fn();
        eventBus.on(EventName.STICKER_SELECTED, listener);

        // act
        eventBus.removeAllListeners(EventName.STICKER_SELECTED);

        // assert
        expect(eventBus.listenerCount(EventName.STICKER_SELECTED)).toBe(0);
    });

    it('should remove all listeners for all events', () => {
        // arrange
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        eventBus.on(EventName.STICKER_SELECTED, listener1);
        eventBus.on(EventName.MOVE_EXECUTED, listener2);

        // act
        eventBus.removeAllListeners();

        // assert
        expect(eventBus.listenerCount(EventName.STICKER_SELECTED)).toBe(0);
        expect(eventBus.listenerCount(EventName.MOVE_EXECUTED)).toBe(0);
    });
});
