import { CubeView } from '@/cube/types';

import { getViewTitle } from './view-registry';

/**
 * Renders a horizontal scrollable tab strip above the visualizations area.
 * Active below the 1025px breakpoint; hidden at desktop widths.
 */
export class TabBar {
    private tabBarEl: HTMLElement;
    private styles: Record<string, string>;
    private getActiveViewId: () => string | undefined;
    private onTabClick: (viewType: string) => void;

    constructor(
        container: HTMLElement,
        styles: Record<string, string>,
        getActiveViewId: () => string | undefined,
        onTabClick: (viewType: string) => void
    ) {
        this.styles = styles;
        this.getActiveViewId = getActiveViewId;
        this.onTabClick = onTabClick;

        this.tabBarEl = document.createElement('div');
        this.tabBarEl.className = styles['tab-bar'] ?? 'tab-bar';
        // Insert before all panels (first child of the visualizations container)
        container.insertBefore(this.tabBarEl, container.firstChild);
    }

    /** Show the tab bar (set via display style; CSS keeps it hidden by default). */
    show(): void {
        this.tabBarEl.style.display = 'flex';
    }

    /** Hide the tab bar. */
    hide(): void {
        this.tabBarEl.style.display = 'none';
    }

    /**
     * Rebuild the tab strip to reflect the current set of open views.
     * Should be called whenever a view is opened, closed, or focus changes.
     */
    updateTabs(views: Map<string, { view: CubeView; container: HTMLElement }>): void {
        this.tabBarEl.innerHTML = '';
        const activeId = this.getActiveViewId();

        for (const [viewType] of views) {
            const tab = document.createElement('button');
            tab.className = this.styles['tab-item'] ?? 'tab-item';
            tab.textContent = getViewTitle(viewType);
            tab.dataset.viewType = viewType;
            tab.setAttribute('aria-selected', viewType === activeId ? 'true' : 'false');

            if (viewType === activeId) {
                tab.classList.add(this.styles['tab-item--active'] ?? 'tab-item--active');
            }

            tab.addEventListener('click', () => this.onTabClick(viewType));
            this.tabBarEl.appendChild(tab);
        }
    }
}
