// Usage: node eval/cli.ts <eval-set.json>   (AI_PROVIDER=fake|huggingface, HF_TOKEN, HF_TRIAGE_MODEL)
// Exits 1 when the P0 Critical false-negative rate exceeds 2% (5.8, 25.3).
import { readFile } from 'node:fs/promises';
import { FakeAiAdapter, HuggingFaceAdapter, type AiAdapter } from '@campusconnect/ai-adapter';
import {
  createPiiRedactor,
  StaticGazetteerProvider,
  StaticRollNumberPatternProvider,
} from '@campusconnect/pii-redactor';
import { MAX_P0_FALSE_NEGATIVE_RATE } from './metrics';
import { runEval, type EvalSet } from './run-eval';

function createAdapter(): AiAdapter {
  if ((process.env.AI_PROVIDER ?? 'fake') === 'fake') return new FakeAiAdapter();
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error('HF_TOKEN is required when AI_PROVIDER=huggingface');
  const modelId = process.env.HF_TRIAGE_MODEL ?? '';
  if (!modelId) throw new Error('HF_TRIAGE_MODEL is required when AI_PROVIDER=huggingface');
  return new HuggingFaceAdapter(token, { triage: { modelId, timeoutMs: 10_000 } });
}

async function main(): Promise<number> {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: cli <eval-set.json>');
    return 2;
  }
  const set = JSON.parse(await readFile(file, 'utf8')) as EvalSet;
  const redactor = createPiiRedactor({
    gazetteer: new StaticGazetteerProvider({}),
    rollNumberPatterns: new StaticRollNumberPatternProvider({}),
  });
  try {
    const report = await runEval(set, { adapter: createAdapter(), redactor });
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) {
      console.error(
        `P0 false-negative rate ${(report.p0FalseNegativeRate * 100).toFixed(2)}% exceeds ${String(MAX_P0_FALSE_NEGATIVE_RATE * 100)}%`,
      );
      return 1;
    }
    return 0;
  } finally {
    await redactor.close();
  }
}

process.exitCode = await main();
