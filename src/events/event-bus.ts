// EventBus implementation for pub/sub communication in the Commanding and Eventing System
import type { EventName, EventPayload } from '@/types';

/**
 * Simple EventEmitter for browser compatibility
 */
class SimpleEventEmitter {
    private listeners: { [event: string]: ((payload: EventPayload) => void)[] } = {};

    /**
     * Register an event listener for a specific event
     * @param event - The name of the event to listen for
     * @param listener - The callback function to execute when the event is emitted
     */
    on(event: EventName, listener: (payload: EventPayload) => void): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(listener);
    }

    /**
     * Remove a specific event listener for an event
     * @param event - The name of the event
     * @param listener - The callback function to remove
     */
    off(event: EventName, listener: (payload: EventPayload) => void): void {
        const eventListeners = this.listeners[event];
        if (!eventListeners) return;

        const index = eventListeners.indexOf(listener);
        if (index < 0) return;

        // Remove the listener from the array.
        eventListeners.splice(index, 1);
    }

    /**
     * Emit an event to all registered listeners
     * @param event - The name of the event to emit
     * @param payload - The data payload to pass to listeners
     */
    emit(event: EventName, payload: EventPayload): void {
        const eventListeners = this.listeners[event];
        if (eventListeners) {
            eventListeners.forEach(listener => listener(payload));
        }
    }

    /**
     * Remove all listeners for a specific event or all events
     * @param event - Optional event name. If not provided, removes all listeners for all events
     */
    removeAllListeners(event?: EventName): void {
        if (event) {
            delete this.listeners[event];
        } else {
            this.listeners = {};
        }
    }

    /**
     * Get the number of listeners registered for a specific event
     * @param event - The name of the event
     * @returns The number of listeners for the event
     */
    listenerCount(event: EventName): number {
        return this.listeners[event]?.length || 0;
    }
}

/**
 * Main EventBus class providing type-safe pub/sub communication
 */
export class EventBus {
    private emitter = new SimpleEventEmitter();

    /**
     * Subscribe to an event with type-safe payload handling
     * @template T - The specific event payload type
     * @param event - The name of the event to listen for
     * @param listener - The callback function to execute when the event is emitted
     */
    on<T extends EventPayload>(event: EventName, listener: (payload: T) => void): void {
        this.emitter.on(event, listener as (payload: EventPayload) => void);
    }

    /**
     * Unsubscribe from an event
     * @template T - The specific event payload type
     * @param event - The name of the event
     * @param listener - The callback function to remove
     */
    off<T extends EventPayload>(event: EventName, listener: (payload: T) => void): void {
        this.emitter.off(event, listener as (payload: EventPayload) => void);
    }

    /**
     * Emit an event with type-safe payload
     * @template T - The specific event payload type
     * @param event - The name of the event to emit
     * @param payload - The data payload to pass to listeners
     */
    emit<T extends EventPayload>(event: EventName, payload: T): void {
        this.emitter.emit(event, payload);
    }

    /**
     * Remove all listeners for a specific event or all events
     * @param event - Optional event name. If not provided, removes all listeners for all events
     */
    removeAllListeners(event?: EventName): void {
        if (event) {
            this.emitter.removeAllListeners(event);
        } else {
            this.emitter.removeAllListeners();
        }
    }

    /**
     * Get the number of listeners registered for a specific event
     * @param event - The name of the event
     * @returns The number of listeners for the event
     */
    listenerCount(event: EventName): number {
        return this.emitter.listenerCount(event);
    }
}
