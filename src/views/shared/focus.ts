/**
 * Shared focus behaviour for cube views.
 *
 * ## Why this lives here
 *
 * Each view marks its content container focusable (`container.tabIndex = 0`) so
 * the view can own the keyboard, but only one view ever actually focused it. The
 * others set the attribute and never used it, so contacting those views left DOM
 * focus wherever it was — commonly on a controls-sidebar widget. An arrow key
 * then reached both the view (through the document-level capture handler) and
 * that other control, so the user saw the cube resize while trying to move the
 * selection.
 *
 * This is a DOM operation shared by views, which is why it sits in a view-level
 * shared module rather than in `src/interaction/` (view-agnostic policies over
 * cube data, no DOM) or `src/view-manager/` (a layer the views must not depend
 * on).
 *
 * ## Two ways in
 *
 * `contactView` is the user's route: a pointer-down on the content. `activateView`
 * is the programmatic route: an id, resolved against a local registry. Both end
 * in the same three effects, so a caller cannot produce half the interaction by
 * moving DOM focus directly. The registry lives here rather than in
 * `view-manager/` because of the layering rule above — resolving a container is
 * the only thing activation needs from the outside.
 */
import { getEventBus } from '@/event-bus-accessor';
import { EventName } from '@/types';

/**
 * Give a view's container keyboard focus.
 *
 * Called on contact with a view's content. Contact — a pointer-down — is the
 * trigger rather than sticker selection: the touch handlers suppress the native
 * default on pointer-down, so a later `click` may never fire for touch input and
 * a selection-driven call would not run at all.
 *
 * Focus is claimed without scrolling. `preventScroll` matters because the views
 * sit inside scrollable layout containers, and a plain `focus()` can scroll the
 * target into view — which would jerk the viewport every time the user touched
 * the cube.
 *
 * Safe to call with a null or detached container: views are created and destroyed
 * across cube-size switches, and a stale reference is expected rather than
 * exceptional.
 *
 * @param container The view's content container, or `null`/`undefined` if absent
 */
export function focusViewContainer(container: HTMLElement | null | undefined): void {
    if (!container) return;

    // A detached element cannot take focus. Calling focus() on one is harmless in
    // browsers but leaves the document's active element unchanged, which would
    // silently defeat the caller's intent — so skip explicitly instead.
    if (!container.isConnected) return;

    container.focus({ preventScroll: true });
}

/**
 * Handle the user contacting a view's content: claim DOM focus and tell the app
 * which view was used.
 *
 * These two steps belong together. Focus decides which element receives the
 * keystroke; the event updates the app's own focus model, which drives active-view
 * styling and command routing. Wiring them as one call means a view cannot end up
 * claiming focus without announcing itself, or announcing itself without actually
 * taking focus — a divergence that would show up only as subtle misrouting.
 *
 * The view id is announced even when focus could not be claimed (a detached
 * container), because the interaction did happen and the app should reflect it.
 *
 * @param container The view's content container, or `null`/`undefined` if absent
 * @param viewId The view's registered id, as returned by its `getViewType()`
 */
export function contactView(container: HTMLElement | null | undefined, viewId: string): void {
    focusViewContainer(container);
    getEventBus().emit(EventName.VIEW_INTERACTED, { viewId });
}

/**
 * Live containers by view id, so a view can be activated without a pointer.
 *
 * A view registers here when it is created and unregisters when it is destroyed.
 * This is a registry rather than a view-manager lookup on purpose: this module
 * must not depend on `view-manager/` (see the header), and resolving a container
 * is the only piece of activation that the registry needs to supply.
 *
 * Registration also owns the view's `pointerdown` contact listener, so the two
 * user-facing routes into a view — pointer contact and programmatic activation —
 * share one lifecycle. They are torn down together by
 * {@link unregisterViewContainer}.
 */
const viewContainers = new Map<string, HTMLElement>();

/**
 * Abort signal per registered view, used to detach that view's contact listener.
 *
 * Registration previously returned no teardown path: each view attached an
 * anonymous `pointerdown` closure to its container, which nothing could remove.
 * Re-creating a view on the same container therefore stacked a second listener
 * (one pointer-down produced two `viewInteracted` emissions), and a destroyed
 * view kept announcing itself because its closure stayed attached to the DOM
 * element. Holding an `AbortController` here makes both cases impossible without
 * each view having to remember to clean up.
 *
 * The pattern is the one `src/views/circular/zoom-pan.ts` already uses —
 * `abort.abort()` plus `{ signal }` on every `addEventListener`.
 */
const viewAbortControllers = new Map<string, AbortController>();

/**
 * Announce that a view's container exists and can receive activation, and
 * attach its pointer-contact listener.
 *
 * Registering owns the listener deliberately. A view that registers without
 * wiring contact, or wires contact without being able to tear it down, is the
 * asymmetry that produced the stacked-handler and announce-after-destroy
 * defects. One call now establishes both, and {@link unregisterViewContainer}
 * removes both.
 *
 * Idempotent for a repeated id: the latest container wins, and any listener on
 * a previously registered container is detached first. A view re-created on a
 * size switch therefore replaces its registration rather than adding to it.
 *
 * @param viewId The view's registered id, as returned by its `getViewType()`
 * @param container The view's content container
 */
export function registerViewContainer(viewId: string, container: HTMLElement): void {
    // Replace any previous registration for this id, listener included. Without
    // this the old container would keep a live closure, and the old controller
    // would never be aborted (the id keys a single entry).
    unregisterViewContainer(viewId);

    const controller = new AbortController();
    viewContainers.set(viewId, container);
    viewAbortControllers.set(viewId, controller);

    container.addEventListener(
        'pointerdown',
        () => {
            contactView(container, viewId);
        },
        { signal: controller.signal }
    );
}

/**
 * Forget a view's container so a destroyed view cannot be activated, and detach
 * its contact listener so it cannot announce an interaction either.
 *
 * Safe to call for an unknown id, so a view can unregister unconditionally in
 * its teardown.
 *
 * @param viewId The id passed to {@link registerViewContainer}
 */
export function unregisterViewContainer(viewId: string): void {
    viewAbortControllers.get(viewId)?.abort();
    viewAbortControllers.delete(viewId);
    viewContainers.delete(viewId);
}

/**
 * Activate a view by id, with no pointer event required.
 *
 * This is the addressable form of contact: it performs the same three effects
 * {@link contactView} performs — claim DOM focus, report the interaction, and let
 * the app move its own focus model — but resolves the container from the
 * registry instead of requiring a caller inside a listener closure.
 *
 * It exists because the pointer was previously the *only* way to reach the pair,
 * which meant an actor that can move DOM focus directly (a script, an
 * automation driver, a keyboard-only user tabbing in) completed half the
 * interaction: DOM focus moved while `focusStack` stayed where it was. The two
 * focus models could therefore disagree, which is the split this mechanism
 * exists to prevent.
 *
 * Calling it for an unknown or destroyed view is safe and does nothing — a
 * caller cannot know whether a view is currently open, so this must not throw.
 *
 * @param viewId The view's registered id
 * @returns True when a registered container was found and activation ran
 */
export function activateView(viewId: string): boolean {
    const container = viewContainers.get(viewId);
    if (!container) return false;

    contactView(container, viewId);
    return true;
}
