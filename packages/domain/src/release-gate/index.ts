// Release gate for dependency vulnerabilities (22.9).

export type Severity = 'low' | 'moderate' | 'high' | 'critical';

export interface Finding {
  readonly id: string;
  readonly severity: Severity;
  readonly packageName?: string;
}

export interface SecurityException {
  readonly findingId: string;
  readonly approver: string;
  /** ISO date (YYYY-MM-DD) or timestamp. */
  readonly expires: string;
}

function isActive(exception: SecurityException, buildDate: Date): boolean {
  if (exception.approver.trim() === '') return false;
  const expiry = new Date(exception.expires);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() > buildDate.getTime();
}

/** Critical findings that have no approved, unexpired exception. */
export function unresolvedCriticalFindings(
  findings: readonly Finding[],
  exceptions: readonly SecurityException[],
  buildDate: Date,
): Finding[] {
  return findings.filter(
    (f) =>
      f.severity === 'critical' &&
      !exceptions.some((e) => e.findingId === f.id && isActive(e, buildDate)),
  );
}

export function releaseBlocked(
  findings: readonly Finding[],
  exceptions: readonly SecurityException[],
  buildDate: Date,
): boolean {
  return unresolvedCriticalFindings(findings, exceptions, buildDate).length > 0;
}
