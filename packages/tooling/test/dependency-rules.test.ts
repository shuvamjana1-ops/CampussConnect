import { fileURLToPath } from 'node:url';
import { cruise, type ICruiseResult } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';
import { forbidden, options } from '../dependency-cruiser/config.mjs';

// The fixture tree mirrors the monorepo layout. Files named bad-* break one rule each;
// every other file shows a dependency the rules allow.
const fixtureRoot = fileURLToPath(new URL('./fixtures/depcruise/', import.meta.url));

const EXPECTED_VIOLATIONS = [
  'ai-provider-calls-in-ai-adapter-only: packages/server/triage/bad-ai-provider.ts -> @huggingface/inference',
  'analytics-fact-tables-only: packages/server/analytics/bad-reads.ts -> packages/db/src/schema/tickets/index.ts',
  'analytics-no-module-reads: packages/server/analytics/bad-reads.ts -> packages/server/tickets/index.ts',
  'domain-no-io-core-modules: packages/domain/src/tickets/bad-io.ts -> fs',
  'domain-pure-dependencies-only: packages/domain/src/tickets/bad-io.ts -> pg',
  'module-boundary-domain-consumers: apps/api/src/bad-domain-internals.ts -> packages/domain/src/calendar/windows.ts',
  'module-boundary-domain: packages/domain/src/sla/bad-module-internals.ts -> packages/domain/src/calendar/windows.ts',
  'module-boundary-server-consumers: apps/api/src/bad-server-internals.ts -> packages/server/tickets/internal/repository.ts',
  'module-boundary-server: packages/server/sla/bad-module-internals.ts -> packages/server/tickets/internal/repository.ts',
  'own-tables-only: packages/server/sla/bad-other-tables.ts -> packages/db/src/schema/tickets/index.ts',
  'postgres-driver-in-db-only: apps/api/src/bad-postgres-driver.ts -> pg',
  'postgres-driver-in-db-only: packages/domain/src/tickets/bad-io.ts -> pg',
  'postgres-driver-in-db-only: packages/server/sla/bad-postgres-driver.ts -> drizzle-orm/node-postgres',
  'redacted-text-minted-in-pii-redactor-only: packages/server/copilot/bad-mint.ts -> packages/pii-redactor/src/internal/mint.ts',
].sort();

/** Every violation found in the fixture tree, formatted as "rule: from -> to". */
async function fixtureViolations(): Promise<string[]> {
  const { output } = await cruise(['apps', 'packages'], {
    ...options,
    baseDir: fixtureRoot,
    validate: true,
    ruleSet: { forbidden },
  });
  const result = typeof output === 'string' ? (JSON.parse(output) as ICruiseResult) : output;
  return result.summary.violations
    .map((violation) => `${violation.rule.name}: ${violation.from} -> ${violation.to.replace(/^node:/, '')}`)
    .sort();
}

describe('dependency-cruiser rules', () => {
  it('flag every forbidden dependency in the fixture tree and nothing else', { timeout: 30_000 }, async () => {
    expect(await fixtureViolations()).toEqual(EXPECTED_VIOLATIONS);
  });

  it('cover each of the six design dependency rules', () => {
    const designRules = new Set(
      forbidden.map((rule) => /^Design rule (\d):/.exec(rule.comment ?? '')?.[1] ?? `unnumbered rule ${rule.name ?? ''}`),
    );
    expect([...designRules].sort()).toEqual(['1', '2', '3', '4', '5', '6']);
  });
});
