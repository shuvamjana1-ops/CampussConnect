import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../', import.meta.url);
const arbitrariesDir = new URL('test/arbitraries/', packageRoot);

const moduleNames = readdirSync(new URL('src/', packageRoot), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe('packages/domain layout', () => {
  it('exposes each module as the subpath export @campusconnect/domain/<module>', () => {
    const manifest = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')) as { exports?: unknown };
    expect(manifest.exports).toEqual({ './*': './src/*/index.ts' });
  });

  it.each(moduleNames)('gives module %s an index.ts entry point', (name) => {
    expect(existsSync(new URL(`src/${name}/index.ts`, packageRoot))).toBe(true);
  });

  it('keeps exactly one arbitraries file per module', () => {
    const arbitraryFiles = readdirSync(arbitrariesDir)
      .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
      .map((file) => file.slice(0, -'.ts'.length))
      .sort();
    expect(arbitraryFiles).toEqual(moduleNames);
  });

  it('re-exports every arbitraries file from test/arbitraries/index.ts', () => {
    const barrel = readFileSync(new URL('index.ts', arbitrariesDir), 'utf8');
    for (const name of moduleNames) {
      expect(barrel).toContain(`export * from './${name}';`);
    }
  });
});
