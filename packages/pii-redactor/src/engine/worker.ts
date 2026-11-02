/*
 * Redaction worker entry. WorkerPiiRedactor starts it with `new Worker(...)`; Node.js loads it through
 * built-in type stripping (Node.js 22.18 or later, or --experimental-strip-types on older 22.x releases).
 * It handles one request at a time and never logs, so input text cannot reach any log (19.6).
 */
import { parentPort } from 'node:worker_threads';
import type RE2 from 're2';
import type { RedactRequest, WorkerResponse } from '../protocol.ts';
import { compileRollNumberPattern } from './detectors/roll-no.ts';
import { buildGazetteerMatcher, type GazetteerMatcher } from './gazetteer.ts';
import { LruCache } from './lru.ts';
import { redactText } from './redact-text.ts';

const port = parentPort;
if (port === null) {
  throw new Error('The PII redaction worker must run in a worker thread');
}

const gazetteers = new LruCache<string, GazetteerMatcher>(16);
const rollNumberPatterns = new LruCache<string, RE2>(256);

function compiledPattern(source: string): RE2 {
  const cached = rollNumberPatterns.get(source);
  if (cached !== undefined) {
    return cached;
  }
  const compiled = compileRollNumberPattern(source);
  rollNumberPatterns.set(source, compiled);
  return compiled;
}

function handle(request: RedactRequest): WorkerResponse {
  const { id } = request;
  let patterns: RE2[];
  try {
    patterns = request.rollNumberPatterns.map(compiledPattern);
  } catch {
    return { type: 'error', id, reason: 'INVALID_TENANT_PATTERN' };
  }
  try {
    let gazetteer: GazetteerMatcher | undefined;
    if (request.gazetteerKey !== null) {
      if (request.gazetteerNames !== undefined) {
        gazetteer = buildGazetteerMatcher(request.gazetteerNames);
        gazetteers.set(request.gazetteerKey, gazetteer);
      } else {
        gazetteer = gazetteers.get(request.gazetteerKey);
        if (gazetteer === undefined) {
          return { type: 'need-gazetteer', id };
        }
      }
    }
    const result = redactText(request.text, { rollNumberPatterns: patterns, gazetteer });
    return { type: 'result', id, text: result.text, spans: result.spans };
  } catch {
    return { type: 'error', id, reason: 'ENGINE_ERROR' };
  }
}

port.on('message', (request: RedactRequest) => {
  port.postMessage(handle(request));
});
