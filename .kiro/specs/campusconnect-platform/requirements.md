# Requirements Document

## Introduction

CampusConnect is an AI-driven, multi-tenant SaaS platform for student–institution communication and campus services. It targets higher-education institutions with 5,000 to 100,000 students that already run an ERP/SIS and an LMS. The initial market is India. DPDP, FERPA and GDPR compliance packs are later work.

The platform addresses six problems: fragmented channels (H1), lack of transparency (H2), administrative bottlenecks with 25-30% misrouted items and 4-6 day first response (H3), opportunity leakage (H4), broadcast inefficiency (H5), and leadership blindness (H6).

Scope is the full platform, delivered in four phases:

- **Phase 1**: Ticketing and grievance core (journeys J1 and J3).
- **Phase 2**: Opportunities and scholarships (J2).
- **Phase 3**: Broadcasts, emergency alerts and executive analytics (J4).
- **Phase 4**: AI Copilot.

Cross-cutting foundations (identity, RBAC, multi-tenancy, audit, integrations, NFRs) are delivered from Phase 1 and extended in later phases.

**Priority tags** used in this document:

- **P0**: launch-blocking.
- **P1**: required for phase GA.
- **P2**: fast follow.

**Ticket priority bands** are P0 Critical, P1 High, P2 Normal and P3 Low. Requirement priority tags and ticket priority bands are distinct concepts. Requirement tags are always written as "Priority: Pn" and ticket bands as "band".

**Assumptions** are marked (A) and are listed in the Assumptions section.

**Technical context** (recorded here for design, not as requirements): TypeScript full-stack on AWS; React/Next.js PWA; NestJS API; PostgreSQL with row-level security; AWS CDK; Hugging Face API behind a provider adapter interface.

**Non-goals**:

- Replacing the ERP, SIS or LMS (integration is read-only).
- Fee payments.
- Grade edits.
- A parent portal.
- A social network or public complaint wall.

**North Star metric (VOTR)**: the share of closed tickets resolved within priority SLA and not disputed or reopened within 7 days. Targets are at least 65% at month 3, 80% at month 6 and 90% at month 12.

## Glossary

- **CampusConnect**: The overall multi-tenant SaaS platform.
- **Tenant**: One institution (customer) whose data is logically isolated from all other institutions.
- **Student**: An undergraduate, postgraduate or research learner who uses CampusConnect.
- **Handler**: A department staff member who works tickets from the Staff_Workbench.
- **Dept_Head**: A department head or dean who owns L2 escalations and Reopened tickets.
- **Executive**: A central leadership user who views analytics and issues broadcasts.
- **Ombudsperson**: A member of the Grievance Committee who reviews L3 escalations and handles confidential identities.
- **Tenant_Admin**: An IT administrator who configures a Tenant.
- **Ticket**: A tracked request or complaint raised by a Student.
- **Grievance**: A Ticket of type Complaint.
- **Ticket_Service**: The component that creates, stores and transitions Tickets.
- **Ticket_Priority_Band**: The urgency band of a Ticket: P0 Critical, P1 High, P2 Normal, P3 Low.
- **Triage_Service**: The component that classifies, prioritises and routes Tickets using the AI_Adapter.
- **AI_Adapter**: The provider-neutral interface through which CampusConnect calls AI models (classification, priority, embeddings, LLM summaries, Copilot). The default implementation uses the Hugging Face API.
- **PII_Redactor**: The component that removes personally identifiable information from text before any external call.
- **SLA_Engine**: The component that calculates due times, runs SLA clocks and triggers escalation.
- **SLA_Clock**: The running timer of a Ticket against its first-response and resolution commitments.
- **At_Risk**: A Ticket state in which at least 75% of its resolution SLA has elapsed.
- **Staff_Workbench**: The web interface used by Handlers and Dept_Heads to work Tickets.
- **Needs_Verification_Lane**: A Staff_Workbench lane holding Tickets whose AI confidence is below the Tenant threshold.
- **Notification_Service**: The component that delivers in-app, push, email and SMS messages.
- **Broadcast_Service**: The component that sends targeted announcements and emergency alerts and tracks acknowledgements.
- **Opportunity_Service**: The component that manages scholarships, internships and similar opportunities, matching and applications.
- **Match_Engine**: The component that computes eligibility and match scores between Student profiles and Opportunities.
- **Document_Locker**: The per-Student store of uploaded documents reusable across applications.
- **Copilot**: The conversational assistant that answers Student questions grounded in Tenant knowledge.
- **Analytics_Service**: The component that computes metrics, dashboards, spike detection and reports.
- **Identity_Service**: The component that authenticates users and enforces role-based access control (RBAC).
- **SSO_Provider**: The institution's single sign-on identity provider (mocked in the first release).
- **ERP_Adapter**: The interface through which CampusConnect reads data from the institution's ERP/SIS (stubbed in the first release).
- **Audit_Log**: The append-only record of security- and workflow-relevant events.
- **k-anonymity**: A rule under which an aggregate is shown only if it covers at least k individuals. The value of k is 5 unless a Tenant configures a higher value.
- **VOTR**: The North Star metric defined in the Introduction.
- **Working_Day**: A day designated as a working day in the Tenant calendar.

## Requirements

### Requirement 1: Tenant Isolation and Configuration (Priority: P0, Phase 1)

**User Story:** As a Tenant_Admin, I want my institution's data isolated and configurable, so that data of other institutions is never exposed and policies match my institution.

#### Acceptance Criteria

1. THE CampusConnect SHALL enforce Tenant isolation on every persistent data store using database row-level security keyed by Tenant identifier, such that a query executed under one Tenant identifier returns zero rows belonging to any other Tenant.
2. WHEN a request is received, THE Identity_Service SHALL resolve the Tenant identifier from the authenticated session and attach it to the data access context before any data store access occurs.
3. IF a request has no valid authenticated session or the Tenant identifier cannot be resolved, THEN THE Identity_Service SHALL reject the request without accessing any data store, return an authentication error indication to the caller, and record an Audit_Log entry.
4. IF a request attempts to read or write data belonging to a different Tenant, THEN THE CampusConnect SHALL deny the request, return an authorization error indication to the caller without revealing whether the requested data exists, leave the targeted data unchanged, and record an Audit_Log entry containing the requesting Tenant identifier, the targeted Tenant identifier, the requesting user, and the timestamp within 5 seconds of the denial.
5. WHERE a Tenant_Admin configures categories, departments, routing rules, SLA durations, working calendar, confidence thresholds or k-anonymity value, THE CampusConnect SHALL apply the configuration to that Tenant only and SHALL leave the configuration of all other Tenants unchanged.
6. IF a Tenant_Admin submits a configuration value that is invalid (an SLA duration not a positive whole number of minutes, a confidence threshold outside 0.00 to 1.00, or a k-anonymity value not a whole number from 2 to 1000), THEN THE CampusConnect SHALL reject the change, retain the previously saved configuration, and return an error indication identifying the invalid field.
7. WHEN a Tenant_Admin creates a Tenant, THE CampusConnect SHALL provision default categories, SLA policies and roles for that Tenant within 30 seconds, and the Tenant SHALL have no access to any other Tenant's data.
8. IF provisioning of default categories, SLA policies or roles fails during Tenant creation, THEN THE CampusConnect SHALL roll back all partially created Tenant data, report the failure to the Tenant_Admin, and record an Audit_Log entry.
9. THE CampusConnect SHALL store each Tenant's data in the AWS region configured for that Tenant, with ap-south-1 as the default region for India Tenants. (A)

### Requirement 2: Authentication and Role-Based Access Control (Priority: P0, Phase 1)

**User Story:** As a Tenant_Admin, I want users to sign in through institutional SSO with role-appropriate access, so that only authorised people see sensitive data.

#### Acceptance Criteria

1. WHEN a user opens CampusConnect without an active session, THE Identity_Service SHALL redirect the user to the SSO_Provider for authentication and, on a successful SSO_Provider response, establish an authenticated session within 3 seconds.
2. THE Identity_Service SHALL support exactly the roles Student, Handler, Dept_Head, Executive, Ombudsperson and Tenant_Admin, and SHALL assign each authenticated user at least 1 role.
3. WHEN a Handler, Dept_Head, Executive, Ombudsperson or Tenant_Admin signs in, THE Identity_Service SHALL require a successful multi-factor authentication challenge before establishing the session.
4. WHEN a user requests a resource, THE Identity_Service SHALL permit the request only if the user's role is authorised for that resource and action.
5. IF a user requests a resource or action that the user's role is not authorised for, THEN THE Identity_Service SHALL deny the request, return an error indicating insufficient permission, leave the resource unchanged, and record an Audit_Log entry.
6. THE Identity_Service SHALL scope Handler and Dept_Head access to Tickets of the departments assigned to that user.
7. WHEN a session has had no user activity for 30 minutes, THE Identity_Service SHALL expire the session and require re-authentication. (A: 30 minutes is the default and is Tenant-configurable between 5 and 480 minutes.)
8. THE Identity_Service SHALL authenticate against a mocked SSO_Provider in the first release behind an interface that allows OIDC and SAML implementations to be added later. (A)
9. IF authentication fails 5 consecutive times for an account within 15 minutes, THEN THE Identity_Service SHALL lock the account for 15 minutes, reject further sign-in attempts for that account during the lock with an error indicating the account is locked, and record an Audit_Log entry.
10. IF the SSO_Provider is unavailable or does not respond within 10 seconds, THEN THE Identity_Service SHALL deny sign-in, display an error indicating that sign-in is temporarily unavailable, and create no session.

### Requirement 3: Grievance and Ticket Submission (Priority: P0, Phase 1; journey J1)

**User Story:** As a Student, I want to raise a Ticket or Grievance easily, even with poor connectivity, so that my issue is recorded without losing my text.

#### Acceptance Criteria

1. WHEN a Student enters or edits text in the Ticket form, THE CampusConnect PWA SHALL autosave a draft on the device within 5 seconds of the last change, retaining the draft until the Ticket is successfully submitted or the Student discards it.
2. WHILE the device has no network connectivity, THE CampusConnect PWA SHALL allow the Student to compose and save a draft and SHALL indicate that the draft is queued for submission.
3. WHEN network connectivity returns, THE CampusConnect PWA SHALL submit each queued draft within 30 seconds, using the same idempotency key for every retry of that draft.
4. IF a queued submission fails after 5 retry attempts, THEN THE CampusConnect PWA SHALL retain the draft on the device, show an error indicating that submission failed, and let the Student retry manually.
5. WHEN the Student has entered at least 20 characters in the description, THE Triage_Service SHALL return a suggested category with a confidence value between 0 and 100 percent within 3 seconds.
6. IF the Triage_Service does not respond within 3 seconds or returns an error, THEN THE CampusConnect PWA SHALL let the Student select a category manually and SHALL NOT block submission.
7. THE CampusConnect PWA SHALL let the Student accept or change the suggested category before submission.
8. WHERE a Student selects the confidential option on a Grievance, THE Ticket_Service SHALL restrict the Student's identity to the Ombudsperson and to Handlers explicitly authorised by the Ombudsperson, and SHALL hide the Student's identity from all other users.
9. WHEN a Student submits a Ticket, THE Ticket_Service SHALL create the Ticket idempotently using a client-generated idempotency key, so that repeated submissions with the same key produce one Ticket and return the receipt of the existing Ticket.
10. WHEN a Student submits a Ticket, THE Ticket_Service SHALL run a profanity check and a duplicate check against the Student's open Tickets within 5 seconds.
11. IF the duplicate check finds an open Ticket with a similarity score at or above the Tenant threshold, THEN THE CampusConnect PWA SHALL show the existing Ticket and let the Student choose to link or continue, and SHALL preserve the Student's entered text whichever option is chosen.
12. IF the profanity check flags the text, THEN THE CampusConnect PWA SHALL ask the Student to review the text and SHALL allow submission after the Student confirms.
13. WHEN a Ticket is created, THE Ticket_Service SHALL issue a receipt showing the Ticket identifier, assigned category, first-response commitment and resolution commitment.
14. THE Ticket_Service SHALL accept up to 5 attachments per Ticket, each up to 10 MB, of type PDF, JPEG, PNG or MP4. (A)
15. IF an attachment exceeds 10 MB, is not of an accepted type, or would exceed 5 attachments on the Ticket, THEN THE Ticket_Service SHALL reject that attachment, show an error indicating the reason, and keep the Ticket text and other attachments unchanged.
16. IF an attachment fails malware scanning, THEN THE Ticket_Service SHALL reject the attachment, inform the Student that the attachment was rejected, and keep the Ticket text and other valid attachments unchanged.

### Requirement 4: Ticket Lifecycle and Status Transparency (Priority: P0, Phase 1; journey J1)

**User Story:** As a Student, I want to see my Ticket's status and confirm or dispute its resolution, so that I know where my issue stands.

#### Acceptance Criteria

1. THE Ticket_Service SHALL support exactly seven statuses: New, Assigned, In Progress, Awaiting Student, Resolved (Pending Confirmation), Closed and Reopened.
2. WHEN a Ticket status changes, THE Ticket_Service SHALL record the change with actor, timestamp (UTC, second precision), previous status, new status and a reason of 1 to 500 characters in the Ticket history, and SHALL make the entry visible in the Ticket history within 5 seconds.
3. WHEN a Student opens the Ticket list or a Ticket detail view, THE CampusConnect PWA SHALL show the current status, assigned department, SLA due times and full status history of each of the Student's own Tickets and SHALL NOT show Tickets belonging to other Students.
4. WHEN a Handler sets a Ticket to Awaiting Student, THE SLA_Engine SHALL pause the SLA_Clock and record the paused start time within 5 seconds.
5. WHEN the Student responds to a Ticket in Awaiting Student, THE SLA_Engine SHALL resume the SLA_Clock, record the paused duration, and extend the SLA due times by the paused duration within 5 seconds.
6. WHEN a Ticket has been in Awaiting Student for 7 days without a Student response, THE Ticket_Service SHALL notify the Student and the Handler and SHALL keep the Ticket open, with the SLA_Clock remaining paused, until a Handler acts. (A)
7. WHEN a Handler marks a Ticket resolved, THE Ticket_Service SHALL set the status to Resolved (Pending Confirmation), notify the Student, and start a 7-day confirmation window.
8. WHEN the Student confirms resolution and submits a rating of 1 to 5 within the confirmation window, THE Ticket_Service SHALL set the status to Closed and store the rating.
9. WHEN the 7-day confirmation window ends without Student action, THE Ticket_Service SHALL set the status to Closed and flag the closure as auto-confirmed.
10. WHEN a Student disputes a resolution within the confirmation window and provides a dispute reason of 1 to 500 characters, THE Ticket_Service SHALL set the status to Reopened, assign the Ticket at Dept_Head level to a Handler different from the previous resolver, and set the SLA to 50% of the original SLA.
11. IF a Student disputes a resolution after the confirmation window has ended, THEN THE Ticket_Service SHALL reject the dispute, leave the Ticket status unchanged, and show the Student an error indicating the window has ended.
12. WHEN a Student withdraws a Ticket that is not Closed, THE Ticket_Service SHALL set the status to Closed with reason Withdrawn.
13. IF a status change is attempted on a Closed Ticket by any actor other than a Dept_Head or Ombudsperson reopening it, THEN THE Ticket_Service SHALL reject the change, leave the Ticket status unchanged, and return an error indicating the Ticket is Closed.
14. WHEN a Dept_Head or Ombudsperson reopens a Closed Ticket with a reason, THE Ticket_Service SHALL set the status to Reopened and record the reason in the Ticket history.

### Requirement 5: AI Triage with PII Redaction (Priority: P0, Phase 1; journeys J1, J3)

**User Story:** As a Handler, I want Tickets automatically classified, prioritised and routed, so that fewer Tickets are misrouted and urgent ones are seen first.

#### Acceptance Criteria

1. WHEN a Ticket is created, THE PII_Redactor SHALL redact PII from the Ticket text before any text is sent to the AI_Adapter, and SHALL complete redaction within 2 seconds for Ticket text of up to 10,000 characters.
2. THE PII_Redactor SHALL redact names, phone numbers, email addresses, enrolment or roll numbers, government identifiers, postal addresses and bank or card numbers, replacing each redacted item with a placeholder that indicates the PII type.
3. IF the PII_Redactor fails or does not complete within 2 seconds, THEN THE Triage_Service SHALL not call the AI_Adapter, SHALL route the Ticket to the Needs_Verification_Lane, and SHALL retain the original Ticket unchanged.
4. WHEN redacted Ticket text is received, THE Triage_Service SHALL produce a category, a Ticket_Priority_Band, a department route and a confidence value between 0.00 and 1.00 for each of category, band and department route, and SHALL complete this within 10 seconds.
5. WHEN the confidence for category or department is below the Tenant threshold, THE Triage_Service SHALL place the Ticket in the Needs_Verification_Lane. (A: default threshold is 0.70, configurable per Tenant between 0.00 and 1.00.)
6. WHEN the Ticket text indicates a safety risk (harassment, self-harm or physical danger), THE Triage_Service SHALL assign band P0 Critical and notify the on-duty Dept_Head and the Ombudsperson within 60 seconds of band assignment.
7. IF the notification of the on-duty Dept_Head or the Ombudsperson for a P0 Critical Ticket fails, THEN THE Triage_Service SHALL retry up to 3 times at 30-second intervals and, if all retries fail, SHALL flag the Ticket as "Escalation Failed" on the Handler queue.
8. THE Triage_Service SHALL keep the P0 Critical false-negative rate at or below 2% on the Tenant evaluation set.
9. THE Triage_Service SHALL use AI output only as a recommendation for category, band and route, and SHALL not reject, close or decide the outcome of any Ticket.
10. WHILE the AI_Adapter is unavailable or returns no response within 10 seconds, THE Triage_Service SHALL route new Tickets to a default department queue using rule-based keyword routing and mark them as Needs Verification.
11. WHEN an AI call is made, THE Triage_Service SHALL record the model identifier, model version, redacted input hash, outputs and confidences for that call.
12. THE AI_Adapter SHALL expose a provider-neutral interface for classification, priority scoring, embeddings and text generation, so that the provider can be replaced by configuration without changes to calling components.
13. THE AI_Adapter SHALL use the Hugging Face API as the default provider. (A)
14. THE CampusConnect SHALL send no text to any external AI provider unless it has passed the PII_Redactor.
15. THE CampusConnect SHALL display the label "AI-suggested" on every AI-generated category, band, route or summary shown to a Handler or Student.

### Requirement 6: SLA Management and Escalation (Priority: P0, Phase 1; journey J3)

**User Story:** As a Dept_Head, I want SLAs tracked and breached Tickets escalated, so that nothing silently stalls.

#### Acceptance Criteria

1. WHEN a Ticket is routed, THE SLA_Engine SHALL start the SLA_Clock and compute first-response and resolution due times from the Ticket_Priority_Band, category and the Tenant working calendar within 1 minute of routing.
2. WHILE the SLA_Clock is running, THE SLA_Engine SHALL count only Working_Day hours defined in the Tenant calendar, except for band P0 Critical which SHALL be counted continuously (24 hours per day, 7 days per week, including non-Working_Days). (A)
3. WHEN 75% of a Ticket's resolution SLA has elapsed, THE SLA_Engine SHALL mark the Ticket At_Risk and notify the assigned Handler within 1 minute of the 75% threshold being reached.
4. WHEN 100% of a Ticket's resolution SLA has elapsed without the Ticket being resolved, THE SLA_Engine SHALL escalate the Ticket to L1 and notify the Student of the new ETA within 1 minute of the escalation, AND THE Ticket_Service SHALL require the Handler to enter a new ETA that is later than the current time and no more than 30 calendar days ahead.
5. WHEN an L1 escalation is not resolved within its escalation SLA, THE SLA_Engine SHALL escalate to L2 at Dept_Head level and notify the Dept_Head within 1 minute of escalation. (A)
6. WHEN an L2 escalation is not resolved within its escalation SLA, THE SLA_Engine SHALL escalate to L3 for Ombudsperson review and notify the Ombudsperson within 1 minute of escalation.
7. WHEN a Ticket is escalated to L3, THE Ticket_Service SHALL require the Ombudsperson to complete review of the Ticket within 10 Working Days, and IF the review is not completed within 10 Working Days, THEN THE SLA_Engine SHALL flag the Ticket as Ombudsperson-overdue and notify the Dept_Head.
8. WHEN a Handler records a first public response on a Ticket, THE SLA_Engine SHALL mark the first-response SLA as met if the elapsed SLA_Clock time is less than or equal to the first-response due time, otherwise as breached, and record the elapsed time in minutes.
9. WHEN a Ticket is paused, resumed, reassigned or has its Ticket_Priority_Band changed, THE SLA_Engine SHALL recalculate the first-response and resolution due times within 1 minute of the event.
10. WHEN a Handler or Dept_Head changes a Ticket_Priority_Band, THE Ticket_Service SHALL require a reason of 1 to 500 characters and record the change, the reason, the actor and the timestamp in the Audit_Log.
11. IF a Handler or Dept_Head submits a Ticket_Priority_Band change without a reason, or with a reason outside 1 to 500 characters, THEN THE Ticket_Service SHALL reject the change, retain the existing Ticket_Priority_Band, and display an error indicating that a reason of 1 to 500 characters is required.
12. IF the Tenant working calendar is missing or undefined when a Ticket is routed, THEN THE SLA_Engine SHALL not start the SLA_Clock, flag the Ticket as SLA-unconfigured, and notify the Tenant_Admin within 1 minute.

### Requirement 7: Staff Workbench Queue and Actions (Priority: P0, Phase 1; journey J3)

**User Story:** As a Handler, I want an efficient keyboard-driven queue with bulk actions, so that I can process 90 to 150 items per day.

#### Acceptance Criteria

1. WHEN a Handler opens the queue, THE Staff_Workbench SHALL list the Handler's assigned Tickets sorted first by Ticket_Priority_Band from highest to lowest, then by nearest SLA due time ascending, and then by creation time ascending for Tickets with equal due times, and SHALL display the first 50 Tickets within 2 seconds for a queue of up to 500 Tickets.
2. THE Staff_Workbench SHALL display, for each At_Risk Ticket, the text label "At risk" and, for each breached Ticket, the text label "Breached", in addition to color highlighting, so that the status is identifiable without color perception.
3. THE Staff_Workbench SHALL provide the Needs_Verification_Lane listing every open Ticket whose AI-suggested category, band or route has not yet been confirmed or corrected by a Handler, and SHALL display the count of Tickets in the lane.
4. WHEN a Handler corrects an AI-suggested category, band or route with one action, THE Staff_Workbench SHALL apply the correction to the Ticket and record the original suggestion, the correction, the Handler identity and the timestamp as a training label, and SHALL show the corrected value within 2 seconds.
5. THE Staff_Workbench SHALL calculate the AI override rate per category as the number of corrected AI suggestions divided by the number of AI suggestions made in the category over a rolling 30-day period, SHALL display it only to Dept_Heads, and SHALL NOT display or report the rate per individual Handler.
6. WHEN a Handler inserts a canned reply into a response, THE Staff_Workbench SHALL place the reply text in the editable response field, and SHALL NOT send the response until the Handler explicitly submits it.
7. THE Staff_Workbench SHALL support keyboard shortcuts for navigating the queue, opening a Ticket, assigning, replying and changing status, such that each of these five actions can be completed without a pointing device.
8. WHEN a Handler selects 2 to 100 Tickets and requests reassignment with a reason of 1 to 500 characters, THE Ticket_Service SHALL reassign all selected Tickets atomically, leave their SLA due times unchanged, and record one Audit_Log entry per Ticket containing the Handler, the previous assignee, the new assignee, the reason and the timestamp.
9. IF any Ticket in a bulk reassignment cannot be reassigned, THEN THE Ticket_Service SHALL reassign none of the selected Tickets, leave all Tickets unchanged, and return an error listing each failing Ticket with the reason for its failure.
10. IF a Ticket is a confidential Grievance, THEN THE Staff_Workbench SHALL hide the Student's name and contact details from Handlers not authorised by the Ombudsperson, in the queue, in the Ticket view and in search results.
11. THE Staff_Workbench SHALL allow a Handler to add internal notes of 1 to 5,000 characters to a Ticket, and SHALL NOT show internal notes to the Student in any Student-facing view or notification.
12. WHERE the AI_Adapter is available, WHEN a Handler opens a Ticket, THE Staff_Workbench SHALL show an AI-generated summary of the Ticket labelled "AI-suggested" within 3 seconds. (A: Priority P1, requires the AI_Adapter.)
13. IF the AI_Adapter is unavailable or does not return a summary within 3 seconds, THEN THE Staff_Workbench SHALL open the Ticket without the summary, display a notice that the summary is unavailable, and keep all other Ticket actions usable.

### Requirement 8: Grievance Committee and Confidentiality (Priority: P1, Phase 1; journey J1)

**User Story:** As an Ombudsperson, I want confidential and escalated Grievances handled securely and on time, so that Students can raise concerns without fear of retaliation.

#### Acceptance Criteria

1. WHEN a confidential Grievance is created, THE Ticket_Service SHALL replace the Student's name, email address and student ID with an anonymised reference that is unique to that Grievance, in every view, notification and search result available to Handlers.
2. WHEN an Ombudsperson reveals a confidential identity to a Handler, THE Ticket_Service SHALL require a reason of 10 to 500 characters and, on submission, SHALL reveal the identity only to the named Handler for that Grievance and write an Audit_Log entry containing the Ombudsperson, Handler, Grievance, reason and timestamp.
3. IF an Ombudsperson submits a reveal request with a missing reason or a reason outside 10 to 500 characters, THEN THE Ticket_Service SHALL reject the request, display an error indicating the reason is invalid, and keep the identity hidden.
4. WHEN an Ombudsperson opens the L3 Grievance list, THE Ticket_Service SHALL display every open L3 Grievance with the Working Days remaining in its 10 Working Day review period, and SHALL mark a Grievance as overdue when zero Working Days remain.
5. WHEN an Ombudsperson records a decision on an L3 Grievance, THE Ticket_Service SHALL require a rationale of 20 to 5,000 characters, store the decision and rationale, and notify the Student within 60 seconds.
6. THE Analytics_Service SHALL exclude the name, email address, student ID and anonymised-reference mapping of confidential Students from every report and export.
7. IF a Handler attempts to view a confidential identity without authorisation, THEN THE Ticket_Service SHALL deny access, display an error indicating the action is not permitted, keep the identity hidden, and write an Audit_Log entry containing the Handler, Grievance and timestamp within 5 seconds.
8. IF writing an Audit_Log entry fails during an identity reveal, THEN THE Ticket_Service SHALL cancel the reveal, keep the identity hidden, and display an error to the Ombudsperson indicating the reveal was not completed.

### Requirement 9: Notifications (Priority: P0, Phase 1)

**User Story:** As a Student, I want timely notifications on my Tickets and services, so that I do not need to check repeatedly.

#### Acceptance Criteria

1. WHEN a Ticket status, assignment, ETA or response changes, THE Notification_Service SHALL create a notification for the Student on each of the Student's enabled channels within 60 seconds of the change being recorded.
2. THE Notification_Service SHALL support in-app, web push and email channels for notifications.
3. WHERE SMS is enabled for a Tenant, THE Notification_Service SHALL deliver emergency alerts through SMS in addition to the channels in criterion 2.
4. THE Notification_Service SHALL let each user enable or disable each of the in-app, web push and email channels for non-emergency notifications.
5. IF delivery on a channel fails, THEN THE Notification_Service SHALL retry delivery on that channel up to 3 times, with at most 60 seconds between attempts, and after the third failed retry SHALL deliver the notification through the next enabled channel in the order in-app, web push, email.
6. IF delivery fails on all enabled channels after retries, THEN THE Notification_Service SHALL keep the notification as an unread in-app notification and record the failure for the Tenant_Admin.
7. THE Notification_Service SHALL exclude Grievance description text, attachments and reporter identity from email and web push message bodies.
8. WHEN the Student's device is offline, THE Notification_Service SHALL retain in-app notifications for up to 30 days and display them when the Student next signs in.

### Requirement 10: Opportunity Publication and Student Profile (Priority: P1, Phase 2; journey J2)

**User Story:** As a Student, I want a complete profile prefilled from the ERP, so that I am matched to relevant opportunities.

#### Acceptance Criteria

1. WHEN a Student signs in for the first time, THE Opportunity_Service SHALL prefill the Student's profile with the fields returned by the ERP_Adapter within 10 seconds and SHALL mark each prefilled ERP field as authoritative.
2. IF the ERP_Adapter returns an error or does not respond within 10 seconds during first sign-in, THEN THE Opportunity_Service SHALL create an empty profile, display a message indicating that ERP data is unavailable, and retry the prefill up to 3 times at intervals of 5 minutes.
3. WHEN a Student edits a profile field that is not an authoritative ERP field, THE Opportunity_Service SHALL save the corrected value and display the saved value to the Student.
4. IF a Student attempts to edit an authoritative ERP field, THEN THE Opportunity_Service SHALL reject the change, keep the existing value, and display a message indicating that the field is managed by the ERP.
5. WHERE a Student provides an income band, THE Opportunity_Service SHALL store it only after recording the Student's explicit consent with a timestamp.
6. WHEN a Student withdraws consent for the income band, THE Opportunity_Service SHALL delete the stored income band and exclude it from matching within 5 minutes.
7. WHEN a Student profile changes, THE Opportunity_Service SHALL regenerate the Student profile embedding within 5 minutes.
8. IF embedding regeneration fails, THEN THE Opportunity_Service SHALL keep the previous embedding, retry up to 3 times at intervals of 5 minutes, and flag the profile as embedding-stale until a retry succeeds.
9. THE Opportunity_Service SHALL calculate the profile completeness percentage as the number of filled matching-relevant fields divided by the total matching-relevant fields, rounded to the nearest whole number from 0 to 100, and SHALL display it with the list of missing fields that affect matching.
10. WHEN a Tenant staff user with publishing rights submits a new Opportunity containing title (1 to 200 characters), description (1 to 5,000 characters), eligibility rules, required documents, deadline (a future date and time) and a link or instructions to apply, THE Opportunity_Service SHALL store the Opportunity.
11. IF a Tenant staff user submits an Opportunity with a missing mandatory field, a field exceeding its length limit, or a deadline not in the future, THEN THE Opportunity_Service SHALL reject the submission, store nothing, and display a message identifying each invalid field.
12. IF a Tenant staff user without publishing rights attempts to create an Opportunity, THEN THE Opportunity_Service SHALL reject the request and store nothing.
13. WHEN an Opportunity's deadline passes, THE Opportunity_Service SHALL mark it Expired and exclude it from recommendations within 5 minutes.
14. THE Opportunity_Service SHALL send only redacted profile text to the AI_Adapter for embedding.

### Requirement 11: Opportunity Matching and Recommendations (Priority: P1, Phase 2; journey J2)

**User Story:** As a Student, I want ranked, explained recommendations with clear eligibility, so that I apply only to opportunities I can win.

#### Acceptance Criteria

1. WHEN an Opportunity is published, THE Match_Engine SHALL evaluate each Student's rule-based eligibility and compute a semantic match score as an integer from 0 to 100 for each eligible Student within 5 minutes of publication.
2. THE Match_Engine SHALL treat rule-based ineligibility as an exclusion that no match score can override, so that an ineligible Student never appears in that Opportunity's recommendations regardless of score.
3. THE CampusConnect PWA SHALL show a "Why recommended" explanation with each recommendation, listing between 1 and 5 matching profile attributes.
4. THE CampusConnect PWA SHALL show an eligibility checklist for each Opportunity, marking each criterion as exactly one of met, not met or unknown, where unknown applies when the Student's profile lacks the data needed to evaluate the criterion.
5. WHERE a Student has opted in to the weekly digest, THE Notification_Service SHALL send once per 7-day period a digest of the top 5 recommended Opportunities ranked by match score in descending order, or all available recommendations if fewer than 5 exist.
6. IF a Student has no eligible recommendations when the weekly digest is due, THEN THE Notification_Service SHALL skip sending the digest for that period.
7. WHEN a Student marks a recommendation as relevant, not relevant or hidden, THE Match_Engine SHALL record the feedback within 5 seconds and apply it to rankings generated after the feedback is recorded.
8. WHEN a Student marks a recommendation as hidden, THE CampusConnect PWA SHALL remove that Opportunity from the Student's recommendation list and digests.
9. THE Analytics_Service SHALL measure Opportunity exposure, defined as the share of Students in each group who were shown the Opportunity, across Student groups defined by gender, category and program, and SHALL report to the Tenant_Admin each pair of groups whose exposure differs by more than 10 percentage points.
10. THE Match_Engine SHALL not use income band, caste category or gender as semantic ranking inputs, and SHALL use them only for rule-based eligibility defined by the Opportunity. (A)

### Requirement 12: Application Tracking and Document Locker (Priority: P1, Phase 2; journey J2)

**User Story:** As a Student, I want to track applications and reuse documents, so that I do not miss deadlines or re-upload files.

#### Acceptance Criteria

1. WHEN a Student selects a target state for an Opportunity, THE CampusConnect PWA SHALL move the Opportunity to that state, where the allowed states are Saved, Preparing, Submitted and Outcome, and SHALL display the new state within 2 seconds.
2. THE Document_Locker SHALL store Student documents encrypted at rest.
3. WHEN a Student attaches a document to an application, THE Document_Locker SHALL link the document to that application without creating a copy, and a single document SHALL be attachable to up to 50 applications.
4. WHEN a Student opens the eligibility checklist for an Opportunity that requires a document missing from the Document_Locker, THE CampusConnect PWA SHALL list each missing document by name on the checklist.
5. WHEN a saved Opportunity deadline is exactly 7 days away or exactly 3 days away, THE Notification_Service SHALL send one reminder to the Student for each of those two points, but only if the application is not in the Submitted state or Outcome state at the time of sending.
6. WHEN a Student records an Outcome, THE Opportunity_Service SHALL store exactly one value from Selected, Not Selected or Withdrawn, and SHALL display the stored value to the Student within 2 seconds.
7. IF a Student attempts to record an Outcome value other than Selected, Not Selected or Withdrawn, THEN THE Opportunity_Service SHALL reject the request, retain the previous state, and display an error indicating the allowed values.
8. WHEN a Student deletes a document, THE Document_Locker SHALL remove it from the Student's view immediately and SHALL permanently remove it from storage within 30 days. (A)
9. WHEN a Student uploads a document, THE Document_Locker SHALL accept the file only if it is a PDF, JPEG or PNG file of 10 MB or less and it passes a malware scan.
10. IF an uploaded file is not a PDF, JPEG or PNG, exceeds 10 MB, or fails the malware scan, THEN THE Document_Locker SHALL reject the upload, not store the file, and display an error indicating the reason for rejection.
11. THE CampusConnect PWA SHALL perform no payment collection for application fees.

### Requirement 13: Targeted Broadcasts and Emergency Alerts (Priority: P0, Phase 3; journey J4)

**User Story:** As an Executive, I want to send targeted announcements and emergency alerts with tracked acknowledgement, so that critical messages reach the right Students quickly.

#### Acceptance Criteria

1. WHEN an authorised user creates a Broadcast, THE Broadcast_Service SHALL let the user target recipients by any combination of department, program, year, hostel or custom group, with a maximum of 50,000 recipients per Broadcast. (A)
2. WHEN an authorised user finishes selecting an audience, THE Broadcast_Service SHALL show the deduplicated recipient count within 2 seconds and before the Broadcast can be sent.
3. WHEN a Broadcast is sent, THE Broadcast_Service SHALL track delivered, read and acknowledged counts per Broadcast and update them within 5 seconds of each recipient event.
4. WHEN an Executive sends an emergency alert, THE Broadcast_Service SHALL deliver the alert to 95% of recipients over all enabled channels, including SMS, within 60 seconds of sending. (A)
5. WHILE an alert is flagged as an emergency alert, THE Broadcast_Service SHALL ignore user channel preferences and quiet hours when delivering it.
6. WHEN an emergency alert has not been acknowledged by a recipient within 5 minutes of delivery, THE Broadcast_Service SHALL resend the alert to that recipient once, on a channel not yet used for that alert.
7. WHILE an emergency alert is active, THE Broadcast_Service SHALL show the sender the acknowledgement rate (acknowledged recipients divided by total recipients), refreshed at least every 5 seconds.
8. IF a user other than an Executive or Tenant_Admin attempts to send an emergency alert, THEN THE Broadcast_Service SHALL reject the request, show an error indicating insufficient permission, and not deliver any message.
9. WHERE a Tenant enables approval workflow for non-emergency Broadcasts, THE Broadcast_Service SHALL hold each non-emergency Broadcast unsent until an approver approves it, and SHALL not send it if the approver rejects it.
10. IF delivery to a recipient fails on all enabled channels, THEN THE Broadcast_Service SHALL list the recipient and the failed channels in a failed-delivery report available to the sender within 5 minutes of the final failed attempt.
11. WHEN a Broadcast is created, approved, rejected or sent, THE Broadcast_Service SHALL record sender, audience, content and timestamp for that action in the Audit_Log.

### Requirement 14: Executive Analytics, Spike Detection and Incidents (Priority: P1, Phase 3; journey J4)

**User Story:** As an Executive, I want dashboards and spike alerts without exposing individuals, so that I can act on systemic issues.

#### Acceptance Criteria

1. THE Analytics_Service SHALL compute the VOTR, first-response time, SLA breach rate, escalation rate, misrouting rate, reopen and dispute rate and CSAT, filterable by department, category and period, where period is a start date and end date spanning 1 to 366 days inclusive.
2. WHEN the weekly digest time arrives (default Monday 08:00 in the institution's configured time zone), THE Notification_Service SHALL send each Executive a digest within 15 minutes containing the metrics listed in criterion 1 for the previous 7 days and the change versus the preceding 7 days, with each metric whose change is 10 percent or more flagged as notable.
3. WHEN the daily Ticket count for a category has a z-score above 3 against its trailing baseline of the previous 8 weeks, THE Analytics_Service SHALL raise a spike alert to the Executive within 15 minutes of the count crossing the threshold. (A: baseline is the trailing 8 weeks.)
4. IF a category has fewer than 14 days of baseline data or a baseline standard deviation of 0, THEN THE Analytics_Service SHALL NOT raise a spike alert for that category and SHALL display "Insufficient data" for its spike status.
5. WHEN a spike alert is raised, THE Analytics_Service SHALL show aggregate clusters of related Tickets, each covering at least k Tickets (default k = 5, configurable from 3 to 20), without Student identities.
6. THE Analytics_Service SHALL suppress any aggregate or drill-down covering fewer than k individuals and SHALL display an indication that the data was suppressed instead of the value.
7. WHEN an Executive creates an incident record from a spike, THE Analytics_Service SHALL require an owner who is an active staff user and a target resolution date that is not earlier than the current date, and SHALL link the incident to the originating spike alert.
8. IF an Executive submits an incident record without an owner or with a missing or past target resolution date, THEN THE Analytics_Service SHALL reject the submission, indicate the missing or invalid fields, and retain the entered values.
9. THE Analytics_Service SHALL provide a board pack for a selected period, listing all L2 and L3 escalations and a scorecard per department containing the metrics listed in criterion 1, and SHALL generate it within 30 seconds for periods up to 366 days.
10. THE Analytics_Service SHALL refresh dashboard data within 15 minutes of source changes. (A)
11. IF a metric has fewer than k contributing Tickets in the selected filter and period, or its denominator is 0, THEN THE Analytics_Service SHALL display "Insufficient data" instead of a number.

### Requirement 15: Reporting and Data Export (Priority: P1, Phase 1 for scheduled reports, Phase 3 for annual export)

**User Story:** As a Dept_Head, I want scheduled and on-demand reports and a signed annual export, so that I can report to governing bodies.

#### Acceptance Criteria

1. WHEN a Dept_Head schedules a report with a frequency (daily, weekly, monthly or quarterly), a format (PDF or CSV) and 1 to 20 recipients, THE Analytics_Service SHALL generate the report and deliver it in the selected format to every recipient within 15 minutes of each scheduled time.
2. IF a Dept_Head submits a schedule with a missing frequency, a missing format, zero recipients, more than 20 recipients, or a recipient outside the Tenant, THEN THE Analytics_Service SHALL reject the schedule with an error identifying the invalid field and SHALL NOT create or alter any schedule.
3. THE Analytics_Service SHALL restrict report content to data that the requesting user's role and department scope authorise, and SHALL exclude all other data from the generated output.
4. WHEN an Executive requests an annual export, THE Analytics_Service SHALL produce a digitally signed export that includes the audit trail for the export period and applies k-anonymity with k of at least 5, and SHALL make the export available to the requester within 1 hour.
5. WHEN a signed export is verified with the Tenant public key, THE Analytics_Service SHALL return a result of either "unchanged since signing" or "modified or signature invalid" within 10 seconds.
6. IF a scheduled report fails to generate, THEN THE Analytics_Service SHALL retry once within 15 minutes of the failure, and IF the retry also fails, THEN THE Analytics_Service SHALL notify the report owner of the failure within 5 minutes and SHALL retain the schedule for the next occurrence.
7. IF an annual export fails to generate or cannot be signed, THEN THE Analytics_Service SHALL notify the requesting Executive within 5 minutes and SHALL NOT deliver an unsigned export.
8. WHEN a report or export is generated, THE Analytics_Service SHALL record an Audit_Log entry containing the requester, report type, scope, timestamp and outcome (success or failure).

### Requirement 16: AI Copilot (Priority: P1, Phase 4)

**User Story:** As a Student, I want a conversational assistant that answers campus questions accurately and hands off to staff when it cannot, so that I get help without raising Tickets.

#### Acceptance Criteria

1. WHEN a Student submits a question of 1 to 2,000 characters, THE Copilot SHALL return an answer generated only from Tenant knowledge sources and the Student's own CampusConnect data, and SHALL cite at least one source for each factual statement in the answer, within 10 seconds for at least 95% of requests.
2. IF the Copilot cannot find a grounded answer with a confidence score at or above the Tenant confidence threshold (a value from 0.00 to 1.00 configured per Tenant), THEN THE Copilot SHALL state that it cannot answer, SHALL not present an ungrounded answer, and SHALL offer to create a Ticket with the conversation prefilled.
3. WHEN a Student message is received, THE PII_Redactor SHALL redact PII from the message and from all retrieved context before the Copilot calls the AI_Adapter, and THE Copilot SHALL not call the AI_Adapter with unredacted content.
4. IF a Student asks the Copilot to decide, predict or promise the outcome of a Grievance, scholarship or application, THEN THE Copilot SHALL decline to give an outcome, SHALL state that only authorised staff can decide, and SHALL offer to create a Ticket.
5. WHEN a Student requests a human, THE Copilot SHALL ask the Student to confirm Ticket creation, and WHEN the Student confirms, THE Copilot SHALL create a Ticket containing the full conversation transcript and show the Ticket identifier to the Student.
6. THE Copilot SHALL achieve grounded-answer accuracy of at least 92% in months 1 to 6 and at least 96% from month 7, measured on a Tenant-reviewed evaluation set of at least 200 questions.
7. THE Analytics_Service SHALL report Copilot containment rate (conversations resolved without a Ticket), with a target of at least 50% at month 6 and 65% at month 12. (A)
8. WHILE a Student is in a Copilot conversation, THE Copilot SHALL display a notice that responses are AI-generated.
9. WHEN a Student gives thumbs-down feedback on an answer, THE Copilot SHALL record the feedback with the redacted question and the cited sources, and SHALL make the record available for Tenant review within 1 minute.
10. IF the AI_Adapter is unavailable or does not respond within 15 seconds, THEN THE Copilot SHALL inform the Student that the assistant is unavailable, SHALL retain the conversation, and SHALL offer to create a Ticket.
11. THE Copilot SHALL treat knowledge-source content and Student messages as untrusted input and SHALL not execute instructions embedded in them.
12. IF a Student message exceeds 2,000 characters or is empty, THEN THE Copilot SHALL reject the message, retain the existing conversation, and show an error indicating the allowed length.

### Requirement 17: ERP/SIS Integration (Priority: P0, Phase 1 stub; real connectors later)

**User Story:** As a Tenant_Admin, I want CampusConnect to read student and course data from our ERP/SIS, so that profiles and routing use authoritative data.

#### Acceptance Criteria

1. THE ERP_Adapter SHALL define a read-only interface that returns, for each Student, identity, program, year, department and enrolment status (active or inactive), and, for each course, course data.
2. THE ERP_Adapter SHALL ship with a stub implementation that returns configurable sample data scoped to each Tenant, with no data returned for one Tenant visible to another Tenant. (A)
3. WHEN a Student signs in for the first time, THE CampusConnect SHALL create the Student record from ERP_Adapter data within 5 seconds.
4. IF no ERP_Adapter record exists for a Student signing in for the first time, THEN THE CampusConnect SHALL deny creation of the Student record, show the Student an error indicating the account could not be found in the institution's records, and create no partial Student record.
5. WHEN 24 hours have elapsed since the last successful synchronisation, THE CampusConnect SHALL synchronise ERP_Adapter data for each Tenant, so that the interval between successful synchronisations does not exceed 24 hours.
6. IF the ERP_Adapter is unavailable or a synchronisation attempt fails, THEN THE CampusConnect SHALL retain and continue using the last successfully synchronised data, retry the synchronisation at intervals of 15 minutes up to 4 attempts per cycle, and show Tenant_Admin a data-freshness warning that includes the timestamp of the last successful synchronisation.
7. WHEN a synchronisation succeeds after a failure, THE CampusConnect SHALL remove the data-freshness warning within 60 seconds.
8. THE CampusConnect SHALL perform no write operations to the ERP, SIS or LMS.
9. WHEN a Student's enrolment status becomes inactive in the ERP_Adapter data, THE CampusConnect SHALL, within 60 seconds of detecting the change, restrict that Student to read-only access of the Student's own Tickets, preventing the creation, editing, reply and closure of Tickets.

### Requirement 18: Audit Logging (Priority: P0, Phase 1)

**User Story:** As a Tenant_Admin, I want a tamper-evident record of sensitive actions, so that I can investigate incidents and demonstrate compliance.

#### Acceptance Criteria

1. WHEN an authentication event, role change, Ticket priority change, Ticket assignment change, confidential identity access, Broadcast, export or configuration change occurs, THE Audit_Log SHALL record an entry containing actor, role, action, target, Tenant, timestamp in UTC with millisecond precision, and outcome (success or failure) within 2 seconds of the event.
2. THE Audit_Log SHALL be append-only, and IF any application role attempts to modify or delete an entry, THEN THE Audit_Log SHALL reject the attempt, leave the entry unchanged, and record the rejected attempt as a new entry with outcome failure.
3. WHEN an entry is appended, THE Audit_Log SHALL include in the entry a cryptographic hash computed over the entry content and the hash of the immediately preceding entry in the same Tenant, so that any modification, deletion or reordering of entries is detectable.
4. WHEN a Tenant_Admin requests an integrity verification of the Audit_Log, THE CampusConnect SHALL verify the hash chain for the requested range and return either a pass result or the identifier of the first entry at which verification fails, within 60 seconds for up to 1,000,000 entries.
5. WHEN a Tenant_Admin searches the Audit_Log, THE CampusConnect SHALL return only entries belonging to the Tenant_Admin's Tenant, filtered by any combination of actor, action, target and time range, within 5 seconds for a time range of up to 30 days.
6. IF an Audit_Log search fails or exceeds 30 seconds, THEN THE CampusConnect SHALL display an error message indicating the search could not be completed and SHALL retain the entered filter values.
7. THE Audit_Log SHALL retain entries for at least 3 years from the entry timestamp. (A)
8. THE Audit_Log SHALL contain no free-text Ticket content and no PII other than user identifiers.
9. IF an action that requires an audit entry cannot be recorded, THEN THE CampusConnect SHALL reject that action, leave system state unchanged, and display an error message indicating the action was not performed because audit recording failed.

### Requirement 19: Privacy, Consent and Data Subject Rights (Priority: P0, Phase 1; DPDP pack extended later)

**User Story:** As a Student, I want control over my personal data, so that my privacy is protected.

#### Acceptance Criteria

1. WHEN a Student first signs in, THE CampusConnect SHALL present a privacy notice and record, for each optional processing purpose, the Student's consent decision (granted or declined) with a timestamp, before the Student can access any feature that depends on that purpose.
2. WHEN a Student withdraws consent for a purpose, THE CampusConnect SHALL stop that processing within 24 hours, retain a record of the withdrawal with a timestamp, and display the purpose as withdrawn in the Student's privacy settings.
3. WHEN a Student requests a copy of the Student's data, THE CampusConnect SHALL provide the export in a machine-readable format within 30 days, covering all personal data held about the Student, and SHALL notify the Student when the export is available. (A)
4. WHEN a Student requests erasure, THE CampusConnect SHALL erase or anonymise the Student's personal data within 30 days, except data that the Tenant is legally required to retain, and SHALL notify the Student of completion and of any categories retained with the reason for retention.
5. THE CampusConnect SHALL apply Tenant-configurable retention periods to Tickets, attachments, Copilot conversations and Document_Locker contents, and SHALL delete or anonymise each item within 24 hours after its retention period expires.
6. THE CampusConnect SHALL contain zero PII in logs, analytics outputs, AI provider requests and error messages.
7. IF a personal data breach is detected, THEN THE CampusConnect SHALL notify the affected Tenant_Admin within 72 hours of detection, with a notification stating the nature of the breach, the affected data categories and the approximate number of affected Students. (A)
8. THE CampusConnect SHALL not use Student data to train external provider models.
9. IF a data export or erasure request cannot be completed within 30 days, THEN THE CampusConnect SHALL notify the Student of the failure and the reason, keep the request open, and retain the Student's data unchanged until the request completes.
10. IF a Student's erasure request or consent withdrawal fails to process, THEN THE CampusConnect SHALL preserve the Student's current data state, display an error indication to the Student, and allow the Student to resubmit the request.

### Requirement 20: Student Experience Platform (Priority: P1, Phase 1)

**User Story:** As a Student, I want a fast, installable and accessible mobile-first app, so that I can use it on any device.

#### Acceptance Criteria

1. WHERE the Student's browser supports PWA installation, THE CampusConnect PWA SHALL offer an install option on mobile devices and desktop browsers, and WHEN the Student accepts it, THE CampusConnect PWA SHALL launch from the device home screen or app launcher in a standalone window without a browser address bar.
2. WHILE the device has no network connectivity, THE CampusConnect PWA SHALL display the Tickets the Student loaded during their most recent online session, up to the 50 most recently viewed Tickets, and SHALL show an indicator that the data is offline and the time it was last updated.
3. WHILE the device has no network connectivity, IF the Student attempts an action that requires the network (updating or rating a Ticket), THEN THE CampusConnect PWA SHALL display a message indicating the action requires a connection, SHALL NOT discard text the Student has entered in the form, and SHALL leave stored Ticket data unchanged.
4. THE CampusConnect PWA SHALL conform to WCAG 2.1 Level AA success criteria for all Student-facing screens, including a minimum text contrast ratio of 4.5:1 and a minimum touch target size of 44 by 44 CSS pixels on viewports 320 to 480 pixels wide.
5. THE CampusConnect PWA SHALL allow every Student and Staff_Workbench function to be completed using only a keyboard, with a visible focus indicator and a logical focus order, and SHALL expose names, roles and states of all interactive elements to screen readers.
6. THE CampusConnect PWA SHALL provide English and Hindi UI text at launch, SHALL let the user select the language, and SHALL persist that selection across sessions. (A)
7. WHERE a new locale is added through translation resources, THE CampusConnect PWA SHALL display that locale in the language selector without code changes, and IF a translation key is missing in the selected locale, THEN THE CampusConnect PWA SHALL display the English text for that key.
8. WHEN a Student submits a post-closure rating, THE CampusConnect PWA SHALL capture a CSAT score as an integer from 1 to 5 and an optional comment of up to 1000 characters, and SHALL show a confirmation that the rating was saved.
9. IF a Student submits a post-closure rating with no score, a score outside 1 to 5, or a comment over 1000 characters, THEN THE CampusConnect PWA SHALL reject the submission, display an error indicating the invalid field, and retain the Student's entered values.

### Requirement 21: Metrics Instrumentation and Guardrails (Priority: P1, Phase 1, extended per phase)

**User Story:** As a product owner, I want the North Star and OKR metrics measured from launch, so that we can verify outcomes and guardrails.

#### Acceptance Criteria

1. WHEN a reporting period closes at month 3, month 6 or month 12 after launch, THE Analytics_Service SHALL compute VOTR for that period and report it against targets of 65% at month 3, 80% at month 6 and 90% at month 12, with a status of met or not met for each target.
2. WHEN a reporting period closes at month 3, month 6 or month 12 after launch, THE Analytics_Service SHALL report the median first response time for Normal band (P2 band) Tickets against targets of 1 day (24 hours), 4 hours and 2 hours respectively, with a status of met or not met.
3. WHEN a reporting period closes at month 3, month 6 or month 12 after launch, THE Analytics_Service SHALL report SLA breach rate, as the percentage of Tickets that breached their SLA out of all Tickets that reached a resolved or breached state in the period, against targets of at most 25%, 15% and 8% respectively, with a status of met or not met.
4. WHEN a reporting period closes at month 3, month 6 or month 12 after launch, THE Analytics_Service SHALL report misrouting rate, as the percentage of Tickets reassigned to a different department after initial routing out of all routed Tickets in the period, against targets of at most 10%, 5% and 3% respectively, with a status of met or not met.
5. WHEN a reporting period closes at month 3, month 6 or month 12 after launch, THE Analytics_Service SHALL report the weekly-to-monthly active user ratio against targets of at least 30%, 40% and 50% respectively, and activation rate against targets of at least 40%, 60% and 75% respectively, with a status of met or not met for each.
6. WHEN a reporting period closes at month 3, month 6 or month 12 after launch, THE Analytics_Service SHALL report dispute rate, as the percentage of resolved Tickets that were disputed in the period, against targets of at most 12%, 8% and 6% respectively, with a status of met or not met.
7. WHEN a reporting period closes at month 3, month 6 or month 12 after launch, THE Analytics_Service SHALL report average CSAT on a 1 to 5 scale against targets of at least 3.8, 4.1 and 4.4 respectively, with a status of met or not met.
8. WHERE the Opportunities module is enabled, WHEN a reporting period closes at month 3, month 6 or month 12 after launch, THE Analytics_Service SHALL report recommendation-to-save rate, save-to-apply rate and missed-deadline rate against the OKR targets for that month, with a status of met or not met for each.
9. WHERE the Broadcast module is enabled, WHEN a reporting period closes at month 3, month 6 or month 12 after launch, THE Analytics_Service SHALL report 24-hour read rate and the rate of emergency Broadcasts acknowledged within 5 minutes against the OKR targets for that month, with a status of met or not met for each.
10. THE Analytics_Service SHALL report the following guardrail metrics at least once every 24 hours and in each reporting period: count of PII exposure incidents (target 0), P0 Critical false-negative rate, AI override rate, and opportunity exposure parity.
11. IF a guardrail metric breaches its threshold (any PII exposure incident count greater than 0, or a threshold defined in the OKR targets for the other guardrail metrics), THEN THE Analytics_Service SHALL flag the metric as breached in the report within 24 hours of detection and notify the product owner role, retaining the previously computed values.
12. IF source data required to compute a metric is missing or the computation fails, THEN THE Analytics_Service SHALL mark that metric as unavailable with an indication of the reason, continue reporting all other metrics, and retain previously computed values.

## Non-Functional Requirements

### Requirement 22: Security (Priority: P0, all phases)

**User Story:** As a Tenant_Admin, I want the platform to be secure by design, so that institutional and student data is protected.

#### Acceptance Criteria

1. THE CampusConnect SHALL encrypt all data in transit between clients and the API server, and between internal services, using TLS 1.2 or higher.
2. IF a client attempts to connect using a protocol version lower than TLS 1.2 or using plain HTTP, THEN THE CampusConnect SHALL reject the connection or redirect it to an encrypted connection, and SHALL NOT process the request over the unencrypted channel.
3. THE CampusConnect SHALL encrypt all data at rest using keys managed by AWS KMS, with a separate KMS key for each Tenant for attachments and Document_Locker contents. (A)
4. IF input to the API server fails validation (wrong type, missing required field, value outside its defined length or numeric bounds, or disallowed characters), THEN THE CampusConnect SHALL reject the request with an error response identifying the invalid field, and SHALL NOT persist any part of the request.
5. WHEN the API server accepts user-supplied text that is later rendered to other users, THE CampusConnect SHALL sanitise the text so that executable script content and markup event handlers are neutralised before storage or rendering.
6. THE CampusConnect SHALL contain no secrets (credentials, API keys, private keys, tokens) in source code or client bundles, verified by an automated secret scan that reports zero findings on each build.
7. THE CampusConnect SHALL rate-limit authenticated API calls per user and per Tenant, using limits that Tenant_Admin or platform operators can configure without a code deployment.
8. IF an authenticated user or Tenant exceeds its configured rate limit, THEN THE CampusConnect SHALL reject further calls in the current limit window with an error response indicating the rate limit was exceeded and the time in seconds until calls are accepted again, and SHALL resume accepting calls when the window resets.
9. WHEN a dependency vulnerability of critical severity is reported, THE CampusConnect delivery pipeline SHALL block release until the vulnerability is remediated or an exception is approved by a named approver and recorded with an expiry date.
10. THE CampusConnect SHALL define all AWS infrastructure as code using AWS CDK.
11. WHEN a phase is prepared for GA, THE CampusConnect delivery pipeline SHALL run automated security tests covering each OWASP Top 10 risk category and SHALL block GA if any finding of high or critical severity remains open.

### Requirement 23: Performance and Scalability (Priority: P1, all phases)

**User Story:** As a Student or Handler, I want fast responses at scale, so that the platform is usable during peak load.

#### Acceptance Criteria

1. WHILE the CampusConnect load is at or below the target load defined in criterion 3, THE CampusConnect SHALL respond to at least 95% of read API requests within 500 ms and at least 95% of write API requests within 1 second, measured server-side from request receipt to response completion over a 15-minute measurement window. (A)
2. WHEN a page is loaded in the CampusConnect PWA on a mid-range mobile device (4 CPU cores or fewer, 4 GB RAM or less) over a 4G connection (9 Mbps down, 1.5 Mbps up, 170 ms round-trip latency), THE CampusConnect PWA SHALL achieve a Largest Contentful Paint of 2.5 seconds or less for at least 75% of page loads.
3. THE CampusConnect SHALL support 100,000 Students per Tenant and 5,000 concurrent authenticated users per Tenant simultaneously, while meeting the response time targets in criteria 1, 4, 5 and 6 and keeping the API server-side error rate below 1% of requests.
4. WHEN a Ticket is created, THE Triage_Service SHALL return a triage result within 10 seconds of Ticket creation for at least 95% of Tickets, measured over a 15-minute window.
5. WHEN a Student has entered 20 characters in the Ticket description field, THE CampusConnect SHALL show a category suggestion within 3 seconds for at least 95% of requests, measured over a 15-minute window.
6. WHEN a Broadcast targets up to 100,000 recipients, THE Broadcast_Service SHALL enqueue delivery to all recipients within 60 seconds of the Broadcast being submitted.
7. IF the Triage_Service does not return a triage result within 30 seconds of Ticket creation, THEN THE CampusConnect SHALL keep the Ticket in its created state, mark it as pending manual triage, and make it visible to Handlers in the queue without data loss.
8. IF the category suggestion is not available within 10 seconds of the Student reaching 20 characters, THEN THE CampusConnect SHALL stop waiting, show no suggestion, and allow the Student to select a category manually and submit the Ticket.

### Requirement 24: Availability and Resilience (Priority: P1, all phases)

**User Story:** As a Tenant_Admin, I want high availability and recoverability, so that staff and students can rely on the service.

#### Acceptance Criteria

1. THE CampusConnect SHALL achieve monthly availability of at least 99.9% for Ticket submission and the Staff_Workbench, measured per calendar month as the percentage of one-minute synthetic checks that succeed, excluding scheduled maintenance announced at least 48 hours in advance and not exceeding 4 hours per month.
2. THE CampusConnect SHALL achieve monthly availability of at least 99.95% for emergency alert delivery, measured per calendar month as the percentage of one-minute synthetic checks that succeed, with no scheduled-maintenance exclusion. (A)
3. THE CampusConnect SHALL take automated database backups at least once every 24 hours and support point-in-time recovery to any point within the previous 7 days.
4. THE CampusConnect SHALL meet a recovery point objective of 15 minutes (maximum data loss) and a recovery time objective of 4 hours (maximum time from outage declaration to restored Ticket submission and Staff_Workbench service). (A)
5. IF an external dependency (AI provider, ERP, SSO, SMS gateway) is unavailable or does not respond within 10 seconds, THEN THE CampusConnect SHALL mark the dependent function as degraded, display a message to affected users indicating the function is temporarily unavailable, and continue to accept Ticket submissions without data loss.
6. WHEN an asynchronous job fails, THE CampusConnect SHALL retry the job up to 5 times with increasing delay between attempts, and move the job to a dead-letter queue if all retries fail.
7. IF the dead-letter queue contains at least one job for more than 15 minutes, THEN THE CampusConnect SHALL send an alert to operations and repeat the alert every 60 minutes until the queue is empty.
8. IF a database restore or point-in-time recovery operation fails, THEN THE CampusConnect SHALL alert operations within 5 minutes and leave the existing production data unchanged.

### Requirement 25: Observability and AI Quality Monitoring (Priority: P1, all phases)

**User Story:** As an operations engineer, I want visibility into system health and AI quality, so that issues are detected early.

#### Acceptance Criteria

1. WHEN CampusConnect processes a request, THE CampusConnect SHALL emit a structured log entry, metrics and a trace span, each containing the Tenant identifier and the request identifier, and none containing PII (names, email addresses, phone numbers, student identifiers, or free-text complaint content).
2. IF the error rate exceeds 5% of requests over a 5-minute window, or p95 latency exceeds 2 seconds over a 5-minute window, or queue depth exceeds 1,000 pending messages for 5 consecutive minutes, THEN THE CampusConnect SHALL send an alert to the operations notification channel within 60 seconds of the threshold breach, identifying the breached metric, the Tenant (where applicable) and the observed value.
3. WHEN each evaluation period of 24 hours ends, THE Triage_Service SHALL report, per category, classification accuracy (percentage of AI categories matching the final Handler-confirmed category), confidence calibration (absolute difference between mean AI confidence and observed accuracy, in percentage points), and AI override rate (percentage of AI classifications changed by a Handler).
4. WHEN the AI override rate for a category exceeds 30% over a rolling 7-day window and the category has at least 50 classifications in that window, THE Analytics_Service SHALL flag the category for model review within 24 hours and make the flag visible to operations. (A)
5. IF a Handler correction is not PII-redacted or the originating Tenant has not opted in, THEN THE Triage_Service SHALL exclude that correction from the training label set and record the exclusion count per Tenant. (A)
6. WHERE a Tenant has opted in to training-label use, WHEN a Handler correction is stored, THE Triage_Service SHALL add it to the training label set only after PII redaction has completed successfully. (A)
7. IF the evaluation report in criterion 3 fails to complete, THEN THE Triage_Service SHALL raise an alert to operations within 15 minutes of the scheduled completion time and retain the previous report unchanged.

## Assumptions

- (A) Decisions confirmed by the user: scope is the full platform in four phases; stack is TypeScript on AWS (React/Next.js PWA, NestJS, PostgreSQL with row-level security, CDK); AI uses the Hugging Face API behind an adapter interface with PII redaction before every external call.
- (A) The SSO_Provider is mocked in the first release. Real OIDC and SAML integration is later work.
- (A) The ERP_Adapter is a read-only stub in the first release. Real ERP/SIS connectors are later work.
- (A) Numeric defaults not stated in the PRD (confidence threshold 0.70, session idle timeout 30 minutes, attachment limits, retention periods, performance and availability targets, escalation SLAs for L1 and L2, spike baseline of 8 weeks, data-subject request deadline of 30 days, breach notification of 72 hours) are proposed values for review and are Tenant-configurable where applicable.
- (A) Languages at launch are English and Hindi.
- (A) The default hosting region for India Tenants is ap-south-1.
- (A) The PRD sections defining FR, AC, EC and NFR identifiers were not provided. This document uses numbered requirements and can be traced to PRD identifiers once those sections are supplied.
- (A) DPDP, FERPA and GDPR packs are later work. Requirement 19 provides a baseline aligned to DPDP principles.

## Phase Mapping

| Phase | Scope | Requirements |
|-------|-------|--------------|
| 1 | Ticketing and grievance core (J1, J3) and cross-cutting foundations | 1, 2, 3, 4, 5, 6, 7, 8, 9, 15 (scheduled reports), 17, 18, 19, 20, 21 (core metrics), 22, 23, 24, 25 |
| 2 | Opportunities and scholarships (J2) | 10, 11, 12 |
| 3 | Broadcasts, emergency alerts and executive analytics (J4) | 13, 14, 15 (annual export) |
| 4 | AI Copilot | 16 |
