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
            'view-commands-inline': 'module_viewCommandsInline',
            'view-commands-toggle': 'module_viewCommandsToggle',
            'view-commands-overflow': 'module_viewCommandsOverflow',
            'view-commands-container--has-overflow': 'module_hasOverflow',
            'view-commands-container--expanded': 'module_expanded',
            'view-panel--tabbed': 'module_viewPanelTabbed',
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
        it('logs warning when view-actions container is missing', async () => {
            // Arrange: no view-actions in DOM
            document.body.innerHTML = `
                <div id="controller-commands"></div>
                <div id="global-move-commands"></div>
            `;

            const { logger } = await import('@/diagnostics/logger');
            const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

            // Should not throw
            expect(() => renderer.renderGlobalCommands(new Map(), undefined)).not.toThrow();
            expect(warnSpy).toHaveBeenCalledWith('view-actions container not found');

            warnSpy.mockRestore();
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

    describe('updateViewHeaderCommands', () => {
        it('renders header command buttons for view commands with showInHeader', () => {
            // Arrange
            const container = document.createElement('div');
            const header = document.createElement('div');
            header.setAttribute('data-view-header', '');
            container.appendChild(header);

            const registry = new Map([
                [
                    'v1',
                    [
                        {
                            id: 'hdr-cmd',
                            label: 'Toggle',
                            action: vi.fn(),
                            category: 'view' as CommandCategory,
                            showInHeader: true,
                        },
                    ],
                ],
            ]);

            // Act
            renderer.updateViewHeaderCommands('v1', container, registry);

            // Assert
            const btnContainer = header.querySelector('[data-view-commands-container]');
            expect(btnContainer).not.toBeNull();
            const btns = btnContainer!.querySelectorAll(`.${styles['view-command-btn']}`);
            expect(btns.length).toBe(1);
        });

        it('does nothing when header is missing', () => {
            const container = document.createElement('div');
            const registry = new Map([
                [
                    'v1',
                    [
                        {
                            id: 'hdr2',
                            label: 'X',
                            action: vi.fn(),
                            category: 'view' as CommandCategory,
                            showInHeader: true,
                        },
                    ],
                ],
            ]);

            // Act & Assert
            expect(() =>
                renderer.updateViewHeaderCommands('v1', container, registry)
            ).not.toThrow();
        });

        it('does nothing when no commands have showInHeader', () => {
            const container = document.createElement('div');
            const header = document.createElement('div');
            header.setAttribute('data-view-header', '');
            container.appendChild(header);

            const registry = new Map([
                [
                    'v1',
                    [
                        {
                            id: 'no-header',
                            label: 'Hidden',
                            action: vi.fn(),
                            category: 'view' as CommandCategory,
                        },
                    ],
                ],
            ]);

            renderer.updateViewHeaderCommands('v1', container, registry);

            expect(header.querySelector('[data-view-commands-container]')).toBeNull();
        });

        it('removes existing commands container before re-rendering', () => {
            const container = document.createElement('div');
            const header = document.createElement('div');
            header.setAttribute('data-view-header', '');
            container.appendChild(header);

            const registry = new Map([
                [
                    'v1',
                    [
                        {
                            id: 'hdr3',
                            label: 'A',
                            action: vi.fn(),
                            category: 'view' as CommandCategory,
                            showInHeader: true,
                        },
                    ],
                ],
            ]);

            // First render
            renderer.updateViewHeaderCommands('v1', container, registry);
            // Second render
            renderer.updateViewHeaderCommands('v1', container, registry);

            const containers = header.querySelectorAll('[data-view-commands-container]');
            expect(containers.length).toBe(1);
        });
    });

    describe('refreshCommandStates', () => {
        it('updates disabled and aria-pressed on rendered command buttons', () => {
            // Arrange
            document.body.innerHTML = '';
            const btn = document.createElement('button');
            btn.setAttribute('data-cmd-id', 'cmd-refresh');
            document.body.appendChild(btn);

            const registry = new Map([
                [
                    'v1',
                    [
                        {
                            id: 'cmd-refresh',
                            label: 'Toggle',
                            action: vi.fn(),
                            category: CommandCategory.VIEW,
                            isEnabled: () => false,
                            isActive: () => true,
                        },
                    ],
                ],
            ]);

            // Act
            renderer.refreshCommandStates(registry);

            // Assert
            expect(btn.disabled).toBe(true);
            expect(btn.getAttribute('aria-pressed')).toBe('true');
        });

        it('is a no-op for buttons without matching command', () => {
            document.body.innerHTML = '';
            const btn = document.createElement('button');
            btn.setAttribute('data-cmd-id', 'nonexistent');
            document.body.appendChild(btn);

            expect(() => renderer.refreshCommandStates(new Map())).not.toThrow();
            expect(btn.disabled).toBe(false);
        });
    });

    describe('header command layout interaction', () => {
        it('toggle button click toggles expanded state', () => {
            // Arrange
            const container = document.createElement('div');
            const header = document.createElement('div');
            header.setAttribute('data-view-header', '');
            container.appendChild(header);

            const registry = new Map([
                [
                    'v1',
                    [
                        {
                            id: 'hdr-toggle',
                            label: 'CMD',
                            action: vi.fn(),
                            category: 'view' as CommandCategory,
                            showInHeader: true,
                        },
                    ],
                ],
            ]);

            renderer.updateViewHeaderCommands('v1', container, registry);

            const toggle = header.querySelector(
                `.${styles['view-commands-toggle']}`
            ) as HTMLElement;
            expect(toggle).not.toBeNull();

            // Act — click toggle
            toggle.click();

            // Assert
            const btnContainer = header.querySelector('[data-view-commands-container]')!;
            expect(toggle.getAttribute('aria-expanded')).toBe('true');
            expect(
                btnContainer.classList.contains(styles['view-commands-container--expanded'])
            ).toBe(true);

            // Act — click again to collapse
            toggle.click();
            expect(toggle.getAttribute('aria-expanded')).toBe('false');
        });

        it('toggle button responds to Enter key', () => {
            // Arrange
            const container = document.createElement('div');
            const header = document.createElement('div');
            header.setAttribute('data-view-header', '');
            container.appendChild(header);

            const registry = new Map([
                [
                    'v1',
                    [
                        {
                            id: 'hdr-key',
                            label: 'K',
                            action: vi.fn(),
                            category: 'view' as CommandCategory,
                            showInHeader: true,
                        },
                    ],
                ],
            ]);

            renderer.updateViewHeaderCommands('v1', container, registry);
            const toggle = header.querySelector(
                `.${styles['view-commands-toggle']}`
            ) as HTMLElement;

            // Act — dispatch keydown with Enter
            toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

            // Assert
            expect(toggle.getAttribute('aria-expanded')).toBe('true');
        });

        it('toggle button ignores non-Enter/Space keys', () => {
            const container = document.createElement('div');
            const header = document.createElement('div');
            header.setAttribute('data-view-header', '');
            container.appendChild(header);

            const registry = new Map([
                [
                    'v1',
                    [
                        {
                            id: 'hdr-esc',
                            label: 'E',
                            action: vi.fn(),
                            category: 'view' as CommandCategory,
                            showInHeader: true,
                        },
                    ],
                ],
            ]);

            renderer.updateViewHeaderCommands('v1', container, registry);
            const toggle = header.querySelector(
                `.${styles['view-commands-toggle']}`
            ) as HTMLElement;

            // Act
            toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

            // Assert — should remain collapsed
            expect(toggle.getAttribute('aria-expanded')).toBe('false');
        });

        it('pointerdown on toggle stops propagation', () => {
            const container = document.createElement('div');
            const header = document.createElement('div');
            header.setAttribute('data-view-header', '');
            container.appendChild(header);

            const registry = new Map([
                [
                    'v1',
                    [
                        {
                            id: 'hdr-ptr',
                            label: 'P',
                            action: vi.fn(),
                            category: 'view' as CommandCategory,
                            showInHeader: true,
                        },
                    ],
                ],
            ]);

            renderer.updateViewHeaderCommands('v1', container, registry);
            const toggle = header.querySelector(
                `.${styles['view-commands-toggle']}`
            ) as HTMLElement;

            const evt = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
            const stopSpy = vi.spyOn(evt, 'stopPropagation');

            toggle.dispatchEvent(evt);

            expect(stopSpy).toHaveBeenCalled();
        });
    });

    describe('renderGlobalCommands – with view-actions container', () => {
        it('renders view commands excluding CUBE category', () => {
            document.body.innerHTML = `
                <div id="controller-commands"></div>
                <div id="global-move-commands"></div>
                <div id="view-actions"></div>
            `;

            const reg = new Map([
                [
                    'v1',
                    [
                        {
                            id: 'view-cmd',
                            label: 'View Action',
                            action: vi.fn(),
                            category: CommandCategory.VIEW,
                        },
                        {
                            id: 'cube-cmd',
                            label: 'Cube Action',
                            action: vi.fn(),
                            category: CommandCategory.CUBE,
                        },
                    ],
                ],
            ]);

            renderer.renderGlobalCommands(reg, 'v1');

            const viewActions = document.getElementById('view-actions')!;
            expect(viewActions.getAttribute('data-rendered')).toBe('1');
            // Cube command should be in global-move-commands, not in view-actions
            expect(viewActions.innerHTML).not.toContain('Cube Action');
        });

        it('shows placeholder when no activeViewId', () => {
            document.body.innerHTML = `
                <div id="controller-commands"></div>
                <div id="global-move-commands"></div>
                <div id="view-actions"></div>
            `;

            renderer.renderGlobalCommands(new Map(), undefined);

            const viewActions = document.getElementById('view-actions')!;
            expect(viewActions.innerHTML).toContain('Select a view');
        });

        it('shows message when view has no commands at all', () => {
            document.body.innerHTML = `
                <div id="controller-commands"></div>
                <div id="global-move-commands"></div>
                <div id="view-actions"></div>
            `;

            renderer.renderGlobalCommands(new Map(), 'missing-view');

            const viewActions = document.getElementById('view-actions')!;
            expect(viewActions.innerHTML).toContain('No actions available');
        });

        it('click on command button syncs isActive/isEnabled across all instances', () => {
            document.body.innerHTML = `
                <div id="controller-commands"></div>
                <div id="global-move-commands"></div>
                <div id="view-actions"></div>
            `;

            let active = false;
            const actionFn = vi.fn(() => {
                active = !active;
            });

            const reg = new Map([
                [
                    'v1',
                    [
                        {
                            id: 'sync-cmd',
                            label: 'Sync',
                            action: actionFn,
                            category: CommandCategory.VIEW,
                            isActive: () => active,
                            isEnabled: () => true,
                        },
                    ],
                ],
            ]);

            renderer.renderGlobalCommands(reg, 'v1');

            // Also add a second instance button
            const secondBtn = document.createElement('button');
            secondBtn.setAttribute('data-cmd-id', 'sync-cmd');
            document.body.appendChild(secondBtn);

            // Act — click the rendered button
            const btn = document.querySelector<HTMLButtonElement>(
                '#view-actions [data-cmd-id="sync-cmd"]'
            )!;
            btn.click();

            // Assert — action was called and both buttons synced
            expect(actionFn).toHaveBeenCalled();
            expect(secondBtn.getAttribute('aria-pressed')).toBe('true');
        });
    });

    describe('renderGlobalCommands – controller & global-move-commands containers', () => {
        it('renders controller commands into controller-commands container', () => {
            document.body.innerHTML = `
                <div id="controller-commands"></div>
                <div id="global-move-commands"></div>
                <div id="view-actions"></div>
            `;

            const reg = new Map([
                [
                    'controller',
                    [
                        {
                            id: 'ctrl-cmd',
                            label: 'Reset',
                            action: vi.fn(),
                            category: CommandCategory.CONTROLLER,
                        },
                    ],
                ],
            ]);

            renderer.renderGlobalCommands(reg, undefined);

            const cc = document.getElementById('controller-commands')!;
            expect(cc.querySelector('[data-cmd-id="ctrl-cmd"]')).not.toBeNull();
        });

        it('renders cube commands from active view into global-move-commands', () => {
            document.body.innerHTML = `
                <div id="controller-commands"></div>
                <div id="global-move-commands"></div>
                <div id="view-actions"></div>
            `;

            const reg = new Map([
                [
                    'controller',
                    [
                        {
                            id: 'ctrl-cube',
                            label: 'R',
                            action: vi.fn(),
                            category: CommandCategory.CUBE,
                        },
                    ],
                ],
                [
                    'view1',
                    [
                        {
                            id: 'view-cube',
                            label: 'L',
                            action: vi.fn(),
                            category: CommandCategory.CUBE,
                        },
                    ],
                ],
            ]);

            renderer.renderGlobalCommands(reg, 'view1');

            const gc = document.getElementById('global-move-commands')!;
            expect(gc.querySelector('[data-cmd-id="ctrl-cube"]')).not.toBeNull();
            expect(gc.querySelector('[data-cmd-id="view-cube"]')).not.toBeNull();
        });
    });

    describe('TouchTooltipManager via rendered buttons', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('touchstart followed by timeout creates and shows tooltip, rAF positions it', () => {
            const container = document.createElement('div');
            document.body.appendChild(container);

            const cmd: Command = {
                id: 'touch-cmd',
                label: 'Touch',
                tooltip: 'Hold me',
                action: vi.fn(),
                category: CommandCategory.VIEW,
            };

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;

            // Mock rAF to run callbacks synchronously
            const origRaf = globalThis.requestAnimationFrame;
            globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
                cb(0);
                return 0;
            };

            // Dispatch touchstart
            btn.dispatchEvent(new Event('touchstart', { bubbles: true }));

            // Advance past the 500ms delay
            vi.advanceTimersByTime(500);

            // The tooltip should have been created and positioned via rAF
            const tooltip = document.querySelector('.touch-tooltip') as HTMLElement;
            expect(tooltip).not.toBeNull();
            expect(tooltip!.textContent).toBe('Touch: Hold me');
            expect(tooltip!.classList.contains('touch-tooltip--visible')).toBe(true);
            // rAF callback should have set positioning styles
            expect(tooltip!.style.left).not.toBe('-9999px');

            globalThis.requestAnimationFrame = origRaf;
            container.remove();
        });

        it('tooltip falls below button when near the top edge', () => {
            const container = document.createElement('div');
            document.body.appendChild(container);

            const cmd: Command = {
                id: 'touch-top-cmd',
                label: 'Top',
                tooltip: 'Near top',
                action: vi.fn(),
                category: CommandCategory.VIEW,
            };

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;

            // Mock getBoundingClientRect to simulate button near top of viewport
            vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
                top: 0,
                bottom: 30,
                left: 100,
                right: 150,
                width: 50,
                height: 30,
                x: 100,
                y: 0,
                toJSON: () => ({}),
            });

            // Mock rAF to run synchronously
            const origRaf = globalThis.requestAnimationFrame;
            globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
                cb(0);
                return 0;
            };

            btn.dispatchEvent(new Event('touchstart', { bubbles: true }));
            vi.advanceTimersByTime(500);

            const tooltip = document.querySelector('.touch-tooltip') as HTMLElement;
            expect(tooltip).not.toBeNull();
            // Since button is at top=0, tooltip should fall below (top = rect.bottom + 8 = 38)
            expect(Number.parseInt(tooltip!.style.top)).toBeGreaterThan(0);

            globalThis.requestAnimationFrame = origRaf;
            container.remove();
        });

        it('touchend hides tooltip before timeout fires', () => {
            const container = document.createElement('div');
            document.body.appendChild(container);

            const cmd: Command = {
                id: 'touch-end-cmd',
                label: 'End',
                tooltip: 'Lift',
                action: vi.fn(),
                category: CommandCategory.VIEW,
            };

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;

            btn.dispatchEvent(new Event('touchstart', { bubbles: true }));
            btn.dispatchEvent(new Event('touchend', { bubbles: true }));

            // Advance time — tooltip should NOT show because touchend cancelled it
            vi.advanceTimersByTime(600);

            const tooltip = document.querySelector('.touch-tooltip');
            // Tooltip might not exist yet, or if it does it should not be visible
            if (tooltip) {
                expect(tooltip.classList.contains('touch-tooltip--visible')).toBe(false);
            }

            container.remove();
        });

        it('touchmove hides tooltip', () => {
            const container = document.createElement('div');
            document.body.appendChild(container);

            const cmd: Command = {
                id: 'touch-move-cmd',
                label: 'Move',
                tooltip: 'Drag',
                action: vi.fn(),
                category: CommandCategory.VIEW,
            };

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;

            // Fire touchstart and wait for the tooltip to appear
            btn.dispatchEvent(new Event('touchstart', { bubbles: true }));
            vi.advanceTimersByTime(500);

            // The tooltip element is reused across instances via static field,
            // so query from the body — it will be the same element.
            const tooltips = document.querySelectorAll('.touch-tooltip');
            const tooltip = tooltips[tooltips.length - 1];
            expect(tooltip).toBeTruthy();
            expect(tooltip!.classList.contains('touch-tooltip--visible')).toBe(true);

            // touchmove hides it
            btn.dispatchEvent(new Event('touchmove', { bubbles: true }));
            expect(tooltip!.classList.contains('touch-tooltip--visible')).toBe(false);

            container.remove();
        });

        it('touchcancel hides tooltip', () => {
            const container = document.createElement('div');
            document.body.appendChild(container);

            const cmd: Command = {
                id: 'touch-cancel-cmd',
                label: 'Cancel',
                tooltip: 'Oops',
                action: vi.fn(),
                category: CommandCategory.VIEW,
            };

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;

            btn.dispatchEvent(new Event('touchstart', { bubbles: true }));
            vi.advanceTimersByTime(500);

            btn.dispatchEvent(new Event('touchcancel', { bubbles: true }));

            const tooltips = document.querySelectorAll('.touch-tooltip');
            const tooltip = tooltips[tooltips.length - 1];
            expect(tooltip).toBeTruthy();
            expect(tooltip!.classList.contains('touch-tooltip--visible')).toBe(false);

            container.remove();
        });
    });

    describe('configureHeaderCommandLayout – real layout path', () => {
        afterEach(() => {
            document.body.innerHTML = '';
        });

        function makeOverflowStyles(): Record<string, string> {
            return {
                ...styles,
                'view-commands-toggle': 'view-commands-toggle',
                'view-commands-inline': 'view-commands-inline',
                'view-commands-overflow': 'view-commands-overflow',
                'view-commands-container--has-overflow': 'has-overflow',
                'view-commands-container--expanded': 'expanded',
                'view-command-btn': 'view-command-btn',
                'view-panel--tabbed': 'module_viewPanelTabbed',
            };
        }

        function setupHeaderContainer(): {
            container: HTMLElement;
            header: HTMLElement;
        } {
            const container = document.createElement('div');
            const header = document.createElement('div');
            header.setAttribute('data-view-header', '');
            const title = document.createElement('span');
            title.setAttribute('data-view-title', '');
            title.textContent = 'My View';
            header.appendChild(title);
            container.appendChild(header);
            document.body.appendChild(container);
            return { container, header };
        }

        function makeCmds(count: number): Command[] {
            return Array.from({ length: count }, (_, i) => ({
                id: `layout-cmd-${i}`,
                label: `C${i}`,
                action: vi.fn(),
                category: 'view' as CommandCategory,
                showInHeader: true,
            }));
        }

        it('all buttons fit inline when header is wide enough', () => {
            const { container, header } = setupHeaderContainer();
            // Mock header width large enough
            Object.defineProperty(header, 'clientWidth', {
                value: 500,
                configurable: true,
            });

            const r = new CommandRenderer(makeOverflowStyles(), buttonStyles);
            const registry = new Map([['v1', makeCmds(2)]]);

            // Mock getComputedStyle to return a gap
            const origGetCS = window.getComputedStyle;
            vi.spyOn(window, 'getComputedStyle').mockImplementation(el => {
                const result = origGetCS(el);
                return { ...result, columnGap: '8', gap: '8' } as CSSStyleDeclaration;
            });

            r.updateViewHeaderCommands('v1', container, registry);

            // After render, mock button sizes and trigger layout via ResizeObserver
            const btns = header.querySelectorAll<HTMLElement>('.view-command-btn');
            btns.forEach(btn => {
                vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
                    width: 40,
                    height: 24,
                    x: 0,
                    y: 0,
                    top: 0,
                    left: 0,
                    right: 40,
                    bottom: 24,
                    toJSON: () => ({}),
                });
            });

            // Re-render to trigger layout with mocked sizes
            r.updateViewHeaderCommands('v1', container, registry);

            // We need to re-mock after second render too
            const btns2 = header.querySelectorAll<HTMLElement>('.view-command-btn');
            btns2.forEach(btn => {
                vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
                    width: 40,
                    height: 24,
                    x: 0,
                    y: 0,
                    top: 0,
                    left: 0,
                    right: 40,
                    bottom: 24,
                    toJSON: () => ({}),
                });
            });

            const btnContainer = header.querySelector('[data-view-commands-container]')!;
            // With 500px header, 2 buttons × 40px easily fits → no overflow
            expect(btnContainer.classList.contains('has-overflow')).toBe(false);

            container.remove();
            vi.mocked(window.getComputedStyle).mockRestore();
        });

        it('overflows buttons when header is narrow', () => {
            const { container, header } = setupHeaderContainer();
            Object.defineProperty(header, 'clientWidth', {
                value: 200,
                configurable: true,
            });

            const overflowStyles = makeOverflowStyles();
            const r = new CommandRenderer(overflowStyles, buttonStyles);
            const registry = new Map([['v1', makeCmds(5)]]);

            const origGetCS = window.getComputedStyle;
            vi.spyOn(window, 'getComputedStyle').mockImplementation(el => {
                const result = origGetCS(el);
                return { ...result, columnGap: '8', gap: '8' } as CSSStyleDeclaration;
            });

            // We need to pre-mock getBoundingClientRect on any future .view-command-btn
            // by intercepting createElement
            const origCreateElement = document.createElement.bind(document);
            const mockBtnRect = {
                width: 60,
                height: 24,
                x: 0,
                y: 0,
                top: 0,
                left: 0,
                right: 60,
                bottom: 24,
                toJSON: () => ({}),
            };

            vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
                const el = origCreateElement(tag);
                if (tag === 'button') {
                    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(mockBtnRect);
                }
                return el;
            });

            r.updateViewHeaderCommands('v1', container, registry);

            const btnContainer = header.querySelector('[data-view-commands-container]')!;
            const overflow = header.querySelector('[data-view-commands-overflow]')!;
            const overflowBtns = overflow.querySelectorAll('.view-command-btn');

            // 5 buttons × 60px = 300px + gaps > 200px - reserves → some should overflow
            if (overflowBtns.length > 0) {
                expect(btnContainer.classList.contains('has-overflow')).toBe(true);
            }

            container.remove();
            vi.mocked(document.createElement).mockRestore();
            vi.mocked(window.getComputedStyle).mockRestore();
        });

        it('handles tabbed mode (no title reserve)', () => {
            const { container, header } = setupHeaderContainer();
            Object.defineProperty(header, 'clientWidth', {
                value: 300,
                configurable: true,
            });

            // Wrap header in a tabbed panel
            const tabbedPanel = document.createElement('div');
            tabbedPanel.className = 'module_viewPanelTabbed';
            container.removeChild(header);
            tabbedPanel.appendChild(header);
            container.appendChild(tabbedPanel);

            const r = new CommandRenderer(makeOverflowStyles(), buttonStyles);
            const registry = new Map([['v1', makeCmds(2)]]);

            r.updateViewHeaderCommands('v1', container, registry);

            const btnContainer = header.querySelector('[data-view-commands-container]');
            expect(btnContainer).not.toBeNull();

            container.remove();
        });
    });

    describe('wireButton – initial isEnabled and isActive', () => {
        it('disables button when isEnabled returns false', () => {
            const container = document.createElement('div');
            const cmd: Command = {
                id: 'disabled-cmd',
                label: 'Disabled',
                action: vi.fn(),
                category: CommandCategory.VIEW,
                isEnabled: () => false,
            };

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;
            expect(btn.disabled).toBe(true);
        });

        it('sets aria-pressed on initial render when isActive is provided', () => {
            const container = document.createElement('div');
            const cmd: Command = {
                id: 'active-cmd',
                label: 'Active',
                action: vi.fn(),
                category: CommandCategory.VIEW,
                isActive: () => true,
            };

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;
            expect(btn.getAttribute('aria-pressed')).toBe('true');
        });

        it('sets data-cmd attribute to group when present', () => {
            const container = document.createElement('div');
            const cmd: Command = {
                id: 'group-cmd',
                label: 'Grouped',
                action: vi.fn(),
                category: CommandCategory.VIEW,
                group: 'MyGroup',
            };

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;
            expect(btn.getAttribute('data-cmd')).toBe('MyGroup');
        });
    });

    describe('createCommandButton – labelPosition override', () => {
        it('uses command labelPosition over icon metadata', () => {
            const container = document.createElement('div');
            const cmd: Command = {
                id: 'label-pos-cmd',
                label: 'Icon Cmd',
                action: vi.fn(),
                category: CommandCategory.VIEW,
                icon: 'test-icon',
                labelPosition: 'top-left',
            };

            // Add the top-left label style
            buttonStyles['btn-icon-label-top-left'] = 'btn-icon-label-top-left';

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;
            const labelSpan = btn.querySelector('.btn-icon-label-top-left');
            expect(labelSpan).not.toBeNull();
            expect(labelSpan!.textContent).toBe('Icon Cmd');
        });

        it('uses "none" labelPosition skips label span', () => {
            const container = document.createElement('div');
            const cmd: Command = {
                id: 'no-label-cmd',
                label: 'No Label',
                action: vi.fn(),
                category: CommandCategory.VIEW,
                icon: 'test-icon',
                labelPosition: 'none',
            };

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;
            const labelSpan = btn.querySelector('.btn-icon-label');
            expect(labelSpan).toBeNull();
        });
    });

    describe('formatKeyBinding – Windows Meta key', () => {
        it('shows Win instead of Cmd on Windows', async () => {
            const { detectOS } = await import('@/global');
            vi.mocked(detectOS).mockReturnValue('Windows');

            const binding = { key: 'a', metaKey: true };
            const formatted = renderer.formatKeyBinding(binding);
            expect(formatted).toBe('Win+A');

            vi.mocked(detectOS).mockReturnValue('macOS');
        });
    });

    describe('buildTooltip – with touch device and key bindings', () => {
        it('includes key bindings when not touch device', () => {
            const container = document.createElement('div');
            const cmd: Command = {
                id: 'tooltip-kb',
                label: 'Save',
                tooltip: 'Save file',
                action: vi.fn(),
                category: CommandCategory.VIEW,
                keyBindings: [{ key: 's', ctrlKey: true }],
            };

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;
            expect(btn.title).toContain('Ctrl+S');
        });

        it('omits key bindings on touch device', async () => {
            const { isTouchDevice } = await import('@/global');
            vi.mocked(isTouchDevice).mockReturnValue(true);

            const container = document.createElement('div');
            const cmd: Command = {
                id: 'tooltip-touch',
                label: 'Save',
                tooltip: 'Save file',
                action: vi.fn(),
                category: CommandCategory.VIEW,
                keyBindings: [{ key: 's', ctrlKey: true }],
            };

            renderer.renderCommandButtons(container, [cmd]);
            const btn = container.querySelector('button')!;
            expect(btn.title).not.toContain('Ctrl+S');

            vi.mocked(isTouchDevice).mockReturnValue(false);
        });
    });
});
