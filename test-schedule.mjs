#!/usr/bin/env node
// Quick test script to verify schedule property tests

import { spawn } from 'child_process';
import { cwd } from 'process';

const testProcess = spawn('npx', ['vitest', 'run', 'packages/domain/test/schedule.property.test.ts'], {
  cwd: cwd(),
  stdio: 'inherit',
  shell: true,
});

testProcess.on('close', (code) => {
  process.exit(code);
});
