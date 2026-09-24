import { resolve } from 'path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            // `import.meta.dirname`, not `__dirname`: Vite plans to load configs with
            // Node's own ESM loader (`configLoader: 'native'`), where the CommonJS
            // `__dirname` is undefined. The bundling loader defines it today, so
            // `__dirname` works now and would break on that switch.
            '@': resolve(import.meta.dirname, './src'),
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        environmentOptions: {},
        // Order matters. `vitest.error-guard.ts` must register its `window` error
        // listener before anything imports `diagnostics/logger.ts`, which installs
        // the app's own handler — that handler calls `stopImmediatePropagation()`,
        // so a listener registered after it never runs. See the guard's header.
        setupFiles: ['./vitest.error-guard.ts', './vitest.setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{js,jsx,mts,cts,mjs,cjs}'],
        // These suites build real views — a 7×7 view constructs 218 cubies and ~1800
        // DOM elements — and a few enumerate a large sequence space (the
        // orientation-group sweep walks 341 rotation sequences). That is genuinely slow
        // work, and vitest's 5s default made the coverage gate flaky.
        testTimeout: 30000,
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
