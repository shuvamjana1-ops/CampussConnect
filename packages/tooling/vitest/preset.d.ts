import type { ViteUserConfig } from 'vitest/config';

/** Unit, example and property tests (`*.test.ts`). Integration tests (`*.int.test.ts`) are excluded. */
export declare const unitTestConfig: ViteUserConfig;

/** Integration tests (`*.int.test.ts`) against Testcontainers and LocalStack. Test files run one at a time. */
export declare const integrationTestConfig: ViteUserConfig;
