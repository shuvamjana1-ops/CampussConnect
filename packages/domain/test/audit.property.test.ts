// @campusconnect/domain/audit: property test for hash chain integrity.

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  type AuditEntry,
  type HashedAuditEntry,
  chainHash,
  chainTail,
  verifyChain,
} from '../src/audit/index.js';
import { auditEntries, auditEntrySequences } from './arbitraries/index.js';

describe('Audit hash chain', () => {
  /**
   * **Property 57: Audit hash chain detects tampering**
   * **Validates: Requirements 18.3, 18.4**
   *
   * For any sequence of audit entries, the hash chain correctly verifies when unchanged
   * and detects any tampering (modification, deletion, or reordering) in the chain.
   */
  it('detects tampering in the chain', () => {
    fc.assert(
      fc.property(auditEntrySequences({ minLength: 1, maxLength: 20 }), (entries) => {
        // Build the chain
        const hashed: HashedAuditEntry[] = [];
        let prevHash = '';
        for (const entry of entries) {
          const hash = chainHash(prevHash, entry);
          hashed.push({ ...entry, hash });
          prevHash = hash;
        }

        // Verify the chain is valid
        const result1 = verifyChain(hashed, '');
        expect(result1.isValid).toBe(true);
        expect(result1.firstFailingEntryId).toBeUndefined();
      }),
    );
  });

  it('detects entry modification', () => {
    fc.assert(
      fc.property(
        auditEntrySequences({ minLength: 2, maxLength: 10 }),
        (entries) => {
          // Build the chain
          const hashed: HashedAuditEntry[] = [];
          let prevHash = '';
          for (const entry of entries) {
            const hash = chainHash(prevHash, entry);
            hashed.push({ ...entry, hash });
            prevHash = hash;
          }

          // Pick an entry to tamper with (not the first, to keep prevHash constant)
          const tamperedIndex = Math.floor(Math.random() * (hashed.length - 1)) + 1;
          const tampered = [...hashed];
          const original = tampered[tamperedIndex];
          // Modify the action field
          tampered[tamperedIndex] = {
            ...original,
            action: 'tampered.action',
          };

          // Verification should fail at the tampered entry
          const result = verifyChain(tampered, '');
          expect(result.isValid).toBe(false);
          expect(result.firstFailingEntryId).toBe(original.id);
        },
      ),
    );
  });

  it('detects entry deletion', () => {
    fc.assert(
      fc.property(
        auditEntrySequences({ minLength: 3, maxLength: 10 }),
        (entries) => {
          // Build the chain
          const hashed: HashedAuditEntry[] = [];
          let prevHash = '';
          for (const entry of entries) {
            const hash = chainHash(prevHash, entry);
            hashed.push({ ...entry, hash });
            prevHash = hash;
          }

          // Delete an entry in the middle
          const deletedIndex = Math.floor(Math.random() * (hashed.length - 2)) + 1;
          const deleted = [...hashed.slice(0, deletedIndex), ...hashed.slice(deletedIndex + 1)];

          // Verification should fail at the entry after the deletion
          const result = verifyChain(deleted, '');
          expect(result.isValid).toBe(false);
          expect(result.firstFailingEntryId).toBe(hashed[deletedIndex + 1].id);
        },
      ),
    );
  });

  it('detects entry reordering', () => {
    fc.assert(
      fc.property(
        auditEntrySequences({ minLength: 3, maxLength: 10 }),
        (entries) => {
          // Build the chain
          const hashed: HashedAuditEntry[] = [];
          let prevHash = '';
          for (const entry of entries) {
            const hash = chainHash(prevHash, entry);
            hashed.push({ ...entry, hash });
            prevHash = hash;
          }

          // Swap two adjacent entries
          const swapIndex = Math.floor(Math.random() * (hashed.length - 1));
          const reordered = [...hashed];
          [reordered[swapIndex], reordered[swapIndex + 1]] = [
            reordered[swapIndex + 1],
            reordered[swapIndex],
          ];

          // Verification should fail at the first swapped entry
          const result = verifyChain(reordered, '');
          expect(result.isValid).toBe(false);
          expect(result.firstFailingEntryId).toBe(reordered[swapIndex].id);
        },
      ),
    );
  });

  it('handles continuous verification with previous tail', () => {
    fc.assert(
      fc.property(
        auditEntrySequences({ minLength: 1, maxLength: 10 }),
        auditEntrySequences({ minLength: 1, maxLength: 10 }),
        (batch1, batch2) => {
          // Build first batch
          const hashed1: HashedAuditEntry[] = [];
          let prevHash = '';
          for (const entry of batch1) {
            const hash = chainHash(prevHash, entry);
            hashed1.push({ ...entry, hash });
            prevHash = hash;
          }

          // Verify first batch
          const result1 = verifyChain(hashed1, '');
          expect(result1.isValid).toBe(true);

          // Get tail of first batch for use in second batch
          const tailHash = chainTail(hashed1);

          // Build second batch using the tail
          const hashed2: HashedAuditEntry[] = [];
          prevHash = tailHash;
          for (const entry of batch2) {
            const hash = chainHash(prevHash, entry);
            hashed2.push({ ...entry, hash });
            prevHash = hash;
          }

          // Verify second batch with first tail as starting point
          const result2 = verifyChain(hashed2, tailHash);
          expect(result2.isValid).toBe(true);
        },
      ),
    );
  });

  it('handles empty chain', () => {
    const result = verifyChain([], '');
    expect(result.isValid).toBe(true);
    expect(result.firstFailingEntryId).toBeUndefined();
  });

  it('provides correct tail hash', () => {
    fc.assert(
      fc.property(auditEntrySequences({ minLength: 1, maxLength: 10 }), (entries) => {
        // Build the chain
        const hashed: HashedAuditEntry[] = [];
        let prevHash = '';
        let lastHash = '';
        for (const entry of entries) {
          const hash = chainHash(prevHash, entry);
          hashed.push({ ...entry, hash });
          prevHash = hash;
          lastHash = hash;
        }

        // Verify tail matches last entry hash
        const tail = chainTail(hashed);
        expect(tail).toBe(lastHash);
      }),
    );
  });
});
