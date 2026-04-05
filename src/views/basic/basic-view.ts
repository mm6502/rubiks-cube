// Basic 3D Cube Visualization
import { Application } from '@/application';
import { CubeView, Face, LayoutMode, ReadOnlyCubeModel, Size2D, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { Command, CommandCategory, EventName, MoveExecutedEvent } from '@/types';

import * as initialization from './initialization';
import * as navigation from './navigation';
import * as rendering from './rendering';
import * as selection from './selection';
import styles from './basic-view.module.css';

/**
 * Variant type for basic view (front or back).
 */
export type BasicVariant = 'front' | 'back';

/**
 * State persisted for the basic view.
 */
export interface BasicViewState {
    isTilted: boolean;
    isPitched: boolean;
    yRotation: number;
    xRotation: number;
    zRotation: number;
}

/**
 * Full internal state shared between all basic-view modules.
 * Defined here so modules can import it as a type without creating runtime
 * circular dependencies.
 */
export type BasicViewInternalData = {
    model?: ReadOnlyCubeModel;
    container: HTMLElement | null;
    cubeElement: HTMLElement | null;
    cubeContainer: HTMLElement | null;
    styles: Record<string, string>;
    variant: BasicVariant;
    viewType: string;
    isTilted: boolean;
    isPitched: boolean;
    yRotation: number;
    xRotation: number;
    zRotation: number;
    isHovered: boolean;
    currentSelected?: StickerId;
    pendingMoveFace?: string;
};

export class BasicView implements CubeView {
    private state: BasicViewInternalData;
    private touchNoticeEl: HTMLElement | null = null;

    constructor(config?: { viewType?: string }) {
        const viewType = config?.viewType === 'basic-back' ? 'basic-back' : 'basic-front';
        const variant: BasicVariant = viewType === 'basic-back' ? 'back' : 'front';

        this.state = {
            model: undefined,
            container: null,
            cubeElement: null,
            cubeContainer: null,
            styles: styles as Record<string, string>,
            variant,
            viewType,
            isTilted: false,
            isPitched: false,
            yRotation: 0,
            xRotation: 0,
            zRotation: 0,
            isHovered: false,
            currentSelected: undefined,
            pendingMoveFace: undefined,
        };
    }

    getViewType(): string {
        return this.state.viewType;
    }

    getCubeElement(): HTMLElement | null {
        return this.state.cubeElement;
    }

    getCommands(): Command[] {
        return [
            {
                id: `${this.getViewType()}.undo`,
                label: 'Undo',
                category: CommandCategory.VIEW,
                showInHeader: true,
                icon: '↩',
                tooltip: 'Undo last move',
                priority: 900,
                action: () => Application.eventBus.emit(EventName.UNDO_REQUESTED, {}),
                isEnabled: () => this.state.model?.getMoveHistory().canUndo() ?? false,
            },
            {
                id: `${this.getViewType()}.redo`,
                label: 'Redo',
                category: CommandCategory.VIEW,
                showInHeader: true,
                icon: '↪',
                tooltip: 'Redo last undone move',
                priority: 901,
                action: () => Application.eventBus.emit(EventName.REDO_REQUESTED, {}),
                isEnabled: () => this.state.model?.getMoveHistory().canRedo() ?? false,
            },
            {
                id: 'tilt-view',
                label: 'Tilt View',
                keyBindings: [{ key: '|' }, { key: '\\' }],
                category: CommandCategory.VIEW,
                group: '.',
                icon: '↔',
                showInHeader: true,
                tooltip: 'Toggle view tilt (Y-axis: -35° ↔ 35°)',
                action: () => {
                    this.state.isTilted = !this.state.isTilted;
                    rendering.updateRotation(this.state);
                    rendering.updateFaceLabels(this.state);
                    this.emitStateChanged();
                },
            },
            {
                id: 'pitch-view',
                label: 'Pitch View',
                keyBindings: [{ key: 'PageUp' }, { key: 'PageDown' }],
                category: CommandCategory.VIEW,
                group: '.',
                icon: '↕',
                showInHeader: true,
                tooltip: 'Toggle view pitch (X-axis: -25° ↔ 25°)',
                action: () => {
                    this.state.isPitched = !this.state.isPitched;
                    rendering.updateRotation(this.state);
                    rendering.updateFaceLabels(this.state);
                    this.emitStateChanged();
                },
            },
            {
                id: 'rotate-view-left',
                label: 'Rotate View Left',
                keyBindings: [{ key: 'ArrowLeft', ctrlKey: true }],
                category: CommandCategory.VIEW,
                group: '.',
                icon: '←',
                tooltip: 'Rotate cube view left',
                action: () => {
                    this.rotateViewLeft();
                    this.emitStateChanged();
                },
            },
            {
                id: 'rotate-view-right',
                label: 'Rotate View Right',
                keyBindings: [{ key: 'ArrowRight', ctrlKey: true }],
                category: CommandCategory.VIEW,
                group: '.',
                icon: '→',
                tooltip: 'Rotate cube view right',
                action: () => {
                    this.rotateViewRight();
                    this.emitStateChanged();
                },
            },
            {
                id: 'rotate-view-up',
                label: 'Rotate View Up',
                keyBindings: [{ key: 'ArrowUp', ctrlKey: true }],
                category: CommandCategory.VIEW,
                group: '.',
                icon: '↑',
                tooltip: 'Rotate cube view up',
                action: () => {
                    this.rotateViewUp();
                    this.emitStateChanged();
                },
            },
            {
                id: 'rotate-view-down',
                label: 'Rotate View Down',
                keyBindings: [{ key: 'ArrowDown', ctrlKey: true }],
                category: CommandCategory.VIEW,
                group: '.',
                icon: '↓',
                tooltip: 'Rotate cube view down',
                action: () => {
                    this.rotateViewDown();
                    this.emitStateChanged();
                },
            },
            {
                id: 'reset-view',
                label: 'Reset View',
                keyBindings: [{ key: 'Home' }],
                category: CommandCategory.VIEW,
                group: '.',
                icon: '↻',
                showInHeader: true,
                tooltip: 'Reset all view rotations to default position',
                action: () => {
                    this.resetView();
                    this.emitStateChanged();
                },
            },
            {
                id: 'align-cube-to-view',
                label: 'Align Cube to View',
                keyBindings: [
                    { key: '=' },
                    { key: 'End' },
                    { key: 'Enter' },
                    { key: 'NumpadEnter' },
                ],
                category: CommandCategory.VIEW,
                group: '.',
                icon: '=',
                showInHeader: true,
                tooltip: 'Rotate the cube to match the current view orientation',
                action: () => {
                    this.alignCubeToView();
                    this.emitStateChanged();
                },
            },
        ];
    }

    // -------------------------------------------------------------------------
    // CubeView interface
    // -------------------------------------------------------------------------

    create(container: HTMLElement, model: ReadOnlyCubeModel): void {
        // initialization.initialize builds the DOM and returns the canonical
        // state object.  Event listeners inside that function close over it,
        // so we must replace this.state with the returned reference.
        this.state = initialization.initialize(
            container,
            model,
            this.state.styles,
            this.state.variant,
            this.state.viewType,
            id => this.updateSelected(id)
        );
        // Apply the correct default orientation for this variant.
        navigation.resetView(this.state);
        rendering.updateRotation(this.state, true);
        rendering.updateFaceLabels(this.state);

        // Default selection: F4 sticker.
        const f4 = CubeStateUtils.getStickerAt(model.getCurrentState(), Face.F, 4);
        if (f4) this.updateSelected(f4.id);
    }

    update(model: ReadOnlyCubeModel): void {
        this.state.model = model;
        rendering.update(this.state, model);
    }

    updateSelective(event?: MoveExecutedEvent): void {
        if (event) {
            rendering.updateSelective(this.state, event);
        }
    }

    resize(): void {
        rendering.resize(this.state);
    }

    setLayoutMode(mode: LayoutMode): void {
        if (mode === 'tabbed') {
            if (!this.touchNoticeEl && this.state.container) {
                const notice = document.createElement('div');
                notice.className = this.state.styles['touch-notice'] ?? '';
                notice.textContent = 'Touch interaction is not yet implemented.';
                this.state.container.appendChild(notice);
                this.touchNoticeEl = notice;
            }
        } else {
            this.touchNoticeEl?.remove();
            this.touchNoticeEl = null;
        }
    }

    getMinimumSize(): Size2D {
        return rendering.getMinimumSize();
    }

    // -------------------------------------------------------------------------
    // Keyboard navigation
    // -------------------------------------------------------------------------

    handleKeyDown(event: KeyboardEvent): boolean {
        return this.handleKeyPress(event, true);
    }

    handleKeyUp(event: KeyboardEvent): boolean {
        return this.handleKeyPress(event, false);
    }

    private handleKeyPress(event: KeyboardEvent, preview: boolean): boolean {
        if (!navigation.isNavigationKey(event)) return false;

        const handled = navigation.navigate(event, preview, this.state, id =>
            this.updateSelected(id)
        );
        if (handled && !preview) {
            // navigate() may mutate yRotation for U→B over-horizon transitions.
            rendering.updateRotation(this.state);
        }
        return handled;
    }

    // -------------------------------------------------------------------------
    // Highlight / selection
    // -------------------------------------------------------------------------

    updateHighlight(highlightedSticker?: StickerId): void {
        selection.updateHighlight(this.state, highlightedSticker);
    }

    updateSelected(selectedSticker?: StickerId): void {
        selection.updateSelected(this.state, selectedSticker);
    }

    // -------------------------------------------------------------------------
    // Move handling
    // -------------------------------------------------------------------------

    handleMoveExecuted(event: MoveExecutedEvent): void {
        if (event.moveDetails?.movedCubies && this.state.model) {
            this.updateSelective(event);
        } else if (this.state.model) {
            this.update(this.state.model);
        }
    }

    // -------------------------------------------------------------------------
    // View rotation (public for commands and tests)
    // -------------------------------------------------------------------------

    rotateViewLeft(): void {
        navigation.rotateViewLeft(this.state);
        rendering.updateRotation(this.state);
        rendering.updateFaceLabels(this.state);
    }

    rotateViewRight(): void {
        navigation.rotateViewRight(this.state);
        rendering.updateRotation(this.state);
        rendering.updateFaceLabels(this.state);
    }

    rotateViewUp(): void {
        navigation.rotateViewUp(this.state);
        rendering.updateRotation(this.state);
        rendering.updateFaceLabels(this.state);
    }

    rotateViewDown(): void {
        navigation.rotateViewDown(this.state);
        rendering.updateRotation(this.state);
        rendering.updateFaceLabels(this.state);
    }

    resetView(): void {
        navigation.resetView(this.state);
        rendering.updateRotation(this.state);
        rendering.updateFaceLabels(this.state);
    }

    alignCubeToView(): void {
        navigation.alignCubeToView(this.state);
        rendering.updateRotation(this.state, true);
        rendering.updateFaceLabels(this.state);
    }

    // -------------------------------------------------------------------------
    // Rendering helpers (retained for backwards-compatibility with tests)
    // -------------------------------------------------------------------------

    updateRotation(skipAnimation?: boolean): void {
        rendering.updateRotation(this.state, skipAnimation);
    }

    updateFaceLabels(): void {
        rendering.updateFaceLabels(this.state);
    }

    findClosestEquivalentAngle(current: number, target: number): number {
        return rendering.findClosestEquivalentAngle(current, target);
    }

    // -------------------------------------------------------------------------
    // State persistence
    // -------------------------------------------------------------------------

    getState(): BasicViewState {
        return {
            isTilted: this.state.isTilted,
            isPitched: this.state.isPitched,
            yRotation: this.state.yRotation,
            xRotation: this.state.xRotation,
            zRotation: this.state.zRotation,
        };
    }

    setState(state: unknown): void {
        if (!state || typeof state !== 'object') return;
        const viewState = state as Partial<BasicViewState>;

        if (typeof viewState.isTilted === 'boolean') this.state.isTilted = viewState.isTilted;
        if (typeof viewState.isPitched === 'boolean') this.state.isPitched = viewState.isPitched;
        if (typeof viewState.yRotation === 'number') this.state.yRotation = viewState.yRotation;
        if (typeof viewState.xRotation === 'number') this.state.xRotation = viewState.xRotation;
        if (typeof viewState.zRotation === 'number') this.state.zRotation = viewState.zRotation;

        rendering.updateRotation(this.state, true);
        rendering.updateFaceLabels(this.state);
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    destroy(): void {
        initialization.destroy(this.state);
        this.state.cubeElement = null;
        this.state.container = null;
        this.state.model = undefined;
    }

    private emitStateChanged(): void {
        Application.eventBus.emit(EventName.VIEW_STATE_CHANGED, {
            viewType: this.getViewType(),
        });
    }
}
