const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
    {
        ignores: ['dist', 'node_modules', 'coverage'],
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: require('@typescript-eslint/parser'),
            parserOptions: { ecmaVersion: 2021, sourceType: 'module' },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            prettier: prettierPlugin,
        },
        rules: {
            ...prettierConfig.rules,
            'prettier/prettier': 'error',
            // Project-specific restriction: prefer '@/...' imports and no explicit extensions
            'no-restricted-imports': ['error', { patterns: ['../*', '**/*.js', '**/*.ts'] }],
        },
    },
];
