import { describe, expect, it } from "vitest";

import {
  buildEmfRecords,
  createMetricsEmitter,
  INVALID_VALUE,
  MAX_METRICS_PER_RECORD,
  type MetricDatum,
  type MetricsEmitterOptions,
} from "./metrics";
import { NO_TENANT } from "./validation";

const TENANT = "0190a1b2-0000-7000-8000-00000000000a";
const REQUEST = "01JABCDEFGHJKMNPQRSTVWXYZ0";
const NOW = Date.UTC(2026, 0, 15, 10, 0, 0);
const CONTEXT = { tenantId: TENANT, requestId: REQUEST };

function capture(options: Partial<MetricsEmitterOptions> = {}) {
  const raw: string[] = [];
  const metrics = createMetricsEmitter({
    service: "api",
    now: () => NOW,
    write: (line) => {
      raw.push(line);
    },
    ...options,
  });
  const records = () =>
    raw.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { metrics, raw, records };
}

describe("createMetricsEmitter", () => {
  it("writes an EMF record that carries the Tenant id and request id as properties, not dimensions", () => {
    const { metrics, records } = capture();

    metrics.emit(
      CONTEXT,
      [
        { name: "RequestCount", unit: "Count", value: 1 },
        { name: "RequestDuration", unit: "Milliseconds", value: 84.2 },
      ],
      { Route: "/api/v1/tickets/:id" },
    );

    expect(records()).toEqual([
      {
        _aws: {
          Timestamp: NOW,
          CloudWatchMetrics: [
            {
              Namespace: "CampusConnect",
              Dimensions: [["Service", "Route"]],
              Metrics: [
                { Name: "RequestCount", Unit: "Count" },
                { Name: "RequestDuration", Unit: "Milliseconds" },
              ],
            },
          ],
        },
        Service: "api",
        TenantId: TENANT,
        RequestId: REQUEST,
        Route: "/api/v1/tickets/:id",
        RequestCount: 1,
        RequestDuration: 84.2,
      },
    ]);
  });

  it("accepts NO_TENANT for platform work such as queue depth", () => {
    const { metrics, records } = capture({ service: "staff" });

    metrics.emit(
      { tenantId: NO_TENANT, requestId: REQUEST },
      [{ name: "QueueDepth", unit: "Count", value: 12 }],
      {
        Queue: "triage-jobs",
      },
    );

    expect(records()).toMatchObject([
      {
        Service: "staff",
        TenantId: NO_TENANT,
        RequestId: REQUEST,
        Queue: "triage-jobs",
      },
    ]);
  });

  it("writes INVALID_VALUE in place of a malformed Tenant id, request id or dimension value", () => {
    const { metrics, raw, records } = capture();

    metrics.emit(
      { tenantId: "iit-x", requestId: "priya@example.edu" },
      [{ name: "AiErrors", unit: "Count", value: 1 }],
      {
        Route: "/api/v1/students/2021CS1234",
        Purpose: "summary for Priya",
      },
    );

    expect(records()).toMatchObject([
      {
        TenantId: INVALID_VALUE,
        RequestId: INVALID_VALUE,
        Route: INVALID_VALUE,
        Purpose: INVALID_VALUE,
      },
    ]);
    for (const leaked of ["iit-x", "priya", "2021CS1234"]) {
      expect(raw.join("\n")).not.toContain(leaked);
    }
  });

  it("leaves out metrics with invalid, reserved or repeated names and non-finite values", () => {
    const { metrics, records } = capture();

    metrics.emit(CONTEXT, [
      { name: "DlqSize", unit: "Count", value: 3 },
      { name: "DlqSize", unit: "Count", value: 4 },
      { name: "priya@example.edu", unit: "Count", value: 1 },
      { name: "TenantId", unit: "None", value: 1 },
      {
        name: "SweeperLag",
        unit: "Milliseconds",
        value: Number.POSITIVE_INFINITY,
      },
    ]);

    const [record] = records();
    expect(record).toMatchObject({ DlqSize: 3, TenantId: TENANT });
    expect(record).not.toHaveProperty("SweeperLag");
    expect(record).not.toHaveProperty(["priya@example.edu"]);
  });

  it("writes nothing when no metric is left", () => {
    const { metrics, raw } = capture();

    metrics.emit(CONTEXT, [
      { name: "AuditChainerLag", unit: "Milliseconds", value: Number.NaN },
    ]);

    expect(raw).toEqual([]);
  });

  it("rejects an invalid service name or an AWS namespace", () => {
    expect(() => createMetricsEmitter({ service: "API" })).toThrow(RangeError);
    expect(() =>
      createMetricsEmitter({ service: "api", namespace: "AWS/ECS" }),
    ).toThrow(RangeError);
  });
});

describe("buildEmfRecords", () => {
  it("splits more than 100 metrics into several records, each with the Tenant id and request id", () => {
    const metrics = Array.from(
      { length: MAX_METRICS_PER_RECORD + 1 },
      (_, index): MetricDatum => ({
        name: `Metric${String(index)}`,
        unit: "Count",
        value: index,
      }),
    );

    const records = buildEmfRecords({
      namespace: "CampusConnect",
      service: "api",
      timestamp: NOW,
      context: CONTEXT,
      metrics,
    });

    expect(
      records.map((record) => record._aws.CloudWatchMetrics[0]?.Metrics.length),
    ).toEqual([MAX_METRICS_PER_RECORD, 1]);
    for (const record of records) {
      expect(record).toMatchObject({ TenantId: TENANT, RequestId: REQUEST });
    }
  });
});
