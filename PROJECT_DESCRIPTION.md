# CampusConnect · JIS University

> A modern, simple, and transparent college management and student grievance portal built specifically for **JIS University**.

---

## 1. What is CampusConnect?

**CampusConnect** is an all-in-one web portal designed for JIS University. It connects students, faculty staff, and university administrators in one fast, easy-to-use digital system.

Instead of standing in long lines, submitting paper applications, or waiting weeks for marks corrections, students and staff can do everything directly online:

- View verified semester attendance and exam marks.
- Flag errors in internal marks (for example, if a paper was graded 22/30 but recorded as 12/30).
- Register complaints about hostels, classrooms, internet Wi-Fi, or exams.
- Watch ticket progress move live across 4 transparent stages.
- Upload profile photos and edit personal contact details.

---

## 2. Who Uses CampusConnect?

CampusConnect provides three dedicated portals tailored to each user's daily needs:

### 🎓 1. Student Portal

- **Dashboard & Attendance**: See your current semester attendance percentage and CGPA score at a glance.
- **75% Attendance Drilldown & Bunk Calculator**: Subject-wise lecture tracking (CS301–CS305), exact safe bunk margin calculation ($m = \lfloor \frac{A - 0.75H}{0.75} \rfloor$), shortage recovery requirement ($c = \lceil \frac{0.75H - A}{0.25} \rceil$), and interactive simulation controls.
- **Academic Section (AC) Log**: Inspect subject-wise internal assessment marks, grades, and statutory clearances.
- **Evidence Proof Attachments**: Upload client-side compressed exam scripts, medical certificates, or broken hostel facility images with full lightbox preview.
- **In-Ticket Two-Way Clarification Thread**: Direct live conversation with course evaluators, hostel wardens, and admin oversight inside every grievance card.
- **Official Digital Exam Hall Ticket**: Instant generation of official printable Examination Admit Card with Odd Sem 2026 timetable, desk allocation (`Exam Hall B · Desk B-42`), statutory clearances, and cryptographic seal (`SEC-HASH: JISU-2026-X88A`).
- **Digital Hostel Gate Pass (Outpass)**: Request Day Outpass, Weekend Leave, or Emergency Medical Leave with live status tracking and printable QR Gate Pass slip. Strict RBAC ensures students cannot approve or grant gate pass permissions.
- **Self-Service Institutional E-Certificates**: Generate and print official Bonafide Certificates, Course Fee Estimation Certificates (itemized ₹71,000/sem, ₹1,42,000/yr), and Digital No-Dues Clearance slips.
- **AI Smart Clustering & Auto-Priority**: Live duplicate ticket detection banner on lodge form and automatic escalation to Urgent (P0) for deadline-critical cases.
- **CampusConnect AI Assistant**: Conversational assistant preloaded with JIS University statutory regulations, attendance rules, and deep links.
- **Edit Personal Data**: Update your contact phone number, guardian name, emergency contact, date of birth, blood group, and residential address.
- **Flag Marks Discrepancies**: One-click button to flag an incorrect mark directly to the course evaluator.
- **Lodge Grievance Tickets**: Submit complaints for examinations, hostels, or campus infrastructure.
- **Live 4-Stage Tracker**: Follow your ticket step-by-step:
  $$\text{Submitted} \longrightarrow \text{Under Review} \longrightarrow \text{Assigned to Staff} \longrightarrow \text{Resolved}$$
- **Profile Photo**: Upload your own photo or choose an institutional avatar with crisp 100% circular geometry.

### 👨‍🏫 2. Staff & Faculty Portal

- **Assigned Resolution Queue**: Automatically receives tickets relevant to each staff member's department (e.g. Examination Cell, Hostel Warden, or Campus Maintenance).
- **Direct Academic Marks Correction**: Course evaluators can review student answer booklets, inspect evidence attachments, and correct marks on the university server with one click.
- **Two-Way Ticket Chat**: Post official clarifications and evaluator updates directly to the student's ticket thread.
- **Hostel Warden & Gate Desk**: Approve/reject hostel outpass requests and manage real-time student check-out / safe return logs.
- **Investigation Notes**: Document inspection findings and audit notes before marking tickets as resolved.
- **Work Dockets**: Register internal maintenance forms and equipment testing logs.

### 🏛️ 3. Administrator Command Center

- **Universal Oversight**: University leadership (Registrar / Dean) can monitor all campus operations across all departments.
- **Hostel Gate Pass Permissions Desk**: Exclusively controls outpass approvals, rejections, and security Gate 1 check-out / safe return transitions. Strict guards prevent students from modifying permissions.
- **Ticket Escalation & Case Threading**: Direct administrative oversight intervention in ticket conversations.
- **Staff Reassignment**: Reassign cases to specific faculty members or wardens.
- **Administrative Override**: Correct records or resolve critical tickets instantly.
- **Institution Logo Manager**: Customize the university header logo using official image icons (strict no-emoji policy).
- **Security Audit Panel**: Real-time verification of PostgreSQL Row-Level Security (RLS) guarantees.

---

## 3. How the Grievance & Marks Workflow Works

1. **Student Lodges a Request**:
   A student notices that their Data Structures (`CS302`) internal mark shows `12/30` instead of `22/30`. They click **"⚡ Flag Discrepancy"** inside the Academic Section.
2. **Instant Dispatch**:
   The ticket is instantly sent to the **Staff Portal** (assigned to Course Evaluator Prof. Rahul Mehta) and the **Admin Command Center**.
3. **Staff / Admin Evaluates**:
   The evaluator checks the physical answer booklet, verifies the discrepancy, enters `22` in the marks box, and clicks **"✓ Correct Marks & Resolve"**.
4. **Live Update**:
   The student's portal immediately updates: the grade changes to `22/30`, the status updates to `✓ Marks Discrepancy Resolved`, and the ticket stage changes to `Resolved`.

---

## 4. Privacy & Data Security

CampusConnect is built on a **Zero-Trust** database architecture using **Supabase** and **PostgreSQL Row-Level Security (RLS)**:

- **Student Privacy**: Students can only view and edit their own personal data and complaints. Student A cannot see Student B's data.
- **Staff Isolation**: Staff members can only view tasks assigned to their department.
- **Role Lock**: User roles are strictly locked in the database with trigger protection (`trg_protect_role`) so non-admin users cannot elevate themselves to administrators.
- **Admin Root**: University administrators have universal visibility to audit operations and ensure university SLAs are met.

---

## 5. How to Run the Website Locally

### Prerequisites

- Node.js (version 20 or higher)
- pnpm (package manager)

### Quick Start Commands

```bash
# 1. Install dependencies
pnpm install

# 2. Start the development server
pnpm --filter @campusconnect/web dev

# 3. Open in your web browser:
# http://localhost:5173  or  http://localhost:3000
```

### Pre-Configured Demo Logins

On the login screen, click any **One-Click Demo Button**:

- **Administrator**: `admin@demo.com` / `Admin@123`
- **Staff (Evaluator)**: `faculty@demo.com` / `staff@123`
- **Staff (Facilities)**: `warden@demo.com` / `staff@123`
- **Student 1**: `student1@demo.com` / `Student@123`
- **Student 2**: `student2@demo.com` / `Student@123`

---

## 6. Technology Stack

- **Frontend**: React 19, TypeScript, Vite, TanStack Query, Lucide Icons
- **Styling**: Permanent Universal Dark Theme (`#0B0F19`), macOS Liquid Glass (`backdrop-filter: blur(16px)`), Royal Navy (`#0F2850`), Golden Amber (`#F59E0B`), High-Contrast Pure Black Option Menus (`#000000` on `#FFFFFF`), and 100% Circular Icon Geometry.
- **Backend & Database**: Supabase Auth, PostgreSQL 15, Row-Level Security (RLS)
- **Testing**: Vitest (218 automated tests across web features, contracts, and UI components; 114 tests in `@campusconnect/web` alone)
