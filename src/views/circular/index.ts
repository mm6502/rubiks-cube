import { ViewFactory } from '@/view-manager/view-registry';

import { CircularCubeView } from './circular-view';
import { loadedSizes } from './svg-loader';

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
        // generated and validated, and the list is derived from the assets the
        // loader can actually resolve rather than restated — a size named here
        // without an asset would present a checkbox that fails on selection.
        return loadedSizes();
    },

    getDefaultConfig(): { x: number; y: number; width: number; height: number } {
        return { x: 140, y: 0, width: 450, height: 450 };
    },
};

export default circularViewFactory;
