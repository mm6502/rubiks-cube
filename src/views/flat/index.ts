import { CubeView } from '@/cube/types';
import { ViewFactory } from '@/view-manager/view-registry';

import { FlatView } from './flat-view';
import styles from './flat-view.module.css';

// Factory function
export const flatViewFactory: ViewFactory = {
    create(_config?: any): CubeView {
        return new FlatView(styles) as CubeView;
    },

    getViewType(): string {
        return 'flat';
    },

    getTitle(): string {
        return 'Flat View';
    },

    getSupportedSizes(): number[] {
        return [2, 3, 4, 5, 6, 7];
    },

    getDefaultConfig(): { x: number; y: number; width: number; height: number } {
        return { x: 600, y: 310, width: 300, height: 300 };
    },
};

export default flatViewFactory;
