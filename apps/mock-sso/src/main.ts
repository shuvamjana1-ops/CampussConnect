// Entry point for the mock-sso service (ECS Fargate in deployed environments).
//
// Environment:
// - MOCK_SSO_SEED_FILE (required): JSON file with the users seeded per Tenant.
// - MOCK_SSO_PORT (default 4010) and MOCK_SSO_HOST (default 0.0.0.0).
// - Client, issuer and admin settings: see configFromEnv in ./config.
import { ConfigError, configFromEnv } from './config';
import { loadSeedFile } from './seed';
import { createMockSsoServer } from './server';

const DEFAULT_PORT = 4010;

function port(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_PORT;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new ConfigError('MOCK_SSO_PORT must be a whole number from 1 to 65535');
  }
  return parsed;
}

const seedFile = process.env.MOCK_SSO_SEED_FILE?.trim();
if (seedFile === undefined || seedFile === '') {
  throw new ConfigError('Missing environment variables: MOCK_SSO_SEED_FILE');
}

const app = createMockSsoServer(configFromEnv(process.env, await loadSeedFile(seedFile)));
const address = await app.listen(port(process.env.MOCK_SSO_PORT), process.env.MOCK_SSO_HOST ?? '0.0.0.0');
process.stdout.write(`mock-sso listening on port ${String(address.port)}\n`);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
