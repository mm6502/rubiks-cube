import { SUPPORTED_SIZES } from '@/cube/types';
import { ViewFactory } from '@/view-manager/view-registry';

import { MovesView } from './moves-view';

const MovesViewFactory: ViewFactory = {
    create: () => new MovesView(),
    getViewType: () => 'moves',
    getTitle: () => 'Moves',
    getSupportedSizes: () => [...SUPPORTED_SIZES],
    getDefaultConfig: () => ({
        x: 0,
        y: 0,
        width: 130,
        height: 450,
    }),
};

export default MovesViewFactory;
