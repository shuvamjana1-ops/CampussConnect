// Quick verification script for audit hash chain implementation
// This is a CommonJS file for Node.js verification without full test runner

const crypto = require('crypto');

// Simulate the implementations
function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

function canonicalJson(entry) {
  return JSON.stringify(sortKeys(entry));
}

function chainHash(prevHash, entry) {
  const canonical = canonicalJson(entry);
  const combined = canonical + prevHash;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

function verifyChain(entries, startPrevHash) {
  let prevHash = startPrevHash;
  for (const entry of entries) {
    const expectedHash = chainHash(prevHash, entry);
    if (entry.hash !== expectedHash) {
      return {
        isValid: false,
        firstFailingEntryId: entry.id,
      };
    }
    prevHash = entry.hash;
  }
  return { isValid: true };
}

// Test data
const entry1 = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  tenantId: 'tenant-1',
  actor: 'user-1',
  action: 'ticket.created',
  target: 'ticket:123',
  outcome: 'success',
  details: { category: 'feedback', band: 'P2' },
  timestampMs: 1704067200000,
};

const entry2 = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  tenantId: 'tenant-1',
  actor: 'user-2',
  action: 'ticket.assigned',
  target: 'ticket:123',
  outcome: 'success',
  details: { handler: 'handler123' },
  timestampMs: 1704067260000,
};

// Build and verify chain
console.log('Building chain...');
const hash1 = chainHash('', entry1);
console.log('Entry 1 hash:', hash1);

const hash2 = chainHash(hash1, entry2);
console.log('Entry 2 hash:', hash2);

const chain = [
  { ...entry1, hash: hash1 },
  { ...entry2, hash: hash2 },
];

console.log('\nVerifying valid chain...');
const result1 = verifyChain(chain, '');
console.log('Valid chain result:', result1);
if (!result1.isValid) {
  console.error('ERROR: Valid chain should pass verification!');
  process.exit(1);
}

console.log('\nVerifying tampered chain...');
const tampered = [
  { ...entry1, hash: hash1 },
  { ...entry2, hash: hash2, action: 'ticket.modified' },
];
const result2 = verifyChain(tampered, '');
console.log('Tampered chain result:', result2);
if (result2.isValid) {
  console.error('ERROR: Tampered chain should fail verification!');
  process.exit(1);
}
if (result2.firstFailingEntryId !== entry2.id) {
  console.error('ERROR: First failing entry should be entry2!');
  process.exit(1);
}

console.log('\n✅ All verification checks passed!');
