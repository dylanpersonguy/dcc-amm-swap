// Shared ESLint flat config for the whole monorepo. Three packages'
// package.json "lint" scripts reference eslint despite neither the tool nor
// any config existing anywhere in the repo — this is that missing config.
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.js',
      '**/*.d.ts',
      '**/coverage/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Catches real bugs without needing type-aware linting (which would
      // require per-package tsconfig project references — out of scope for
      // a first pass; add that later if the team wants stricter checks).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'off', // TypeScript's own checker already covers this, and this rule false-positives on globals like BigInt/fetch
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'smart'],
      'no-duplicate-imports': 'error',
    },
  },
];
