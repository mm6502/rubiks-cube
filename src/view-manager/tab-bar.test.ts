// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { TabBar } from './tab-bar';

vi.mock('./view-registry', () => ({
    getViewTitle: (viewType: string) => `Title:${viewType}`,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STYLES: Record<string, string> = {
    'tab-bar': 'module_tabBar',
    'tab-item': 'module_tabItem',
    'tab-item--active': 'module_tabItemActive',
};

/** Minimal CubeView stand-in — only the shape matters for the Map value type. */
const fakeView = {} as never;

function makeViews(...ids: string[]): Map<string, { view: never; container: HTMLElement }> {
    return new Map(
        ids.map(id => [id, { view: fakeView, container: document.createElement('div') }])
    );
}

function makeSut(activeId?: string) {
    const container = document.createElement('div');
    const onTabClick = vi.fn();
    const getActiveViewId = vi.fn(() => activeId);

    const tabBar = new TabBar(container, STYLES, getActiveViewId, onTabClick);

    return { container, onTabClick, getActiveViewId, tabBar };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TabBar', () => {
    describe('construction', () => {
        it('inserts the tab bar element as the first child of the container', () => {
            // Arrange / Act
            const { container } = makeSut();

            // Assert
            expect(container.firstChild).toBe(container.querySelector('.module_tabBar'));
        });

        it('inserts before any pre-existing children', () => {
            // Arrange
            const container = document.createElement('div');
            const existing = document.createElement('div');
            container.appendChild(existing);

            // Act
            const tabBar = new TabBar(container, STYLES, () => undefined, vi.fn());
            void tabBar; // only construction matters here

            // Assert
            expect(container.firstChild).not.toBe(existing);
            expect(container.children[1]).toBe(existing);
        });

        it('applies the tab-bar CSS module class', () => {
            // Arrange / Act
            const { container } = makeSut();

            // Assert
            const el = container.firstChild as HTMLElement;
            expect(el.className).toBe('module_tabBar');
        });

        it('falls back to plain class name when styles map has no entry', () => {
            // Arrange
            const container = document.createElement('div');

            // Act
            new TabBar(container, {}, () => undefined, vi.fn());

            // Assert
            const el = container.firstChild as HTMLElement;
            expect(el.className).toBe('tab-bar');
        });
    });

    // -----------------------------------------------------------------------

    describe('show / hide', () => {
        it('show() sets display to flex', () => {
            // Arrange
            const { container, tabBar } = makeSut();

            // Act
            tabBar.show();

            // Assert
            const el = container.firstChild as HTMLElement;
            expect(el.style.display).toBe('flex');
        });

        it('hide() sets display to none', () => {
            // Arrange
            const { container, tabBar } = makeSut();
            tabBar.show();

            // Act
            tabBar.hide();

            // Assert
            const el = container.firstChild as HTMLElement;
            expect(el.style.display).toBe('none');
        });

        it('show() after hide() makes the bar visible again', () => {
            // Arrange
            const { container, tabBar } = makeSut();
            tabBar.hide();

            // Act
            tabBar.show();

            // Assert
            const el = container.firstChild as HTMLElement;
            expect(el.style.display).toBe('flex');
        });
    });

    // -----------------------------------------------------------------------

    describe('updateTabs()', () => {
        it('creates one button per view', () => {
            // Arrange
            const { container, tabBar } = makeSut('a');

            // Act
            tabBar.updateTabs(makeViews('a', 'b', 'c'));

            // Assert
            const buttons = container.querySelectorAll('button');
            expect(buttons).toHaveLength(3);
        });

        it('sets button text content from getViewTitle', () => {
            // Arrange
            const { container, tabBar } = makeSut('a');

            // Act
            tabBar.updateTabs(makeViews('a', 'b'));

            // Assert
            const buttons = Array.from(container.querySelectorAll('button'));
            expect(buttons[0].textContent).toBe('Title:a');
            expect(buttons[1].textContent).toBe('Title:b');
        });

        it('sets data-view-type attribute on each tab', () => {
            // Arrange
            const { container, tabBar } = makeSut('a');

            // Act
            tabBar.updateTabs(makeViews('a', 'b'));

            // Assert
            const buttons = Array.from(container.querySelectorAll<HTMLElement>('button'));
            expect(buttons[0].dataset.viewType).toBe('a');
            expect(buttons[1].dataset.viewType).toBe('b');
        });

        it('applies the tab-item class to every tab', () => {
            // Arrange
            const { container, tabBar } = makeSut('a');

            // Act
            tabBar.updateTabs(makeViews('a', 'b'));

            // Assert
            const buttons = Array.from(container.querySelectorAll('button'));
            buttons.forEach(btn => expect(btn.classList.contains('module_tabItem')).toBe(true));
        });

        it('marks the active tab with aria-selected="true"', () => {
            // Arrange
            const { container, tabBar } = makeSut('b');

            // Act
            tabBar.updateTabs(makeViews('a', 'b'));

            // Assert
            const buttons = Array.from(container.querySelectorAll('button'));
            expect(buttons[0].getAttribute('aria-selected')).toBe('false');
            expect(buttons[1].getAttribute('aria-selected')).toBe('true');
        });

        it('adds the active class only to the active tab', () => {
            // Arrange
            const { container, tabBar } = makeSut('b');

            // Act
            tabBar.updateTabs(makeViews('a', 'b', 'c'));

            // Assert
            const buttons = Array.from(container.querySelectorAll('button'));
            expect(buttons[0].classList.contains('module_tabItemActive')).toBe(false);
            expect(buttons[1].classList.contains('module_tabItemActive')).toBe(true);
            expect(buttons[2].classList.contains('module_tabItemActive')).toBe(false);
        });

        it('renders no active tab when getActiveViewId returns undefined', () => {
            // Arrange
            const { container, tabBar } = makeSut(undefined);

            // Act
            tabBar.updateTabs(makeViews('a', 'b'));

            // Assert
            const active = container.querySelectorAll('.module_tabItemActive');
            expect(active).toHaveLength(0);
            const buttons = Array.from(container.querySelectorAll('button'));
            buttons.forEach(btn => expect(btn.getAttribute('aria-selected')).toBe('false'));
        });

        it('clears previous tabs before rebuilding', () => {
            // Arrange
            const { container, tabBar } = makeSut('a');
            tabBar.updateTabs(makeViews('a', 'b', 'c'));

            // Act
            tabBar.updateTabs(makeViews('x', 'y'));

            // Assert
            expect(container.querySelectorAll('button')).toHaveLength(2);
        });

        it('produces no buttons for an empty views map', () => {
            // Arrange
            const { container, tabBar } = makeSut();

            // Act
            tabBar.updateTabs(new Map());

            // Assert
            expect(container.querySelectorAll('button')).toHaveLength(0);
        });

        it('re-reads getActiveViewId on each call', () => {
            // Arrange
            const { container, getActiveViewId, tabBar } = makeSut('a');
            tabBar.updateTabs(makeViews('a', 'b'));

            // Act — change the active view and rebuild
            getActiveViewId.mockReturnValue('b');
            tabBar.updateTabs(makeViews('a', 'b'));

            // Assert
            const activeButtons = container.querySelectorAll('.module_tabItemActive');
            expect(activeButtons).toHaveLength(1);
            expect((activeButtons[0] as HTMLElement).dataset.viewType).toBe('b');
        });
    });

    // -----------------------------------------------------------------------

    describe('tab click callbacks', () => {
        it('calls onTabClick with the correct viewType when a tab is clicked', () => {
            // Arrange
            const { container, onTabClick, tabBar } = makeSut('a');
            tabBar.updateTabs(makeViews('a', 'b'));

            // Act
            const buttons = container.querySelectorAll('button');
            (buttons[1] as HTMLElement).click();

            // Assert
            expect(onTabClick).toHaveBeenCalledOnce();
            expect(onTabClick).toHaveBeenCalledWith('b');
        });

        it('calls onTabClick for the first tab when clicked', () => {
            // Arrange
            const { container, onTabClick, tabBar } = makeSut('b');
            tabBar.updateTabs(makeViews('a', 'b'));

            // Act
            (container.querySelectorAll('button')[0] as HTMLElement).click();

            // Assert
            expect(onTabClick).toHaveBeenCalledWith('a');
        });

        it('fires onTabClick exactly once per click after multiple updateTabs calls', () => {
            // Arrange
            const { container, onTabClick, tabBar } = makeSut('x');
            tabBar.updateTabs(makeViews('x', 'y'));
            // Rebuild the strip (simulates active view change)
            tabBar.updateTabs(makeViews('x', 'y'));

            // Act
            (container.querySelectorAll('button')[0] as HTMLElement).click();

            // Assert
            expect(onTabClick).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------

    describe('style fallbacks', () => {
        it('falls back to plain class names when styles map is empty', () => {
            // Arrange
            const container = document.createElement('div');
            const tabBar = new TabBar(container, {}, () => 'a', vi.fn());

            // Act
            tabBar.updateTabs(makeViews('a', 'b'));

            // Assert
            const tabs = Array.from(container.querySelectorAll('button'));
            expect(tabs[0].classList.contains('tab-item')).toBe(true);
            expect(tabs[0].classList.contains('tab-item--active')).toBe(true); // 'a' is active
            expect(tabs[1].classList.contains('tab-item--active')).toBe(false);
        });
    });
});
