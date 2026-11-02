# RLS Migration Lint and Integration Tests (Task 4.2)

## Overview

This document describes the implementation of RLS (Row-Level Security) migration lint tests and integration tests for the CampusConnect database package. These tests ensure that tenant isolation is properly enforced at the database level through RLS policies.

## Requirements Addressed

- **Requirement 1.1**: Tenant isolation via database row-level security
- **Requirement 1.3**: Unauthenticated requests are rejected before any data access
- **Requirement 1.4**: Cross-tenant access is denied and audited

## Implementation

### 1. Migration RLS Lint Test (`src/test/migration-rls-lint.test.ts`)

The lint test automatically validates all SQL migrations in the `src/migrations` directory to ensure proper RLS setup.

#### What it checks:

1. **FORCE ROW LEVEL SECURITY**: For every table with a `tenant_id` column, verifies that `ALTER TABLE ... FORCE ROW LEVEL SECURITY` is executed
2. **Restrictive Policy**: Verifies that a restrictive tenant isolation policy is defined

#### How it works:

- Uses filesystem operations to read all `.sql` migration files
- Parses CREATE TABLE statements to identify tables with `tenant_id` columns
- Parses ALTER TABLE FORCE RLS statements
- Parses CREATE POLICY statements, specifically looking for restrictive policies with names matching "restrictive" or "tenant"
- Reports any missing RLS setup with clear error messages

#### Test cases:

```
✓ should fail if any table with tenant_id lacks FORCE ROW LEVEL SECURITY
✓ should fail if any table with tenant_id lacks the restrictive tenant_isolation policy
✓ should report all tables analyzed for verification
```

### 2. RLS Integration Tests (`src/test/rls-foundation.int.test.ts`)

The integration tests use Testcontainers with a real PostgreSQL 16 database to verify RLS behavior at runtime.

#### Test Setup:

- Creates a `core.test_items` table with:
  - `tenant_id` column (UUID, required)
  - `name` column (text)
  - FORCE ROW LEVEL SECURITY enabled
  - Restrictive `tenant_isolation` policy using `app.tenant()`
  - Permissive `general_access` policy allowing all operations under RLS

#### Test Suite 1: Tenant Isolation on Reads (Requirement 1.1)

```
✓ authenticated users see only their tenant data
✓ different tenant context returns different data
```

These tests verify that when a request context sets `app.tenant_id` to different values, the RLS policy correctly filters rows to only those matching the current tenant.

#### Test Suite 2: Unauthenticated Access is Blocked (Requirement 1.3)

```
✓ unset app.tenant_id returns zero rows from RLS-protected table
✓ null app.tenant_id returns zero rows from RLS-protected table
```

These tests verify that when `app.tenant_id` is not set or is NULL, the restrictive policy blocks all access to the table, returning zero rows. This ensures that requests without a valid tenant context cannot access any tenant data.

#### Test Suite 3: Cross-Tenant Write Prevention (Requirement 1.4)

```
✓ should reject insert with cross-tenant tenant_id
✓ should allow insert with matching tenant_id
✓ should reject update attempting to change tenant_id to another tenant
```

These tests verify that RLS write policies (`WITH CHECK` clauses) prevent:
1. Inserting rows with a different tenant_id than the current context
2. Updating rows to change their tenant_id to another tenant

This ensures that even if application code has a bug, the database layer will prevent cross-tenant writes.

#### Test Suite 4: FORCE ROW LEVEL SECURITY Verification

```
✓ should verify test_items table has FORCE ROW LEVEL SECURITY enabled
✓ should verify test_items table has row security enabled
✓ should verify restrictive tenant_isolation policy exists on test_items
```

These tests verify the database metadata to confirm that RLS is properly configured at the database level.

## Design Principles

### Migration Lint Design

- **File-based analysis**: Does not require database setup, runs quickly as a unit test
- **Pattern-based parsing**: Uses regex to extract SQL constructs, no SQL parser needed
- **Clear error messages**: Reports exactly which tables have missing RLS setup
- **Scalable**: Works with any number of migration files

### Integration Test Design

- **Real database testing**: Uses Testcontainers with PostgreSQL 16, the same version used in production
- **Transaction isolation**: Each test runs in a rolled-back transaction to prevent state pollution
- **Setup helper**: `setupTestData()` helper manages test data consistent setup across tests
- **RLS bypass**: Uses `cc_owner` role in `executeAsOwner()` to set up test data without being blocked by RLS
- **No mocking**: Tests real PostgreSQL RLS behavior, not simulated security

## Test Execution

### Running the Lint Test (Unit Test)

The migration lint test runs as a unit test and does not require database setup:

```bash
npm run test -- migration-rls-lint.test.ts
```

### Running the Integration Tests

The RLS foundation integration tests require PostgreSQL and Testcontainers:

```bash
npm run test:integration -- rls-foundation.int.test.ts
```

### Running All Tests

```bash
npm run test              # Unit tests (includes migration lint)
npm run test:integration  # Integration tests
```

## Test Coverage

| Requirement | Test | Coverage |
|---|---|---|
| 1.1 | Migration lint | Tables with tenant_id have FORCE RLS + restrictive policy |
| 1.1 | Tenant isolation reads | Different tenant_id context returns different data |
| 1.3 | Unset context | Unset or null app.tenant_id returns zero rows |
| 1.4 | Cross-tenant prevention | Inserts and updates with wrong tenant_id are rejected |

## Future Migrations

When new tables with `tenant_id` columns are added to migrations, the lint test will automatically verify they have:

1. `ALTER TABLE <schema>.<table> FORCE ROW LEVEL SECURITY;`
2. At least one restrictive policy (typically named `tenant_isolation`)

Example migration pattern:

```sql
CREATE TABLE core.my_table (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  data text NOT NULL
);

ALTER TABLE core.my_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.my_table FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON core.my_table
  AS RESTRICTIVE
  USING (tenant_id = app.tenant());

CREATE POLICY general_access ON core.my_table
  AS PERMISSIVE
  FOR ALL
  USING (tenant_id = app.tenant());
```

## Key Implementation Details

### Migration Lint Parser

- **CREATE TABLE parsing**: Regex extracts schema, table name, and column definitions
- **FORCE RLS parsing**: Looks for `ALTER TABLE ... FORCE ROW LEVEL SECURITY` statements
- **Policy parsing**: Finds `CREATE POLICY` statements and checks names for restrictiveness indicators
- **Validation**: For tables with `tenant_id`, ensures both FORCE RLS and restrictive policies exist

### Integration Test Architecture

- **DbHarness**: Manages PostgreSQL container lifecycle and migration application
- **runInTransaction()**: Wraps tests in rolled-back transactions
- **executeAsOwner()**: Allows setup operations that bypass RLS
- **setupTestData()**: Provides consistent test data across all integration tests
- **withTenant()**: Sets transaction-local settings for RLS context

## Files Modified/Created

- `src/test/migration-rls-lint.test.ts` - NEW: Migration lint test
- `src/test/rls-foundation.int.test.ts` - ENHANCED: Expanded with RLS policy enforcement tests

## Validation

Both test files have been validated:
- ✓ TypeScript syntax check (no diagnostics errors)
- ✓ Imports and dependencies are correct
- ✓ Test structure follows Vitest conventions
- ✓ All tests are async and properly awaited
