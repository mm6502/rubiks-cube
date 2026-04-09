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
