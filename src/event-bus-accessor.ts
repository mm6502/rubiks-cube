// fallow-ignore-file unused-export
import { EventBus } from '@/events/event-bus';

// Shared singleton used by getEventBus() and Application.eventBus.
// Tests may replace it via setEventBus() when they need an isolated bus.
let _eventBus: EventBus = new EventBus();

/**
 * Replace the shared EventBus instance.
 * Primarily used by tests that need an isolated app-wide bus.
 */
export function setEventBus(bus: EventBus): void {
    _eventBus = bus;
}

/**
 * Retrieve the active EventBus instance.
 */
export function getEventBus(): EventBus {
    return _eventBus;
}
