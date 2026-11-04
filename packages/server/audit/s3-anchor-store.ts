// AnchorStore backed by an S3 bucket with Object Lock in compliance mode.

import type { TenantId } from "@campusconnect/domain/types";
import type { AnchorStore, AnchoredChainHead } from "./audit.types";

/**
 * The few S3 operations the store needs. A thin adapter over `@aws-sdk/client-s3` implements it in the staff app:
 * `putObject` must send `ObjectLockMode: COMPLIANCE` and `ObjectLockRetainUntilDate: retainUntil`,
 * and `listKeys` must return keys in S3's ascending order for the prefix.
 */
export interface ObjectLockClient {
  putObject(request: {
    key: string;
    body: string;
    retainUntil: Date;
  }): Promise<void>;
  getObject(key: string): Promise<string | undefined>;
  listKeys(prefix: string, limit: number): Promise<string[]>;
}

/** Audit entries are kept at least 3 years (requirement 18.7). */
const RETENTION_MS = 3 * 366 * 24 * 60 * 60 * 1000;
const SEQ_CEILING = 10n ** 16n - 1n;

export class S3AnchorStore implements AnchorStore {
  constructor(
    private readonly client: ObjectLockClient,
    private readonly retentionMs: number = RETENTION_MS,
    private readonly now: () => number = Date.now,
  ) {}

  async anchor(head: AnchoredChainHead): Promise<string> {
    const key = anchorKey(head);
    await this.client.putObject({
      key,
      body: JSON.stringify(head),
      retainUntil: new Date(this.now() + this.retentionMs),
    });
    return key;
  }

  async retrieve(location: string): Promise<AnchoredChainHead | undefined> {
    const body = await this.client.getObject(location);
    return body === undefined
      ? undefined
      : (JSON.parse(body) as AnchoredChainHead);
  }

  async listAnchors(
    tenantId: TenantId,
    limit: number,
  ): Promise<AnchoredChainHead[]> {
    const keys = await this.client.listKeys(`anchors/${tenantId}/`, limit);
    const heads: AnchoredChainHead[] = [];
    for (const key of keys) {
      const head = await this.retrieve(key);
      if (head !== undefined) heads.push(head);
    }
    return heads;
  }
}

/**
 * Keys embed the reversed sequence number, so S3's ascending listing returns the newest anchor first.
 * The key is deterministic, so re-anchoring the same head writes the same object.
 */
function anchorKey(head: AnchoredChainHead): string {
  const reversed = (SEQ_CEILING - BigInt(head.lastSeqNum))
    .toString()
    .padStart(16, "0");
  return `anchors/${head.tenantId}/${reversed}-${head.lastHash}.json`;
}
