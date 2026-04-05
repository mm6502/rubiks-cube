import { CubeView } from '@/cube/types';

/**
 * Interface for command management operations used by ViewLifecycleManager.
 */
export interface CommandManager {
    /**
     * Registers commands for a specific view.
     */
    registerViewCommands(viewId: string, view: CubeView): void;

    /**
     * Updates command buttons in the header of a specific view.
     */
    updateViewHeaderCommands(viewId: string): void;

    /**
     * Renders global command buttons.
     */
    renderGlobalCommands(): void;
}
