// Command Renderer - Handles rendering of commands and command groups
import { logger } from '@/diagnostics/logger';
import { detectOS, isTouchDevice } from '@/global';
import { COMMANDS_ICONS, isolateSvgIds } from '@/icons';
import { Command, CommandCategory, GroupLayout, KeyBinding } from '@/types';

/**
 * Manages a single shared long-press tooltip for touch devices.
 * After the user holds a button for 500 ms the tooltip appears above (or below)
 * the button and disappears immediately on lift, move, or cancel.
 */
class TouchTooltipManager {
    private static tooltipEl: HTMLElement | null = null;
    private static timerId: ReturnType<typeof setTimeout> | null = null;
    private static readonly DELAY_MS = 500;

    private static getOrCreateTooltip(): HTMLElement {
        if (!this.tooltipEl) {
            this.tooltipEl = document.createElement('div');
            this.tooltipEl.className = 'touch-tooltip';
            this.tooltipEl.setAttribute('role', 'tooltip');
            this.tooltipEl.setAttribute('aria-live', 'polite');
            document.body.appendChild(this.tooltipEl);
        }
        return this.tooltipEl;
    }

    private static show(text: string, rect: DOMRect): void {
        const el = this.getOrCreateTooltip();
        el.textContent = text;
        // Place off-screen first so we can measure the rendered size
        el.style.left = '-9999px';
        el.style.top = '-9999px';
        el.classList.add('touch-tooltip--visible');

        requestAnimationFrame(() => {
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            const vw = window.innerWidth;

            // Horizontally centre on the button, clamped within the viewport
            let left = rect.left + rect.width / 2 - w / 2;
            left = Math.max(8, Math.min(left, vw - w - 8));

            // Prefer above the button; fall back to below when near the top edge
            let top = rect.top - h - 8;
            if (top < 8) top = rect.bottom + 8;

            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
        });
    }

    static hide(): void {
        if (this.timerId !== null) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        this.tooltipEl?.classList.remove('touch-tooltip--visible');
    }

    static attachToButton(button: HTMLButtonElement, text: string): void {
        if (!text || typeof document === 'undefined') return;

        button.addEventListener(
            'touchstart',
            () => {
                this.hide();
                this.timerId = setTimeout(() => {
                    this.show(text, button.getBoundingClientRect());
                }, this.DELAY_MS);
            },
            { passive: true }
        );
        button.addEventListener('touchend', () => this.hide(), { passive: true });
        button.addEventListener('touchmove', () => this.hide(), { passive: true });
        button.addEventListener('touchcancel', () => this.hide(), { passive: true });
    }
}

/**
 * Handles rendering of command buttons and command groups into the UI
 */
export class CommandRenderer {
    /**
     * CSS module styles for view manager
     */
    private styles: Record<string, string>;

    /**
     * Button styles from CSS module
     */
    private buttonStyles: Record<string, string>;

    /**
     * Tracks per-header ResizeObservers used to switch between inline/compact header command layouts.
     */
    private headerLayoutObservers = new WeakMap<HTMLElement, ResizeObserver>();

    /**
     * Creates a new CommandRenderer instance
     * @param styles - CSS module styles for view manager
     * @param buttonStyles - Button styles from CSS module
     */
    constructor(styles: Record<string, string>, buttonStyles: Record<string, string>) {
        this.styles = styles;
        this.buttonStyles = buttonStyles;
    }

    /**
     * Formats a key binding into a human-readable string
     * @param binding - The key binding to format
     * @returns Formatted string representation of the key binding
     */
    formatKeyBinding(binding: KeyBinding): string {
        const parts: string[] = [];

        if (binding.ctrlKey) parts.push('Ctrl');
        if (binding.altKey) parts.push('Alt');
        if (binding.shiftKey) parts.push('Shift');
        // Cmd for Mac, Win for Windows, but Cmd is more common.
        if (binding.metaKey) detectOS() === 'macOS' ? parts.push('Cmd') : parts.push('Win');

        // Format the main key
        let key = binding.key;

        // Handle whitespace keys
        if (key === ' ') {
            key = 'Space';
        }
        // Handle named keys - capitalize first letter
        else if (key.length > 1) {
            key = key.charAt(0).toUpperCase() + key.slice(1);
        }
        // Handle single character keys - uppercase
        else {
            key = key.toUpperCase();
        }

        parts.push(key);

        return parts.join('+');
    }

    /**
     * Build class names using CSS module mappings when available and fall back to base class names.
     * Example: buildClassNames(['command-group', 'global-command-group'])
     * returns e.g. "module_commandGroup module_globalCommandGroup command-group global-command-group"
     */
    private buildClassNames(names: string[]): string {
        const classes: string[] = [];
        names.forEach(name => {
            if (this.styles && this.styles[name]) classes.push(this.styles[name]);
            classes.push(name);
        });
        return classes.join(' ');
    }

    /** Parses a group path string into its parent key and sub-label components. */
    private parseGroupPath(group: string): { parentKey: string; subLabel: string } {
        const segments = group
            .split('/')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        const dotIndex = segments.findIndex(s => s.startsWith('.'));
        const parentKey = (dotIndex === -1 ? segments : segments.slice(0, dotIndex)).join('/');
        const subLabel =
            dotIndex === -1
                ? ''
                : segments
                      .slice(dotIndex)
                      .map(s => (s.startsWith('.') ? s.slice(1) : s))
                      .join('/');
        return { parentKey, subLabel };
    }

    /** Returns a copy of commands sorted ascending by displayOrder (lower number = further left). */
    private sortByDisplayOrder(commands: Command[]): Command[] {
        return [...commands].sort((a, b) => (a.displayOrder ?? 100) - (b.displayOrder ?? 100));
    }

    /** Derives the group layout from the first command that declares one, falling back to 'flow'. */
    private resolveLayout(cmds: Command[]): GroupLayout {
        return cmds.find(c => c.groupLayout)?.groupLayout ?? 'flow';
    }

    /** Creates a command-group-buttons row div populated with the given commands. */
    private createButtonsRow(cmds: Command[]): HTMLElement {
        const layout = this.resolveLayout(cmds);
        const row = document.createElement('div');
        const layoutClass = `command-group-buttons--${layout}`;
        const allIcons = cmds.every(c => !!c.icon);
        const classes = ['command-group-buttons', layoutClass];
        if (!allIcons) classes.push('command-group-buttons--has-text');
        row.className = this.buildClassNames(classes);
        this.renderCommandButtons(row, cmds);
        return row;
    }

    /** Clears a container and renders the given commands into it as grouped global commands. */
    private renderCommandGroup(container: HTMLElement, commands: Command[]): void {
        container.innerHTML = '';
        const { parentMap, ungrouped } = this.groupCommands(commands);
        this.renderGroupedCommands(container, parentMap, ungrouped, true, commands, container);
    }

    /**
     * Groups commands by their group property into parent and sub maps
     * @param commands - Array of commands to group
     * @returns Object containing parentMap and ungrouped commands
     */
    groupCommands(commands: Command[]): {
        parentMap: Map<string, Map<string, Command[]>>;
        ungrouped: Command[];
    } {
        const parentMap = new Map<string, Map<string, Command[]>>();
        const ungrouped: Command[] = [];

        commands.forEach(cmd => {
            // Treat undefined group as '.'
            const group = cmd.group ?? '.';

            const { parentKey, subLabel } = this.parseGroupPath(group);
            const key = parentKey || '';
            if (!parentMap.has(key)) parentMap.set(key, new Map());
            const subMap = parentMap.get(key)!;
            if (!subMap.has(subLabel)) subMap.set(subLabel, []);
            subMap.get(subLabel)!.push(cmd);
        });

        return { parentMap, ungrouped };
    }

    /**
     * Builds the tooltip string for a command button.
     * Includes key bindings when not on a touch device.
     */
    private buildTooltip(cmd: Command): string {
        let tooltip = `${cmd.label}: ${cmd.tooltip || ''}`;
        if (!isTouchDevice() && cmd.keyBindings && cmd.keyBindings.length > 0) {
            const keyBindingText = cmd.keyBindings
                .map(binding => this.formatKeyBinding(binding))
                .join(' or ');
            tooltip += ` (${keyBindingText})`;
        }
        return tooltip.trim();
    }

    /**
     * Stamps data-cmd-id, disabled, aria-pressed, and the click sync handler onto a button.
     * All rendering paths call this after constructing button content and CSS classes.
     * When tooltipText is provided, also attaches long-press touch tooltip handlers.
     */
    private wireButton(button: HTMLButtonElement, cmd: Command, tooltipText?: string): void {
        button.setAttribute('data-cmd-id', cmd.id);
        if (cmd.isEnabled) button.disabled = !cmd.isEnabled();
        if (cmd.isActive) button.setAttribute('aria-pressed', String(cmd.isActive()));
        button.addEventListener('click', () => {
            cmd.action();
            // Sync all rendered instances of this command (controls panel, titlebar, etc.)
            document
                .querySelectorAll<HTMLButtonElement>(`[data-cmd-id="${cmd.id}"]`)
                .forEach(btn => {
                    if (cmd.isActive) btn.setAttribute('aria-pressed', String(cmd.isActive()));
                    if (cmd.isEnabled) btn.disabled = !cmd.isEnabled();
                });
        });
        if (tooltipText) TouchTooltipManager.attachToButton(button, tooltipText);
    }

    /** Creates a single command button element without appending it anywhere. */
    private createCommandButton(cmd: Command): HTMLButtonElement {
        const button = document.createElement('button');
        // Base classes (preserve ordering)
        button.className = `${this.buttonStyles['btn']} ${this.buttonStyles['btn-primary']}`;

        // Use icon SVG as button content if available, otherwise use label
        const iconMeta = cmd.icon ? COMMANDS_ICONS[cmd.icon] : null;
        if (iconMeta) {
            button.innerHTML = isolateSvgIds(iconMeta.svg);
            // Mark as icon button for styling
            button.classList.add(this.buttonStyles['btn-icon']);
            // Add helper class (defined in buttons.module.css)
            button.classList.add(this.buttonStyles['btn-has-svg']);

            // Add label overlay if labelPosition is specified
            // Command can override icon metadata labelPosition
            const labelPosition = cmd.labelPosition || iconMeta.labelPosition || 'none';
            if (labelPosition !== 'none') {
                const labelSpan = document.createElement('span');
                labelSpan.className = this.buttonStyles['btn-icon-label'];
                labelSpan.classList.add(this.buttonStyles[`btn-icon-label-${labelPosition}`]);
                labelSpan.textContent = cmd.label;
                button.appendChild(labelSpan);
            }
        } else {
            button.textContent = cmd.label;
        }

        // Accessibility and metadata
        if (cmd.label) button.setAttribute('aria-label', cmd.label);
        button.setAttribute('data-cmd', cmd.group || cmd.label || '');

        const tooltip = this.buildTooltip(cmd);
        if (tooltip) button.title = tooltip;

        this.wireButton(button, cmd, tooltip);
        return button;
    }

    /**
     * Renders command buttons into a container using the specified layout.
     *
     * - `'flow'` (default): buttons are appended directly; they size to their own content
     *   and wrap naturally.
     * - `'stack'`: each button is placed in its own full-width row via a column flex
     *   container on the parent. Best for descriptive labels.
     *
     * @param container - Container to append buttons to
     * @param commands - Commands to render
     */
    renderCommandButtons(container: HTMLElement, commands: Command[]): void {
        const sorted = this.sortByDisplayOrder(commands);
        sorted.forEach(cmd => container.appendChild(this.createCommandButton(cmd)));
    }

    /**
     * Renders grouped commands into a container
     * @param container - Container to render into
     * @param parentMap - Map of grouped commands
     * @param ungrouped - Ungrouped commands
     * @param isGlobal - Whether this is for global commands
     * @param commands - All commands (for fallback)
     * @param debugContainer - Optional container for debug attributes
     */
    renderGroupedCommands(
        container: HTMLElement,
        parentMap: Map<string, Map<string, Command[]>>,
        ungrouped: Command[],
        isGlobal: boolean,
        commands: Command[],
        debugContainer?: HTMLElement
    ): void {
        // Render ungrouped buttons first
        if (ungrouped.length > 0) {
            this.renderCommandButtons(container, ungrouped);
        }

        // If no groups but commands exist, render fallback group
        if (parentMap.size === 0 && commands.length > 0) {
            const fallback = document.createElement('div');
            fallback.className = this.buildClassNames(
                isGlobal ? ['command-group', 'global-command-group'] : ['command-group']
            );
            fallback.setAttribute('data-group', 'Misc');

            const header = document.createElement('div');
            header.className = this.buildClassNames(['command-group-header']);
            header.textContent = 'Misc';
            fallback.appendChild(header);

            fallback.appendChild(this.createButtonsRow(commands));
            container.appendChild(fallback);
        }

        // Debug attributes for global commands
        if (isGlobal && debugContainer) {
            const debugList = commands.map(cmd => {
                const { parentKey, subLabel } = this.parseGroupPath(cmd.group || '');
                return { group: cmd.group, parentKey, subLabel };
            });

            debugContainer.setAttribute('data-parent-debug', JSON.stringify(debugList));

            debugContainer.setAttribute(
                'data-parent-keys',
                JSON.stringify(Array.from(parentMap.keys()))
            );

            debugContainer.setAttribute(
                'data-cube-groups',
                JSON.stringify(commands.map(c => c.group))
            );
        }

        // Render parent groups
        parentMap.forEach((subMap, parentKey) => {
            const parentContainer = document.createElement('div');
            parentContainer.className = this.buildClassNames(
                isGlobal ? ['command-group', 'global-command-group'] : ['command-group']
            );
            parentContainer.setAttribute('data-group', parentKey);

            // Parent header
            if (parentKey) {
                const header = document.createElement('div');
                header.className = this.buildClassNames(['command-group-header']);
                header.textContent = parentKey.split('/').join(' / ');
                parentContainer.appendChild(header);
            }

            // Render subgroups
            subMap.forEach((cmds, subLabel) => {
                if (subLabel) {
                    const sub = document.createElement('div');
                    sub.className = this.buildClassNames(['command-subgroup']);
                    sub.setAttribute('data-subgroup', subLabel);
                    sub.appendChild(this.createButtonsRow(cmds));
                    parentContainer.appendChild(sub);
                } else {
                    parentContainer.appendChild(this.createButtonsRow(cmds));
                }
            });

            container.appendChild(parentContainer);
        });
    }

    /**
     * Renders global command buttons and view-specific action buttons
     * @param commandRegistry - Map of registered commands
     * @param activeViewId - ID of the currently active view
     */
    renderGlobalCommands(
        commandRegistry: Map<string, Command[]>,
        activeViewId: string | undefined
    ): void {
        // Render controller commands to controller-commands container (if exists)
        const controllerContainer = document.getElementById('controller-commands');
        if (controllerContainer) {
            const controllerCommands = commandRegistry.get('controller') || [];
            this.renderCommandGroup(
                controllerContainer,
                controllerCommands.filter(cmd => cmd.category === CommandCategory.CONTROLLER)
            );
        }

        // Render cube commands to global-move-commands container (if exists)
        const globalContainer = document.getElementById('global-move-commands');
        if (globalContainer) {
            const controllerCommands = commandRegistry.get('controller') || [];
            const cubeCommands = controllerCommands.filter(
                cmd => cmd.category === CommandCategory.CUBE
            );
            // Also include view-specific cube commands if there's an active view
            if (activeViewId) {
                cubeCommands.push(
                    ...(commandRegistry.get(activeViewId) || []).filter(
                        cmd => cmd.category === CommandCategory.CUBE
                    )
                );
            }
            this.renderCommandGroup(globalContainer, cubeCommands);
        }

        // Render view commands to view-actions container
        const viewActionsContainer = document.querySelector('#view-actions');
        if (!viewActionsContainer) {
            logger.warn('view-actions container not found');
            return;
        }

        // Narrow to HTMLElement for DOM manipulation
        const viewActionsEl = viewActionsContainer as HTMLElement;
        viewActionsEl.innerHTML = ''; // Clear existing

        if (!activeViewId) {
            viewActionsContainer.innerHTML = '<p>Select a view to see available actions</p>';
            return;
        }

        const commands = commandRegistry.get(activeViewId);
        if (!commands) {
            viewActionsContainer.innerHTML = '<p>No actions available for this view</p>';
            return;
        }

        const allCommands = commands.filter(cmd => cmd.category !== CommandCategory.CUBE);
        if (allCommands.length === 0) {
            viewActionsContainer.innerHTML = '<p>No actions available for this view</p>';
            return;
        }

        const sortedCommands = this.sortByDisplayOrder(allCommands);
        const { parentMap, ungrouped } = this.groupCommands(sortedCommands);
        this.renderGroupedCommands(viewActionsEl, parentMap, ungrouped, false, sortedCommands);

        // Mark view actions as rendered so tests can validate the render pass
        viewActionsEl.setAttribute('data-rendered', '1');
    }

    /**
     * Updates the command buttons in a view's header
     * @param viewId - The ID of the view to update
     * @param container - The view container element
     * @param commandRegistry - Map of registered commands
     */
    updateViewHeaderCommands(
        viewId: string,
        container: HTMLElement,
        commandRegistry: Map<string, Command[]>
    ): void {
        const header = container.querySelector(`[data-view-header]`);
        if (!header) return;

        // Clear existing command buttons container
        const existingContainer = header.querySelector(`[data-view-commands-container]`);
        if (existingContainer) {
            existingContainer.remove();
        }

        const commands = commandRegistry.get(viewId);
        if (!commands) return;

        const viewCommands = commands.filter(
            cmd => cmd.category === 'view' && cmd.showInHeader === true
        );
        if (viewCommands.length === 0) return;

        const sortedCommands = this.sortByDisplayOrder(viewCommands);

        // Create container for header command controls
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = this.styles['view-commands-container'];
        buttonsContainer.setAttribute('data-view-commands-container', '');

        const inlineRail = document.createElement('div');
        inlineRail.className = this.styles['view-commands-inline'] || 'view-commands-inline';
        inlineRail.setAttribute('data-view-commands-inline', '');

        const toggleButton = document.createElement('span');
        toggleButton.className = this.styles['view-commands-toggle'];
        toggleButton.textContent = '⋯';
        toggleButton.setAttribute('role', 'button');
        toggleButton.setAttribute('tabindex', '0');
        toggleButton.setAttribute('aria-label', 'Toggle header commands');
        toggleButton.setAttribute('aria-expanded', 'false');
        toggleButton.setAttribute('title', 'Show header commands');

        const overflowDropdown = document.createElement('div');
        overflowDropdown.className =
            this.styles['view-commands-overflow'] || 'view-commands-overflow';
        overflowDropdown.setAttribute('data-view-commands-overflow', '');

        sortedCommands.forEach((cmd, index) => {
            const button = document.createElement('button');
            button.className = this.styles['view-command-btn'];
            button.textContent = cmd.icon || cmd.label;
            button.dataset.cmdOrder = String(index);
            button.dataset.overflowPriority = String(
                cmd.overflowPriority ?? cmd.displayOrder ?? 100
            );
            const tooltip = this.buildTooltip(cmd);
            if (tooltip) button.title = tooltip;
            this.wireButton(button, cmd, tooltip);
            inlineRail.appendChild(button);
        });

        buttonsContainer.appendChild(toggleButton);
        buttonsContainer.appendChild(inlineRail);
        buttonsContainer.appendChild(overflowDropdown);

        header.appendChild(buttonsContainer);

        const titleElement = header.querySelector<HTMLElement>('[data-view-title]');
        this.configureHeaderCommandLayout(
            header as HTMLElement,
            titleElement,
            buttonsContainer,
            inlineRail,
            overflowDropdown
        );
    }

    /**
     * Distributes header command buttons between the inline rail and the overflow dropdown.
     * Buttons are shown inline as long as they fit; any that don't fit are moved to the
     * overflow dropdown behind the ⋯ toggle. The toggle is only shown when there is overflow.
     */
    private configureHeaderCommandLayout(
        header: HTMLElement,
        titleElement: HTMLElement | null,
        buttonsContainer: HTMLElement,
        inlineRail: HTMLElement,
        overflowDropdown: HTMLElement
    ): void {
        const hasOverflowClass = this.styles['view-commands-container--has-overflow'];
        const expandedClass = this.styles['view-commands-container--expanded'];
        const btnClass = this.styles['view-command-btn'];
        const toggleButton = buttonsContainer.querySelector<HTMLElement>(
            `.${this.styles['view-commands-toggle']}`
        );
        if (!toggleButton || !hasOverflowClass || !expandedClass) return;

        const setExpanded = (expanded: boolean): void => {
            buttonsContainer.classList.toggle(expandedClass, expanded);
            toggleButton.setAttribute('aria-expanded', String(expanded));
            toggleButton.setAttribute(
                'title',
                expanded ? 'Hide header commands' : 'Show header commands'
            );
        };

        toggleButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded(toggleButton.getAttribute('aria-expanded') !== 'true');
        });

        toggleButton.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleButton.click();
        });

        toggleButton.addEventListener('pointerdown', event => event.stopPropagation());

        const applyLayout = (): void => {
            const headerWidth = header.clientWidth;

            // JSDOM reports zero-sized layout boxes — keep everything inline.
            if (headerWidth <= 0) {
                [...overflowDropdown.querySelectorAll<HTMLElement>(`.${btnClass}`)].forEach(btn =>
                    inlineRail.appendChild(btn)
                );
                buttonsContainer.classList.remove(hasOverflowClass);
                setExpanded(false);
                return;
            }

            // Collect every button from both containers and restore original order.
            const allButtons = [
                ...inlineRail.querySelectorAll<HTMLElement>(`.${btnClass}`),
                ...overflowDropdown.querySelectorAll<HTMLElement>(`.${btnClass}`),
            ].sort((a, b) => Number(a.dataset.cmdOrder ?? 0) - Number(b.dataset.cmdOrder ?? 0));
            if (allButtons.length === 0) return;

            // Move everything into the inline rail so we can measure natural widths.
            allButtons.forEach(btn => inlineRail.appendChild(btn));

            // Measure each button and the gap used by the flex container.
            const railStyles = getComputedStyle(inlineRail);
            const gap = Number.parseFloat(railStyles.columnGap || railStyles.gap || '0') || 8;

            const widths = allButtons.map(btn => {
                const r = btn.getBoundingClientRect();
                return r.width > 0 ? r.width : btn.offsetWidth;
            });

            const isTabbedMode = !!header.closest(`.${this.styles['view-panel--tabbed']}`);
            // In tabbed mode the title is hidden, so reserve no space for it.
            const titleReserve = isTabbedMode ? 0 : 130;
            const containerPadding = 24;
            const toggleReserve = 52; // toggle width + one gap

            const totalAvailable = Math.max(0, headerWidth - titleReserve - containerPadding);

            const totalNeeded =
                widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, allButtons.length - 1);

            if (totalNeeded <= totalAvailable) {
                // Everything fits — no overflow needed.
                buttonsContainer.classList.remove(hasOverflowClass);
                setExpanded(false);
                titleElement?.removeAttribute('title');
                return;
            }

            // Determine which buttons survive overflow using overflowPriority.
            // Higher overflowPriority values survive longer. Buttons are greedily
            // included by descending overflowPriority until space runs out, then
            // placed back in display order (cmdOrder) for rendering.
            const availableForInline = Math.max(0, totalAvailable - toggleReserve);

            // Build an index array sorted by overflowPriority descending (highest survives).
            // Tiebreak by index descending so buttons at the same priority level
            // overflow in a stable, predictable order (leftmost overflows first).
            const byOverflow = allButtons
                .map((btn, i) => ({
                    index: i,
                    width: widths[i],
                    overflowPriority: Number(btn.dataset.overflowPriority ?? 0),
                }))
                .sort((a, b) => b.overflowPriority - a.overflowPriority || b.index - a.index);

            const inlineSet = new Set<number>();
            let used = 0;

            for (const entry of byOverflow) {
                const cost = (inlineSet.size === 0 ? 0 : gap) + entry.width;
                if (used + cost > availableForInline) break;
                used += cost;
                inlineSet.add(entry.index);
            }

            // Distribute buttons maintaining display order (cmdOrder).
            allButtons.forEach((btn, i) => {
                if (inlineSet.has(i)) {
                    inlineRail.appendChild(btn);
                } else {
                    overflowDropdown.appendChild(btn);
                }
            });

            const overflowCount = allButtons.length - inlineSet.size;

            if (overflowCount > 0) {
                buttonsContainer.classList.add(hasOverflowClass);
                titleElement?.setAttribute('title', titleElement.textContent ?? '');
            } else {
                buttonsContainer.classList.remove(hasOverflowClass);
                setExpanded(false);
            }
        };

        const existingObserver = this.headerLayoutObservers.get(header);
        existingObserver?.disconnect();

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => applyLayout());
            observer.observe(header);
            this.headerLayoutObservers.set(header, observer);
        }

        applyLayout();
    }

    /**
     * Updates disabled/aria-pressed state on all rendered command buttons in-place.
     * Call after any state change to keep buttons in sync without a full re-render.
     * @param commandRegistry - Map of registered commands
     */
    refreshCommandStates(commandRegistry: Map<string, Command[]>): void {
        // Build a flat id → Command lookup from all registered commands
        const byId = new Map<string, Command>();
        for (const commands of commandRegistry.values()) {
            for (const cmd of commands) {
                byId.set(cmd.id, cmd);
            }
        }

        const buttons = document.querySelectorAll<HTMLButtonElement>('[data-cmd-id]');
        buttons.forEach(button => {
            const id = button.getAttribute('data-cmd-id');
            if (!id) return;
            const cmd = byId.get(id);
            if (!cmd) return;

            if (cmd.isEnabled) button.disabled = !cmd.isEnabled();
            if (cmd.isActive) button.setAttribute('aria-pressed', String(cmd.isActive()));
        });
    }
}
