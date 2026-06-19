import parser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser,
      sourceType: 'module',
      ecmaVersion: 6,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/naming-convention': 'warn',
      'semi': 'warn',
      'curly': 'warn',
      'eqeqeq': 'warn',
      'no-throw-literal': 'warn'
    }
  },
  {
    ignores: ['out', 'dist', '**/*.d.ts']
  }
];
