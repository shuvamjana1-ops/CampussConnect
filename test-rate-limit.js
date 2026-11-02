import { spawn } from 'child_process';
import { resolve } from 'path';

const cwd = resolve('packages/domain');
const proc = spawn('npx', ['vitest', 'run', 'test/auth.property.test.ts', '--reporter=verbose'], {
  cwd,
  stdio: 'inherit',
  shell: true,
});

process.exit(proc.exitCode || 0);
