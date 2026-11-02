// Usage: node security-exceptions/cli.ts [--osv osv.json] [--audit audit.json] [--exceptions security/exceptions.yaml]
// Exits 1 when a critical finding has no approved, unexpired exception (22.9).
import { readFile } from 'node:fs/promises';
import {
  unresolvedCriticalFindings,
  type Finding,
  type SecurityException,
  type Severity,
} from '@campusconnect/domain/release-gate';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readOptional(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

function normalizeSeverity(s: unknown): Severity {
  const v = String(s ?? '').toLowerCase();
  if (v === 'critical' || v === 'high' || v === 'low') return v;
  return v === 'medium' || v === 'moderate' ? 'moderate' : 'low';
}

/** OSV-Scanner JSON: results[].packages[].groups[].{ids, max_severity} (CVSS score). */
export function parseOsv(text: string): Finding[] {
  const out: Finding[] = [];
  const json = JSON.parse(text) as {
    results?: {
      packages?: {
        package?: { name?: string };
        groups?: { ids?: string[]; max_severity?: string }[];
        vulnerabilities?: { id: string; database_specific?: { severity?: string } }[];
      }[];
    }[];
  };
  for (const r of json.results ?? []) {
    for (const p of r.packages ?? []) {
      const sevById = new Map<string, Severity>();
      for (const v of p.vulnerabilities ?? []) {
        if (v.database_specific?.severity) {
          sevById.set(v.id, normalizeSeverity(v.database_specific.severity));
        }
      }
      for (const g of p.groups ?? []) {
        const score = Number(g.max_severity);
        for (const id of g.ids ?? []) {
          const severity: Severity = Number.isFinite(score) && g.max_severity !== ''
            ? score >= 9
              ? 'critical'
              : score >= 7
                ? 'high'
                : score >= 4
                  ? 'moderate'
                  : 'low'
            : (sevById.get(id) ?? 'low');
          out.push({ id, severity, packageName: p.package?.name });
        }
      }
    }
  }
  return out;
}

/** `pnpm audit --json`: advisories{} (v8) or vulnerabilities{}.via[] (npm style). */
export function parseAudit(text: string): Finding[] {
  const out: Finding[] = [];
  const json = JSON.parse(text) as {
    advisories?: Record<string, { severity?: string; module_name?: string; github_advisory_id?: string; cves?: string[] }>;
    vulnerabilities?: Record<string, { via?: unknown[] }>;
  };
  for (const [key, a] of Object.entries(json.advisories ?? {})) {
    const severity = normalizeSeverity(a.severity);
    const ids = [a.github_advisory_id, ...(a.cves ?? []), key].filter((x): x is string => !!x);
    for (const id of ids) out.push({ id, severity, packageName: a.module_name });
  }
  for (const [name, v] of Object.entries(json.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via === 'object' && via !== null) {
        const o = via as { source?: number | string; url?: string; severity?: string };
        const id = o.url?.split('/').pop() ?? String(o.source ?? name);
        out.push({ id, severity: normalizeSeverity(o.severity), packageName: name });
      }
    }
  }
  return out;
}

/** Minimal parser for the list-of-maps shape of security/exceptions.yaml. */
export function parseExceptions(text: string): SecurityException[] {
  const items: Record<string, string>[] = [];
  let cur: Record<string, string> | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '');
    if (line.trim() === '') continue;
    const m = /^\s*(-\s+)?([A-Za-z_]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    if (m[1]) {
      cur = {};
      items.push(cur);
    }
    if (cur) cur[m[2]!] = m[3]!.trim().replace(/^['"]|['"]$/g, '');
  }
  return items.flatMap((i) => {
    const findingId = i.id ?? i.findingId;
    return findingId && i.approver && i.expires
      ? [{ findingId, approver: i.approver, expires: i.expires }]
      : [];
  });
}

async function main(): Promise<number> {
  const findings: Finding[] = [];
  const osv = await readOptional(arg('osv'));
  if (osv) findings.push(...parseOsv(osv));
  const audit = await readOptional(arg('audit'));
  if (audit) findings.push(...parseAudit(audit));
  const exc = await readOptional(arg('exceptions') ?? 'security/exceptions.yaml');
  const exceptions = exc ? parseExceptions(exc) : [];

  const blocking = unresolvedCriticalFindings(findings, exceptions, new Date());
  for (const f of blocking) {
    console.error(`BLOCKED: ${f.id} (${f.packageName ?? 'unknown'}) is critical with no approved, unexpired exception`);
  }
  if (blocking.length === 0) console.log('Release gate passed');
  return blocking.length > 0 ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('security-exceptions/cli.ts')) {
  main().then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e);
      process.exit(2);
    },
  );
}
