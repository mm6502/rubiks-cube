import { ViewFactory } from '@/view-manager/view-registry';

import { CircularCubeView } from './circular-view';

export const circularViewFactory: ViewFactory = {
    create(_config?: any): CircularCubeView {
        return new CircularCubeView();
    },

    getViewType(): string {
        return 'circular';
    },

    getTitle(): string {
        return 'Circular View';
    },

    getSupportedSizes(): number[] {
        // Circular view is SVG-per-N; only 3×3 has an authored SVG so far.
        // Other sizes land in a later phase.
        return [3];
    },

    getDefaultConfig(): { x: number; y: number; width: number; height: number } {
        return { x: 140, y: 0, width: 450, height: 450 };
    },
};

export default circularViewFactory;
