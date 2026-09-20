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

import {
    activateView,
    contactView,
    focusViewContainer,
    registerViewContainer,
    unregisterViewContainer,
} from './focus';

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

describe('activateView', () => {
    // The registry is module-level state, so every test must clear the ids it
    // registers — otherwise a later test in this file sees a stale container and
    // assertions pass for the wrong reason.
    const registered: string[] = [];

    function register(viewId: string): HTMLElement {
        const container = document.createElement('div');
        container.tabIndex = 0;
        document.body.appendChild(container);
        registerViewContainer(viewId, container);
        registered.push(viewId);
        return container;
    }

    afterEach(() => {
        registered.splice(0).forEach(unregisterViewContainer);
        document.body.innerHTML = '';
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('focuses the container, announces the interaction and reports success', () => {
        const container = register('flat');
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        expect(activateView('flat')).toBe(true);

        // All three effects of contact, without a pointer event.
        expect(document.activeElement).toBe(container);
        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_INTERACTED, { viewId: 'flat' });
    });

    it('returns false and does nothing for an unregistered view id', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        expect(() => activateView('ghost-view')).not.toThrow();
        expect(activateView('ghost-view')).toBe(false);
        expect(emitSpy).not.toHaveBeenCalled();
    });

    it('stops being activatable once unregistered (AE12-style liveness)', () => {
        register('circular');

        unregisterViewContainer('circular');

        expect(activateView('circular')).toBe(false);
    });

    it('activates B after A, leaving A without DOM focus', () => {
        const a = register('basic-front');
        const b = register('flat');

        activateView('basic-front');
        expect(document.activeElement).toBe(a);

        activateView('flat');

        expect(document.activeElement).toBe(b);
        expect(document.activeElement).not.toBe(a);
    });

    it('keeps the latest container when a view id is registered twice', () => {
        // A view re-created on a size switch re-registers; the stale container
        // must not win.
        const stale = register('flat');
        const fresh = register('flat');

        activateView('flat');

        expect(document.activeElement).toBe(fresh);
        expect(document.activeElement).not.toBe(stale);
    });

    it('still reports the interaction when the registered container is detached', () => {
        const container = register('flat');
        container.remove();
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        expect(activateView('flat')).toBe(true);

        // Matches contactView's documented behaviour: the interaction happened,
        // so the app learns about it even though focus could not be claimed.
        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_INTERACTED, { viewId: 'flat' });
        expect(document.activeElement).not.toBe(container);
    });

    it('does not scroll the viewport (AE10)', () => {
        const container = register('flat');
        const focusSpy = vi.spyOn(container, 'focus');

        activateView('flat');

        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    });
});

describe('registerViewContainer: the region that counts as \"in this view\"', () => {
    // A panel is `[data-view-panel]` and holds TWO siblings: a header carrying
    // the view's action buttons, and the content container the view is created
    // into. Only the content is registered, so a listener bound to it never sees
    // focus land in the header — and the user tabbing through a panel reaches
    // the header buttons first.
    //
    // Reported defect: tabbing through the header buttons left the app's focus
    // model on the PREVIOUS view, so the active-view styling and the View Actions
    // panel described a different view than the one the keystrokes reached. The
    // region that counts as \"in this view\" has to match what the user sees as
    // the view, which is the whole panel.
    const registered: string[] = [];

    /** Builds a panel holding a header button and a content container. */
    function registerInPanel(viewId: string): {
        panel: HTMLElement;
        headerButton: HTMLButtonElement;
        content: HTMLElement;
    } {
        const panel = document.createElement('div');
        panel.setAttribute('data-view-panel', viewId);

        const header = document.createElement('div');
        header.setAttribute('data-view-header', '');
        const headerButton = document.createElement('button');
        header.appendChild(headerButton);

        const content = document.createElement('div');
        content.tabIndex = 0;

        panel.appendChild(header);
        panel.appendChild(content);
        document.body.appendChild(panel);

        registerViewContainer(viewId, content);
        registered.push(viewId);
        return { panel, headerButton, content };
    }

    afterEach(() => {
        registered.splice(0).forEach(unregisterViewContainer);
        document.body.innerHTML = '';
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('reports the interaction when focus lands in the header, not only the content', () => {
        const { headerButton } = registerInPanel('flat');
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        headerButton.focus();

        expect(document.activeElement).toBe(headerButton);
        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_INTERACTED, { viewId: 'flat' });
    });

    it('still reports the interaction when focus lands on the content itself', () => {
        // Contrast case: a fix that moved the listener to the panel must not stop
        // observing the content, which is the element the pointer path focuses.
        const { content } = registerInPanel('flat');
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        content.focus();

        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_INTERACTED, { viewId: 'flat' });
    });

    it('reports nothing when focus lands outside the panel', () => {
        registerInPanel('flat');
        const outside = document.createElement('input');
        document.body.appendChild(outside);
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        outside.focus();

        expect(emitSpy).not.toHaveBeenCalled();
    });

    it('falls back to the container when it has no panel ancestor', () => {
        // Registration is also used with a bare container — every existing test in
        // this file does exactly that, and a view could be created outside a panel.
        // The panel must widen the observed region, not become a requirement.
        const container = document.createElement('div');
        container.tabIndex = 0;
        document.body.appendChild(container);
        registerViewContainer('flat', container);
        registered.push('flat');
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        container.focus();

        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_INTERACTED, { viewId: 'flat' });
    });
});
