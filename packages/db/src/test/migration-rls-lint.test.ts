import { beforeAll, describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TableAnalysis {
  table: string;
  schema: string;
  hasTenantId: boolean;
  hasForceRls: boolean;
  hasRestrictivePolicy: boolean;
  issues: string[];
}

/**
 * Parse SQL migrations to extract table definitions and check RLS policies
 */
function parseMigrations(migrationsDir: string): Map<string, TableAnalysis> {
  const tableMap = new Map<string, TableAnalysis>();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const content = readFileSync(filePath, 'utf-8');

    // Find all CREATE TABLE statements
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)\s*\(([\s\S]*?)\);/gi;
    let match;

    while ((match = createTableRegex.exec(content)) !== null) {
      const schema = match[1] || 'public';
      const table = match[2];
      const tableBody = match[3];
      const tableKey = `${schema}.${table}`;

      // Check if table has tenant_id column
      const hasTenantId = /tenant_id\s+uuid/i.test(tableBody);

      if (!tableMap.has(tableKey)) {
        tableMap.set(tableKey, {
          table,
          schema,
          hasTenantId,
          hasForceRls: false,
          hasRestrictivePolicy: false,
          issues: [],
        });
      }
    }

    // Find ALTER TABLE FORCE ROW LEVEL SECURITY statements
    const forceRlsRegex = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi;
    while ((match = forceRlsRegex.exec(content)) !== null) {
      const schema = match[1] || 'public';
      const table = match[2];
      const tableKey = `${schema}.${table}`;

      if (tableMap.has(tableKey)) {
        const analysis = tableMap.get(tableKey)!;
        analysis.hasForceRls = true;
      }
    }

    // Find restrictive policies - these are policies that use "AS RESTRICTIVE"
    // Also look for policies on tables with tenant_id that use app.tenant()
    const policyRegex = /CREATE\s+POLICY\s+(\w+)\s+ON\s+(?:(\w+)\.)?(\w+)/gi;
    while ((match = policyRegex.exec(content)) !== null) {
      const policyName = match[1];
      const schema = match[2] || 'public';
      const table = match[3];
      const tableKey = `${schema}.${table}`;

      if (tableMap.has(tableKey)) {
        const analysis = tableMap.get(tableKey)!;
        // Check if this is a restrictive policy (typical name pattern)
        if (policyName.toLowerCase().includes('restrictive') || policyName.toLowerCase().includes('tenant')) {
          analysis.hasRestrictivePolicy = true;
        }
      }
    }
  }

  // Validate each table with tenant_id
  for (const [tableKey, analysis] of tableMap.entries()) {
    if (analysis.hasTenantId) {
      if (!analysis.hasForceRls) {
        analysis.issues.push(
          `Table ${tableKey} has tenant_id column but FORCE ROW LEVEL SECURITY is not enabled`
        );
      }
      if (!analysis.hasRestrictivePolicy) {
        analysis.issues.push(
          `Table ${tableKey} has tenant_id column but no restrictive tenant_isolation policy found`
        );
      }
    }
  }

  return tableMap;
}

describe('RLS Migration Lint', () => {
  let tableAnalyses: Map<string, TableAnalysis>;

  beforeAll(() => {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    tableAnalyses = parseMigrations(migrationsDir);
  });

  it('should fail if any table with tenant_id lacks FORCE ROW LEVEL SECURITY', () => {
    const issues: string[] = [];

    for (const [, analysis] of tableAnalyses.entries()) {
      if (analysis.hasTenantId && !analysis.hasForceRls) {
        issues.push(analysis.issues[0]);
      }
    }

    expect(issues).toHaveLength(0);
    if (issues.length > 0) {
      console.error('RLS Lint Issues Found:');
      issues.forEach((issue) => console.error(`  - ${issue}`));
    }
  });

  it('should fail if any table with tenant_id lacks the restrictive tenant_isolation policy', () => {
    const issues: string[] = [];

    for (const [, analysis] of tableAnalyses.entries()) {
      if (analysis.hasTenantId && !analysis.hasRestrictivePolicy) {
        issues.push(analysis.issues[1]);
      }
    }

    expect(issues).toHaveLength(0);
    if (issues.length > 0) {
      console.error('RLS Lint Issues Found:');
      issues.forEach((issue) => console.error(`  - ${issue}`));
    }
  });

  it('should report all tables analyzed for verification', () => {
    const tablesWithTenantId = Array.from(tableAnalyses.values())
      .filter((a) => a.hasTenantId)
      .map((a) => `${a.schema}.${a.table}`);

    // Currently, no tables have tenant_id yet (they will be added in later migrations)
    // This test documents the lint expectations
    if (tablesWithTenantId.length > 0) {
      console.log('Tables with tenant_id requiring RLS:');
      tablesWithTenantId.forEach((t) => console.log(`  - ${t}`));
    }
  });
});
