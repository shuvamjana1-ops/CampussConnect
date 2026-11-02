import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as cpactions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

/** Lighthouse CI largest-contentful-paint budget in milliseconds (23.2). */
export const LCP_BUDGET_MS = 2500;

export interface PipelineStackProps extends StackProps {
  /** GitHub owner of the repository. */
  readonly repoOwner: string;
  readonly repoName: string;
  /** CodeStar connection ARN used by the main and phase-GA pipelines. */
  readonly codeStarConnectionArn: string;
  /** Branch that feeds the main and phase-GA pipelines. Defaults to `main`. */
  readonly mainBranch?: string;
  /** Base URL of the deployed staging environment for DAST, TLS, load and Lighthouse scans. */
  readonly stagingUrl: string;
  /** Staging hostname (no scheme) for testssl.sh. */
  readonly stagingHost: string;
}

const NODE_INSTALL = [
  'corepack enable',
  'pnpm install --frozen-lockfile',
];

/** Gates shared by every stage: static checks, tests, synth with cdk-nag, secrets and dependency scans. */
const PR_COMMANDS = [
  'pnpm typecheck',
  'pnpm lint',
  'pnpm depcruise',
  'pnpm test',
  'pnpm test:integration',
  'pnpm --filter @campusconnect/infra exec cdk synth --quiet',
  // Zero findings required: gitleaks exits non-zero on any leak.
  'gitleaks detect --source . --config .gitleaks.toml --redact --exit-code 1',
  // Release gate (22.9): fail only on critical findings without an approved, unexpired exception.
  'osv-scanner scan --lockfile pnpm-lock.yaml --format json --output osv.json || true',
  'pnpm audit --json > audit.json || true',
  'pnpm --filter @campusconnect/tools exec node --import tsx security-exceptions/cli.ts --osv ../osv.json --audit ../audit.json --exceptions ../security/exceptions.yaml',
  'semgrep scan --config auto --error --metrics off .',
];

const BROWSER_COMMANDS = [
  'pnpm --filter @campusconnect/web exec playwright install --with-deps chromium',
  'pnpm --filter @campusconnect/web exec playwright test',
];

/** Blocks on any open high or critical finding from the DAST, TLS, load and performance scans. */
const GA_COMMANDS = [
  'mkdir -p reports',
  'docker run --rm -v "$PWD/reports:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable zap-full-scan.py -t "$STAGING_URL" -J zap.json -I || true',
  `node -e "const r=require('./reports/zap.json');const o=(r.site||[]).flatMap(s=>s.alerts||[]).filter(a=>Number(a.riskcode)>=3);if(o.length){console.error('ZAP high findings:',o.map(a=>a.name));process.exit(1)}"`,
  'testssl.sh --jsonfile reports/testssl.json --severity HIGH --quiet "$STAGING_HOST"',
  'k6 run tools/load/scenarios.js --env BASE_URL="$STAGING_URL"',
  `pnpm dlx @lhci/cli@0.14.0 autorun --collect.url="$STAGING_URL" --collect.settings.preset=mobile --assert.assertions.largest-contentful-paint="[\\"error\\",{\\"maxNumericValue\\":${LCP_BUDGET_MS}}]"`,
];

/** CI/CD: pull request gate, main pipeline with browser tests, and a manually approved phase-GA pipeline. */
export class PipelineStack extends Stack {
  public readonly artifactBucket: s3.Bucket;
  public readonly pullRequestProject: codebuild.Project;
  public readonly mainProject: codebuild.Project;
  public readonly browserProject: codebuild.Project;
  public readonly phaseGaProject: codebuild.Project;
  public readonly mainPipeline: codepipeline.Pipeline;
  public readonly phaseGaPipeline: codepipeline.Pipeline;

  public constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);
    const branch = props.mainBranch ?? 'main';

    const key = new kms.Key(this, 'ArtifactKey', { enableKeyRotation: true, removalPolicy: RemovalPolicy.RETAIN });
    this.artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ expiration: Duration.days(90), noncurrentVersionExpiration: Duration.days(30) }],
    });

    const environment: codebuild.BuildEnvironment = {
      buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      computeType: codebuild.ComputeType.LARGE,
      privileged: true, // docker for ZAP and integration test containers
    };

    const project = (
      name: string,
      source: codebuild.ISource | undefined,
      commands: readonly string[],
      extraEnv: Record<string, codebuild.BuildEnvironmentVariable> = {},
      timeout = Duration.minutes(45),
    ): codebuild.Project =>
      new codebuild.Project(this, name, {
        projectName: `campusconnect-${name.toLowerCase()}`,
        source,
        environment,
        encryptionKey: key,
        timeout,
        environmentVariables: extraEnv,
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          env: { variables: { CI: 'true' } },
          phases: {
            install: {
              'runtime-versions': { nodejs: '22' },
              commands: NODE_INSTALL,
            },
            build: { commands },
          },
        }),
      });

    // ---- Pull request stage ----
    const prSource = codebuild.Source.gitHub({
      owner: props.repoOwner,
      repo: props.repoName,
      webhook: true,
      webhookFilters: [
        codebuild.FilterGroup.inEventOf(
          codebuild.EventAction.PULL_REQUEST_CREATED,
          codebuild.EventAction.PULL_REQUEST_UPDATED,
          codebuild.EventAction.PULL_REQUEST_REOPENED,
        ),
      ],
      reportBuildStatus: true,
    });
    this.pullRequestProject = project('PullRequest', prSource, PR_COMMANDS);

    // ---- Main stage: PR gates plus Playwright and axe-core ----
    this.mainProject = project('MainChecks', undefined, PR_COMMANDS);
    this.browserProject = project('MainBrowser', undefined, BROWSER_COMMANDS);

    const sourceOutput = new codepipeline.Artifact('Source');
    const source = new cpactions.CodeStarConnectionsSourceAction({
      actionName: 'Source',
      owner: props.repoOwner,
      repo: props.repoName,
      branch,
      connectionArn: props.codeStarConnectionArn,
      output: sourceOutput,
      codeBuildCloneOutput: true,
    });

    this.mainPipeline = new codepipeline.Pipeline(this, 'MainPipeline', {
      pipelineName: 'campusconnect-main',
      artifactBucket: this.artifactBucket,
      pipelineType: codepipeline.PipelineType.V2,
      stages: [
        { stageName: 'Source', actions: [source] },
        {
          stageName: 'Verify',
          actions: [
            new cpactions.CodeBuildAction({
              actionName: 'GatesAndTests',
              project: this.mainProject,
              input: sourceOutput,
              runOrder: 1,
            }),
            new cpactions.CodeBuildAction({
              actionName: 'PlaywrightAxe',
              project: this.browserProject,
              input: sourceOutput,
              runOrder: 1,
            }),
          ],
        },
      ],
    });

    // ---- Phase-GA stage: DAST, TLS, load and performance, blocking on high or critical ----
    this.phaseGaProject = project(
      'PhaseGa',
      undefined,
      [...PR_COMMANDS, ...GA_COMMANDS],
      {
        STAGING_URL: { value: props.stagingUrl },
        STAGING_HOST: { value: props.stagingHost },
      },
      Duration.hours(2),
    );

    const gaSourceOutput = new codepipeline.Artifact('GaSource');
    this.phaseGaPipeline = new codepipeline.Pipeline(this, 'PhaseGaPipeline', {
      pipelineName: 'campusconnect-phase-ga',
      artifactBucket: this.artifactBucket,
      pipelineType: codepipeline.PipelineType.V2,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new cpactions.CodeStarConnectionsSourceAction({
              actionName: 'Source',
              owner: props.repoOwner,
              repo: props.repoName,
              branch,
              connectionArn: props.codeStarConnectionArn,
              output: gaSourceOutput,
              codeBuildCloneOutput: true,
              triggerOnPush: false,
            }),
          ],
        },
        {
          stageName: 'Approve',
          actions: [new cpactions.ManualApprovalAction({ actionName: 'StartPhaseGaScans' })],
        },
        {
          stageName: 'Scan',
          actions: [
            new cpactions.CodeBuildAction({
              actionName: 'ZapTestsslK6Lighthouse',
              project: this.phaseGaProject,
              input: gaSourceOutput,
            }),
          ],
        },
      ],
    });

    // Build projects in pipelines clone the repository through the connection.
    for (const p of [this.mainProject, this.browserProject, this.phaseGaProject]) {
      p.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['codestar-connections:UseConnection', 'codeconnections:UseConnection'],
          resources: [props.codeStarConnectionArn],
        }),
      );
    }
    // `cdk synth` in CI needs context lookups to resolve; allow read-only describe access only.
    this.mainProject.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-*-lookup-role-*`] }),
    );
  }
}
