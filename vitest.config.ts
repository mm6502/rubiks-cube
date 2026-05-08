import { resolve } from 'path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        environmentOptions: {},
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{js,jsx,mts,cts,mjs,cjs}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov', 'json'],
            reportsDirectory: './coverage',
            thresholds: {
                lines: 70,
                functions: 70,
                branches: 70,
                statements: 70,
                // Per-file exceptions: accepted ceilings due to untestable branches
                // basic/touch-handler.ts: multi-pointer gesture paths require a real
                //   PointerEvent dispatch loop not available in jsdom (R2 best-effort)
                'src/views/basic/touch-handler.ts': {
                    branches: 75,
                },
                // basic/basic-view.ts: remaining branches coupled to Three.js WebGL
                //   camera/renderer state unreachable without a full WebGL context (R9 best-effort)
                'src/views/basic/basic-view.ts': {
                    branches: 70,
                },
            },
            include: ['src/**/*.ts'],
            exclude: [
                'node_modules/',
                'src/**/*.test.ts',
                'src/**/*.spec.ts',
                'vitest.setup.ts',
                'vitest.config.ts',
                'vite.config.ts',
                'eslint.config.cjs',
                'src/docs/**',
                'dist/',
                // Exclude custom files
                'src/types/index.ts',
                'src/cube/**/index.ts',
                'src/**/*.commands.ts',
                // Exclude type-only files (no executable code)
                'src/cube/types/**',
                // Exclude interface-only files (no executable statements)
                'src/view-manager/command-manager.ts',
            ],
        },
    },
});
