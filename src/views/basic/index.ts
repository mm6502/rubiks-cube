import { ViewFactory, ViewVariant } from '@/view-manager/view-registry';

import { BasicView } from './basic-view';

export { createBasicInteractionAdapter } from './basic-interaction-adapter';

export const basicViewFactory: ViewFactory = {
    create(config?: any): BasicView {
        return new BasicView(config) as BasicView;
    },

    getViewType(): string {
        return 'basic';
    },

    getTitle(): string {
        return 'Basic View';
    },

    getDefaultConfig(): { x: number; y: number; width: number; height: number } {
        return { x: 20, y: 20, width: 300, height: 300 };
    },

    getVariants(): ViewVariant[] {
        return [
            {
                viewType: 'basic-front',
                title: 'Basic (Front)',
                defaultConfig: { x: 600, y: 0, width: 300, height: 300 },
            },
            {
                viewType: 'basic-back',
                title: 'Basic (Back)',
                defaultConfig: { x: 900, y: 0, width: 300, height: 300 },
            },
        ];
    },
};

export default basicViewFactory;
