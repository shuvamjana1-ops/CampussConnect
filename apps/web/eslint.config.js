import { createConfig, globals } from '@campusconnect/tooling/eslint';

export default [
  ...createConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: true,
        },
      ],
      '@typescript-eslint/no-invalid-void-type': [
        'error',
        {
          allowInGenericTypeArguments: true,
        },
      ],
      '@typescript-eslint/no-misused-spread': 'off',
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  {
    files: ['src/__tests__/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-unnecessary-type-conversion': 'off',
    },
  },
];
