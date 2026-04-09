import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Command, CommandCategory } from '@/types';

import { CommandRenderer } from './command-renderer';

// Mock the icon imports
vi.mock('@/icons', () => ({
    COMMANDS_ICONS: {
        'test-icon': {
            svg: '<svg>test</svg>',
            labelPosition: 'bottom',
        },
    },
    isolateSvgIds: (svg: string) => svg,
}));

// Mock detectOS
vi.mock('@/global', () => ({
    detectOS: vi.fn(() => 'macOS'),
    isTouchDevice: vi.fn(() => false),
}));

describe('CommandRenderer', () => {
    let renderer: CommandRenderer;
    let styles: Record<string, string>;
    let buttonStyles: Record<string, string>;

    beforeEach(() => {
        styles = {
            'command-group': 'module_commandGroup',
            'global-command-group': 'module_globalCommandGroup',
            'command-group-header': 'module_commandGroupHeader',
            'command-group-buttons': 'module_commandGroupButtons',
            'command-subgroup': 'module_commandSubgroup',
            'view-commands-container': 'module_viewCommandsContainer',
            'view-command-btn': 'module_viewCommandBtn',
        };
        buttonStyles = {
            btn: 'btn',
            'btn-primary': 'btn-primary',
            'btn-icon': 'btn-icon',
            'btn-has-svg': 'btn-has-svg',
            'btn-icon-label': 'btn-icon-label',
            'btn-icon-label-bottom': 'btn-icon-label-bottom',
        };
        renderer = new CommandRenderer(styles, buttonStyles);
    });

    describe('formatKeyBinding', () => {
        it('should format a simple key', () => {
            // Arrange
            const binding = { key: 'a' };

            // Act
            const formatted = renderer.formatKeyBinding(binding);

            // Assert
            expect(formatted).toBe('A');
        });

        it('should format a key with Ctrl modifier', () => {
            // Arrange
            const binding = { key: 's', ctrlKey: true };

            // Act
            const formatted = renderer.formatKeyBinding(binding);

            // Assert
            expect(formatted).toBe('Ctrl+S');
        });

        it('should format a key with multiple modifiers', () => {
            // Arrange
            const binding = { key: 'z', ctrlKey: true, shiftKey: true };

            // Act
            const formatted = renderer.formatKeyBinding(binding);

            // Assert
            expect(formatted).toBe('Ctrl+Shift+Z');
        });

        it('should format space key', () => {
            // Arrange
            const binding = { key: ' ' };

            // Act
            const formatted = renderer.formatKeyBinding(binding);

            // Assert
            expect(formatted).toBe('Space');
        });

        it('should format named keys with capitalization', () => {
            // Arrange
            const binding = { key: 'enter' };

            // Act
            const formatted = renderer.formatKeyBinding(binding);

            // Assert
            expect(formatted).toBe('Enter');
        });

        it('should format Meta key as Cmd on macOS', () => {
            // Arrange
            const binding = { key: 'a', metaKey: true };

            // Act
            const formatted = renderer.formatKeyBinding(binding);

            // Assert
            expect(formatted).toBe('Cmd+A');
        });

        it('should format all modifiers', () => {
            // Arrange
            const binding = {
                key: 'a',
                ctrlKey: true,
                altKey: true,
                shiftKey: true,
                metaKey: true,
            };

            // Act
            const formatted = renderer.formatKeyBinding(binding);

            // Assert
            expect(formatted).toBe('Ctrl+Alt+Shift+Cmd+A');
        });
    });

    describe('groupCommands', () => {
        it('should group commands by parent key', () => {
            // Arrange
            const commands: Command[] = [
                {
                    id: 'cmd1',
                    label: 'Cmd1',
                    action: () => {},
                    group: 'Group1',
                    category: CommandCategory.CUBE,
                },
                {
                    id: 'cmd2',
                    label: 'Cmd2',
                    action: () => {},
                    group: 'Group1',
                    category: CommandCategory.CUBE,
                },
                {
                    id: 'cmd3',
                    label: 'Cmd3',
                    action: () => {},
                    group: 'Group2',
                    category: CommandCategory.CUBE,
                },
            ];

            // Act
            const { parentMap, ungrouped } = renderer.groupCommands(commands);

            // Assert
            expect(ungrouped.length).toBe(0);
            expect(parentMap.size).toBe(2);
            expect(parentMap.get('Group1')?.get('')?.length).toBe(2);
            expect(parentMap.get('Group2')?.get('')?.length).toBe(1);
        });

        it('should handle subgroups with dot notation', () => {
            const commands: Command[] = [
                {
                    id: 'cmd1',
                    label: 'Cmd1',
                    action: () => {},
                    group: 'Group1/.SubGroup1',
                    category: CommandCategory.CUBE,
                },
                {
                    id: 'cmd2',
                    label: 'Cmd2',
                    action: () => {},
                    group: 'Group1/.SubGroup2',
                    category: CommandCategory.CUBE,
                },
            ];

            const { parentMap } = renderer.groupCommands(commands);

            expect(parentMap.get('Group1')?.size).toBe(2);
            expect(parentMap.get('Group1')?.get('SubGroup1')?.length).toBe(1);
            expect(parentMap.get('Group1')?.get('SubGroup2')?.length).toBe(1);
        });

        it('should handle commands without groups', () => {
            const commands: Command[] = [
                {
                    id: 'cmd1',
                    label: 'Cmd1',
                    action: () => {},
                    category: CommandCategory.CUBE,
                },
            ];

            const { parentMap } = renderer.groupCommands(commands);

            expect(parentMap.get('')?.get('')?.length).toBe(1);
        });

        it('should handle nested group paths', () => {
            const commands: Command[] = [
                {
                    id: 'cmd1',
                    label: 'Cmd1',
                    action: () => {},
                    group: 'Parent/Child/.SubGroup',
                    category: CommandCategory.CUBE,
                },
            ];

            const { parentMap } = renderer.groupCommands(commands);

            expect(parentMap.get('Parent/Child')?.get('SubGroup')?.length).toBe(1);
        });
    });

    describe('renderCommandButtons', () => {
        let container: HTMLElement;

        beforeEach(() => {
            container = document.createElement('div');
        });

        it('should render command buttons', () => {
            // Arrange
            const commands: Command[] = [
                {
                    id: 'test-cmd',
                    label: 'Test Command',
                    action: vi.fn(),
                    tooltip: 'Test tooltip',
                    category: CommandCategory.CUBE,
                },
            ];

            // Act
            renderer.renderCommandButtons(container, commands);

            // Assert
            const buttons = container.querySelectorAll('button');
            expect(buttons.length).toBe(1);
            expect(buttons[0].textContent).toBe('Test Command');
            expect(buttons[0].className).toContain('btn');
            expect(buttons[0].className).toContain('btn-primary');
        });

        it('should render buttons with icons', () => {
            const commands: Command[] = [
                {
                    id: 'icon-cmd',
                    label: 'Icon Command',
                    icon: 'test-icon',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                },
            ];

            renderer.renderCommandButtons(container, commands);

            const button = container.querySelector('button');
            expect(button?.innerHTML).toContain('<svg>test</svg>');
            expect(button?.className).toContain('btn-icon');
        });

        it('should render icon with label overlay when labelPosition is set', () => {
            const commands: Command[] = [
                {
                    id: 'icon-label-cmd',
                    label: 'Icon with Label',
                    icon: 'test-icon',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                },
            ];

            renderer.renderCommandButtons(container, commands);

            const button = container.querySelector('button');
            const labelSpan = button?.querySelector('span');
            expect(labelSpan?.textContent).toBe('Icon with Label');
            expect(labelSpan?.className).toContain('btn-icon-label-bottom');
        });

        it('should sort commands by priority', () => {
            const commands: Command[] = [
                {
                    id: 'low-priority',
                    label: 'Low Priority',
                    action: vi.fn(),
                    priority: 200,
                    category: CommandCategory.CUBE,
                },
                {
                    id: 'high-priority',
                    label: 'High Priority',
                    action: vi.fn(),
                    priority: 50,
                    category: CommandCategory.CUBE,
                },
                {
                    id: 'medium-priority',
                    label: 'Medium Priority',
                    action: vi.fn(),
                    priority: 100,
                    category: CommandCategory.CUBE,
                },
            ];

            renderer.renderCommandButtons(container, commands);

            const buttons = container.querySelectorAll('button');
            expect(buttons[0].textContent).toBe('High Priority');
            expect(buttons[1].textContent).toBe('Medium Priority');
            expect(buttons[2].textContent).toBe('Low Priority');
        });

        it('should add tooltip with key bindings', () => {
            const commands: Command[] = [
                {
                    id: 'tooltip-cmd',
                    label: 'Command',
                    action: vi.fn(),
                    tooltip: 'Does something',
                    keyBindings: [{ key: 'a', ctrlKey: true }],
                    category: CommandCategory.CUBE,
                },
            ];

            renderer.renderCommandButtons(container, commands);

            const button = container.querySelector('button');
            expect(button?.title).toContain('Command: Does something');
            expect(button?.title).toContain('(Ctrl+A)');
        });

        it('should call action when button is clicked', () => {
            // Arrange
            const action = vi.fn();
            const commands: Command[] = [
                {
                    id: 'click-cmd',
                    label: 'Command',
                    action,
                    category: CommandCategory.CUBE,
                },
            ];
            renderer.renderCommandButtons(container, commands);
            const button = container.querySelector('button');

            // Act
            button?.click();

            // Assert
            expect(action).toHaveBeenCalledTimes(1);
        });

        it('should stamp data-cmd-id on each button', () => {
            const commands: Command[] = [
                { id: 'cmd-a', label: 'A', action: vi.fn(), category: CommandCategory.CUBE },
                { id: 'cmd-b', label: 'B', action: vi.fn(), category: CommandCategory.CUBE },
            ];
            renderer.renderCommandButtons(container, commands);
            const buttons = container.querySelectorAll<HTMLButtonElement>('[data-cmd-id]');
            expect(buttons.length).toBe(2);
            const ids = Array.from(buttons).map(b => b.getAttribute('data-cmd-id'));
            expect(ids).toContain('cmd-a');
            expect(ids).toContain('cmd-b');
        });

        it('should disable button when isEnabled returns false', () => {
            const commands: Command[] = [
                {
                    id: 'disabled-cmd',
                    label: 'Disabled',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                    isEnabled: () => false,
                },
            ];
            renderer.renderCommandButtons(container, commands);
            const button = container.querySelector<HTMLButtonElement>('button');
            expect(button?.disabled).toBe(true);
        });

        it('should enable button when isEnabled returns true', () => {
            const commands: Command[] = [
                {
                    id: 'enabled-cmd',
                    label: 'Enabled',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                    isEnabled: () => true,
                },
            ];
            renderer.renderCommandButtons(container, commands);
            const button = container.querySelector<HTMLButtonElement>('button');
            expect(button?.disabled).toBe(false);
        });

        it('should not set disabled when isEnabled is absent', () => {
            const commands: Command[] = [
                {
                    id: 'no-enable',
                    label: 'No Enable',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                },
            ];
            renderer.renderCommandButtons(container, commands);
            const button = container.querySelector<HTMLButtonElement>('button');
            expect(button?.disabled).toBe(false);
        });

        it('should set aria-pressed at render time for isActive commands', () => {
            const commands: Command[] = [
                {
                    id: 'toggle-render',
                    label: 'Toggle',
                    action: vi.fn(),
                    category: CommandCategory.VIEW,
                    isActive: () => true,
                },
            ];
            renderer.renderCommandButtons(container, commands);
            const button = container.querySelector<HTMLButtonElement>('button');
            expect(button?.getAttribute('aria-pressed')).toBe('true');
        });

        it('should sync all instances of the same command on click', () => {
            document.body.appendChild(container);
            // Second container simulates titlebar rendering the same command
            const container2 = document.createElement('div');
            document.body.appendChild(container2);

            let active = false;
            const cmd: Command = {
                id: 'shared-toggle',
                label: 'Toggle',
                action: () => {
                    active = !active;
                },
                category: CommandCategory.VIEW,
                isActive: () => active,
            };
            renderer.renderCommandButtons(container, [cmd]);
            renderer.renderCommandButtons(container2, [{ ...cmd }]);

            const btn1 = container.querySelector<HTMLButtonElement>(
                '[data-cmd-id="shared-toggle"]'
            )!;
            const btn2 = container2.querySelector<HTMLButtonElement>(
                '[data-cmd-id="shared-toggle"]'
            )!;

            expect(btn1.getAttribute('aria-pressed')).toBe('false');
            expect(btn2.getAttribute('aria-pressed')).toBe('false');

            // Click button in container1 — both should update
            btn1.click();
            expect(btn1.getAttribute('aria-pressed')).toBe('true');
            expect(btn2.getAttribute('aria-pressed')).toBe('true');

            document.body.removeChild(container);
            document.body.removeChild(container2);
        });
    });

    describe('refreshCommandStates', () => {
        it('should update disabled state in-place', () => {
            // Arrange
            const container = document.createElement('div');
            document.body.appendChild(container);
            let enabled = true;
            const commands: Command[] = [
                {
                    id: 'refresh-cmd',
                    label: 'Refresh',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                    isEnabled: () => enabled,
                },
            ];
            renderer.renderCommandButtons(container, commands);
            const button = container.querySelector<HTMLButtonElement>(
                '[data-cmd-id="refresh-cmd"]'
            )!;
            expect(button.disabled).toBe(false);

            // Act & Assert
            enabled = false;
            const registry = new Map([['ctrl', commands]]);
            renderer.refreshCommandStates(registry);
            expect(button.disabled).toBe(true);

            enabled = true;
            renderer.refreshCommandStates(registry);
            expect(button.disabled).toBe(false);

            document.body.removeChild(container);
        });

        it('should update aria-pressed in-place', () => {
            const container = document.createElement('div');
            document.body.appendChild(container);
            let active = false;
            const commands: Command[] = [
                {
                    id: 'toggle-cmd',
                    label: 'Toggle',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                    isActive: () => active,
                },
            ];
            renderer.renderCommandButtons(container, commands);
            const button = container.querySelector<HTMLButtonElement>(
                '[data-cmd-id="toggle-cmd"]'
            )!;

            active = true;
            const registry = new Map([['ctrl', commands]]);
            renderer.refreshCommandStates(registry);
            expect(button.getAttribute('aria-pressed')).toBe('true');

            document.body.removeChild(container);
        });
    });

    describe('renderGroupedCommands', () => {
        let container: HTMLElement;

        beforeEach(() => {
            container = document.createElement('div');
        });

        it('should render ungrouped commands', () => {
            const ungrouped: Command[] = [
                {
                    id: 'ungrouped',
                    label: 'Ungrouped',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                },
            ];

            // Create a non-empty parent map to avoid fallback group creation
            const parentMap = new Map([
                [
                    'Group1',
                    new Map([
                        [
                            '',
                            [
                                {
                                    id: 'grouped',
                                    label: 'Grouped',
                                    action: vi.fn(),
                                    category: CommandCategory.CUBE,
                                },
                            ],
                        ],
                    ]),
                ],
            ]);

            renderer.renderGroupedCommands(container, parentMap, ungrouped, false, []);

            // Should have 2 buttons: 1 ungrouped + 1 in the group
            const buttons = container.querySelectorAll('button');
            expect(buttons.length).toBe(2);
            // First button should be the ungrouped one (rendered first)
            expect(buttons[0].textContent).toBe('Ungrouped');
        });

        it('should render fallback group when no groups exist', () => {
            const commands: Command[] = [
                {
                    id: 'fallback-cmd',
                    label: 'Command',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                },
            ];

            renderer.renderGroupedCommands(container, new Map(), [], false, commands);

            const group = container.querySelector('[data-group="Misc"]');
            expect(group).toBeTruthy();
            expect(group?.querySelector('.command-group-header')?.textContent).toBe('Misc');
        });

        it('should render parent groups with headers', () => {
            const parentMap = new Map([
                [
                    'Group1',
                    new Map([
                        [
                            '',
                            [
                                {
                                    id: 'group-cmd',
                                    label: 'Cmd1',
                                    action: vi.fn(),
                                    category: CommandCategory.CUBE,
                                },
                            ],
                        ],
                    ]),
                ],
            ]);

            renderer.renderGroupedCommands(container, parentMap, [], false, []);

            const group = container.querySelector('[data-group="Group1"]');
            expect(group).toBeTruthy();
            expect(group?.querySelector('.command-group-header')?.textContent).toBe('Group1');
        });

        it('should render subgroups', () => {
            const parentMap = new Map([
                [
                    'Parent',
                    new Map([
                        [
                            'SubGroup',
                            [
                                {
                                    id: 'subgroup-cmd',
                                    label: 'Cmd1',
                                    action: vi.fn(),
                                    category: CommandCategory.CUBE,
                                },
                            ],
                        ],
                    ]),
                ],
            ]);

            renderer.renderGroupedCommands(container, parentMap, [], false, []);

            const subgroup = container.querySelector('[data-subgroup="SubGroup"]');
            expect(subgroup).toBeTruthy();
        });

        it('should add debug attributes for global commands', () => {
            const commands: Command[] = [
                {
                    id: 'debug-cmd',
                    label: 'Cmd1',
                    action: vi.fn(),
                    group: 'Group1',
                    category: CommandCategory.CUBE,
                },
            ];

            renderer.renderGroupedCommands(container, new Map(), [], true, commands, container);

            expect(container.getAttribute('data-parent-debug')).toBeTruthy();
            expect(container.getAttribute('data-parent-keys')).toBeTruthy();
            expect(container.getAttribute('data-cube-groups')).toBeTruthy();
        });

        it('should apply global command classes when isGlobal is true', () => {
            const commands: Command[] = [
                {
                    id: 'global-class-cmd',
                    label: 'Cmd1',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                },
            ];

            renderer.renderGroupedCommands(container, new Map(), [], true, commands);

            const group = container.querySelector('[data-group="Misc"]');
            expect(group?.className).toContain('global-command-group');
        });
    });

    describe('renderGlobalCommands', () => {
        let commandRegistry: Map<string, Command[]>;

        beforeEach(() => {
            // Set up DOM elements
            document.body.innerHTML = `
                <div id="controller-commands"></div>
                <div id="global-move-commands"></div>
                <div id="view-actions"></div>
            `;

            commandRegistry = new Map();
        });

        it('should render controller commands', () => {
            // Arrange
            commandRegistry.set('controller', [
                {
                    id: 'controller-cmd',
                    label: 'Controller Cmd',
                    action: vi.fn(),
                    category: CommandCategory.CONTROLLER,
                },
            ]);

            // Act
            renderer.renderGlobalCommands(commandRegistry, undefined);

            // Assert
            const container = document.getElementById('controller-commands');
            expect(container?.querySelector('button')).toBeTruthy();
        });

        it('should render cube commands', () => {
            commandRegistry.set('controller', [
                {
                    id: 'cube-cmd2',
                    label: 'Cube Cmd',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                },
            ]);

            renderer.renderGlobalCommands(commandRegistry, undefined);

            const container = document.getElementById('global-move-commands');
            expect(container?.querySelector('button')).toBeTruthy();
        });

        it('should include view commands in cube commands section', () => {
            commandRegistry.set('controller', [
                {
                    id: 'controller-cube-cmd',
                    label: 'Controller Cube Cmd',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                },
            ]);
            commandRegistry.set('view1', [
                {
                    id: 'view-cube-cmd',
                    label: 'View Cube Cmd',
                    action: vi.fn(),
                    category: CommandCategory.CUBE,
                },
            ]);

            renderer.renderGlobalCommands(commandRegistry, 'view1');

            const container = document.getElementById('global-move-commands');
            const buttons = container?.querySelectorAll('button');
            expect(buttons?.length).toBe(2);
        });

        it('should render view actions for active view', () => {
            commandRegistry.set('view1', [
                {
                    id: 'view-action',
                    label: 'View Action',
                    action: vi.fn(),
                    category: CommandCategory.VIEW,
                },
            ]);

            renderer.renderGlobalCommands(commandRegistry, 'view1');

            const container = document.getElementById('view-actions');
            expect(container?.querySelector('button')).toBeTruthy();
            expect(container?.getAttribute('data-rendered')).toBe('1');
        });

        it('should show message when no active view', () => {
            renderer.renderGlobalCommands(commandRegistry, undefined);

            const container = document.getElementById('view-actions');
            expect(container?.innerHTML).toContain('Select a view to see available actions');
        });

        it('should show message when no view commands', () => {
            commandRegistry.set('view1', []);

            renderer.renderGlobalCommands(commandRegistry, 'view1');

            const container = document.getElementById('view-actions');
            expect(container?.innerHTML).toContain('No actions available for this view');
        });
    });

    describe('updateViewHeaderCommands', () => {
        let container: HTMLElement;
        let commandRegistry: Map<string, Command[]>;

        beforeEach(() => {
            container = document.createElement('div');
            container.innerHTML = '<div data-view-header></div>';
            commandRegistry = new Map();
        });

        it('should render header commands', () => {
            // Arrange
            commandRegistry.set('view1', [
                {
                    id: 'header-cmd2',
                    label: 'Header Cmd',
                    action: vi.fn(),
                    category: 'view',
                    showInHeader: true,
                },
            ]);

            // Act
            renderer.updateViewHeaderCommands('view1', container, commandRegistry);

            // Assert
            const headerContainer = container.querySelector('[data-view-commands-container]');
            expect(headerContainer).toBeTruthy();
            expect(headerContainer?.querySelector('button')).toBeTruthy();
        });

        it('should not render commands without showInHeader flag', () => {
            commandRegistry.set('view1', [
                {
                    id: 'not-header-cmd2',
                    label: 'Not Header Cmd',
                    action: vi.fn(),
                    category: 'view',
                    showInHeader: false,
                },
            ]);

            renderer.updateViewHeaderCommands('view1', container, commandRegistry);

            const headerContainer = container.querySelector('[data-view-commands-container]');
            expect(headerContainer).toBeNull();
        });

        it('should remove existing command container before rendering', () => {
            const header = container.querySelector('[data-view-header]');
            const existing = document.createElement('div');
            existing.setAttribute('data-view-commands-container', '');
            header?.appendChild(existing);

            commandRegistry.set('view1', [
                {
                    id: 'header-cmd-remove',
                    label: 'Header Cmd',
                    action: vi.fn(),
                    category: 'view',
                    showInHeader: true,
                },
            ]);

            renderer.updateViewHeaderCommands('view1', container, commandRegistry);

            const containers = container.querySelectorAll('[data-view-commands-container]');
            expect(containers.length).toBe(1);
        });

        it('should sort header commands by priority', () => {
            commandRegistry.set('view1', [
                {
                    id: 'low-priority2',
                    label: 'Low',
                    action: vi.fn(),
                    category: 'view',
                    showInHeader: true,
                    priority: 200,
                },
                {
                    id: 'high-priority2',
                    label: 'High',
                    action: vi.fn(),
                    category: 'view',
                    showInHeader: true,
                    priority: 50,
                },
            ]);

            renderer.updateViewHeaderCommands('view1', container, commandRegistry);

            const buttons = container.querySelectorAll('button');
            expect(buttons[0].textContent).toBe('High');
            expect(buttons[1].textContent).toBe('Low');
        });

        it('should handle missing header element', () => {
            container.innerHTML = '';

            commandRegistry.set('view1', [
                {
                    id: 'header-cmd4',
                    label: 'Header Cmd',
                    action: vi.fn(),
                    category: 'view',
                    showInHeader: true,
                },
            ]);

            // Should not throw
            expect(() => {
                renderer.updateViewHeaderCommands('view1', container, commandRegistry);
            }).not.toThrow();
        });
    });

    describe('configureHeaderCommandLayout (toggle button)', () => {
        let container: HTMLElement;
        let commandRegistry: Map<string, Command[]>;
        let overflowStyles: Record<string, string>;

        beforeEach(() => {
            // Include overflow-related CSS module keys so configureHeaderCommandLayout
            // doesn't early-return on missing style classes.
            overflowStyles = {
                ...styles,
                'view-commands-toggle': 'view-commands-toggle',
                'view-commands-inline': 'view-commands-inline',
                'view-commands-overflow': 'view-commands-overflow',
                'view-commands-container--has-overflow': 'has-overflow',
                'view-commands-container--expanded': 'expanded',
                'view-command-btn': 'view-command-btn',
            };

            container = document.createElement('div');
            container.innerHTML = '<div data-view-header><span data-view-title>Title</span></div>';
            document.body.appendChild(container);

            commandRegistry = new Map([
                [
                    'view1',
                    [
                        {
                            id: 'toggle-header-cmd',
                            label: 'Cmd',
                            action: vi.fn(),
                            category: 'view' as any,
                            showInHeader: true,
                        },
                    ],
                ],
            ]);
        });

        afterEach(() => {
            container.remove();
        });

        function buildRenderer(): CommandRenderer {
            return new CommandRenderer(overflowStyles, buttonStyles);
        }

        it('toggle button click expands / collapses overflow dropdown', () => {
            const r = buildRenderer();
            r.updateViewHeaderCommands('view1', container, commandRegistry);

            const toggleBtn = container.querySelector('.view-commands-toggle') as HTMLElement;
            expect(toggleBtn).not.toBeNull();
            expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

            // Click → expand
            toggleBtn.click();
            expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');

            // Click again → collapse
            toggleBtn.click();
            expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
        });

        it('toggle button Enter key triggers click', () => {
            const r = buildRenderer();
            r.updateViewHeaderCommands('view1', container, commandRegistry);

            const toggleBtn = container.querySelector('.view-commands-toggle') as HTMLElement;

            toggleBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
        });

        it('toggle button Space key triggers click', () => {
            const r = buildRenderer();
            r.updateViewHeaderCommands('view1', container, commandRegistry);

            const toggleBtn = container.querySelector('.view-commands-toggle') as HTMLElement;

            toggleBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
            expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
        });

        it('toggle button ignores non-Enter/Space keys', () => {
            const r = buildRenderer();
            r.updateViewHeaderCommands('view1', container, commandRegistry);

            const toggleBtn = container.querySelector('.view-commands-toggle') as HTMLElement;

            toggleBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
            expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
        });

        it('toggle button pointerdown stops propagation (does not throw)', () => {
            const r = buildRenderer();
            r.updateViewHeaderCommands('view1', container, commandRegistry);

            const toggleBtn = container.querySelector('.view-commands-toggle') as HTMLElement;
            expect(() => {
                toggleBtn.dispatchEvent(
                    new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
                );
            }).not.toThrow();
        });
    });

    describe('renderGlobalCommands – missing view-actions container', () => {
        it('logs warning when view-actions container is missing', () => {
            // Arrange: no view-actions in DOM
            document.body.innerHTML = `
                <div id="controller-commands"></div>
                <div id="global-move-commands"></div>
            `;

            // Should not throw
            expect(() => renderer.renderGlobalCommands(new Map(), undefined)).not.toThrow();
        });

        it('shows message when view has only CUBE commands (no VIEW category)', () => {
            document.body.innerHTML = `
                <div id="controller-commands"></div>
                <div id="global-move-commands"></div>
                <div id="view-actions"></div>
            `;

            const reg = new Map([
                [
                    'view1',
                    [
                        {
                            id: 'cube-only',
                            label: 'Cube',
                            action: vi.fn(),
                            category: CommandCategory.CUBE,
                        },
                    ],
                ],
            ]);

            renderer.renderGlobalCommands(reg, 'view1');

            const viewActions = document.getElementById('view-actions');
            expect(viewActions?.innerHTML).toContain('No actions available for this view');
        });
    });
});
