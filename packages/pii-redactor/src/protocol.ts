/** Messages between WorkerPiiRedactor (main thread) and the redaction staff (`engine/staff.ts`). */
import type { RedactionSpan } from "./pii-types";
import type { GazetteerName } from "./providers";

export interface RedactRequest {
  readonly type: "redact";
  readonly id: number;
  readonly text: string;
  readonly rollNumberPatterns: readonly string[];
  /** Cache key of the Tenant gazetteer (Tenant id and version), or null when the Tenant has no names. */
  readonly gazetteerKey: string | null;
  /** Sent only after the staff answered `need-gazetteer` for this request. */
  readonly gazetteerNames?: readonly GazetteerName[] | undefined;
}

export type WorkerResponse =
  | {
      readonly type: "result";
      readonly id: number;
      readonly text: string;
      readonly spans: readonly RedactionSpan[];
    }
  | { readonly type: "need-gazetteer"; readonly id: number }
  | {
      readonly type: "error";
      readonly id: number;
      readonly reason: "INVALID_TENANT_PATTERN" | "ENGINE_ERROR";
    };
