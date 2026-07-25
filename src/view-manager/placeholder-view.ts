// fallow-ignore-file unused-export
import { CubeView, ReadOnlyCubeModel, Size2D } from '@/cube/types';
import { Command } from '@/types';

export class PlaceholderView implements CubeView {
    private container: HTMLElement | null = null;

    constructor(private viewType: string) {}

    create(container: HTMLElement, model: ReadOnlyCubeModel): void {
        this.container = container;
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; border: 2px dashed #ccc; border-radius: 8px;">
                <h3>${this.viewType} View</h3>
                <p>View implementation coming soon...</p>
                <div style="margin-top: 10px;">
                    <small>Status: ${model.isSolved() ? 'Solved' : 'Scrambled'}</small>
                </div>
            </div>
        `;
    }

    getViewType(): string {
        return this.viewType;
    }

    update(model: ReadOnlyCubeModel): void {
        const statusElement = this.container?.querySelector('small');
        if (statusElement) {
            statusElement.textContent = `Status: ${model.isSolved() ? 'Solved' : 'Scrambled'}`;
        }
    }

    resize(): void {
        // Placeholder view doesn't need special resize handling
    }

    getMinimumSize(): Size2D {
        return { width: 100, height: 40 };
    }

    updateHighlight(_highlightedSticker?: string): void {
        // Placeholder: no highlighting implemented
    }

    updateSelected(_selectedSticker?: string): void {
        // Placeholder: no selecting implemented
    }

    getCommands(): Command[] {
        return [];
    }

    destroy(): void {
        // Cleanup if needed
    }
}

export default PlaceholderView;
