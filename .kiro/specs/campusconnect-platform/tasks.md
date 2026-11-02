# Implementation Plan: CampusConnect Platform

## Overview

This plan implements the CampusConnect design in TypeScript (Node.js 22, strict mode) as a pnpm and Turborepo monorepo, following the layout in design.md. Tasks are ordered by the Phase Mapping in requirements.md:

- **Phase 1** (tasks 1–26): foundations first (scaffolding, contracts, domain rules, observability, PII redaction, database and RLS, audit log, outbox and jobs, AI, SSO and ERP adapters, identity, tenancy), then the ticketing and grievance core, notifications, triage, SLA, Staff_Workbench, ERP sync, privacy, core analytics, the PWA, CDK infrastructure and the delivery pipeline.
- **Phase 2** (tasks 27–32): opportunities, matching, applications and Document_Locker.
- **Phase 3** (tasks 33–38): broadcasts, emergency alerts, executive analytics and signed exports.
- **Phase 4** (tasks 39–42): AI Copilot.

Pure business rules live in `packages/domain` and are built before the module that uses them, with their property tests placed directly after them. Each domain module is a separate subpath export (`@campusconnect/domain/<module>`), so domain modules can be built in parallel. All AI calls go through the `AiAdapter` interface; tests use `FakeAiAdapter`, and the Hugging Face implementation is selected by configuration. Text reaches the adapter only as `RedactedText` produced by the PII_Redactor.

## Tasks

### Phase 1: Foundations

- [x] 1. Set up the monorepo, tooling and shared contracts
  - [x] 1.1 Scaffold the pnpm and Turborepo monorepo
    - Create `pnpm-workspace.yaml`, `turbo.json`, root `package.json` (Node.js 22 engines) and an empty workspace for every app and package in the design's monorepo layout (`apps/web`, `apps/api`, `apps/worker`, `apps/mock-sso`, all `packages/*`, `infra`, `tools`)
    - Add `packages/tooling` with a strict `tsconfig` base, ESLint config, a Vitest preset whose setup file calls `fc.configureGlobal({ numRuns: 100 })`, and `dependency-cruiser` rules enforcing the six module dependency rules from the design
    - Configure `packages/domain` with wildcard subpath exports (`./*` → `src/*/index.ts`) and a `test/arbitraries/` folder with one file per domain module
    - Add `.gitleaks.toml` and root scripts `typecheck`, `lint`, `depcruise`, `test`, `test:integration`
    - _Requirements: 22.6_

  - [x] 1.2 Implement the validation catalogue in `packages/contracts`
    - Zod field specs for every row of the design's validation catalogue, with string lengths counted in Unicode code points after NFC normalisation and unknown fields rejected
    - `validate(schema, input)` returning every invalid field path with its rule and bounds
    - RFC 9457 problem+json type and the error code enum from the Error Handling section
    - _Requirements: 1.6, 4.2, 4.10, 6.4, 6.11, 7.8, 7.11, 8.3, 8.5, 10.11, 14.1, 14.8, 15.2, 16.12, 20.9, 22.4_

  - [x] 1.3 Write property test for the validation catalogue
    - **Property 2: Validation accepts exactly in-bounds values**
    - **Validates: Requirements 1.6, 4.2, 4.10, 6.4, 6.10, 6.11, 7.8, 7.11, 8.2, 8.3, 8.5, 10.10, 10.11, 14.1, 14.7, 14.8, 15.2, 16.12, 20.8, 20.9, 22.4**

  - [x] 1.4 Implement the input sanitiser in `packages/contracts`
    - `sanitizeText()` using `sanitize-html` with no allowed tags, applied by the API to user text that is rendered to other users
    - _Requirements: 22.5_

  - [x] 1.5 Write property test for sanitisation
    - **Property 65: Sanitisation neutralises executable content**
    - **Validates: Requirements 22.5**

- [ ] 2. Implement core pure rules in `packages/domain`
  - [x] 2.1 Implement shared types and the working calendar
    - Branded ids (`TenantId`, `UserId`, `DepartmentId`, `TicketId`) and `Instant` in `domain/types`
    - `WorkingCalendar`, `addWorkingSeconds`, `workingSecondsBetween` and `isWorkingDay` in `domain/calendar` using Luxon, with `working` and `continuous` modes and a `CalendarHasNoWorkingTime` error
    - Arbitraries for instants, IANA zones (including DST zones) and calendars with random windows and holidays
    - _Requirements: 6.1, 6.2, 6.12_

  - [x] 2.2 Write property test for the working calendar
    - **Property 19: Working-calendar round trip**
    - **Validates: Requirements 6.1, 6.2**

  - [x] 2.3 Implement `RetryPolicy` and the retry executor in `domain/retry`
    - Fixed-interval and exponential-with-jitter policies with a terminal action (flag, notify or dead-letter)
    - Named policies: P0 escalation (3 × 30 s), ERP prefill (3 × 5 min), embedding regeneration (3 × 5 min), report retry (1 within 15 min), ERP sync (4 × 15 min), async jobs (5 retries at `5 s × 2^n` plus up to 20% jitter)
    - _Requirements: 5.7, 10.2, 10.8, 15.6, 17.6, 24.6_

  - [x] 2.4 Write property test for retry policies
    - **Property 18: Retry policies**
    - **Validates: Requirements 5.7, 10.2, 10.8, 15.6, 17.6, 24.6**

  - [x] 2.5 Implement the RBAC matrix and `authorize` in `domain/rbac`
    - Static permission matrix matching the design table for the six roles, with scope predicates for department membership, ownership, grants, confidential reveals and active enrolment for Student writes; deny by default with `INSUFFICIENT_PERMISSION`
    - `reportScopeFilter(principal)` restricting report rows to the requester's role and department scope
    - Arbitraries for principals, resources and actions
    - _Requirements: 2.2, 2.4, 2.5, 2.6, 4.3, 10.12, 13.8, 15.3, 17.9_

  - [x] 2.6 Write property test for authorisation
    - **Property 3: Authorisation is deny-by-default and scope-respecting**
    - **Validates: Requirements 2.4, 2.5, 2.6, 4.3, 10.12, 13.8, 15.3, 17.9**

  - [x] 2.7 Implement session, lockout and rate-limit rules in `domain/auth`
    - `sessionValid(lastActivity, now, idleMinutes)` for idle timeouts of 5 to 480 minutes
    - `lockoutState(attempts, now, policy)`: 5 failures within 15 minutes lock for 15 minutes; attempts during a lock are rejected and not counted; failed MFA counts as a failure
    - Sliding-window `rateLimitDecision(requests, limit, windowSec, now)` returning `retryAfterSeconds`
    - _Requirements: 2.7, 2.9, 22.7, 22.8_

  - [x] 2.8 Write property test for session idle expiry
    - **Property 4: Session idle expiry**
    - **Validates: Requirements 2.7**

  - [ ]* 2.9 Write property test for account lockout
    - **Property 5: Account lockout**
    - Compare against a simple reference model kept in the test folder
    - **Validates: Requirements 2.9**

  - [ ]* 2.10 Write property test for rate limiting
    - **Property 64: Rate limiting**
    - **Validates: Requirements 22.7, 22.8**

  - [x] 2.11 Implement recurring schedule calculation in `domain/schedule`
    - `nextRunAt(schedule, after, timeZone)` for daily, weekly, monthly and quarterly reports, weekly digests at a configured weekday and time, and 24-hour ERP sync
    - _Requirements: 14.2, 15.1, 17.5_

  - [ ]* 2.12 Write property test for recurring schedules
    - **Property 52: Recurring schedules**
    - **Validates: Requirements 14.2, 15.1, 17.5**

- [x] 3. Implement the observability and PII redaction packages
  - [x] 3.1 Implement `packages/observability`
    - pino logger that accepts only a typed `LogFields` allowlist (`requestId`, `tenantId`, `route`, `status`, `durationMs`, `errorCode`, `actorRef`), with `actorRef` an HMAC of the user id under a per-tenant key
    - OpenTelemetry SDK setup with a span attribute allowlist, and CloudWatch Embedded Metric Format helpers that always carry Tenant id and request id
    - _Requirements: 19.6, 25.1_

  - [x] 3.2 Implement `packages/pii-redactor`
    - `RedactedText` brand that only this package can mint, plus a per-process mint registry used by the AI egress guard
    - `re2` detectors for EMAIL, PHONE, GOV_ID, BANK_CARD, ROLL_NO (Tenant-configured patterns), ADDRESS and NAME (gazetteer provider interface with Latin and Devanagari forms, honorific patterns)
    - Span merging (longest span, then type priority), right-to-left `[PII:TYPE]` replacement, worker-thread execution with a 2-second deadline raising `RedactionTimeoutError`
    - _Requirements: 5.1, 5.2, 5.3, 19.6_

  - [x] 3.3 Write property test for PII redaction
    - **Property 13: PII redaction is complete and idempotent**
    - Generators interleave non-PII text with every PII type in Latin and Devanagari script
    - **Validates: Requirements 5.2**

  - [x] 3.4 Write unit tests for redaction deadlines and failures
    - 10,000-character input completes within 2 seconds; a stalled detector raises `RedactionTimeoutError`
    - _Requirements: 5.1, 5.3_

- [ ] 4. Build the database package with row-level security
  - [x] 4.1 Create the Drizzle schema, roles and RLS foundation in `packages/db`
    - Migrations for database roles (`cc_owner`, `cc_app`, `cc_reader`, `cc_definer`), extensions (`pgvector`, `pg_trgm`, `pgcrypto`), the `app.tenant()`, `app.uid()`, `app.has_role()` and `app.depts()` helpers, and the `core` and `platform` schema skeletons
    - Restrictive `tenant_isolation` policy and `force row level security` on every Tenant table; every index leads with `tenant_id`
    - `withTenant(ctx, fn)` that opens a transaction and sets the four transaction-local settings; `owner_tenant_of(resource_type, id)` SECURITY DEFINER function
    - Testcontainers harness (PostgreSQL 16 with pgvector) that applies production migrations and wraps each test in a rolled-back transaction
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 4.2 Write RLS migration lint and integration tests
    - Fail if any table with a `tenant_id` column lacks forced RLS or the restrictive policy; unset context returns zero rows; cross-tenant inserts fail the `with check` clause
    - _Requirements: 1.1_

- [ ] 5. Implement the Audit_Log core
  - [x] 5.1 Implement the audit hash chain in `domain/audit`
    - `AuditEntry` type, RFC 8785 canonical JSON, `chainHash(prevHash, entry)` and `verifyChain(entries, startPrevHash)` returning the id of the first failing entry
    - Arbitraries for audit entry sequences
    - _Requirements: 18.3, 18.4_

  - [x] 5.2 Write property test for the audit hash chain
    - **Property 57: Audit hash chain detects tampering**
    - **Validates: Requirements 18.3, 18.4**

  - [x] 5.3 Implement audit storage, recording and chaining in `packages/server/audit`
    - Migrations for `audit.audit_pending`, monthly-partitioned `audit.audit_log` and `audit.audit_chain_head`; `INSERT, SELECT` only for `cc_app`; trigger rejecting `UPDATE` and `DELETE` for every role
    - `audit.record()` inserting into `audit_pending` inside the caller's transaction, accepting only ids, codes and `RedactedText` in `details` (G4), with insert failure surfacing as `AUDIT_UNAVAILABLE`
    - Per-tenant chainer loop (advisory lock, 500 ms cadence) and hourly anchoring of chain heads through an `AnchorStore` interface backed by the S3 Object Lock bucket
    - _Requirements: 18.1, 18.2, 18.3, 18.7, 18.8, 18.9_

  - [ ]* 5.4 Write integration tests for append-only enforcement
    - `UPDATE` and `DELETE` on `audit_log` fail for `cc_app` and for the owner; chainer output verifies with `verifyChain`
    - _Requirements: 18.2, 18.3_

- [x] 6. Implement the outbox, queues, timers and service runtimes
  - [x] 6.1 Implement the outbox, consumer and timer infrastructure in `packages/server/outbox`
    - Migrations for `platform.outbox`, `platform.processed_events` and `platform.timers`; SECURITY DEFINER claim functions using `FOR UPDATE SKIP LOCKED`
    - Outbox relay publishing to SQS; consumer base class recording `(consumer, event_id)` in the effect transaction and applying the async-job `RetryPolicy` through visibility timeout changes, with `maxReceiveCount` 6 before the DLQ
    - Timer sweeper (10-second cadence) enqueuing due timers with their generation; handlers ignore stale generations
    - Versioned domain event types in `packages/contracts`
    - _Requirements: 24.6_

  - [x] 6.2 Create the `apps/api` and `apps/worker` NestJS entry points
    - api: HTTP bootstrap, OpenAPI generation from Zod schemas, Zod validation pipe, problem+json exception filter built only from codes and field paths, `nestjs-cls` request context
    - worker: standalone bootstrap hosting the outbox relay, timer sweeper, audit chainer and SQS consumers; hourly DLQ re-alert job that alerts while any DLQ has held a message for more than 15 minutes
    - `DependencyHealth` registry recording AI, ERP, SSO and SMS call outcomes, exposed as a `degraded` response field and a `/health/dependencies` endpoint
    - _Requirements: 18.1, 19.6, 22.4, 24.5, 24.6, 24.7_

  - [ ]* 6.3 Write integration tests for the async runtime
    - LocalStack SQS: each outbox event is published, consumers apply effects once, a message reaches the DLQ after 6 receives, a stale timer generation is ignored, the DLQ re-alert repeats hourly
    - _Requirements: 24.6, 24.7_

- [ ] 7. Implement the AI_Adapter
  - [x] 7.1 Implement `packages/ai-adapter`
    - `AiAdapter` interface and `AiPurpose` from the design; `FakeAiAdapter` with scripted outputs, latency and failures that records every payload it receives
    - `HuggingFaceAdapter` using `InferenceClient` from `@huggingface/inference` (`zeroShotClassification`, `featureExtraction`, `chatCompletion` with a JSON response schema), with model id and provider pinned per purpose by configuration and the token read from Secrets Manager; `AI_PROVIDER=huggingface | fake` selects the implementation
    - Egress guard accepting only `RedactedText` verified against the mint registry; per-purpose timeouts (3 s suggestions and summaries, 10 s triage, 15 s Copilot); `opossum` circuit breaker; no request-path retries
    - Call-log decorator writing purpose, provider, model id and version, SHA-256 of the exact payload, outputs, confidences, latency and status to an injected `AiCallLog` sink
    - _Requirements: 5.11, 5.12, 5.13, 5.14, 19.8_

  - [ ]* 7.2 Write shared contract tests for `AiAdapter`
    - Run the same suite against `FakeAiAdapter` and `HuggingFaceAdapter` with mocked HTTP; unverified text is refused before any network call
    - _Requirements: 5.12, 5.13, 5.14_

- [x] 8. Implement the SSO and ERP adapters
  - [x] 8.1 Implement `packages/sso-adapter` and `apps/mock-sso`
    - `SsoProvider` interface and `MockSsoProvider` client whose `handleCallback` raises `SsoUnavailableError` after 10 seconds
    - OIDC-shaped mock server with users seeded per Tenant and switchable failure modes (unavailable, slow, wrong password)
    - _Requirements: 2.1, 2.8, 2.10_

  - [x] 8.2 Implement `packages/erp-adapter`
    - Read-only `ErpAdapter` interface with no write methods; `StubErpAdapter` over the Tenant-scoped `core.erp_stub_records` table under RLS, with fixture seeding
    - _Requirements: 17.1, 17.2, 17.8_

  - [ ]* 8.3 Write shared contract tests for `SsoProvider` and `ErpAdapter`
    - _Requirements: 2.8, 2.10, 17.1, 17.2_

- [x] 9. Implement the Identity_Service and request pipeline
  - [x] 9.1 Implement sign-in, MFA and sessions in `packages/server/identity`
    - Migrations for `users`, `user_roles` (check constraint on the six roles), `user_departments`, `user_grants`, `students`, `auth_attempts` and `mfa_factors`
    - `GET /auth/login` and `GET /auth/callback` with state and nonce checks, lockout check (`ACCOUNT_LOCKED`), user resolution, Student creation from ERP_Adapter data within 5 seconds, and `ACCOUNT_NOT_IN_RECORDS` with no partial record; users without a role are refused
    - TOTP MFA (`otplib`, secrets encrypted with a platform KMS key) for every staff role before a session exists; Valkey sessions with a sliding TTL from the Tenant idle setting and an `HttpOnly; Secure; SameSite=Lax` cookie; audit entries for authentication events
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.9, 2.10, 17.3, 17.4, 18.1_

  - [x] 9.2 Implement the request guards in `apps/api`
    - Session guard returning `401 AUTHENTICATION_REQUIRED` before any data access, with an `auth.rejected` audit entry in a separate transaction; host-to-session Tenant check; RBAC guard calling `authorize`; `RequestContext` population for `withTenant`
    - Cross-tenant detection through `owner_tenant_of`, returning the same `403 ACCESS_DENIED` as a missing id and writing `tenant.cross_access_denied` with requesting Tenant, targeted Tenant, user and timestamp
    - Rate-limit guard with Valkey sliding-window counters per user and per Tenant, limits read from `rate_limit_config`, `429 RATE_LIMITED` with `Retry-After`
    - _Requirements: 1.2, 1.3, 1.4, 2.4, 2.5, 2.6, 22.7, 22.8_

  - [ ]* 9.3 Write unit tests for identity
    - MFA requirement over all 63 role combinations; SSO timeout and unavailability create no session; unauthenticated requests never reach a data store; locked-account message; idle session expiry
    - _Requirements: 1.2, 1.3, 2.3, 2.7, 2.9, 2.10_

- [x] 10. Implement tenancy, configuration and provisioning
  - [x] 10.1 Implement Tenant configuration in `packages/server/tenancy`
    - Migrations for `tenant_config`, `departments`, `department_duty`, `categories`, `routing_rules`, `sla_policies`, `working_calendars` (replace only, never delete, G8) and `rate_limit_config`
    - Tenant_Admin configuration endpoints validated by the catalogue; invalid values return field paths and leave saved configuration unchanged; configuration-change audit entries
    - `effectiveK(config) = max(5, kAnonymity)` and `spikeClusterK` handling (G1)
    - _Requirements: 1.5, 1.6, 2.7, 5.5, 18.1, 22.7_

  - [x] 10.2 Implement the Tenant provisioning saga and operator console API
    - Saga steps and compensations from the design: Tenant KMS data key and signing key through a `KeyService` interface; one DB transaction creating defaults (roles, categories, SLA policies from the design table, Monday–Friday 09:00–17:00 calendar); registry entry in DynamoDB and Route 53 record through interfaces; 25-second deadline; failure reported and audited in a separate transaction
    - Region taken from the request with ap-south-1 as the default for India Tenants
    - Operator console routes authenticated as a platform-operator principal outside Tenant RBAC (G3)
    - _Requirements: 1.7, 1.8, 1.9, 22.3_

  - [ ]* 10.3 Write property test for Tenant isolation
    - **Property 1: Tenant isolation for reads and writes**
    - Testcontainers with production migrations; requests go through the api guards
    - **Validates: Requirements 1.1, 1.4, 1.5, 17.2, 18.5**

  - [ ]* 10.4 Write unit tests for provisioning
    - Failure injected at each saga step rolls back all Tenant data, compensates KMS keys, reports the failure and writes an audit entry
    - _Requirements: 1.7, 1.8_

- [ ] 11. Checkpoint - Foundations
  - Ensure all tests pass, ask the user if questions arise.

### Phase 1: Ticketing and grievance core

- [ ] 12. Implement Ticket domain rules in `domain/tickets`
  - [x] 12.1 Implement the Ticket state machine
    - Seven statuses and the transition table as data; `applyCommand(ticket, command, actor, now)` returning `{ ticket, events, historyEntry }` or a typed rejection (`TICKET_CLOSED`, `CONFIRMATION_WINDOW_ENDED`, `INVALID_TRANSITION`) without mutating its input
    - Withdrawal from any non-Closed status; reopen only by Dept_Head or Ombudsperson; 7-day confirmation window; dispute assignee rule (least-loaded other active Handler, otherwise Dept_Head, G9); 50% budgets for dispute and reopen (G16); fixed reasons for system transitions
    - Arbitraries for Ticket command sequences and actors
    - _Requirements: 4.1, 4.2, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14_

  - [ ]* 12.2 Write property test for the Ticket state machine
    - **Property 10: Ticket state machine**
    - Compare against a reference transition model kept in the test folder
    - **Validates: Requirements 4.1, 4.2, 4.12, 4.13, 4.14**

  - [ ]* 12.3 Write property test for the confirmation window
    - **Property 11: Resolution confirmation window**
    - **Validates: Requirements 4.7, 4.8, 4.9, 4.10, 4.11**

  - [x] 12.4 Implement the viewer projection
    - `projectTicketForViewer(ticket, viewer, reveals)` for queue, detail, search and notification views, replacing name, email and student id with the Grievance's `anonRef` for unauthorised viewers and removing internal notes from Student views
    - `generateAnonRef()` producing 8 random base32 characters
    - _Requirements: 3.8, 7.10, 7.11, 8.1, 8.2, 8.7_

  - [ ]* 12.5 Write property test for the viewer projection
    - **Property 12: View projection hides protected content**
    - **Validates: Requirements 3.8, 7.10, 7.11, 8.1, 8.2, 8.7**

  - [x] 12.6 Implement duplicate candidate selection
    - `selectDuplicates(studentId, tickets, similarity, threshold)` returning the Student's own open Tickets at or above the threshold
    - _Requirements: 3.10, 3.11_

  - [ ]* 12.7 Write property test for duplicate candidates
    - **Property 9: Duplicate candidates**
    - **Validates: Requirements 3.11**

  - [x] 12.8 Implement the safety lexicon matcher
    - `safetySignal(text)` over English, Hindi and Hinglish phrases for harassment, self-harm and physical danger, normalising case, spacing and common character substitutions
    - _Requirements: 5.6_

- [x] 13. Implement SLA clock rules in `domain/sla`
  - [x] 13.1 Implement the SLA clock model
    - `SlaClock` with segments, `carriedSec` and state; `elapsedSec` and `instantAtElapsed`; pause closes a segment and resume opens one; band change moves elapsed time into `carriedSec` and switches mode (P0 continuous); fresh clock at 50% budgets; first-response evaluation `met = elapsedSec ≤ firstResponseSec`
    - Arbitraries for clocks with pause sequences
    - _Requirements: 4.4, 4.5, 6.1, 6.2, 6.8, 6.9_

  - [ ]* 13.2 Write property test for paused time
    - **Property 20: Paused time is excluded**
    - **Validates: Requirements 4.4, 4.5, 4.6**

  - [ ]* 13.3 Write property test for recalculation
    - **Property 21: Recalculation is deterministic and reassignment-invariant**
    - **Validates: Requirements 6.9, 7.8**

  - [x] 13.4 Implement thresholds, escalation and timer derivation
    - At_Risk at 75% and Breached at 100% of the resolution budget; L1, L2 and L3 thresholds on the elapsed axis; `escalationLevel` with a stored level that never decreases while open
    - `deriveTimers(ticket, clock, cal)` for `at_risk`, `l1`, `l2`, `l3`, `l3_review_due`, `awaiting_student_7d`, `confirmation_window_end` and `triage_deadline`
    - `workingDaysRemaining(escalatedAt, now, cal)` for the 10 Working_Day L3 review
    - _Requirements: 4.6, 6.3, 6.4, 6.5, 6.6, 6.7, 8.4_

  - [ ]* 13.5 Write property test for SLA outcomes
    - **Property 22: SLA outcomes follow elapsed time**
    - **Validates: Requirements 6.3, 6.4, 6.5, 6.6, 6.8**

  - [ ]* 13.6 Write property test for the L3 review countdown
    - **Property 23: Ombudsperson review days remaining**
    - **Validates: Requirements 6.7, 8.4**

- [x] 14. Implement the Notification_Service
  - [x] 14.1 Implement channel planning and fallback in `domain/notifications`
    - `planDelivery(notification, prefs, tenant)`: non-emergency on enabled in-app, web push and email channels with push and email deferred in quiet hours; emergency on every addressed channel plus SMS when the Tenant enables it, ignoring preferences and quiet hours
    - `nextStep(state, enabled)`: 3 retries at 20, 40 and 60 seconds, then the next channel in the order in-app, web push, email that is enabled and not yet attempted, else exhausted
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6, 13.5_

  - [ ]* 14.2 Write property test for channel selection
    - **Property 28: Channel selection**
    - **Validates: Requirements 9.1, 9.3, 9.4, 13.5**

  - [ ]* 14.3 Write property test for retry and fallback
    - **Property 29: Channel retry and fallback**
    - **Validates: Requirements 9.5, 9.6**

  - [x] 14.4 Implement `packages/channels`
    - `ChannelAdapter` interface with in-app (Postgres inbox), SES email, Web Push (`web-push` with VAPID keys from Secrets Manager) and End User Messaging SMS (DLT entity and template ids per Tenant) adapters
    - Typed per-event templates in English and Hindi; Ticket and Grievance email and push templates accept only `{ ticketRef, statusLabel, deepLink, locale }`; a runtime guard rejects any rendered body containing the description or reporter identity
    - _Requirements: 9.2, 9.3, 9.7_

  - [ ]* 14.5 Write property test for Grievance content exclusion
    - **Property 30: Grievance content stays out of email and push**
    - **Validates: Requirements 9.7**

  - [x] 14.6 Implement the notification module in `packages/server/notifications`
    - Migrations for `notify.notifications` (`expires_at = created_at + 30 days`), `notification_deliveries`, `notification_failures`, `notification_prefs` and `push_subscriptions`
    - `notify` consumer creating the notification and planned deliveries; `deliver-push` and `deliver-email` workers applying `nextStep`; a failure record for the Tenant_Admin when every channel fails
    - Inbox, preference and push subscription endpoints; a public `NotificationService.send()` returning the delivery outcome for callers that apply their own retry policy
    - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6, 9.8_

  - [ ]* 14.7 Write integration tests for notifications
    - Undelivered notifications stay unread in the inbox for 30 days; all-channel failure writes one failure record
    - _Requirements: 9.6, 9.8_

- [x] 15. Implement the Ticket_Service
  - [x] 15.1 Create the Ticket schema and the creation endpoint in `packages/server/tickets`
    - Migrations for `tickets`, `ticket_reporters` (with its reporter visibility policy), `ticket_history`, `ticket_messages`, `ticket_attachments`, `ticket_links`, `confidential_reveals` and `ombudsperson_decisions`, with the student, staff-department and Ombudsperson policies from the design
    - `POST /tickets` with `Idempotency-Key`: insert with `ON CONFLICT DO NOTHING`, `201` for new and `200` with the existing receipt on conflict; stores original text and the redacted copy; `safetySignal` sets band P0; category from the Student's choice and band from the category default; unique `anonRef` for confidential Grievances
    - Receipt with Ticket ref, category and first-response and resolution commitments as durations from the SLA policy; `TicketCreated` outbox event and a 30-second `triage_deadline` timer in the same transaction
    - _Requirements: 3.8, 3.9, 3.13, 5.6, 8.1, 23.7_

  - [ ]* 15.2 Write property test for idempotent creation
    - **Property 7: Ticket creation is idempotent**
    - Testcontainers, including concurrent submissions on separate connections
    - **Validates: Requirements 3.9**

  - [x] 15.3 Implement submission prechecks
    - `POST /tickets/precheck` within a 5-second budget: `pg_trgm` similarity against the Student's open Tickets through `selectDuplicates`, and English, Hindi and Hinglish profanity lists with normalisation
    - `PROFANITY_CONFIRMATION_REQUIRED` unless `profanityConfirmed: true`; the link option appends the text as a Student message on the existing Ticket and creates no Ticket (G11)
    - _Requirements: 3.10, 3.11, 3.12_

  - [ ]* 15.4 Write unit tests for prechecks
    - Obfuscated profanity is flagged; confirmed submission is accepted; linking creates no new Ticket and keeps the text
    - _Requirements: 3.11, 3.12_

  - [x] 15.5 Implement attachments in `packages/server/files`
    - Shared `uploadDecision(existing, candidate, target)` for Ticket (PDF, JPEG, PNG, MP4, at most 5) and Document_Locker (PDF, JPEG, PNG) targets with sizes from 1 byte to 10 MB
    - `POST /tickets/{id}/attachments/upload-url` returning a presigned POST into quarantine with `content-length-range`; `files` consumer for GuardDuty results from EventBridge that checks magic bytes, promotes clean files to the clean store under the Tenant KMS key, and otherwise deletes the object, records the reason and notifies the Student without touching Ticket text or other attachments
    - _Requirements: 3.14, 3.15, 3.16, 22.3_

  - [ ]* 15.6 Write property test for upload acceptance
    - **Property 8: Upload acceptance rule**
    - **Validates: Requirements 3.14, 3.15, 12.9, 12.10**

  - [x] 15.7 Implement Ticket commands, messages and Student views
    - `POST /tickets/{id}/commands` with `If-Match` applying `applyCommand`, writing history, outbox events and audit entries in one transaction; band change with a reason of 1 to 500 characters; assignment; `set_eta` (later than now, at most 30 days ahead) with `ETA_REQUIRED` blocking other actions at L1 (G7); Student writes refused when enrolment is inactive
    - `POST /tickets/{id}/messages` for public replies (flagging the first public Handler response) and internal notes of 1 to 5,000 characters; `GET /tickets?scope=mine` and `GET /tickets/{id}` with status, department, SLA due times and history
    - Timer handlers for `confirmation_window_end` (auto-confirm) and `awaiting_student_7d` (notify Student and Handler, clock stays paused); notification mapping for status, assignment, ETA and response events
    - _Requirements: 4.2, 4.3, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 6.4, 6.10, 6.11, 7.11, 9.1, 17.9, 18.1_

  - [x] 15.8 Implement confidentiality and Grievance Committee endpoints
    - `POST /grievances/{id}/reveals` with a reason of 10 to 500 characters; the reveal row and its audit entry commit together, and an audit failure cancels the reveal with `AUDIT_UNAVAILABLE`
    - Unauthorised identity access returns `ACCESS_DENIED` and writes an audit entry
    - `GET /grievances/l3` with Working Days remaining and an overdue badge at 0; `POST /grievances/{id}/decision` with a rationale of 20 to 5,000 characters emitting `GrievanceDecisionRecorded` for Student notification within 60 seconds
    - _Requirements: 3.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8_

  - [ ]* 15.9 Write property test for audit-or-nothing
    - **Property 58: Audit-or-nothing**
    - Testcontainers; covers band change, assignment, configuration change and identity reveal with injected audit failures
    - **Validates: Requirements 8.8, 18.9**

  - [ ]* 15.10 Write unit tests for Ticket_Service
    - Receipt contents; Awaiting Student 7-day notice; band change audit entry with redacted reason
    - _Requirements: 3.13, 4.6, 6.10_

- [x] 16. Implement the SLA_Engine module
  - [x] 16.1 Implement SLA clocks and timers in `packages/server/sla`
    - Migrations for `sla_clocks`, `sla_segments`, `sla_pauses` and `escalations`
    - `sla` consumer for `TicketRouted`, status, band and assignment events: start the clock within 1 minute of routing, or flag `slaUnconfigured` and notify the Tenant_Admin when the calendar is missing or has no working time; pause and resume with recorded paused duration; recalculation; timer upserts with generation; cached due columns and `sort_due_at`
    - First-response evaluation on the first public Handler message, stored in minutes
    - _Requirements: 4.4, 4.5, 6.1, 6.2, 6.8, 6.9, 6.12_

  - [x] 16.2 Implement threshold and escalation handlers
    - At_Risk flag and Handler notification; L1 breach with Student notification of the interim ETA and the Handler ETA requirement (G7); L2 to Dept_Head; L3 to Ombudsperson with the 10 Working_Day review deadline; `ombudspersonOverdue` flag and Dept_Head notification
    - Emit `SlaAtRisk`, `SlaBreached` and `TicketEscalated` events
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 8.4_

  - [ ]* 16.3 Write integration tests for the SLA_Engine
    - Missing-calendar path; pause and resume persisted; threshold timers fire within one sweep plus queue latency
    - _Requirements: 4.4, 4.5, 6.3, 6.12_

- [x] 17. Implement the Triage_Service
  - [x] 17.1 Implement `decideTriage` in `domain/triage`
    - Category from the top `classify` score over active categories; department from routing rules or a second classification; band as the highest of AI band, category default and safety signal, with any safety signal forcing P0; confidences normalised to 0.00–1.00 for malformed or out-of-range AI scores
    - `needsVerification` when category or department confidence is below the threshold or the result came from fallback rules; output type allows only the `New → Assigned` routing command
    - Keyword routing fallback over `routing_rules`
    - _Requirements: 5.4, 5.5, 5.6, 5.9, 5.10_

  - [ ]* 17.2 Write property test for triage decisions
    - **Property 15: Triage decisions are valid and advisory**
    - **Validates: Requirements 3.5, 5.4, 5.5, 5.9, 7.3**

  - [ ]* 17.3 Write property test for safety signals
    - **Property 16: Safety signals force P0 Critical**
    - **Validates: Requirements 5.6**

  - [x] 17.4 Implement the triage worker and suggestion endpoint in `packages/server/triage`
    - Migrations for `triage_results` and `ai_calls`; Postgres implementation of the `AiCallLog` sink
    - `triage` consumer: redact with a 2-second deadline, and on failure route to the default department with `needsVerification` and no AI call; parallel `classify` and `scorePriority` within 10 seconds; keyword fallback on AI error, timeout or open breaker; store `triage_results`; assign the least-loaded Handler through the `route` command; emit `TicketRouted`; report outcomes to `DependencyHealth`
    - `triage_deadline` watchdog keeping the Ticket New with `pendingManualTriage` (G6); P0 notification of on-duty Dept_Heads and the Ombudsperson through `NotificationService.send()` with the P0 `RetryPolicy`, then `escalationFailed`
    - `POST /triage/suggest`: synchronous redaction, `classify` with a 3-second timeout, `{ categoryId, confidencePercent }` or `{ unavailable: true }`, Valkey cache by redacted-text hash for 10 minutes
    - _Requirements: 3.5, 3.6, 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 5.10, 5.11, 23.4, 23.5, 23.7, 23.8, 24.5_

  - [ ]* 17.5 Write property test for AI egress
    - **Property 14: Nothing unredacted leaves the platform**
    - Covers the triage and suggestion paths and the adapter egress guard for every `AiPurpose`
    - **Validates: Requirements 5.1, 5.3, 5.11, 5.14, 10.14, 16.3**

  - [ ]* 17.6 Write property test for degraded dependencies
    - **Property 17: Degraded dependencies never lose a Ticket**
    - **Validates: Requirements 5.10, 23.7, 24.5**

  - [x] 17.7 Implement the triage evaluation harness in `tools/eval`
    - Runs a Tenant evaluation set through the triage pipeline with a configured adapter, reports P0 Critical false-negative rate and calibration, and exits non-zero when the false-negative rate exceeds 2%
    - _Requirements: 5.8, 25.3_

- [x] 18. Implement the Staff_Workbench API
  - [x] 18.1 Implement queue ordering in `domain/workbench`
    - `queueOrder` comparator: band P0 to P3, then `sort_due_at` ascending with paused Tickets last within their band, then creation time, then id; first page of 50
    - _Requirements: 7.1_

  - [ ]* 18.2 Write property test for queue ordering
    - **Property 24: Queue ordering**
    - **Validates: Requirements 7.1**

  - [x] 18.3 Implement AI quality and training-label rules in `domain/ai-quality`
    - Per-category override rate, accuracy and calibration (percentage points) over a window with no Handler dimension; model-review flag above 30% over 7 days with at least 50 classifications
    - Training-label eligibility (Tenant opt-in and successful redaction) and per-Tenant exclusion count
    - _Requirements: 7.4, 7.5, 25.3, 25.4, 25.5, 25.6_

  - [ ]* 18.4 Write property test for AI quality metrics
    - **Property 26: AI quality metrics**
    - **Validates: Requirements 7.5, 25.3, 25.4**

  - [ ]* 18.5 Write property test for training-label eligibility
    - **Property 27: Training-label eligibility**
    - **Validates: Requirements 7.4, 25.5, 25.6**

  - [x] 18.6 Implement Workbench endpoints in `packages/server/workbench`
    - Migrations for `training_labels`, `canned_replies` and the composite queue index `(tenant_id, assignee_id, is_open, band_rank, sort_due_at, created_at, id)`
    - `GET /workbench/queue` with keyset pagination of 50 and At_Risk, Breached and `escalationFailed` flags; Needs_Verification_Lane filter with count (G15); `POST /tickets/{id}/triage/confirm` and `/correct` writing training labels from redacted text; Dept_Head-only override-rate endpoint; canned reply management
    - `GET /tickets/{id}/summary` calling `generate` on the redacted thread with a 3-second timeout, cached by Ticket version, returning `unavailable` on timeout or error
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.12, 7.13, 25.5, 25.6_

  - [x] 18.7 Implement bulk reassignment
    - `POST /tickets/bulk-reassign` for 2 to 100 ids with a reason: lock rows in id order, validate every Ticket (in scope, open, eligible target) before any change, return `BULK_REASSIGN_FAILED` listing each failing id with its reason, otherwise reassign all with due times unchanged and one audit entry per Ticket in one transaction
    - _Requirements: 7.8, 7.9_

  - [ ]* 18.8 Write property test for bulk reassignment
    - **Property 25: Bulk reassignment is all-or-nothing**
    - Testcontainers
    - **Validates: Requirements 7.8, 7.9**

  - [ ]* 18.9 Write unit tests for the AI summary and extend the egress test
    - Summary success with "AI-suggested" label, timeout returns `unavailable` with other actions usable; add the summary path to the Property 14 test
    - _Requirements: 7.12, 7.13, 5.14_

- [ ] 19. Checkpoint - Ticketing core
  - Ensure all tests pass, ask the user if questions arise.

### Phase 1: Integration, privacy, analytics, PWA and infrastructure

- [x] 20. Implement ERP synchronisation, privacy and audit administration
  - [x] 20.1 Implement ERP freshness rules in `domain/erp`
    - `freshnessState(syncAttempts)`: warning if and only if the latest attempt failed, with the last success time; last good data stays in use
    - _Requirements: 17.6, 17.7_

  - [ ]* 20.2 Write property test for ERP data freshness
    - **Property 56: ERP data freshness**
    - **Validates: Requirements 17.6, 17.7**

  - [x] 20.3 Implement ERP synchronisation in `packages/server/erp`
    - Migration for `core.erp_sync_state`; `erp-sync` consumer paging `listStudentsChangedSince`, updating Student rows and emitting `ErpStudentChanged`; ERP sync `RetryPolicy`; freshness endpoint for the admin console
    - Inactive enrolment applied in the sync transaction, with the write-path authorisation reading enrolment status (cached at most 30 seconds)
    - _Requirements: 17.5, 17.6, 17.7, 17.9_

  - [x] 20.4 Implement retention selection in `domain/retention`
    - `selectExpired(items, policies, now)` returning items at or past expiry, never audit entries younger than 3 years or in-app notifications younger than 30 days, and deleted documents no later than 30 days after deletion
    - _Requirements: 9.8, 12.8, 18.7, 19.5_

  - [ ]* 20.5 Write property test for retention selection
    - **Property 60: Retention selection**
    - **Validates: Requirements 9.8, 12.8, 18.7, 19.5**

  - [x] 20.6 Implement consent, data subject requests and retention in `packages/server/privacy`
    - Migrations for `privacy.consent_purposes`, `consents`, `dsr_requests` and `retention_policies`; first-sign-in privacy notice and per-purpose consent with timestamps; withdrawal applied on the next request and by jobs within 24 hours; `CONSENT_REQUIRED` feature guard
    - `exportSubjectData` and `eraseSubject` contract implemented by identity, tickets and notifications; DSR requests with a 30-day due date, failure notification with reason, data unchanged until completion, resubmission after failure
    - Daily retention job using `selectExpired`; breach declaration in the operator console notifying affected Tenant_Admins with nature, data categories and approximate count
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.7, 19.9, 19.10_

  - [ ]* 20.7 Write property test for erasure
    - **Property 61: Erasure removes personal data**
    - **Validates: Requirements 19.4**

  - [ ]* 20.8 Write unit tests for privacy
    - Consent recorded before dependent features open; breach notification contents; late or failing DSR notifies the Student and keeps data; failed erasure can be resubmitted
    - _Requirements: 19.1, 19.2, 19.7, 19.9, 19.10_

  - [x] 20.9 Implement audit search and verification endpoints
    - `GET /audit` (Tenant_Admin only) filtered by actor, action, target and a range of at most 30 days, with `statement_timeout = 30s` mapped to `SEARCH_TIMEOUT`
    - `POST /audit/verify` streaming the range through `verifyChain` with an anchor check; any API attempt to modify an entry is rejected and audited as a failure
    - _Requirements: 18.2, 18.4, 18.5, 18.6_

  - [ ]* 20.10 Write integration tests for audit administration
    - Search returns only own-Tenant entries; timeout returns `SEARCH_TIMEOUT`; modification attempts write a failure entry
    - _Requirements: 18.2, 18.5, 18.6_

- [x] 21. Implement the Analytics_Service core
  - [x] 21.1 Implement the metric registry and target evaluation in `domain/analytics`
    - Pure metric functions from the design table (VOTR with provisional handling and Withdrawn excluded per G12, median first-response time by band, SLA breach rate, escalation rate, misrouting rate, dispute and reopen rates, CSAT, weekly-to-monthly active ratio, activation rate) returning `{ value, n, denominator }`; "Insufficient data" below k or with a zero denominator; per-metric unavailable state with a reason
    - `evaluateTarget(value, target, direction)`, notable change at 10% or more, guardrail breach rule with any PII exposure count above 0 breaching
    - _Requirements: 14.1, 14.11, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.10, 21.11, 21.12_

  - [ ]* 21.2 Write property test for metric definitions
    - **Property 47: Metric definitions**
    - Compare against naive reference computations kept in the test folder
    - **Validates: Requirements 14.1, 14.11, 16.7, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.12**

  - [ ]* 21.3 Write property test for target and threshold evaluation
    - **Property 48: Target and threshold evaluation**
    - **Validates: Requirements 14.2, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9, 21.11**

  - [x] 21.4 Implement the k-anonymity gateway in `domain/kanon`
    - `Aggregate<T>` and `suppress(aggregate, threshold)` producing a branded `SafeAggregate` or a suppression marker; thresholds `max(5, kAnonymity)` for aggregates and exports and `spikeClusterK` for clusters
    - _Requirements: 8.6, 14.6, 15.4_

  - [ ]* 21.5 Write property test for k-anonymity suppression
    - **Property 50: k-anonymity suppression**
    - **Validates: Requirements 14.5, 14.6, 15.4**

  - [x] 21.6 Implement fact projections in `packages/server/analytics`
    - Migrations for `analytics.ticket_facts`, daily aggregates, sign-in activity facts, `report_schedules`, `report_runs`, `okr_targets`, `metric_snapshots`, `guardrail_flags` and `ai_quality_reports`, with no identity columns
    - Projection consumers for Ticket, SLA and identity events; refresh job every 5 minutes on the Aurora reader
    - _Requirements: 8.6, 14.10, 21.4, 21.5_

  - [x] 21.7 Implement scheduled reports
    - Schedule endpoints for Dept_Heads and Executives validated by the catalogue (frequency, PDF or CSV, 1 to 20 recipients in the Tenant); minute sweeper using `nextRunAt`; content filtered by `reportScopeFilter`; CSV (`csv-stringify`) and PDF (`pdfmake`) rendering to S3 with expiring links
    - One retry within 15 minutes, then owner notification within 5 minutes with the schedule kept; audit entry per generation with requester, type, scope, timestamp and outcome
    - _Requirements: 15.1, 15.2, 15.3, 15.6, 15.8_

  - [x] 21.8 Implement OKR, guardrail and AI quality jobs
    - Milestone jobs at months 3, 6 and 12 computing each metric against `okr_targets` with met or not met status
    - Daily guardrail computation (PII exposure incidents, P0 false-negative rate, AI override rate, exposure parity) with breach flags within 24 hours notifying the platform product owner (G3)
    - Nightly AI quality report per category with model-review flags visible to operations; operations alert within 15 minutes if the report does not complete, previous report retained
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.10, 21.11, 21.12, 25.3, 25.4, 25.7_

  - [ ]* 21.9 Write property test for PII-free outputs
    - **Property 59: PII-free outputs**
    - Covers log, metric, span, audit entry, analytics row and error body serialisers
    - **Validates: Requirements 8.6, 18.8, 19.6, 25.1**

  - [ ]* 21.10 Write unit tests for analytics jobs
    - Report failure retry and owner notification; guardrail job cadence; AI quality report failure alert; report audit entries
    - _Requirements: 15.6, 15.8, 21.10, 25.7_

- [x] 22. Build the PWA for Phase 1
  - [x] 22.1 Implement `packages/i18n` and `packages/ui`
    - English and Hindi JSON resources under `/locales/{code}/`, a locale manifest, and `i18next` with `fallbackLng: 'en'`
    - React Aria Components library with design tokens (text contrast at least 4.5:1, touch targets at least 44 × 44 CSS pixels), `AiSuggestedBadge`, and status labels with text and icon
    - _Requirements: 5.15, 7.2, 20.4, 20.5, 20.6, 20.7_

  - [ ]* 22.2 Write property test for locale fallback
    - **Property 63: Locale fallback**
    - **Validates: Requirements 20.7**

  - [x] 22.3 Scaffold `apps/web`
    - Next.js static export with route groups `(student)`, `(workbench)`, `(exec)`, `(admin)` and `(ops)`; OpenAPI client generated from `packages/contracts` with TanStack Query; strict Content Security Policy and text-only rendering
    - Web app manifest with `display: standalone`, `beforeinstallprompt` install offer and iOS instructions; Serwist service worker with a push handler; language selector persisted to the profile and local storage
    - _Requirements: 20.1, 20.6, 22.5_

  - [x] 22.4 Implement the draft store and sync manager
    - IndexedDB drafts saved 1 second after the last change with a UUIDv7 idempotency key; "Queued for submission" badge while offline
    - Submission on `online`, app focus and Background Sync, first attempt immediately then at 5, 15, 30 and 60 seconds, always with the draft's key; after 5 failed attempts the draft stays with an error and a Retry button
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 22.5 Write property test for offline drafts
    - **Property 6: Offline drafts use one idempotency key**
    - **Validates: Requirements 3.3, 3.4**

  - [x] 22.6 Implement the offline Ticket cache
    - Least-recently-viewed eviction keeping the 50 most recently viewed Tickets in IndexedDB with their last update time; offline indicator; network-only actions show a "needs connection" message and keep form contents and stored data
    - _Requirements: 20.2, 20.3_

  - [ ]* 22.7 Write property test for the offline Ticket cache
    - **Property 62: Offline Ticket cache**
    - **Validates: Requirements 20.2**

  - [x] 22.8 Implement the Student screens
    - Ticket form: suggestion after 20 characters with a 3-second client timeout and manual fallback, accept or change category, duplicate and profanity prompts that keep the text, confidential option for Grievances, attachment errors with reasons, receipt
    - Ticket list and detail with status, department, SLA due times and history; confirm with rating, dispute with reason, withdraw; CSAT form (score 1 to 5, comment up to 1,000 characters) that keeps values on error
    - Privacy notice, consent settings and data requests; notification inbox and channel preferences
    - _Requirements: 3.5, 3.6, 3.7, 3.8, 3.11, 3.12, 3.13, 3.15, 4.3, 4.8, 4.10, 4.11, 4.12, 5.15, 9.4, 9.8, 19.1, 19.2, 19.3, 19.4, 20.8, 20.9, 23.8_

  - [x] 22.9 Implement the Staff_Workbench screens
    - Queue with shortcuts (`j`/`k`, `Enter`, `a`, `r`, `s`, `?`), disabled in text fields and remappable; "At risk" and "Breached" labels; Needs_Verification_Lane with count; one-action correction; canned reply insertion into the editor without sending; internal notes; bulk reassignment with per-Ticket errors
    - AI summary with the "AI-suggested" badge or an unavailable notice; ETA entry after L1; Ombudsperson reveal, L3 list and decision forms; Dept_Head override-rate view
    - _Requirements: 5.15, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 8.2, 8.3, 8.4, 8.5_

  - [x] 22.10 Implement the Tenant_Admin, Dept_Head and operator screens
    - Configuration editors with field errors; ERP freshness warning; notification failure list; audit search (filters kept on error) and verification; scheduled report management
    - Operator console pages for Tenant provisioning, breach declaration and guardrail flags
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 9.6, 15.1, 15.2, 17.6, 17.7, 18.4, 18.5, 18.6, 19.7, 21.11_

  - [ ]* 22.11 Write component and accessibility tests
    - axe-core on every Student and Workbench screen; keyboard-only queue operation; install offer; offline action blocking; contrast tokens; language selection persistence; "AI-suggested" badge on every AI field
    - _Requirements: 5.15, 7.7, 20.1, 20.3, 20.4, 20.5, 20.6_

- [x] 23. Define the Phase 1 AWS infrastructure with CDK
  - [x] 23.1 Implement the network, data and security stacks in `infra/lib/stacks`
    - VPC across 3 AZs with public, private and isolated subnets, NAT gateways, Network Firewall egress allowlist and VPC endpoints
    - Aurora PostgreSQL 16 Multi-AZ writer and reader with `rds.force_ssl = 1`, 14-day backups and an Aurora Global Database secondary in ap-south-2; ElastiCache Serverless Valkey with TLS; platform KMS keys; Secrets Manager
    - S3 buckets for web, quarantine, clean store, exports, audit anchors (Object Lock compliance mode, 3-year retention) and logs, blocking public access and requiring TLS; cell region as a parameter with ap-south-1 default
    - _Requirements: 1.9, 18.7, 22.1, 22.2, 22.3, 22.10, 24.3, 24.4_

  - [x] 23.2 Implement the compute, edge and messaging stacks
    - ECS Fargate services `api` (at least 3 tasks, scaling on CPU and request count), `worker` (scaling on queue backlog) and `mock-sso`; ALB with a TLS 1.2+ policy and HTTP to HTTPS redirect
    - CloudFront with `TLSv1.2_2021`, AWS WAF rate-based rules and the web bucket origin; Route 53 Tenant subdomains; DynamoDB Tenant registry
    - Phase 1 SQS queues with DLQs and KMS; EventBridge Scheduler schedules; GuardDuty Malware Protection for the quarantine bucket with results routed to `files`; SES configuration
    - _Requirements: 3.16, 22.1, 22.2, 22.7, 22.10, 23.1, 23.3, 24.6_

  - [x] 23.3 Implement the observability stack
    - CloudWatch alarms for error rate above 5% and p95 above 2 seconds over 5 minutes, queue depth above 1,000 for 5 periods, DLQ age above 15 minutes, sweeper and chainer lag; SNS to AWS Chatbot
    - Synthetics canaries every minute for Ticket submission and the Staff_Workbench queue; restore-failure alarm from RDS events; ADOT collector sidecars exporting to X-Ray
    - _Requirements: 24.1, 24.7, 24.8, 25.2_

  - [ ]* 23.4 Write CDK assertion tests and `cdk-nag` checks
    - TLS policies, encryption with the right keys, Object Lock, backup retention, alarm thresholds and region defaults
    - _Requirements: 1.9, 22.1, 22.3, 22.10, 24.3, 25.2_

- [x] 24. Implement the delivery pipeline and security gates
  - [x] 24.1 Implement the release gate evaluator
    - `releaseBlocked(findings, exceptions, buildDate)` in `domain/release-gate` and a `tools/security-exceptions` CLI reading OSV-Scanner and `pnpm audit` JSON plus `security/exceptions.yaml`, exiting non-zero when blocked
    - _Requirements: 22.9_

  - [ ]* 24.2 Write property test for the release gate
    - **Property 66: Release gate for critical vulnerabilities**
    - **Validates: Requirements 22.9**

  - [x] 24.3 Implement the pipeline stack in `infra`
    - Pull request stage: typecheck, lint, dependency-cruiser, unit, property and integration tests, `cdk synth` with `cdk-nag`, gitleaks with zero findings, OSV-Scanner and `pnpm audit` through the release gate, Semgrep
    - Main stage adds Playwright and axe-core; phase-GA stage runs OWASP ZAP full scan, testssl.sh, k6 and Lighthouse CI with an LCP budget of 2.5 seconds, blocking on any open high or critical finding
    - _Requirements: 22.6, 22.9, 22.11, 23.2_

- [ ] 25. Write the Phase 1 end-to-end and performance suites
  - [ ]* 25.1 Write Playwright end-to-end tests for journeys J1 and J3
    - Full local stack with mock SSO, stub ERP and fake AI; offline draft submission; confirm and dispute; keyboard-only Workbench flow; escalation with ETA entry
    - _Requirements: 3.1, 3.3, 4.7, 4.10, 6.4, 7.7, 20.5_

  - [ ] 25.2 Write k6 load scenarios and Lighthouse CI configuration
    - 5,000 concurrent users and 100,000 Students per Tenant for read and write latency, triage latency and suggestion latency; Lighthouse mobile throttling profile for Student pages
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

  - [ ] 25.3 Write the audit verification benchmark
    - One million entries verified in under 60 seconds
    - _Requirements: 18.4_

- [ ] 26. Checkpoint - Phase 1 complete
  - Ensure all tests pass, ask the user if questions arise.

### Phase 2: Opportunities and scholarships

- [x] 27. Implement Opportunity domain rules
  - [x] 27.1 Implement eligibility and scoring in `domain/eligibility`
    - `Rule` tree and `evaluate` with Kleene three-valued logic and a per-leaf checklist; candidates exclude overall `not_met` and include `unknown` with flagged criteria (G10)
    - `score = round(100 × clamp((cos(q, o) − s0) / (1 − s0), 0, 1))` with the feedback-adjusted query vector; ranking inputs exclude income band, social category and gender
    - Arbitraries for rule trees and profiles with missing fields
    - _Requirements: 11.1, 11.2, 11.4, 11.7, 11.10_

  - [ ]* 27.2 Write property test for three-valued eligibility
    - **Property 34: Three-valued eligibility**
    - Compare against a reference Kleene-logic evaluator in the test folder
    - **Validates: Requirements 11.1, 11.2, 11.4**

  - [ ]* 27.3 Write property test for protected attributes
    - **Property 35: Protected attributes do not change scores**
    - **Validates: Requirements 11.10**

  - [x] 27.4 Implement recommendations, digests and explanations in `domain/recommendations`
    - `recommendationList` excluding hidden and expired Opportunities; `weeklyDigest` with the top min(5, n) by score and no digest when n is 0; `explain` listing 1 to 5 attributes from met criteria and overlapping tags, falling back to the program
    - _Requirements: 10.13, 11.3, 11.5, 11.6, 11.8_

  - [ ]* 27.5 Write property test for recommendation lists and digests
    - **Property 36: Recommendation lists and digests**
    - **Validates: Requirements 10.13, 11.5, 11.6, 11.8**

  - [ ]* 27.6 Write property test for explanations
    - **Property 37: Recommendation explanations**
    - **Validates: Requirements 11.3**

  - [x] 27.7 Implement completeness and exposure parity in `domain/profile`
    - `completeness(profile, fields)` as `round(100 × filled / total)` with the missing-field list
    - `exposureParity(groups, kEffective)` reporting same-dimension pairs differing by more than 10 percentage points, with groups below effective k suppressed
    - _Requirements: 10.9, 11.9_

  - [ ]* 27.8 Write property test for profile completeness
    - **Property 32: Profile completeness**
    - **Validates: Requirements 10.9**

  - [ ]* 27.9 Write property test for exposure parity
    - **Property 38: Exposure parity report**
    - **Validates: Requirements 11.9**

  - [x] 27.10 Implement application, document and reminder rules in `domain/applications`
    - Application states Saved, Preparing, Submitted and Outcome; outcome values Selected, Not Selected and Withdrawn
    - `canLink(document, links)` with a cap of 50; `missingDocuments(required, locker)` over non-deleted, clean documents; `dueReminders(application, deadline, now, sent)` for the 7-day and 3-day points, skipped when Submitted or in Outcome
    - _Requirements: 12.1, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [ ]* 27.11 Write property test for application states
    - **Property 39: Application states and outcomes**
    - **Validates: Requirements 12.1, 12.6, 12.7**

  - [ ]* 27.12 Write property test for document links
    - **Property 40: Document links**
    - **Validates: Requirements 12.3**

  - [ ]* 27.13 Write property test for missing documents
    - **Property 41: Missing documents**
    - **Validates: Requirements 12.4**

  - [ ]* 27.14 Write property test for deadline reminders
    - **Property 42: Deadline reminders**
    - **Validates: Requirements 12.5**

- [x] 28. Implement the Opportunity_Service
  - [x] 28.1 Implement Student profiles in `packages/server/opportunities`
    - Migrations for the `opps` schema tables with HNSW indexes on embedding columns
    - First sign-in prefill from the ERP_Adapter with a 10-second timeout, marking ERP fields authoritative; on failure an empty profile, a notice and the ERP prefill `RetryPolicy`; edits to authoritative fields return `ERP_FIELD_READ_ONLY`; completeness endpoint; `ProfileChanged` events
    - `exportSubjectData` and `eraseSubject` for profile data
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.9, 19.3, 19.4_

  - [ ]* 28.2 Write property test for ERP-authoritative fields
    - **Property 31: ERP-authoritative profile fields**
    - **Validates: Requirements 10.1, 10.3, 10.4**

  - [x] 28.3 Implement the consent-gated income band and profile embeddings
    - Income band stored only with an `income_band_matching` consent; withdrawal deletes the value and enqueues re-matching within 5 minutes
    - `embed` worker building profile text from the field allowlist (no income band, social category or gender), redacting it and calling `embed`; on failure the previous vector is kept, `embeddingStale` is set and the embedding `RetryPolicy` applies
    - _Requirements: 10.5, 10.6, 10.7, 10.8, 10.14, 11.10, 19.2_

  - [ ]* 28.4 Write property test for consent gating
    - **Property 33: Consent gating**
    - **Validates: Requirements 10.5, 10.6, 19.1, 19.2**

  - [x] 28.5 Implement Opportunity publication and expiry
    - `POST /opportunities` requiring the `opportunity.publish` grant and validated by the catalogue; Opportunity embedding through the redactor and adapter
    - Expiry sweeper marking Opportunities Expired within 5 minutes of the deadline; `OpportunityPublished` and `OpportunityExpired` events
    - _Requirements: 10.10, 10.11, 10.12, 10.13_

  - [ ]* 28.6 Write unit tests for Opportunity_Service and extend the egress test
    - Publication without the grant stores nothing; invalid submissions list every field; add the profile and Opportunity embedding paths to the Property 14 test
    - _Requirements: 10.11, 10.12, 10.14_

- [ ] 29. Implement the Match_Engine
  - [x] 29.1 Implement matching jobs and recommendation endpoints in `packages/server/matching`
    - `match` consumer on publication paging Students in batches of 1,000, evaluating eligibility, computing cosine similarity with pgvector for candidates, and storing matches with criteria, score and explanation within 5 minutes; re-matching on profile, consent and feedback changes
    - Recommendation list, eligibility checklist and feedback endpoints (relevant, not relevant, hidden) recording feedback within 5 seconds
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.7, 11.8, 11.10_

  - [ ] 29.2 Implement the weekly digest and exposure parity jobs
    - Weekly Opportunity digest for opted-in Students through `weeklyDigest`, skipped when empty
    - Nightly exposure parity report to the Tenant_Admin by gender, social category and program
    - _Requirements: 11.5, 11.6, 11.9_

  - [ ]* 29.3 Write unit tests for feedback
    - Feedback recorded within 5 seconds changes the next ranking run; hidden Opportunities leave lists and digests
    - _Requirements: 11.7, 11.8_

- [ ] 30. Implement applications and the Document_Locker
  - [x] 30.1 Implement applications and reminders in `packages/server/opportunities`
    - Application state endpoint returning the new state within 2 seconds; outcome validation with the allowed values in the error
    - Reminder sweeper every 15 minutes using `dueReminders`, with `reminders_sent (application_id, kind)` unique
    - _Requirements: 12.1, 12.5, 12.6, 12.7_

  - [x] 30.2 Implement the Document_Locker in `packages/server/documents`
    - Uploads through the quarantine pipeline and `uploadDecision` for the Document_Locker target, stored under the Tenant KMS key; rejection with reason and nothing stored
    - Links without copying with `DOCUMENT_LINK_LIMIT` at 50 (document row locked in the link transaction); missing-document checklist; soft delete with `purge_after = now + 30 days` purged by the retention job; `eraseSubject` for documents
    - _Requirements: 12.2, 12.3, 12.4, 12.8, 12.9, 12.10, 19.4_

  - [ ] 30.3 Register the Opportunity metrics
    - Recommendation-to-save, save-to-apply and missed-deadline metrics in the registry and fact projections, included in milestone reports when the module is enabled
    - _Requirements: 21.8_

  - [ ]* 30.4 Write tests for Document_Locker and Opportunity metrics
    - Rejected uploads store nothing; deletion hides immediately; add reference computations for the Opportunity metrics to the Property 47 test
    - _Requirements: 12.8, 12.10, 21.8_

- [ ] 31. Build the PWA for Phase 2
  - [-] 31.1 Implement the Opportunity screens
    - Student profile with authoritative-field indicators, completeness and missing fields, income band consent; recommendations with "Why recommended"; Opportunity detail with the eligibility checklist and missing documents; application tracker with outcome recording and no payment flow; Document_Locker
    - Staff Opportunity publishing form with per-field errors
    - _Requirements: 10.3, 10.4, 10.5, 10.9, 10.10, 10.11, 11.3, 11.4, 11.8, 12.1, 12.4, 12.6, 12.7, 12.10, 12.11_

  - [ ]* 31.2 Write Playwright end-to-end tests for journey J2
    - _Requirements: 11.3, 11.4, 12.1, 12.3, 12.5_

- [ ] 32. Checkpoint - Phase 2 complete
  - Ensure all tests pass, ask the user if questions arise.

### Phase 3: Broadcasts, emergency alerts and executive analytics

- [ ] 33. Implement the Broadcast_Service
  - [x] 33.1 Implement Broadcast rules in `domain/broadcast`
    - Audience semantics (segments joined with OR, dimensions with AND, values with OR) and the Tenant recipient cap with emergency alerts exempt (G2)
    - Approval state machine `draft → pending_approval → approved → sending → sent` or `rejected`
    - Counters from recipient events (deduplicated, order-independent), acknowledgement rate, and failed-delivery list
    - _Requirements: 13.1, 13.2, 13.3, 13.7, 13.9, 13.10_

  - [ ]* 33.2 Write property test for audience deduplication
    - **Property 43: Audience deduplication**
    - **Validates: Requirements 13.1, 13.2**

  - [ ]* 33.3 Write property test for counters and failed deliveries
    - **Property 44: Broadcast counters and failed-delivery report**
    - **Validates: Requirements 13.3, 13.7, 13.10**

  - [ ]* 33.4 Write property test for the approval gate
    - **Property 46: Broadcast approval gate**
    - **Validates: Requirements 13.9**

  - [ ] 33.5 Implement the Broadcast module in `packages/server/broadcasts`
    - Migrations for the `bcast` schema; create, audience preview (`COUNT(DISTINCT user_id)` within 2 seconds, required before send) and approval endpoints
    - Send with recipient materialisation and in-app notifications in one bulk insert, then delivery messages enqueued in batches of 500 to finish within 60 seconds for 100,000 recipients; stats job every 2 seconds; failed-delivery report within 5 minutes
    - Audit entries for create, approve, reject and send with sender, audience, redacted content and timestamp
    - _Requirements: 13.1, 13.2, 13.3, 13.8, 13.9, 13.10, 13.11, 23.6_

- [ ] 34. Implement emergency alerts
  - [x] 34.1 Implement the emergency resend rule in `domain/emergency`
    - `resendDecision(timeline, channelsUsed, channelsAvailable)`: resend once when unacknowledged 5 minutes after delivery and an unused channel exists
    - _Requirements: 13.6_

  - [ ]* 34.2 Write property test for emergency resend
    - **Property 45: Emergency resend**
    - **Validates: Requirements 13.6**

  - [ ] 34.3 Implement the `emergency-worker` and acknowledgements
    - Emergency entry point in `apps/worker` consuming the `emergency` queue and delivering on every channel (SMS from DLT templates with a short acknowledgement link), ignoring preferences and quiet hours; Executive or Tenant_Admin only
    - Acknowledgement endpoint; resend sweeper using `resendDecision`; acknowledgement-rate endpoint for the sender refreshed every 5 seconds
    - _Requirements: 9.3, 13.4, 13.5, 13.6, 13.7, 13.8_

  - [ ] 34.4 Register the Broadcast metrics
    - 24-hour read rate and emergency acknowledgement within 5 minutes in the registry and fact projections, included in milestone reports when the module is enabled
    - _Requirements: 21.9_

  - [ ]* 34.5 Write load and integration tests for fan-out
    - 100,000-recipient fan-out enqueued within 60 seconds; emergency delivery to 95% within 60 seconds with simulated providers; add reference computations for the Broadcast metrics to the Property 47 test
    - _Requirements: 13.4, 21.9, 23.6_

- [ ] 35. Implement executive analytics
  - [ ] 35.1 Implement spike detection in `domain/spike`
    - `spikeStatus(series, today)` with a 56-day baseline, at least 14 days of data, non-zero population standard deviation and `z > 3`; "Insufficient data" otherwise; at most one alert per category per day
    - _Requirements: 14.3, 14.4_

  - [ ]* 35.2 Write property test for spike detection
    - **Property 49: Spike detection**
    - Compare against a reference implementation in the test folder
    - **Validates: Requirements 14.3, 14.4**

  - [ ] 35.3 Implement dashboards, spike alerts and clusters in `packages/server/analytics`
    - Migrations for `daily_category_counts`, `spike_alerts` and `incidents`; dashboard endpoints filtered by department, category and a 1 to 366 day period through the k-anonymity gateway
    - Spike job every 5 minutes raising alerts to Executives within 15 minutes; clusters of related Tickets from embeddings of redacted Ticket text with `spikeClusterK`, an "Other related Tickets" bucket, and labels from terms present in at least `spikeClusterK` texts
    - _Requirements: 14.1, 14.3, 14.4, 14.5, 14.6, 14.10, 14.11_

  - [ ] 35.4 Implement incidents, the board pack and the executive digest
    - Incident creation requiring an active staff owner and a target date not before today, linked to the spike alert, with every invalid field returned
    - Board pack listing L2 and L3 escalations without identities and per-department scorecards, generated within 30 seconds for up to 366 days
    - Executive weekly digest at the configured weekday and time within 15 minutes with notable flags
    - _Requirements: 14.2, 14.7, 14.8, 14.9_

  - [ ]* 35.5 Write unit tests for incidents and the board pack
    - _Requirements: 14.7, 14.8, 14.9_

- [ ] 36. Implement the signed annual export
  - [ ] 36.1 Implement export packaging, signing and verification
    - ZIP with k-anonymised CSVs (effective k at least 5) and the period's audit trail, `manifest.json` with each file's SHA-256, and `manifest.sig` from the Tenant `ECC_NIST_P256` key (`ECDSA_SHA_256`) through a `Signer` interface (KMS in production, local ECDSA in tests); available within 1 hour
    - Public key download; `verifyExport` returning "unchanged since signing" or "modified or signature invalid" within 10 seconds; generation or signing failure notifies the Executive within 5 minutes and never delivers an unsigned export; audit entries
    - _Requirements: 15.4, 15.5, 15.7, 15.8_

  - [ ]* 36.2 Write property test for signed export tamper detection
    - **Property 51: Signed export tamper detection**
    - **Validates: Requirements 15.4, 15.5**

- [ ] 37. Build the PWA and infrastructure for Phase 3
  - [-] 37.1 Implement the Broadcast and executive screens
    - Broadcast composer with audience builder, recipient preview gating the send button, approval queue and failed-delivery report; full-screen emergency alert with Acknowledge; live acknowledgement rate
    - Executive dashboards with table alternatives for charts, spike alerts with clusters, incident form that keeps entered values, board pack, export download and verification
    - _Requirements: 13.1, 13.2, 13.7, 13.9, 13.10, 14.1, 14.5, 14.6, 14.7, 14.8, 14.9, 15.4, 15.5, 20.5_

  - [ ] 37.2 Add the Phase 3 infrastructure
    - `broadcast` and `emergency` SQS queues with DLQs; `emergency-worker` Fargate service with at least 2 warm tasks; End User Messaging SMS configuration; KMS signing key permissions; emergency alert canary every minute
    - _Requirements: 13.4, 15.4, 24.2_

  - [ ]* 37.3 Write Playwright tests for journey J4 and CDK assertions for Phase 3
    - _Requirements: 13.2, 13.7, 14.7, 24.2_

- [ ] 38. Checkpoint - Phase 3 complete
  - Ensure all tests pass, ask the user if questions arise.

### Phase 4: AI Copilot

- [ ] 39. Implement Copilot domain rules in `domain/copilot`
  - [ ] 39.1 Implement the grounding gate
    - `groundingGate(statements, retrievedIds, confidence, threshold)` refusing the whole answer when any statement lacks a citation, cites an id not retrieved, or confidence (from retrieval similarity and the `answerable` flag) is below the Tenant threshold
    - _Requirements: 16.1, 16.2_

  - [ ]* 39.2 Write property test for the grounding gate
    - **Property 53: Grounding gate**
    - **Validates: Requirements 16.1, 16.2**

  - [ ] 39.3 Implement the outcome-request detector
    - Multilingual patterns (English, Hindi, Hinglish) plus the model intent field, returning the fixed decline message with a Ticket offer
    - _Requirements: 16.4_

  - [ ]* 39.4 Write property test for outcome requests
    - **Property 54: Outcome requests are declined**
    - **Validates: Requirements 16.4**

  - [ ] 39.5 Implement the prompt builder
    - Places each knowledge chunk and Student message in its own delimited block with `<` and `>` escaped, and parses a prompt back into blocks for verification; the model is given no tools
    - _Requirements: 16.11_

  - [ ]* 39.6 Write property test for untrusted content
    - **Property 55: Untrusted content stays data**
    - **Validates: Requirements 16.5, 16.11**

- [ ] 40. Implement the Copilot service in `packages/server/copilot`
  - [ ] 40.1 Implement knowledge ingestion
    - Migrations for the `copilot` schema with an HNSW index; Tenant_Admin upload of FAQ and policy documents; chunking at about 500 tokens with overlap, redaction, embedding and storage
    - _Requirements: 16.1, 16.3_

  - [ ] 40.2 Implement the conversation endpoint
    - Message length validation (1 to 2,000 characters) keeping the conversation on error; outcome-request check; redaction of the message and all retrieved context; retrieval from Tenant chunks and the Student's own data through typed queries
    - `generate` with a JSON schema and a 15-second timeout; grounding gate; citations; de-redaction of the Student's own details for display from the in-memory map; unavailable message with the conversation kept and a Ticket offer
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.10, 16.11, 16.12_

  - [ ] 40.3 Implement handoff, feedback and containment
    - `POST /copilot/conversations/{id}/handoff` with explicit confirmation creating a Ticket with the full transcript and returning its id
    - Thumbs-down feedback stored with the redacted question and cited source ids, visible for Tenant review within 1 minute; `eraseSubject` for conversations; containment-rate metric in the registry
    - _Requirements: 16.5, 16.7, 16.9, 19.4_

  - [ ]* 40.4 Write unit tests for Copilot and extend shared tests
    - Handoff creates exactly one Ticket only after confirmation; thumbs-down record; unavailability; add the Copilot paths to the Property 14 test and the containment-rate reference to the Property 47 test
    - _Requirements: 16.3, 16.5, 16.7, 16.9, 16.10_

- [ ] 41. Build the Copilot UI and evaluation gate
  - [ ] 41.1 Implement the Copilot screens
    - Conversation screen with a persistent "Responses are AI-generated" notice, citations, length errors, and Ticket offer with confirmation; Tenant review page for feedback; knowledge source management for Tenant_Admins
    - _Requirements: 16.2, 16.5, 16.8, 16.9, 16.12_

  - [ ] 41.2 Extend `tools/eval` with the Copilot accuracy gate
    - Evaluation over a Tenant-reviewed set of at least 200 questions, failing below 92% for months 1 to 6 and below 96% from month 7
    - _Requirements: 16.6_

  - [ ]* 41.3 Write Playwright end-to-end tests for the Copilot
    - _Requirements: 16.2, 16.5, 16.8, 16.10_

- [ ] 42. Final checkpoint - All phases complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP. Core implementation tasks are never optional.
- Each task references requirement clauses from requirements.md for traceability. G-numbers refer to the interim resolutions in design.md.
- Property tests use fast-check with Vitest, run at least 100 iterations (`{ numRuns: 100 }` passed explicitly), and carry the comment `Feature: campusconnect-platform, Property {number}: {property title}`. Each property has exactly one property test.
- Arbitraries are added by the implementation task that introduces the types; property test tasks only read them.
- DB-backed properties (1, 7, 25, 58) run against PostgreSQL 16 with pgvector in Testcontainers using the production migrations and RLS policies.
- Optional tasks 18.9, 28.6, 30.4, 34.5 and 40.4 extend the Property 14 and Property 47 tests to call paths and metrics added in later phases; they do not add new properties.
- Checkpoints close the foundations, the ticketing core and each phase.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1", "3.2", "8.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.2", "2.3", "2.5", "2.7", "2.11", "3.3", "3.4", "4.1", "5.1", "7.1"] },
    { "id": 3, "tasks": ["1.5", "2.4", "2.6", "2.8", "2.9", "2.10", "2.12", "4.2", "5.2", "5.3", "7.2"] },
    { "id": 4, "tasks": ["5.4", "6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["6.3", "8.2"] },
    { "id": 7, "tasks": ["8.3", "9.1"] },
    { "id": 8, "tasks": ["9.2"] },
    { "id": 9, "tasks": ["9.3", "10.1"] },
    { "id": 10, "tasks": ["10.2"] },
    { "id": 11, "tasks": ["10.3", "10.4"] },
    { "id": 12, "tasks": ["12.1", "13.1", "14.1", "20.1", "20.4", "21.1", "21.4", "22.1", "23.1", "24.1"] },
    { "id": 13, "tasks": ["12.2", "12.3", "12.4", "13.2", "13.3", "13.4", "14.2", "14.3", "14.4", "18.1", "20.2", "20.5", "21.2", "21.3", "21.5", "22.2", "22.3", "23.2", "24.2"] },
    { "id": 14, "tasks": ["12.5", "12.6", "13.5", "13.6", "14.5", "14.6", "18.2", "18.3", "22.4", "23.3"] },
    { "id": 15, "tasks": ["12.7", "12.8", "14.7", "18.4", "18.5", "22.5", "22.6", "23.4", "24.3"] },
    { "id": 16, "tasks": ["15.1", "17.1", "22.7"] },
    { "id": 17, "tasks": ["15.2", "15.3", "17.2", "17.3"] },
    { "id": 18, "tasks": ["15.4", "15.5"] },
    { "id": 19, "tasks": ["15.6", "15.7"] },
    { "id": 20, "tasks": ["15.8"] },
    { "id": 21, "tasks": ["15.9", "15.10", "16.1"] },
    { "id": 22, "tasks": ["16.2"] },
    { "id": 23, "tasks": ["16.3", "17.4"] },
    { "id": 24, "tasks": ["17.5", "17.6", "17.7", "18.6"] },
    { "id": 25, "tasks": ["18.7", "18.9"] },
    { "id": 26, "tasks": ["18.8", "20.3"] },
    { "id": 27, "tasks": ["20.6"] },
    { "id": 28, "tasks": ["20.7", "20.8", "20.9", "22.8"] },
    { "id": 29, "tasks": ["20.10", "21.6", "22.9", "25.3"] },
    { "id": 30, "tasks": ["21.7"] },
    { "id": 31, "tasks": ["21.8"] },
    { "id": 32, "tasks": ["21.9", "21.10", "22.10"] },
    { "id": 33, "tasks": ["22.11", "25.1", "25.2"] },
    { "id": 34, "tasks": ["27.1", "27.7", "27.10"] },
    { "id": 35, "tasks": ["27.2", "27.3", "27.4", "27.8", "27.9", "27.11", "27.12", "27.13", "27.14", "28.1"] },
    { "id": 36, "tasks": ["27.5", "27.6", "28.2", "28.3"] },
    { "id": 37, "tasks": ["28.4", "28.5"] },
    { "id": 38, "tasks": ["28.6", "29.1"] },
    { "id": 39, "tasks": ["29.2"] },
    { "id": 40, "tasks": ["29.3", "30.1"] },
    { "id": 41, "tasks": ["30.2"] },
    { "id": 42, "tasks": ["30.3"] },
    { "id": 43, "tasks": ["30.4", "31.1"] },
    { "id": 44, "tasks": ["31.2"] },
    { "id": 45, "tasks": ["33.1", "34.1", "35.1"] },
    { "id": 46, "tasks": ["33.2", "33.3", "33.4", "33.5", "34.2", "35.2"] },
    { "id": 47, "tasks": ["34.3"] },
    { "id": 48, "tasks": ["34.4"] },
    { "id": 49, "tasks": ["34.5", "35.3"] },
    { "id": 50, "tasks": ["35.4"] },
    { "id": 51, "tasks": ["35.5", "36.1"] },
    { "id": 52, "tasks": ["36.2", "37.1", "37.2"] },
    { "id": 53, "tasks": ["37.3"] },
    { "id": 54, "tasks": ["39.1", "40.1"] },
    { "id": 55, "tasks": ["39.2", "39.3"] },
    { "id": 56, "tasks": ["39.4", "39.5"] },
    { "id": 57, "tasks": ["39.6", "40.2"] },
    { "id": 58, "tasks": ["40.3"] },
    { "id": 59, "tasks": ["40.4", "41.1", "41.2"] },
    { "id": 60, "tasks": ["41.3"] }
  ]
}
```
