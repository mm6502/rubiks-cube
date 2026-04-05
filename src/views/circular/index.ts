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

    getDefaultConfig(): { x: number; y: number; width: number; height: number } {
        return { x: 140, y: 0, width: 450, height: 450 };
    },
};

export default circularViewFactory;
