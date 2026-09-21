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
        // Order matters. `vitest.error-guard.ts` must register its `window` error
        // listener before anything imports `diagnostics/logger.ts`, which installs
        // the app's own handler — that handler calls `stopImmediatePropagation()`,
        // so a listener registered after it never runs. See the guard's header.
        setupFiles: ['./vitest.error-guard.ts', './vitest.setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{js,jsx,mts,cts,mjs,cjs}'],
        // These suites build real views — a 7×7 view constructs 294 cubie objects
        // and a full DOM subtree — and a few enumerate a large sequence space (the
        // orientation-group sweep walks 341 rotation sequences). Measured on a
        // 20-CPU machine, that work takes ~800ms in isolation but 4.5-5.5s while
        // 19 parallel jsdom workers contend for cores, which is over vitest's 5s
        // default and made the coverage gate flaky.
        //
        // Raised rather than patched per-test: the duration is a property of the
        // environment, not of any one test, so a per-test timeout would leave the
        // next-heaviest suite to fail instead. `maxWorkers` is capped at the same
        // time so the contention cannot get worse — see below.
        testTimeout: 30000,
        // 19 workers is the vitest default here (cpus - 1) and it actively hurts:
        // this suite is CPU-bound in jsdom, not I/O-bound, so oversubscribing the
        // cores only adds context-switch and GC pressure. Measured wall time and
        // worst single test across worker counts:
        //
        //   workers=19 (default)  25s wall   5540ms worst
        //   workers=10            29s wall   3970ms worst
        //   workers=8             32s wall   3315ms worst
        //   workers=4             49s wall   2593ms worst
        //   workers=3 (CI-like)   60s wall   2934ms worst
        //
        // 8 keeps the worst test comfortably inside the timeout for a modest wall
        // cost. CI is unaffected either way: ubuntu-latest has 4 vCPUs, so it
        // already ran 3 workers and its worst test measured 2934ms.
        maxWorkers: 8,
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
