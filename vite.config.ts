import { defineConfig } from 'vite';
import type { BuildOptions } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Vite 8 added codeSplitting: false to replace inlineDynamicImports,
// but its own type definitions haven't been updated yet.
type BuildOptionsV8 = BuildOptions & { codeSplitting?: boolean };

export default defineConfig({
    plugins: [viteSingleFile({ useRecommendedBuildConfig: false })],
    build: {
        target: 'es2020',
        outDir: 'dist',
        // Enable inline sourcemaps when DEBUG_PROD_MAPS is truthy for better stack traces
        sourcemap: process.env.DEBUG_PROD_MAPS ? 'inline' : false,
        // Disable minification when generating inline sourcemaps to preserve symbol names
        minify: process.env.DEBUG_PROD_MAPS ? false : true,
        // Inline all assets
        assetsInlineLimit: 100000000,
        // Disable code splitting (required for single-file output)
        codeSplitting: false,
    } as BuildOptionsV8,
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version || 'dev'),
        __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    resolve: {
        alias: {
            '@': '/src',
        },
    },
});
