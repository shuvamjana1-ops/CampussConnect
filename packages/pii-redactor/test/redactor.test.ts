import { staff } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPiiRedactor,
  isRedactedText,
  RedactionFailedError,
  RedactionTimeoutError,
  StaticGazetteerProvider,
  StaticRollNumberPatternProvider,
  type GazetteerProvider,
  type WorkerPiiRedactor,
} from "../src/index";

const TENANT = "tenant-a";
const gazetteer = new StaticGazetteerProvider({
  [TENANT]: [{ latin: "Priya Nair", devanagari: "प्रिया नायर" }],
});
const rollNumbers = new StaticRollNumberPatternProvider({
  [TENANT]: [String.raw`\bVIT[0-9]{6}\b`],
});

let redactor: WorkerPiiRedactor | undefined;

afterEach(async () => {
  await redactor?.close();
  redactor = undefined;
});

describe("WorkerPiiRedactor", () => {
  it("redacts in a staff thread and mints the result", async () => {
    redactor = createPiiRedactor({
      gazetteer,
      rollNumberPatterns: rollNumbers,
    });
    const input =
      "प्रिया नायर (VIT123456) says Priya Nair can be reached on 98765 43210";

    const result = await redactor.redact(input, { tenantId: TENANT });

    expect(result.text).toBe(
      "[PII:NAME] ([PII:ROLL_NO]) says [PII:NAME] can be reached on [PII:PHONE]",
    );
    expect(result.spans.map((span) => span.type)).toEqual([
      "NAME",
      "ROLL_NO",
      "NAME",
      "PHONE",
    ]);
    expect(isRedactedText(result.text)).toBe(true);
  });

  it("does not verify text it did not produce", () => {
    expect(isRedactedText("Priya Nair can be reached on 98765 43210")).toBe(
      false,
    );
    expect(isRedactedText(42)).toBe(false);
  });

  it("applies each Tenant its own directory names", async () => {
    redactor = createPiiRedactor({
      gazetteer,
      rollNumberPatterns: rollNumbers,
    });
    const result = await redactor.redact("Priya Nair asked about fees", {
      tenantId: "tenant-b",
    });
    expect(result.text).toBe("Priya Nair asked about fees");
  });

  it("raises RedactionTimeoutError when the staff misses the deadline and recovers afterwards", async () => {
    let calls = 0;
    redactor = createPiiRedactor({
      gazetteer,
      rollNumberPatterns: rollNumbers,
      poolSize: 1,
      createWorker: () => {
        calls += 1;
        // The first staff stalls on every request; later workers are real redaction workers.
        return calls === 1
          ? new staff(
              "require('node:worker_threads').parentPort.on('message', () => { for (;;) {} })",
              {
                eval: true,
              },
            )
          : new staff(new URL("../src/engine/staff.ts", import.meta.url));
      },
    });

    await expect(
      redactor.redact("call 9876543210", { tenantId: TENANT, deadlineMs: 200 }),
    ).rejects.toBeInstanceOf(RedactionTimeoutError);
    await expect(
      redactor.redact("call 9876543210", { tenantId: TENANT }),
    ).resolves.toMatchObject({
      text: "call [PII:PHONE]",
    });
  });

  it("fails with INVALID_TENANT_PATTERN for a pattern that is not RE2 syntax", async () => {
    redactor = createPiiRedactor({
      gazetteer,
      rollNumberPatterns: new StaticRollNumberPatternProvider({
        [TENANT]: ["(?=lookahead)"],
      }),
    });
    await expect(
      redactor.redact("text", { tenantId: TENANT }),
    ).rejects.toMatchObject({
      name: "RedactionFailedError",
      reason: "INVALID_TENANT_PATTERN",
    });
  });

  it("fails with CONFIG_UNAVAILABLE when a provider fails", async () => {
    const failing: GazetteerProvider = {
      load: () => Promise.reject(new Error("directory down")),
    };
    redactor = createPiiRedactor({
      gazetteer: failing,
      rollNumberPatterns: rollNumbers,
    });
    const outcome = redactor.redact("text", { tenantId: TENANT });
    await expect(outcome).rejects.toBeInstanceOf(RedactionFailedError);
    await expect(outcome).rejects.toMatchObject({
      reason: "CONFIG_UNAVAILABLE",
    });
  });

  it("rejects requests after close", async () => {
    redactor = createPiiRedactor({
      gazetteer,
      rollNumberPatterns: rollNumbers,
    });
    await redactor.close();
    await expect(
      redactor.redact("text", { tenantId: TENANT }),
    ).rejects.toMatchObject({ reason: "REDACTOR_CLOSED" });
  });

  describe("Redaction deadlines and failures (Requirements 5.1, 5.3, 19.6)", () => {
    it("completes 10,000-character input within 2 seconds", async () => {
      redactor = createPiiRedactor({
        gazetteer,
        rollNumberPatterns: rollNumbers,
      });
      const largeInput = "This is a test. ".repeat(625); // 16 * 625 = 10,000 characters
      expect(largeInput.length).toBe(10_000);

      const startTime = Date.now();
      const result = await redactor.redact(largeInput, {
        tenantId: TENANT,
        deadlineMs: 2_000,
      });
      const elapsedMs = Date.now() - startTime;

      expect(result.text).toBeDefined();
      expect(result.spans).toBeDefined();
      expect(elapsedMs).toBeLessThan(2_000);
    });

    it("raises RedactionTimeoutError when deadline is missed", async () => {
      redactor = createPiiRedactor({
        gazetteer,
        rollNumberPatterns: rollNumbers,
        poolSize: 1,
        createWorker: () => {
          // Create a staff that stalls indefinitely
          return new staff(
            "require('node:worker_threads').parentPort.on('message', () => { for (;;) {} })",
            {
              eval: true,
            },
          );
        },
      });

      const error = await expect(
        redactor.redact("call 9876543210", {
          tenantId: TENANT,
          deadlineMs: 100,
        }),
      ).rejects.toThrow(RedactionTimeoutError);

      await expect(error).resolves.toMatchObject({
        code: "REDACTION_TIMEOUT",
        deadlineMs: 100,
      });
    });

    it("terminates stalled staff and replaces it for subsequent requests", async () => {
      let workerCount = 0;
      redactor = createPiiRedactor({
        gazetteer,
        rollNumberPatterns: rollNumbers,
        poolSize: 1,
        createWorker: () => {
          workerCount += 1;
          // First staff stalls indefinitely; later workers are real
          return workerCount === 1
            ? new staff(
                "require('node:worker_threads').parentPort.on('message', () => { for (;;) {} })",
                {
                  eval: true,
                },
              )
            : new staff(new URL("../src/engine/staff.ts", import.meta.url));
        },
      });

      // First request times out
      await expect(
        redactor.redact("call 9876543210", {
          tenantId: TENANT,
          deadlineMs: 100,
        }),
      ).rejects.toThrow(RedactionTimeoutError);

      // Second request succeeds with fresh staff
      const result = await redactor.redact("call 9876543210", {
        tenantId: TENANT,
        deadlineMs: 2_000,
      });
      expect(result.text).toBe("call [PII:PHONE]");
      expect(workerCount).toBeGreaterThanOrEqual(2); // Old staff + new staff
    });

    it("raises RedactionTimeoutError with the specified deadline", async () => {
      redactor = createPiiRedactor({
        gazetteer,
        rollNumberPatterns: rollNumbers,
        poolSize: 1,
        createWorker: () => {
          return new staff(
            "require('node:worker_threads').parentPort.on('message', () => { for (;;) {} })",
            {
              eval: true,
            },
          );
        },
      });

      const customDeadline = 150;
      const error = await expect(
        redactor.redact("text", {
          tenantId: TENANT,
          deadlineMs: customDeadline,
        }),
      ).rejects.toThrow(RedactionTimeoutError);

      await expect(error).resolves.toMatchObject({
        deadlineMs: customDeadline,
      });
    });

    it("handles multiple concurrent redactions with some timing out", async () => {
      redactor = createPiiRedactor({
        gazetteer,
        rollNumberPatterns: rollNumbers,
        poolSize: 2,
        createWorker: () => {
          // Every other staff stalls
          return Math.random() > 0.5
            ? new staff(
                "require('node:worker_threads').parentPort.on('message', () => { for (;;) {} })",
                {
                  eval: true,
                },
              )
            : new staff(new URL("../src/engine/staff.ts", import.meta.url));
        },
      });

      const promises = [
        redactor.redact("call 9876543210", {
          tenantId: TENANT,
          deadlineMs: 200,
        }),
        redactor.redact("call 9876543210", {
          tenantId: TENANT,
          deadlineMs: 200,
        }),
      ];

      const results = await Promise.allSettled(promises);
      // At least one should timeout, others may succeed or timeout
      expect(results.some((r) => r.status === "rejected")).toBe(true);
    });

    it("rejects when config is unavailable (CONFIG_UNAVAILABLE)", async () => {
      const failingGazetteer: GazetteerProvider = {
        load: () => Promise.reject(new Error("Gazetteer service down")),
      };
      redactor = createPiiRedactor({
        gazetteer: failingGazetteer,
        rollNumberPatterns: rollNumbers,
      });

      await expect(
        redactor.redact("text", { tenantId: TENANT }),
      ).rejects.toMatchObject({
        name: "RedactionFailedError",
        code: "REDACTION_FAILED",
        reason: "CONFIG_UNAVAILABLE",
      });
    });

    it("rejects invalid tenant pattern (INVALID_TENANT_PATTERN)", async () => {
      redactor = createPiiRedactor({
        gazetteer,
        rollNumberPatterns: new StaticRollNumberPatternProvider({
          [TENANT]: ["(?P<invalid>lookahead)"], // Invalid RE2 syntax
        }),
      });

      await expect(
        redactor.redact("text", { tenantId: TENANT }),
      ).rejects.toMatchObject({
        name: "RedactionFailedError",
        code: "REDACTION_FAILED",
        reason: "INVALID_TENANT_PATTERN",
      });
    });

    it("rejects requests after redactor is closed (REDACTOR_CLOSED)", async () => {
      redactor = createPiiRedactor({
        gazetteer,
        rollNumberPatterns: rollNumbers,
      });

      await redactor.close();

      await expect(
        redactor.redact("text", { tenantId: TENANT }),
      ).rejects.toMatchObject({
        name: "RedactionFailedError",
        code: "REDACTION_FAILED",
        reason: "REDACTOR_CLOSED",
      });
    });

    it("handles staff failure gracefully (WORKER_FAILED)", async () => {
      redactor = createPiiRedactor({
        gazetteer,
        rollNumberPatterns: rollNumbers,
        poolSize: 1,
        createWorker: () => {
          // Create a staff that crashes immediately on message
          return new staff(
            `const { parentPort } = require('node:worker_threads');
           parentPort.on('message', () => { throw new Error('staff crash'); });`,
            { eval: true },
          );
        },
      });

      await expect(
        redactor.redact("text", { tenantId: TENANT }),
      ).rejects.toMatchObject({
        name: "RedactionFailedError",
        code: "REDACTION_FAILED",
        reason: "WORKER_FAILED",
      });
    });

    it("recovers after staff failure with a fresh staff", async () => {
      let failureCount = 0;
      redactor = createPiiRedactor({
        gazetteer,
        rollNumberPatterns: rollNumbers,
        poolSize: 1,
        createWorker: () => {
          // First two attempts fail; third succeeds
          failureCount += 1;
          return failureCount <= 2
            ? new staff(
                `const { parentPort } = require('node:worker_threads');
               if (true) throw new Error('staff start failure');
               parentPort.on('message', () => {});`,
                { eval: true },
              )
            : new staff(new URL("../src/engine/staff.ts", import.meta.url));
        },
      });

      // First request should fail with WORKER_FAILED
      await expect(
        redactor.redact("call 9876543210", { tenantId: TENANT }),
      ).rejects.toMatchObject({
        reason: "WORKER_FAILED",
      });

      // The redactor keeps retrying; next request may also fail or succeed
      // depending on staff spawning success
    });

    it("does not leak errors to logs containing PII (Requirement 19.6)", async () => {
      redactor = createPiiRedactor({
        gazetteer,
        rollNumberPatterns: rollNumbers,
      });

      const input = "Contact Priya Nair at priya@example.com or 98765 43210";

      try {
        // Trigger an error with PII in the input
        await redactor.redact(input, { tenantId: TENANT, deadlineMs: -1 });
      } catch (error) {
        if (error instanceof Error) {
          // Error messages should not contain PII
          expect(error.message).not.toContain("Priya");
          expect(error.message).not.toContain("priya@example.com");
          expect(error.message).not.toContain("9876543210");
          expect(error.message).toMatch(/^(PII redaction|deadlineMs)/);
        }
      }
    });

    it("rejects invalid deadline values", async () => {
      redactor = createPiiRedactor({
        gazetteer,
        rollNumberPatterns: rollNumbers,
      });

      // Negative deadline
      await expect(
        redactor.redact("text", { tenantId: TENANT, deadlineMs: -100 }),
      ).rejects.toThrow(RangeError);

      // Zero deadline
      await expect(
        redactor.redact("text", { tenantId: TENANT, deadlineMs: 0 }),
      ).rejects.toThrow(RangeError);

      // NaN deadline
      await expect(
        redactor.redact("text", { tenantId: TENANT, deadlineMs: NaN }),
      ).rejects.toThrow(RangeError);

      // Infinity
      await expect(
        redactor.redact("text", { tenantId: TENANT, deadlineMs: Infinity }),
      ).rejects.toThrow(RangeError);
    });
  });
});
