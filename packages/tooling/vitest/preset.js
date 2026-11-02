import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const setupFile = fileURLToPath(new URL('./setup.js', import.meta.url));

const exclude = [...configDefaults.exclude, '**/dist/**', '**/coverage/**', '**/.turbo/**', '**/test/fixtures/**'];

/** Unit, example and property tests (`*.test.ts`). Integration tests (`*.int.test.ts`) are excluded. */
export const unitTestConfig = defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: [...exclude, '**/*.int.test.{ts,tsx}'],
    setupFiles: [setupFile],
    passWithNoTests: true,
  },
});

/** Integration tests (`*.int.test.ts`) against Testcontainers and LocalStack. Test files run one at a time. */
export const integrationTestConfig = defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.int.test.{ts,tsx}'],
    exclude,
    setupFiles: [setupFile],
    passWithNoTests: true,
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
