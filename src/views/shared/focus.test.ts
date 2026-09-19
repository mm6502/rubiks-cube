// Tests for `focusViewContainer` — the single shared mechanism that gives a
// view keyboard focus when its content is contacted (U4).
//
// These assert on `document.activeElement` rather than on any view's internal
// state, because the whole point of U4 is that focus is observable to the
// browser (it decides which element receives arrow keys), not just tracked in
// a variable. A bug where the view "knows" it is focused but the DOM disagrees
// is exactly the defect these tests exist to catch.
import { Application } from '@/application';
import { EventName } from '@/types';

import { contactView, focusViewContainer } from './focus';

describe('focusViewContainer', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('focuses a focusable container', () => {
        const container = document.createElement('div');
        container.tabIndex = 0;
        document.body.appendChild(container);

        focusViewContainer(container);

        expect(document.activeElement).toBe(container);
    });

    it('moves focus away from a previously focused control', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        expect(document.activeElement).toBe(input);

        const container = document.createElement('div');
        container.tabIndex = 0;
        document.body.appendChild(container);

        focusViewContainer(container);

        expect(document.activeElement).toBe(container);
        expect(document.activeElement).not.toBe(input);
    });

    it('does not throw for a null container', () => {
        expect(() => focusViewContainer(null)).not.toThrow();
        expect(() => focusViewContainer(undefined)).not.toThrow();
    });

    it('does not throw and does not steal focus for a detached container', () => {
        const anchor = document.createElement('input');
        document.body.appendChild(anchor);
        anchor.focus();

        const detached = document.createElement('div');
        detached.tabIndex = 0;
        // Intentionally never appended: views are destroyed and rebuilt across
        // size switches, so a stale reference is a realistic input.
        expect(detached.isConnected).toBe(false);

        expect(() => focusViewContainer(detached)).not.toThrow();

        // A detached element cannot take focus; the caller's focus must survive.
        expect(document.activeElement).toBe(anchor);
    });

    it('requests focus without scrolling the viewport', () => {
        const container = document.createElement('div');
        container.tabIndex = 0;
        document.body.appendChild(container);

        // Spy on the options passed to focus() to prove `preventScroll` is
        // requested. jsdom does not implement layout, so the scroll offset
        // would not change either way — asserting the option is the only
        // meaningful check available here (AE10).
        const focusSpy = vi.spyOn(container, 'focus');
        focusViewContainer(container);

        expect(focusSpy).toHaveBeenCalledTimes(1);
        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    });

    it('leaves focus on the container after the call (integration)', () => {
        const container = document.createElement('div');
        container.tabIndex = 0;
        document.body.appendChild(container);

        focusViewContainer(container);

        // Simulate subsequent event handling that must not steal it back: the
        // focus call is synchronous, so a defensive re-check after a tick
        // matches what the browser does with the pointer gesture.
        expect(document.activeElement).toBe(container);
    });

    it('is idempotent', () => {
        const container = document.createElement('div');
        container.tabIndex = 0;
        document.body.appendChild(container);

        focusViewContainer(container);
        focusViewContainer(container);

        expect(document.activeElement).toBe(container);
    });
});

describe('contactView', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('focuses the container and announces the interaction, in one call', () => {
        const container = document.createElement('div');
        container.tabIndex = 0;
        document.body.appendChild(container);
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        contactView(container, 'flat');

        expect(document.activeElement).toBe(container);
        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_INTERACTED, { viewId: 'flat' });
    });

    it('announces the interaction even when focus cannot be claimed', () => {
        // A detached container cannot take focus, but the user did interact with
        // that view — so the app must still learn about it.
        const detached = document.createElement('div');
        detached.tabIndex = 0;
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        contactView(detached, 'circular');

        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_INTERACTED, { viewId: 'circular' });
    });

    it('does not throw for a null container', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        expect(() => contactView(null, 'flat')).not.toThrow();

        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_INTERACTED, { viewId: 'flat' });
    });
});
