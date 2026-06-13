// fallow-ignore-file unused-export
import { EventBus } from '@/events/event-bus';

// Default instance used in tests and any context where Application isn't initialized.
// Application.constructor replaces this with the shared app bus via setEventBus().
let _eventBus: EventBus = new EventBus();

/**
 * Register the shared EventBus instance.
 * Called by Application constructor to install the app-wide bus.
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
