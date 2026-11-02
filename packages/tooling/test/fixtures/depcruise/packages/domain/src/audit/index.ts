// Allowed: crypto for hashing and another domain module's index.ts.
import { createHash } from 'node:crypto';
import type { TenantId } from '../types';

export const chainHash = (tenantId: TenantId, entry: string) => createHash('sha256').update(tenantId + entry).digest('hex');
