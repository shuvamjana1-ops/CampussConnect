#!/usr/bin/env node

import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = resolve('packages/domain');

try {
  console.log('Running property tests for rate limiting...\n');
  const result = execSync('npm run test -- test/auth.property.test.ts', {
    cwd,
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  console.log('\n✓ Tests completed successfully');
  process.exit(0);
} catch (error) {
  console.error('\n✗ Tests failed');
  process.exit(1);
}
