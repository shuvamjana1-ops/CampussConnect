/*
 * Pure redaction engine. It runs inside the redaction staff; WorkerPiiRedactor adds the staff thread,
 * the deadline and the RedactedText brand.
 *
 * Files under src/engine/ are loaded by Node.js type stripping in the staff, so their relative imports
 * carry the .ts extension and they use only erasable TypeScript syntax. Code outside src/engine/ must not
 * import them, so that other workspaces never type-check .ts-extension imports.
 */
import type RE2 from "re2";
import type { RedactionSpan } from "../pii-types.ts";
import { detectAddresses } from "./detectors/address.ts";
import { detectBankNumbers } from "./detectors/bank-card.ts";
import { detectEmails } from "./detectors/email.ts";
import { detectGovernmentIds } from "./detectors/gov-id.ts";
import { detectHonorificNames } from "./detectors/name.ts";
import { detectPhones } from "./detectors/phone.ts";
import { detectRollNumbers } from "./detectors/roll-no.ts";
import type { GazetteerMatcher } from "./gazetteer.ts";
import { mergeSpans, replaceSpans } from "./merge.ts";
import { buildDetectionView } from "./text-view.ts";

/** Tenant-specific detectors: compiled roll-number patterns and the directory-name matcher. */
export interface TenantDetectors {
  readonly rollNumberPatterns: readonly RE2[];
  readonly gazetteer: GazetteerMatcher | undefined;
}

export interface EngineResult {
  readonly text: string;
  readonly spans: readonly RedactionSpan[];
}

/** Runs every detector over the detection view and returns the unmerged candidate spans. */
export function detectCandidates(
  view: string,
  tenant: TenantDetectors,
): RedactionSpan[] {
  return [
    ...detectEmails(view),
    ...detectPhones(view),
    ...detectGovernmentIds(view),
    ...detectBankNumbers(view),
    ...detectRollNumbers(view, tenant.rollNumberPatterns),
    ...detectAddresses(view),
    ...detectHonorificNames(view),
    ...(tenant.gazetteer?.find(view) ?? []),
  ];
}

export function redactText(
  input: string,
  tenant: TenantDetectors,
): EngineResult {
  const view = buildDetectionView(input);
  const spans = mergeSpans(detectCandidates(view, tenant));
  return { text: replaceSpans(input, spans), spans };
}
