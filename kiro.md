# CampusConnect · Development Prompt Documentation (kiri.md)

> Comprehensive record of user prompts, architectural directives, engineering decisions, and implementation milestones during the construction of **CampusConnect** for JIS University.

---

## Table of Contents
1. [Overview & Project Context](#1-overview--project-context)
2. [Chronological Prompt History & Technical Execution](#2-chronological-prompt-history--technical-execution)
   - [Prompt 1: Initial Purge & Single Institution Directive](#prompt-1-initial-purge--single-institution-directive)
   - [Prompt 2: Visual Language & 3-Color Glassmorphic Design System](#prompt-2-visual-language--3-color-glassmorphic-design-system)
   - [Prompt 3: Circular Iconography & Social-Style Student Pill](#prompt-3-circular-iconography--social-style-student-pill)
   - [Prompt 4: Institution Logo Customization (Admin-Only, No Emojis)](#prompt-4-institution-logo-customization-admin-only-no-emojis)
   - [Prompt 5: Network Host & Port Binding (`0.0.0.0:3000`)](#prompt-5-network-host--port-binding-00003000)
   - [Prompt 6: Full Supabase Backend & PostgreSQL RLS Migration](#prompt-6-full-supabase-backend--postgresql-rls-migration)
   - [Prompt 7: Academic Section (AC) Marks Grievance & Cross-Panel Sync](#prompt-7-academic-section-ac-marks-grievance--cross-panel-sync)
   - [Prompt 8: CampusConnect Branding & User Profile Photo / Details Editor](#prompt-8-campusconnect-branding--user-profile-photo--details-editor)
   - [Prompt 9: Apple macOS Liquid Glass Redesign Directives](#prompt-9-apple-macos-liquid-glass-redesign-directives)
   - [Prompt 10: Complete Purge of CampusFlow & AC Personal Data Editor](#prompt-10-complete-purge-of-campusflow--ac-personal-data-editor)
3. [Architecture Decisions & Pattern Matrix](#3-architecture-decisions--pattern-matrix)
4. [Automated Test Suite Progression](#4-automated-test-suite-progression)

---

## 1. Overview & Project Context

The objective of this engineering sprint was to take an initial hackathon prototype and evolve it into a production-grade, zero-trust college operating system and student grievance engine for **JIS University**.

### Core Tenets Enforced:
- **Zero Jargon & Clutter**: Remove all dead routes (`Workbench`, `Executive`, `Operation`), repetitive confirmation popups, and placeholder subtitles.
- **Strict Role-Based Access Control (RBAC)**: Distinct, isolated experiences for **Student**, **Staff**, and **Admin**.
- **Real Security Layer**: Enforce PostgreSQL Row-Level Security (RLS) policies directly in the database engine rather than relying on frontend route hiding.
- **Transparent 4-Stage Workflow**: Every ticket moves visibly across `Submitted` $\to$ `Under Review` $\to$ `Assigned to Staff` $\to$ `Resolved`.
- **Dual-Mode Data Architecture**: Operates with zero setup using an in-memory/localStorage reactive store for demo presentations, and automatically connects to live Supabase Postgres when credentials are provided in `.env`.

---

## 2. Chronological Prompt History & Technical Execution

---

### Prompt 1: Initial Purge & Single Institution Directive
> **User Prompt:**
> *"remember this app is only for JIS UNIVERSITY, and keep the website simple and user friendly also its UI/UX and all fonts and all language to english. Do all tests properly. Resolve all errors and everything. Remove extra unnecessary files and elements and words. Remove notification preference section from notification tabs. remove privacy section from code and website interface."*

#### Actions Taken:
- Purged dead navigation links and obsolete routes:
  - Deleted `Workbench` (`Grievances.tsx`, `OverrideRate.tsx`, `Queue.tsx`, `ShortcutHelp.tsx`, `TicketView.tsx`).
  - Deleted `Executive` (`ExecutiveOverview.tsx`, `ReportSchedulesPage.tsx`).
  - Deleted `Operation` (`BreachPage.tsx`, `GuardrailsPage.tsx`, `ProvisionPage.tsx`, `ServiceHealthPage.tsx`).
  - Removed `Privacy.tsx` and unnecessary notification preference toggles.
- Standardized all copy, microcopy, and document titles strictly in **English**.
- Rebranded institution header locks to **JIS UNIVERSITY**.

---

### Prompt 2: Visual Language & 3-Color Glassmorphic Design System
> **User Prompt:**
> *"MASTER ENGINEERING DIRECTIVE: Enforce a strict 3-color palette: Deep Primary Navy (#0A192F / #0F2850), Electric Royal Blue (#1D4ED8 / #2563EB), Signal Yellow / Amber (#F59E0B / #FFC107), Crisp Pure White (#FFFFFF), and slate canvas (#F8FAFC). Glassmorphism surface cards with backdrop-filter: blur(16px) saturate(190%)."*

#### Actions Taken:
- Rewrote `styles.css` with master design tokens:
  - `--cf-navy-deep`: `#0a192f`
  - `--cf-navy-primary`: `#0f2850`
  - `--cf-blue-electric`: `#1d4ed8`
  - `--cf-amber-signal`: `#f59e0b`
  - `--cf-white-crisp`: `#ffffff`
- Defined `.glass-panel` and `.glass-popover` tokens:
  ```css
  .glass-panel {
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(16px) saturate(190%);
    -webkit-backdrop-filter: blur(16px) saturate(190%);
    border: 1px solid rgba(255, 255, 255, 0.6);
    box-shadow: 0 10px 30px 0 rgba(15, 40, 80, 0.06);
    border-radius: 1.25rem;
  }
  ```
- Created the reusable [`GlassCard.tsx`](file:///d:/aws/apps/web/src/components/GlassCard.tsx) component.

---

### Prompt 3: Circular Iconography & Social-Style Student Pill
> **User Prompt:**
> *"100% Circular Geometry: All icons, badges, avatar pills, and branding logos must have border-radius: 50% with matched aspect-ratio: 1/1. Social-Style 'Student Pill': Wherever a student's name appears across complaints, rosters, or dashboards, clicking it triggers a floating social profile card popover (Instagram/FB style)."*

#### Actions Taken:
- Created [`StudentPill.tsx`](file:///d:/aws/apps/web/src/components/StudentPill.tsx):
  - Pill trigger displaying circular avatar, verified student name, and roll number with emerald check badge.
  - Floating glass popover displaying student cover, circular avatar, department, semester, CGPA, email, and one-click actions:
    - *View Academic Section (AC) Record*
    - *Send Official Comms (`mailto:`)*
- Enforced `border-radius: 50%; aspect-ratio: 1 / 1;` across all badges, user pills, and metric icons.

---

### Prompt 4: Institution Logo Customization (Admin-Only, No Emojis)
> **User Prompt:**
> *"also make the logo section where i should give my own icons no emoji should be allowed. the logo desgine can only be edited by the admin side not from the student side."*

#### Actions Taken:
- Created dedicated storage folder: `/apps/web/public/assets/logos/` containing vector SVG icons:
  - `jis-university-logo.svg`
  - `campusconnect-logo.svg`
- Built [`BrandLogo.tsx`](file:///d:/aws/apps/web/src/branding/BrandLogo.tsx) and [`LogoCustomizerModal.tsx`](file:///d:/aws/apps/web/src/branding/LogoCustomizerModal.tsx).
- Enforced strict constraints:
  - Only authenticated **Administrators** can view or trigger the logo editor.
  - Regex verification disallows Unicode emojis, accepting only valid image URLs or file uploads.
  - Changes persist across browser sessions in `localStorage`.

---

### Prompt 5: Network Host & Port Binding (`0.0.0.0:3000`)
> **User Prompt:**
> *"change local host id and make new host to see my live servers"*

#### Actions Taken:
- Configured Vite to bind to `0.0.0.0:3000`, enabling live accessibility from other devices on the same local network:
  ```bash
  pnpm --filter @campusconnect/web dev --host 0.0.0.0 --port 3000
  ```
- Kept dual dev server running on port `5173` as a secondary fallback.

---

### Prompt 6: Full Supabase Backend & PostgreSQL RLS Migration
> **User Prompt:**
> *"I am using SUPABASE (Auth + Postgres + RLS + Storage) as the backend. Do ALL tasks below completely:
> 1. profiles table (id uuid references auth.users(id), full_name, email, role check in ('admin','worker','student')).
> 2. tasks and work_items tables with owner_id references profiles(id).
> 3. Trigger on auth.users auto-creates profile with role 'student'.
> 4. Helper get_my_role() SECURITY DEFINER.
> 5. ENABLE RLS on every table. Users cannot change own role. Cross-tenant isolation.
> 6. scripts/seed.js demo users.
> 7. scripts/test-isolation.js RLS verification."*

#### Actions Taken:
- Created database migration [`supabase/migrations/20261103120000_init.sql`](file:///d:/aws/supabase/migrations/20261103120000_init.sql).
- Implemented helper `public.get_my_role()` with `set search_path = public` to avoid recursive RLS checks.
- Attached `trg_protect_role` trigger function to reject any non-admin attempts to elevate roles.
- Created [`scripts/seed.js`](file:///d:/aws/scripts/seed.js) using the service role key to provision:
  - `admin@demo.com` (`Admin@123`)
  - `worker1@demo.com` (`Worker@123`)
  - `worker2@demo.com` (`Worker@123`)
  - `student1@demo.com` (`Student@123`)
  - `student2@demo.com` (`Student@123`)
- Created [`scripts/test-isolation.js`](file:///d:/aws/scripts/test-isolation.js) verifying cross-tenant isolation and anti-privilege escalation directly against PostgreSQL.

---

### Prompt 7: Academic Section (AC) Marks Grievance & Cross-Panel Sync
> **User Prompt:**
> *"when i register a complain in student ac then i can view that and work on it in admin and worker pannel"*

#### Actions Taken:
- Built real-time pub/sub store [`complaintStore.ts`](file:///d:/aws/apps/web/src/services/complaintStore.ts):
  - Tracks complaints and student academic records reactively across components.
- In [`AcademicSectionView.tsx`](file:///d:/aws/apps/web/src/components/AcademicSectionView.tsx):
  - Added **"⚡ Flag Discrepancy"** button next to each subject code (e.g. `CS302`).
  - Added grievance registration modal submitting subject, grounds, and priority.
- In [`WorkerDashboard.tsx`](file:///d:/aws/apps/web/src/routes/(staff)/WorkerDashboard.tsx):
  - Staff sees assigned grievances in their triage queue.
  - Added **"⚡ Direct AC Marks Correction"** box to adjust marks (e.g. `12/30` $\to$ `22/30`) and mark ticket resolved.
- In [`AdminDashboard.tsx`](file:///d:/aws/apps/web/src/routes/(admin)/AdminDashboard.tsx):
  - Administrator has universal super-user override modal to change stage, reassign staff, or correct marks.
- Added test suite [`student-ac-complaint-workflow.test.tsx`](file:///d:/aws/apps/web/src/__tests__/student-ac-complaint-workflow.test.tsx).

---

### Prompt 8: CampusConnect Branding & User Profile Photo / Details Editor
> **User Prompt:**
> *"the website name is CampusConnect also add an section for users to add there profile photo and edit there personal details"*

#### Actions Taken:
- Renamed brand headers and door cards to **CampusConnect**.
- Created [`UserProfileSection.tsx`](file:///d:/aws/apps/web/src/components/UserProfileSection.tsx) & `ProfileEditorModal`:
  - 100% circular profile photo uploader with `FileReader` data URL conversion.
  - Preset avatar gallery (`student-ananya.svg`, `staff-rahul.svg`, `admin-suresh.svg`, `default-avatar.svg`).
  - Personal details form: Full Name, Institutional Email, Phone Number, Roll/Staff ID, Department, Semester, Emergency Contact, and Bio.
- Connected the user pill in [`Layout.tsx`](file:///d:/aws/apps/web/src/shell/Layout.tsx) header to open the profile editor modal on click from any page.
- Added dedicated **"👤 Profile Photo & Details"** tabs in Student, Staff, and Admin portals.
- Added test suite [`user-profile-and-details.test.tsx`](file:///d:/aws/apps/web/src/__tests__/user-profile-and-details.test.tsx).

---

### Prompt 9: Apple macOS Liquid Glass Redesign Directives
> **User Prompt:**
> *"/teamwork Redesign the ENTIRE frontend with an Apple / macOS 'Liquid Glass' (glassmorphism) look and feel. ... animated floating blurred color orbs ... macOS-style floating glass sidebar ... also change worker tag to staff tag"*

#### Actions Taken:
- Initialized the multi-agent `teamwork` subagent system (`20a74371-bbb5-4c7e-ac2f-045dda664e42`).
- Finalized requirements interview and approved task prompt draft.
- Deployed parallel survey and styling agents to architect centralized Liquid Glass tokens, animated mesh wallpapers, and macOS chrome components.

---

### Prompt 10: Complete Purge of CampusFlow & AC Personal Data Editor
> **User Prompt:**
> *"/goal cahnge campusflow to CampusConnect. and create an ac edit section for users where he can edit his personal data"*

#### Actions Taken:
1. **Total Purge of "CampusFlow"**:
   - Replaced all case-insensitive occurrences across `styles.css`, `session.tsx`, `seed.js`, `test-isolation.js`, `init.sql`, and vitest test files with **CampusConnect**.
   - Verified with `git grep -i "campusflow"` returning **0 matches**.
2. **Academic Section (AC) Personal Data Editor**:
   - Updated `AcademicRecord` in `complaintStore.ts` to include phone, email, guardian name, emergency contact, blood group, date of birth, and permanent address.
   - Built the **"AC Student Personal Dossier"** card in `AcademicSectionView.tsx`.
   - Added **"✏️ Edit AC Personal Data"** trigger and full modal editor.
   - Linked two-way reactive state updates to `complaintStore.updateACPersonalData` and `session.updateProfile`.
   - Added test coverage bringing the test suite to **140 passing tests (100% green)**.

---

## 3. Architecture Decisions & Pattern Matrix

| Requirement | Architecture Pattern Implemented | Rationale |
|---|---|---|
| **Data Isolation** | PostgreSQL Row-Level Security (RLS) | Enforces tenant boundaries at the database engine level so client leaks are mathematically impossible. |
| **Demo vs Production** | Dual-Mode Reactive Store (`complaintStore.ts`) | Allows hackathon presentation with zero setup, but seamlessly reads/writes to Supabase when `.env` is configured. |
| **Role Protection** | Database Trigger `trg_protect_role` | Disallows any non-admin user from changing their own role from `student` to `admin`. |
| **Avatar Geometry** | 100% Circular (`border-radius: 50%`, `aspect-ratio: 1/1`) | Consistent, professional social-style user identification across all portals. |
| **Institution Logo** | Admin-Only Vector Icon Manager | Prevents tampering by students, rejects emojis, stores clean SVG assets on disk. |
| **AC Marks Lifecycle** | Pub/Sub Reactive Event System | Modifying marks in Staff/Admin views immediately updates the student's Academic Section view in real-time. |

---

## 4. Automated Test Suite Progression

| Test File | Tests Passed | Scope & Guarantees |
|---|---|---|
| `@campusconnect/contracts` | 92 / 92 | Schema sanitization, code-point bounds validation, problem details RFC compliance. |
| `@campusconnect/ui` | 12 / 12 | Design system button primitives, role-based styling, accessible focus rings. |
| `campusconnect-enterprise-overhaul.test.tsx` | 14 / 14 | Module purges (Workbench, Executive, Operations removed), RBAC portal separation, sign-in doors. |
| `institution-logo-section.test.tsx` | 10 / 10 | Logo customizer modal, emoji rejection regex, admin-only visibility. |
| `student-ac-complaint-workflow.test.tsx` | 7 / 7 | AC marks discrepancy flagging, evaluator correction (`12/30` $\to$ `22/30`), AC personal data editor. |
| `user-profile-and-details.test.tsx` | 5 / 5 | Profile photo upload, preset avatars, personal details form, layout header triggers. |
| **Total Test Suite** | **140 / 140 (100% Green)** | **Zero compiler errors, zero runtime test failures across the monorepo.** |

