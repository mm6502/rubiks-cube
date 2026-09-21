/**
 * Fail a test that lets an error reach `window` uncaught.
 *
 * ## Why this exists
 *
 * An exception thrown inside a DOM event listener does not fail a vitest test.
 * jsdom catches it and, instead of rethrowing, dispatches an `error` event on
 * `window`; the app's own global handler (`initializeErrorHandlers`) catches
 * that, logs it, and calls `stopImmediatePropagation()`. So the suite stays green
 * while stderr carries a full stack trace — which is exactly how an
 * `ERROR Uncaught error: TypeError: document.elementFromPoint is not a function`
 * survived a passing CI `Unit tests with coverage gate` step.
 *
 * ## Why it is a separate setup file, listed first
 *
 * `stopImmediatePropagation()` kills every listener registered *after* the one
 * that calls it. The app installs its handler when `diagnostics/logger.ts` is
 * first imported, and `vitest.setup.ts` imports it — so anything registered in
 * that file is already too late and never fires. Registering here, in a file
 * that runs before it and imports nothing that installs the handler, is what puts
 * this listener ahead of the app's in registration order.
 *
 * ## Scope
 *
 * The check runs in `afterEach`, so it is attributed to the test that caused it
 * rather than to the worker. Files that exist to exercise the global handlers
 * themselves dispatch `error` events deliberately and are exempted by path.
 */
import { afterEach, expect } from 'vitest';

/** Errors that reached `window` uncaught since the last check. */
const recorded: string[] = [];

/** Describe a caught value well enough to debug it from the failure message. */
function describe(value: unknown): string {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    return String(value);
}

window.addEventListener('error', (event: ErrorEvent) => {
    const error = (event as ErrorEvent & { error?: unknown }).error;
    recorded.push(describe(error ?? event.message));
});

window.addEventListener('unhandledrejection', (event: Event) => {
    const reason = (event as Event & { reason?: unknown }).reason;
    recorded.push(`unhandled rejection: ${describe(reason)}`);
});

/**
 * Files that test the global error handlers by dispatching the events this guard
 * watches for. Matched on the tail of the path, so it survives the absolute
 * prefix differing between a local run and CI.
 */
const EXEMPT_FILES = ['src/diagnostics/logger.handlers.test.ts'];

afterEach(() => {
    const errors = recorded.splice(0, recorded.length);
    if (errors.length === 0) return;

    const testPath = (expect.getState().testPath ?? '').replace(/\\/g, '/');
    if (EXEMPT_FILES.some(file => testPath.endsWith(file))) return;

    expect(
        errors,
        'a test let an error reach window uncaught — see the stderr trace above'
    ).toEqual([]);
});
