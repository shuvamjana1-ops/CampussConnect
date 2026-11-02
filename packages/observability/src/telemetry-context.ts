/**
 * The identifiers that every log line, metric and span for a request carries (25.1).
 * Use {@link NO_TENANT} as `tenantId` for work without a Tenant.
 */
export interface TelemetryContext {
  /** The Tenant id (a UUID) or `NO_TENANT`. */
  readonly tenantId: string;
  /** The platform-generated request id (a ULID or UUID). Worker jobs use their job run id. */
  readonly requestId: string;
}

/**
 * Returns the current request's {@link TelemetryContext}, or `undefined` outside a request.
 * The api and worker apps implement it over their AsyncLocalStorage `RequestContext`.
 */
export type TelemetryContextProvider = () => TelemetryContext | undefined;
