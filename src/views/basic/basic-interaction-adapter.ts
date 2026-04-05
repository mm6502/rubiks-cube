import { ViewInteractionAdapter } from '@/interaction/types';

/**
 * Basic view compatibility scaffold for future cooperative interaction work.
 * Current basic interactions remain click/tentative driven, so no hooks are overridden yet.
 */
export function createBasicInteractionAdapter(): ViewInteractionAdapter {
    return {};
}
