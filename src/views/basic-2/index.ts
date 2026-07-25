// Basic 2 View Factory — registers basic-2-front and basic-2-back variants
import { CubeView } from '@/cube/types';

import { BasicView } from './basic-2-view';

/**
 * Default position and dimensions for basic-2 view variants.
 */
const DEFAULT_CONFIG = {
    x: 0,
    y: 0,
    width: 350,
    height: 350,
};

/**
 * View factory for Basic 2 view (per-cubie 3D architecture with animations).
 * Provides two variants: basic-2-front and basic-2-back.
 *
 * Variant names are distinct from the basic view's 'basic-front'/'basic-back'
 * so both sets of variants coexist in the view registry.
 */
export default class Basic2ViewFactory {
    static create(config?: { viewType?: string }): CubeView {
        return new BasicView(config);
    }

    static getViewType(): string {
        return 'basic-2';
    }

    static getTitle(): string {
        return 'Basic 2';
    }

    static getDefaultConfig(): { x: number; y: number; width: number; height: number } {
        return DEFAULT_CONFIG;
    }

    static getVariants(): Array<{
        viewType: string;
        title: string;
        defaultConfig: { x: number; y: number; width: number; height: number };
    }> {
        return [
            {
                viewType: 'basic-2-front',
                title: 'Basic 2 Front',
                defaultConfig: DEFAULT_CONFIG,
            },
            {
                viewType: 'basic-2-back',
                title: 'Basic 2 Back',
                defaultConfig: DEFAULT_CONFIG,
            },
        ];
    }
}
