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
 */

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
