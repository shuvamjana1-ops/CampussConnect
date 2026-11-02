/**
 * dependency-cruiser rules that enforce the six module dependency rules in design.md
 * ("Module map and dependency rules"). Paths are relative to the repository root.
 *
 * The rules rely on these layout conventions:
 * - `packages/server/<module>/index.ts` is a server module's public service interface.
 * - `packages/domain/src/<module>/index.ts` is a domain module's public interface,
 *   imported as `@campusconnect/domain/<module>`.
 * - `packages/db/src/schema/<module>/` holds the Drizzle tables owned by server module `<module>`,
 *   imported as `@campusconnect/db/schema/<module>`.
 * - `packages/pii-redactor/src/internal/` holds the RedactedText brand and its mint function.
 */

/** Server modules that Analytics_Service may call: itself and the foundation modules every module uses. */
const ANALYTICS_ALLOWED_MODULES = ['analytics', 'identity', 'tenancy', 'audit', 'outbox'];

/** Regular-expression fragments for npm packages that make network calls to an AI provider. */
const AI_PROVIDER_PACKAGES = [
  '@huggingface/inference',
  '@huggingface/hub',
  'openai',
  '@anthropic-ai/sdk',
  '@aws-sdk/client-bedrock-runtime',
  '@aws-sdk/client-bedrock-agent-runtime',
  '@google/genai',
  '@google/generative-ai',
  '@mistralai/mistralai',
  'cohere-ai',
  'groq-sdk',
  'replicate',
  'ollama',
  'ai',
  '@ai-sdk/[^/]+',
  'langchain',
  '@langchain/[^/]+',
];

/** Regular-expression fragments for PostgreSQL drivers, including Drizzle's driver adapters. */
const POSTGRES_DRIVER_PACKAGES = [
  'pg',
  'pg-pool',
  'pg-native',
  'pg-cursor',
  'pg-query-stream',
  'postgres',
  '@neondatabase/serverless',
  '@electric-sql/pglite',
  '@vercel/postgres',
  'drizzle-orm/(node-postgres|postgres-js|pglite|neon-http|neon-serverless|vercel-postgres|aws-data-api|pg-proxy)',
];

/**
 * Pure npm packages that `packages/domain/src` may import.
 * Add a package here only after confirming that it performs no I/O.
 */
const DOMAIN_ALLOWED_PACKAGES = ['luxon', '@types/luxon'];

/**
 * Builds regular expressions that match an npm package whether dependency-cruiser resolved it into
 * node_modules or could not resolve it (then the path is the bare import specifier).
 *
 * @param {readonly string[]} names Package names as regular-expression fragments.
 * @returns {string[]}
 */
function npmPackages(names) {
  const alternatives = names.join('|');
  return [`(^|/)node_modules/(${alternatives})(/|$)`, `^(${alternatives})(/|$)`];
}

/** @type {NonNullable<import('dependency-cruiser').IConfiguration['forbidden']>} */
export const forbidden = [
  {
    name: 'module-boundary-server',
    comment:
      "Design rule 1: a server module calls another module only through the public service interface exported from that module's index.ts.",
    severity: 'error',
    from: { path: '^packages/server/([^/]+)/' },
    to: {
      path: '^packages/server/[^/]+/',
      pathNot: ['^packages/server/$1/', '^packages/server/[^/]+/index\\.ts$', '^packages/server/node_modules/'],
    },
  },
  {
    name: 'module-boundary-server-consumers',
    comment: 'Design rule 1: code outside packages/server uses a server module only through its index.ts.',
    severity: 'error',
    from: { pathNot: '^packages/server/' },
    to: {
      path: '^packages/server/[^/]+/',
      pathNot: ['^packages/server/[^/]+/index\\.ts$', '^packages/server/node_modules/'],
    },
  },
  {
    name: 'module-boundary-domain',
    comment: "Design rule 1: a domain module uses another domain module only through that module's index.ts.",
    severity: 'error',
    from: { path: '^packages/domain/src/([^/]+)/' },
    to: {
      path: '^packages/domain/src/[^/]+/',
      pathNot: ['^packages/domain/src/$1/', '^packages/domain/src/[^/]+/index\\.ts$'],
    },
  },
  {
    name: 'module-boundary-domain-consumers',
    comment:
      'Design rule 1: code outside packages/domain uses a domain module only through its index.ts (@campusconnect/domain/<module>).',
    severity: 'error',
    from: { pathNot: '^packages/domain/' },
    to: {
      path: '^packages/domain/src/[^/]+/',
      pathNot: '^packages/domain/src/[^/]+/index\\.ts$',
    },
  },
  {
    name: 'own-tables-only',
    comment:
      'Design rule 2: a server module reads and writes only its own tables (packages/db/src/schema/<module>). Cross-module reactions go through outbox domain events.',
    severity: 'error',
    from: { path: '^packages/server/([^/]+)/', pathNot: '^packages/server/analytics/' },
    to: {
      path: '^packages/db/src/schema/',
      pathNot: '^packages/db/src/schema/$1/',
    },
  },
  {
    name: 'analytics-fact-tables-only',
    comment:
      'Design rule 3: Analytics_Service reads only its own fact tables in the analytics schema (packages/db/src/schema/analytics).',
    severity: 'error',
    from: { path: '^packages/server/analytics/' },
    to: {
      path: '^packages/db/src/schema/',
      pathNot: '^packages/db/src/schema/analytics/',
    },
  },
  {
    name: 'analytics-no-module-reads',
    comment:
      "Design rule 3: Analytics_Service gets other modules' data from domain events projected into its fact tables, not by calling those modules. It may call the foundation modules identity, tenancy, audit and outbox.",
    severity: 'error',
    from: { path: '^packages/server/analytics/' },
    to: {
      path: '^packages/server/[^/]+/',
      pathNot: [`^packages/server/(${ANALYTICS_ALLOWED_MODULES.join('|')})/`, '^packages/server/node_modules/'],
    },
  },
  {
    name: 'ai-provider-calls-in-ai-adapter-only',
    comment: 'Design rule 4: only packages/ai-adapter may make network calls to an AI provider.',
    severity: 'error',
    from: { pathNot: '^packages/ai-adapter/' },
    to: { path: npmPackages(AI_PROVIDER_PACKAGES) },
  },
  {
    name: 'redacted-text-minted-in-pii-redactor-only',
    comment:
      'Design rule 4: only packages/pii-redactor may create a RedactedText value. The brand and mint function live in packages/pii-redactor/src/internal/.',
    severity: 'error',
    from: { pathNot: '^packages/pii-redactor/' },
    to: { path: '^packages/pii-redactor/src/internal/' },
  },
  {
    name: 'domain-no-io-core-modules',
    comment:
      'Design rule 5: packages/domain imports nothing that performs I/O. The only Node.js built-in it may use is crypto, for hashing.',
    severity: 'error',
    from: { path: '^packages/domain/src/', pathNot: '\\.test\\.tsx?$' },
    to: {
      dependencyTypes: ['core'],
      pathNot: '^(node:)?crypto$',
    },
  },
  {
    name: 'domain-pure-dependencies-only',
    comment:
      'Design rule 5: packages/domain imports only its own modules, @campusconnect/contracts and the pure packages in DOMAIN_ALLOWED_PACKAGES.',
    severity: 'error',
    from: { path: '^packages/domain/src/', pathNot: '\\.test\\.tsx?$' },
    to: {
      dependencyTypesNot: ['core'],
      pathNot: ['^packages/domain/', '^packages/contracts/', ...npmPackages(DOMAIN_ALLOWED_PACKAGES)],
    },
  },
  {
    name: 'postgres-driver-in-db-only',
    comment: 'Design rule 6: only packages/db may import the PostgreSQL driver. All other code uses withTenant().',
    severity: 'error',
    from: { pathNot: '^packages/db/' },
    to: { path: npmPackages(POSTGRES_DRIVER_PACKAGES) },
  },
];

/** @type {NonNullable<import('dependency-cruiser').IConfiguration['options']>} */
export const options = {
  doNotFollow: { path: ['node_modules'] },
  exclude: {
    // Workspace build output only. A broad pattern such as "dist/" would also drop
    // dependencies that resolve into node_modules/<package>/dist and hide rule violations.
    path: [
      '^(apps/[^/]+|packages/[^/]+|infra|tools)/(dist|out|\\.next|cdk\\.out|coverage|\\.turbo)/',
      '^packages/tooling/test/fixtures/',
    ],
  },
  tsPreCompilationDeps: true,
  skipAnalysisNotInRules: true,
  enhancedResolveOptions: {
    exportsFields: ['exports'],
    conditionNames: ['types', 'import', 'require', 'node', 'default'],
    mainFields: ['module', 'main', 'types', 'typings'],
  },
  progress: { type: 'none' },
};

/** @type {import('dependency-cruiser').IConfiguration} */
const config = { forbidden, options };

export default config;
