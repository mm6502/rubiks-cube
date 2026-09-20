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
 * Tell the app which view was used, updating its own focus model.
 *
 * Split out from {@link contactView} because there are now two ways focus can
 * arrive at a view — a pointer contact, and focus landing there without one —
 * and only the first of them should also *claim* focus. Both must announce
 * themselves, and they must announce it identically, which is what this is for.
 *
 * Not exported: both callers are in this module, and the registration owns the
 * listener that uses it. Keeping the public surface to `contactView` and
 * `activateView` is what makes the layering rule above enforceable.
 *
 * @param viewId The view's registered id, as returned by its `getViewType()`
 */
function emitViewInteracted(viewId: string): void {
    getEventBus().emit(EventName.VIEW_INTERACTED, { viewId });
}

/**
 * True while this module is claiming focus on behalf of {@link contactView}.
 *
 * `contactView` claims focus, which the `focusin` listener it also owns would
 * then observe as if the user had tabbed in — announcing the same interaction
 * twice. This marks our own claim so the listener can ignore it. It is cleared
 * in a `finally` so a throw cannot leave the listener permanently deaf.
 *
 * `focusin` is dispatched synchronously by `focus()`, so a flag set immediately
 * around the call is sufficient; no timer or microtask is involved.
 */
let claimingFocus = false;

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
 * When focus *is* claimed the announcement here is still the one that counts —
 * the paired `focusin` listener skips it, so a contact reports exactly once.
 *
 * @param container The view's content container, or `null`/`undefined` if absent
 * @param viewId The view's registered id, as returned by its `getViewType()`
 */
export function contactView(container: HTMLElement | null | undefined, viewId: string): void {
    claimingFocus = true;
    try {
        focusViewContainer(container);
    } finally {
        claimingFocus = false;
    }

    emitViewInteracted(viewId);
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
 * attach the listeners that make it reachable.
 *
 * Registering owns these listeners deliberately. A view that registers without
 * wiring contact, or wires contact without being able to tear it down, is the
 * asymmetry that produced the stacked-handler and announce-after-destroy
 * defects. One call now establishes both, and {@link unregisterViewContainer}
 * removes both.
 *
 * **Two listeners, because there are two ways focus arrives.**
 *
 * - `pointerdown` covers touching or clicking the content.
 * - `focusin` covers focus arriving without a pointer — in practice, the user
 *   tabbing into the container (which is `tabIndex = 0`). Without it, that path
 *   moved DOM focus while the app's focus stack stayed on the previous view, so
 *   the two focus models disagreed: keystrokes were routed to the view the user
 *   tabbed to, while the active-view styling and the actions panel still
 *   described the one they left. That is the exact split this module exists to
 *   prevent, so the keyboard path has to be wired here rather than left to
 *   callers to remember.
 *
 * `focusin` rather than `focus`: `focus` does not bubble, and the listener is on
 * the container while focus may land on any focusable descendant.
 *
 * Idempotent for a repeated id: the latest container wins, and any listeners on
 * a previously registered container are detached first. A view re-created on a
 * size switch therefore replaces its registration rather than adding to it.
 *
 * @param viewId The view's registered id, as returned by its `getViewType()`
 * @param container The view's content container
 */
export function registerViewContainer(viewId: string, container: HTMLElement): void {
    // Replace any previous registration for this id, listeners included. Without
    // this the old container would keep live closures, and the old controller
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

    // Focus is observed across the whole PANEL, not just the content container.
    //
    // A panel is `[data-view-panel]` and owns two siblings: a header holding the
    // view's action buttons, and the content container the view is created into.
    // Only the content is registered — but the user tabbing through a panel
    // reaches the header buttons first, and `focusin` bubbles from the target, so
    // a listener on the content never sees them. Focus in the header therefore
    // went unreported, and the app kept describing the *previous* view while the
    // keystrokes already reached this one: the active-view styling and the View
    // Actions panel lagged a step behind the tab order.
    //
    // The region that counts as "in this view" has to match what the user sees as
    // the view, which is the whole panel. Resolved from the container rather than
    // passed in, because the view is created into the content and never sees its
    // own panel.
    //
    // Falls back to the container when there is no panel ancestor: registration
    // is also used with a bare container (every test in `focus.test.ts` does
    // exactly that), so the panel must widen the observed region, not become a
    // requirement for registering at all.
    //
    // `pointerdown` deliberately stays on the content. The header path already
    // activates the view through `PanelInteractionHandler`, and widening the
    // pointer listener would make a header click claim focus onto the content —
    // pulling it off the button the user just pressed.
    const focusRegion = container.closest('[data-view-panel]') ?? container;

    focusRegion.addEventListener(
        'focusin',
        () => {
            // `contactView` claims focus itself and announces the interaction
            // once; this listener exists for focus that arrives *without* a
            // pointer (tabbing in). Skipping our own claim is what keeps a
            // single contact reporting exactly once.
            if (claimingFocus) return;

            // Only the announcement, not the DOM-focus claim: focus is already
            // where the user put it, and re-claiming it here would fight the tab
            // order.
            emitViewInteracted(viewId);
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
