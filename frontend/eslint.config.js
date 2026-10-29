import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/mockServiceWorker.js',
      '.artifacts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['tests/integration/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
)
