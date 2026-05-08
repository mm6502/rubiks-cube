import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AboutModal } from './about-modal';

// Mock the CSS module
vi.mock('./about-modal.module.css', () => ({
    default: {
        backdrop: 'backdrop',
        hidden: 'hidden',
        dialog: 'dialog',
        header: 'header',
        title: 'title',
        closeButton: 'closeButton',
        description: 'description',
        links: 'links',
        link: 'link',
        license: 'license',
    },
}));

describe('AboutModal', () => {
    let modal: AboutModal;

    beforeEach(() => {
        modal = new AboutModal();
        document.body.innerHTML = '';
        vi.stubGlobal('__APP_VERSION__', '1.0.0');
        vi.stubGlobal('__BUILD_DATE__', '2026-05-09');
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    describe('open()', () => {
        it('appends a backdrop element to document.body', () => {
            modal.open();
            const backdrop = document.body.querySelector('.backdrop');
            expect(backdrop).not.toBeNull();
        });

        it('sets role="dialog" on the backdrop', () => {
            modal.open();
            const backdrop = document.body.querySelector('.backdrop');
            expect(backdrop?.getAttribute('role')).toBe('dialog');
        });

        it('sets aria-modal="true" on the backdrop', () => {
            modal.open();
            const backdrop = document.body.querySelector('.backdrop');
            expect(backdrop?.getAttribute('aria-modal')).toBe('true');
        });

        it('renders a close button inside the dialog', () => {
            modal.open();
            const closeBtn = document.body.querySelector('.closeButton');
            expect(closeBtn).not.toBeNull();
        });

        it('calling open() twice does not append a second backdrop', () => {
            modal.open();
            modal.open();
            const backdrops = document.body.querySelectorAll('.backdrop');
            expect(backdrops.length).toBe(1);
        });

        it('shows the backdrop again when open() is called after close()', () => {
            modal.open();
            modal.close();

            // After close it has .hidden class
            const backdrop = document.body.querySelector('.backdrop');
            expect(backdrop?.classList.contains('hidden')).toBe(true);

            // Open again — should remove .hidden
            modal.open();
            expect(backdrop?.classList.contains('hidden')).toBe(false);
        });
    });

    describe('close()', () => {
        it('adds the hidden class to the backdrop', () => {
            modal.open();
            modal.close();
            const backdrop = document.body.querySelector('.backdrop');
            expect(backdrop?.classList.contains('hidden')).toBe(true);
        });

        it('does nothing when called before open()', () => {
            expect(() => modal.close()).not.toThrow();
        });
    });

    describe('close button click', () => {
        it('clicking the close button hides the modal', () => {
            modal.open();
            const closeBtn = document.body.querySelector<HTMLButtonElement>('.closeButton');
            closeBtn?.click();
            const backdrop = document.body.querySelector('.backdrop');
            expect(backdrop?.classList.contains('hidden')).toBe(true);
        });
    });

    describe('backdrop click', () => {
        it('clicking directly on the backdrop closes the modal', () => {
            modal.open();
            const backdrop = document.body.querySelector<HTMLElement>('.backdrop');

            // Simulate click whose target is the backdrop itself
            const event = new MouseEvent('click', { bubbles: true });
            Object.defineProperty(event, 'target', { value: backdrop });
            backdrop?.dispatchEvent(event);

            expect(backdrop?.classList.contains('hidden')).toBe(true);
        });

        it('clicking inside the dialog does not close the modal', () => {
            modal.open();
            const dialog = document.body.querySelector<HTMLElement>('.dialog');
            dialog?.click();
            const backdrop = document.body.querySelector('.backdrop');
            expect(backdrop?.classList.contains('hidden')).toBe(false);
        });
    });

    describe('keyboard handling', () => {
        it('pressing Escape closes the modal', () => {
            modal.open();
            const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
            document.dispatchEvent(event);
            const backdrop = document.body.querySelector('.backdrop');
            expect(backdrop?.classList.contains('hidden')).toBe(true);
        });

        it('pressing other keys does not close the modal', () => {
            modal.open();
            const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            document.dispatchEvent(event);
            const backdrop = document.body.querySelector('.backdrop');
            expect(backdrop?.classList.contains('hidden')).toBe(false);
        });

        it('removes keydown listener after close', () => {
            modal.open();
            modal.close();

            // Dispatching Escape after explicit close should not throw
            const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
            expect(() => document.dispatchEvent(event)).not.toThrow();
        });
    });
});
