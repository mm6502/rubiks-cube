import { EventBus } from '@/events/event-bus';

// Shared singleton used by getEventBus() and Application.eventBus.
const _eventBus: EventBus = new EventBus();

/**
 * Retrieve the active EventBus instance.
 */
export function getEventBus(): EventBus {
    return _eventBus;
}
