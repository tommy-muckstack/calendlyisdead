import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ['.next/**', '.data/**', 'node_modules/**', 'next-env.d.ts', 'research/**', 'playwright-report/**', 'test-results/**'] },
  ...compat.config({ extends: ['next/core-web-vitals', 'next/typescript'] }),
  // Existing server/provider models use explicit any. Report this debt without
  // mixing a repository-wide type migration into the initial lint setup.
  { rules: { '@typescript-eslint/no-explicit-any': 'warn' } },
];

export default config;
