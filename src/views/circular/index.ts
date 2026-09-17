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
        // Circular view is SVG-per-N. Supported sizes are derived from what the loader can
        // serve: committed `view-<n>.svg` assets when present, otherwise on-demand generation
        // from `parameters.json`. A size is unsupported only when it has no parameter set.
        return loadedSizes();
    },

    getDefaultConfig(): { x: number; y: number; width: number; height: number } {
        return { x: 140, y: 0, width: 450, height: 450 };
    },
};

export default circularViewFactory;
