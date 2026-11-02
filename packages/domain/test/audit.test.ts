// @campusconnect/domain/audit: unit tests for hash chain functions.

import { describe, it, expect } from 'vitest';
import {
  type AuditEntry,
  chainHash,
  canonicalJson,
  verifyChain,
  chainTail,
} from '../src/audit/index.js';
import { instant, tenantId, userId } from '../src/types/index.js';

describe('Audit hash chain - unit tests', () => {
  const entry1: AuditEntry = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    tenantId: tenantId('550e8400-e29b-41d4-a716-446655440011'),
    actor: userId('550e8400-e29b-41d4-a716-446655440021'),
    action: 'ticket.created',
    target: 'ticket:550e8400-e29b-41d4-a716-446655440031',
    outcome: 'success',
    details: { category: 'feedback', band: 'P2' },
    timestampMs: instant(1704067200000), // 2024-01-01T00:00:00Z
  };

  const entry2: AuditEntry = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    tenantId: tenantId('550e8400-e29b-41d4-a716-446655440011'),
    actor: userId('550e8400-e29b-41d4-a716-446655440022'),
    action: 'ticket.assigned',
    target: 'ticket:550e8400-e29b-41d4-a716-446655440031',
    outcome: 'success',
    details: { handler: 'handler123' },
    timestampMs: instant(1704067260000), // 1 minute later
  };

  it('canonicalJson produces deterministic output', () => {
    const json1 = canonicalJson(entry1);
    const json2 = canonicalJson(entry1);
    expect(json1).toBe(json2);
  });

  it('canonicalJson sorts keys', () => {
    const json = canonicalJson(entry1);
    const parsed = JSON.parse(json);
    const keys = Object.keys(parsed);
    const sortedKeys = [...keys].sort();
    expect(keys).toEqual(sortedKeys);
  });

  it('chainHash produces consistent result for same entry and prevHash', () => {
    const hash1 = chainHash('', entry1);
    const hash2 = chainHash('', entry1);
    expect(hash1).toBe(hash2);
  });

  it('chainHash produces different hash with different prevHash', () => {
    const hash1 = chainHash('', entry1);
    const hash2 = chainHash('abc123', entry1);
    expect(hash1).not.toBe(hash2);
  });

  it('chainHash produces different hash when entry changes', () => {
    const hash1 = chainHash('', entry1);
    const modified = { ...entry1, action: 'ticket.modified' };
    const hash2 = chainHash('', modified);
    expect(hash1).not.toBe(hash2);
  });

  it('verifyChain accepts valid chain', () => {
    const hash1 = chainHash('', entry1);
    const hash2 = chainHash(hash1, entry2);

    const hashed = [
      { ...entry1, hash: hash1 },
      { ...entry2, hash: hash2 },
    ];

    const result = verifyChain(hashed, '');
    expect(result.isValid).toBe(true);
    expect(result.firstFailingEntryId).toBeUndefined();
  });

  it('verifyChain rejects tampered entry', () => {
    const hash1 = chainHash('', entry1);
    const hash2 = chainHash(hash1, entry2);

    const hashed = [
      { ...entry1, hash: hash1 },
      { ...entry2, hash: hash2, action: 'ticket.modified' }, // Tampered
    ];

    const result = verifyChain(hashed, '');
    expect(result.isValid).toBe(false);
    expect(result.firstFailingEntryId).toBe(entry2.id);
  });

  it('verifyChain with continuation from previous tail', () => {
    // First batch
    const hash1 = chainHash('', entry1);
    const batch1 = [{ ...entry1, hash: hash1 }];
    const result1 = verifyChain(batch1, '');
    expect(result1.isValid).toBe(true);

    // Get tail
    const tail = chainTail(batch1);

    // Second batch
    const hash2 = chainHash(tail, entry2);
    const batch2 = [{ ...entry2, hash: hash2 }];
    const result2 = verifyChain(batch2, tail);
    expect(result2.isValid).toBe(true);
  });

  it('verifyChain empty array is valid', () => {
    const result = verifyChain([], '');
    expect(result.isValid).toBe(true);
    expect(result.firstFailingEntryId).toBeUndefined();
  });

  it('chainTail returns empty string for empty chain', () => {
    const tail = chainTail([]);
    expect(tail).toBe('');
  });

  it('chainTail returns last entry hash', () => {
    const hash1 = chainHash('', entry1);
    const hash2 = chainHash(hash1, entry2);

    const hashed = [
      { ...entry1, hash: hash1 },
      { ...entry2, hash: hash2 },
    ];

    const tail = chainTail(hashed);
    expect(tail).toBe(hash2);
  });

  it('handles system actor', () => {
    const systemEntry: AuditEntry = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      tenantId: tenantId('550e8400-e29b-41d4-a716-446655440011'),
      actor: 'system',
      action: 'sla.escalated',
      target: 'ticket:550e8400-e29b-41d4-a716-446655440031',
      outcome: 'success',
      timestampMs: instant(1704067320000),
    };

    const hash = chainHash('', systemEntry);
    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(64); // SHA-256 hex is 64 chars
  });

  it('handles missing details', () => {
    const entryNoDetails: AuditEntry = {
      id: '550e8400-e29b-41d4-a716-446655440004',
      tenantId: tenantId('550e8400-e29b-41d4-a716-446655440011'),
      actor: userId('550e8400-e29b-41d4-a716-446655440022'),
      action: 'config.updated',
      target: 'config:1',
      outcome: 'success',
      timestampMs: instant(1704067380000),
    };

    const hash = chainHash('', entryNoDetails);
    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(64);
  });

  it('handles failure outcome', () => {
    const failedEntry: AuditEntry = {
      id: '550e8400-e29b-41d4-a716-446655440005',
      tenantId: tenantId('550e8400-e29b-41d4-a716-446655440011'),
      actor: userId('550e8400-e29b-41d4-a716-446655440022'),
      action: 'auth.login',
      target: 'user:550e8400-e29b-41d4-a716-446655440022',
      outcome: 'failure',
      details: { reason: 'ACCOUNT_LOCKED' },
      timestampMs: instant(1704067440000),
    };

    const hash = chainHash('', failedEntry);
    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(64);

    // Verify chain with failed entry
    const hashed = [{ ...failedEntry, hash }];
    const result = verifyChain(hashed, '');
    expect(result.isValid).toBe(true);
  });
});
