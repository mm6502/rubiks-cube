// View Registry - Discovers and registers views at build time
import { CubeView } from '@/cube/types';
import { logger } from '@/diagnostics/logger';

/**
 * Descriptor for a single view variant
 */
export interface ViewVariant {
    /**
     * The unique type identifier for this variant (e.g., 'basic-front')
     */
    viewType: string;

    /**
     * The human-readable display title for this variant
     */
    title: string;

    /**
     * Default position and dimensions for this variant
     */
    defaultConfig: { x: number; y: number; width: number; height: number };
}

/**
 * Factory interface for creating cube view instances
 */
export interface ViewFactory {
    /**
     * Creates a new instance of the cube view
     * @param config - Optional configuration object for view initialization
     * @returns A new cube view instance
     */
    create(config?: any): CubeView;

    /**
     * Gets the unique type identifier for this view (for single-variant factories)
     * @returns The view type string (e.g., 'flat', 'circular')
     */
    getViewType(): string;

    /**
     * Gets the human-readable display title for this view (for single-variant factories)
     * @returns The display title for the view
     */
    getTitle(): string;

    /**
     * Gets the default configuration for positioning and sizing this view (for single-variant factories)
     * @returns Default position (x, y) and dimensions (width, height)
     */
    getDefaultConfig(): { x: number; y: number; width: number; height: number };

    /**
     * Optional: Gets all variants this factory provides (for multi-variant factories)
     * If present, this takes precedence over getViewType/getTitle/getDefaultConfig
     * @returns Array of view variant descriptors
     */
    getVariants?(): ViewVariant[];
}

/**
 * Module structure for imported view modules
 */
export interface ViewModule {
    /**
     * The default export of a view module, which is the ViewFactory
     */
    default: ViewFactory;
}

// Discover all views at build time using Vite's glob import
const viewModules = import.meta.glob<ViewModule>('../views/*/index.ts', { eager: true });

// Create registry of available views
const viewRegistry = new Map<string, ViewFactory>();

// Register discovered views
for (const [, module] of Object.entries(viewModules)) {
    const factory = module.default;

    // Skip if no factory is provided
    if (!factory) continue;

    // Check if factory provides multiple variants
    if (factory.getVariants) {
        // Multi-variant factory: register each variant separately
        const variants = factory.getVariants();
        for (const variant of variants) {
            viewRegistry.set(variant.viewType, {
                create: (config?: any) => factory.create({ ...config, viewType: variant.viewType }),
                getViewType: () => variant.viewType,
                getTitle: () => variant.title,
                getDefaultConfig: () => variant.defaultConfig,
            });
        }
    } else {
        // Single-variant factory: register directly
        viewRegistry.set(factory.getViewType(), factory);
    }
}

/**
 * Gets a sorted list of all available view types
 * @returns Array of view type strings in preferred display order
 */
export function getAvailableViews(): string[] {
    const desiredOrder = ['moves', 'circular', 'basic-front', 'basic-back', 'flat'];
    const keys = Array.from(viewRegistry.keys());
    return keys.sort((a, b) => {
        const indexA = desiredOrder.indexOf(a);
        const indexB = desiredOrder.indexOf(b);
        // Unknown views at the end
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });
}

/**
 * Gets the factory for a specific view type
 * @param viewType - The type of view to get the factory for
 * @returns The view factory or undefined if not found
 */
export function getViewFactory(viewType: string): ViewFactory | undefined {
    return viewRegistry.get(viewType);
}

/**
 * Creates a new view instance of the specified type
 * @param viewType - The type of view to create
 * @param config - Optional configuration for the view
 * @returns The created view instance or undefined if view type not found
 */
export function createView(viewType: string, config?: any): CubeView | undefined {
    const factory = getViewFactory(viewType);
    if (!factory) {
        logger.warn(`View type '${viewType}' not found. Available views:`, getAvailableViews());
        return undefined;
    }
    return factory.create(config);
}

/**
 * Gets the display title for a view type
 * @param viewType - The type of view to get the title for
 * @returns The display title or the viewType if not found
 */
export function getViewTitle(viewType: string): string {
    const factory = getViewFactory(viewType);
    return factory?.getTitle() || viewType;
}

/**
 * Gets the default configuration for a view type
 * @param viewType - The type of view to get default config for
 * @returns Default position and size configuration
 */
export function getViewDefaultConfig(viewType: string): {
    x: number;
    y: number;
    width: number;
    height: number;
} {
    const factory = getViewFactory(viewType);
    return factory?.getDefaultConfig() || { x: 20, y: 20, width: 350, height: 300 };
}
