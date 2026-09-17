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
        // Circular view is SVG-per-N. Sizes are listed here once their asset is
        // generated and validated — 2×2 and 3×3 are shipped; 4×4 is a proof of
        // concept included so it can be tried, and whether it stays enabled is
        // decided after that. 5×5 is a ghost-rule validation target only and is
        // deliberately absent.
        return [2, 3, 4];
    },

    getDefaultConfig(): { x: number; y: number; width: number; height: number } {
        return { x: 140, y: 0, width: 450, height: 450 };
    },
};

export default circularViewFactory;
