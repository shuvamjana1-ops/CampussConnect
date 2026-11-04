import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlassCard } from '../components/GlassCard';
import { StudentPill } from '../components/StudentPill';
import { ScholarshipDirectory, VERIFIED_OPPORTUNITIES } from '../components/ScholarshipDirectory';
import { ComplaintTracker, type ComplaintData } from '../components/ComplaintTracker';
import { AcademicSectionView } from '../components/AcademicSectionView';
import { complaintStore } from '../services/complaintStore';
import { SessionProvider } from '../auth/session';
import { I18nProvider } from '../i18n/I18nProvider';
import StudentPortal from '../routes/(student)/StudentPortal';
import StaffPortal from '../routes/(staff)/StaffPortal';
import AdminPortal from '../routes/(admin)/AdminPortal';
import SignIn from '../routes/SignIn';
import { Layout } from '../shell/Layout';

function renderComponent(ui: React.ReactElement): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <I18nProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </I18nProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

const MOCK_COMPLAINT: ComplaintData = {
  id: 'tkt_mock_001',
  reference: 'REQ-2026-9999',
  type: 'Academic',
  title: 'Internal Marks Discrepancy in CS302',
  description: 'Evaluation marks mismatch on official script.',
  student: {
    id: 'usr_ananya_01',
    name: 'Ananya Das',
    rollNumber: 'JISU/2024/CSE/0842',
    department: 'Computer Science & Engineering',
    semester: '4th',
    cgpa: '8.92',
    academicStatus: 'Good Standing',
  },
  department: 'Examination & Records Cell',
  priority: 'Urgent (P0)',
  currentStage: 'under_review',
  assignedStaffName: 'Prof. Rahul Mehta',
  createdAt: 'Today, 10:00 AM',
  expectedResolutionTime: 'Within 24 hours',
  timeline: [
    {
      id: 'ev_1',
      stage: 'submitted',
      title: 'Ticket Lodged',
      description: 'Lodged by student.',
      actor: 'Ananya Das',
      timestamp: '10:00 AM',
    },
    {
      id: 'ev_2',
      stage: 'under_review',
      title: 'Under Review',
      description: 'Exam cell evaluating script.',
      actor: 'Prof. Rahul Mehta',
      timestamp: '10:30 AM',
    },
  ],
};

describe('CampusConnect Enterprise Portal Overhaul Test Suite', () => {
  // 1. Frosted Glass Surfaces (GlassCard)
  describe('1. GlassCard & Visual Surfaces', () => {
    it('renders with cc-glass-card base styling', () => {
      const html = renderComponent(<GlassCard>Frosted Surface Content</GlassCard>);
      expect(html).toContain('cc-glass-card');
      expect(html).toContain('Frosted Surface Content');
    });

    it('renders interactive elevation variant with cc-glass-card-interactive', () => {
      const html = renderComponent(<GlassCard interactive>Interactive Card</GlassCard>);
      expect(html).toContain('cc-glass-card-interactive');
    });
  });

  // 2. Social-Style "Student Pill" (FB/Instagram Profile Card Trigger)
  describe('2. Social-Style Student Pill', () => {
    it('renders 100% circular avatar pill with student name and verification badge', () => {
      const html = renderComponent(
        <StudentPill
          student={{
            id: 'usr_ananya_01',
            name: 'Ananya Das',
            rollNumber: 'JISU/2024/CSE/0842',
            department: 'Computer Science & Engineering',
          }}
          showRoll
        />
      );
      expect(html).toContain('cc-student-pill-trigger');
      expect(html).toContain('cc-student-avatar-circle');
      expect(html).toContain('Ananya Das');
      expect(html).toContain('JISU/2024/CSE/0842');
      expect(html).toContain('cc-student-pill-badge');
    });
  });

  // 3. Curated Indian Scholarship & Internship Gateway
  describe('3. Curated Indian Scholarship & Internship Gateway', () => {
    it('renders directory with verified schemes, eligibility, and direct external action buttons', () => {
      const html = renderComponent(<ScholarshipDirectory />);

      // Scheme Titles
      expect(html).toContain('National Scholarship Portal (NSP)');
      expect(html).toContain('AICTE Pragati Scholarship for Girls');
      expect(html).toContain('PM-USP Central Sector Scheme');
      expect(html).toContain('IIT Kharagpur Summer Undergraduate Research Fellowship');

      // Direct Action Button with target="_blank" and rel="noopener noreferrer"
      expect(html).toContain('Open Official Portal');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');

      // Verified URLs
      expect(html).toContain('https://scholarships.gov.in/');
      expect(html).toContain('https://www.aicte-india.org/schemes/students-development-schemes/Pragati');
      expect(html).toContain('https://www.education.gov.in/pm-usp');
      expect(html).toContain('https://www.iitkgp.ac.in/');
    });

    it('all verified opportunities have valid official direct URLs and eligibility snippets', () => {
      expect(VERIFIED_OPPORTUNITIES.length).toBeGreaterThanOrEqual(8);
      for (const opp of VERIFIED_OPPORTUNITIES) {
        expect(opp.officialUrl).toMatch(/^https?:\/\//);
        expect(opp.eligibility.length).toBeGreaterThan(15);
        expect(['Active', 'Closing Soon', 'Open for 2026']).toContain(opp.deadlineStatus);
      }
    });

    it('renders white headlines for scholarships and internships directory and cards', () => {
      const html = renderComponent(<ScholarshipDirectory />);
      expect(html).toContain('id="scholarship-gateway-title"');
      expect(html).toContain('color:#ffffff');
      expect(html).toContain('cc-opp-title');
    });
  });

  // 4. Complaint Tracker with Real-Time Workflow Bar
  describe('4. Complaint Tracker Dynamic Workflow', () => {
    it('renders real-time visual tracking bar with stages: Submitted -> Under Review -> Assigned to Staff -> Resolved', () => {
      const html = renderComponent(<ComplaintTracker complaint={MOCK_COMPLAINT} />);

      expect(html).toContain('Submitted');
      expect(html).toContain('Under Review');
      expect(html).toContain('Assigned to Staff');
      expect(html).toContain('Resolved');
      expect(html).toContain('cc-stepper-track');
      expect(html).toContain('cc-stepper-nodes');
      expect(html).toContain('REQ-2026-9999');
      expect(html).toContain('Prof. Rahul Mehta');
      expect(html).toContain('Urgent (P0)');
    });

    it('renders staff fast-action controls when allowStatusUpdate is enabled', () => {
      const html = renderComponent(<ComplaintTracker complaint={MOCK_COMPLAINT} allowStatusUpdate={true} />);

      expect(html).toContain('Set Under Review');
      expect(html).toContain('Assign to Officer');
      expect(html).toContain('Mark Resolved');
      expect(html).toContain('Append Resolution Note');
    });
  });

  // 5. Academic Section (AC) Direct Module
  describe('5. Academic Section (AC) Direct Module', () => {
    it('renders student continuous assessment marks roster and clearance status', () => {
      const html = renderComponent(<AcademicSectionView defaultRollNumber="JISU/2024/CSE/0842" />);

      expect(html).toContain('OFFICIAL ACADEMIC SECTION (AC) RECORD');
      expect(html).toContain('Ananya Das');
      expect(html).toContain('JISU/2024/CSE/0842');
      expect(html).toContain('CS301');
      expect(html).toContain('CS302');
      expect(html).toContain('All Semester Dues Cleared');
      expect(html).toContain('92.4');
    });

    it('store correctly resolves academic records and marks discrepancy updates', () => {
      const record = complaintStore.getACRecord('JISU/2024/CSE/0842');
      expect(record).not.toBeNull();
      expect(record?.studentName).toBe('Ananya Das');
      expect(record?.subjects.length).toBeGreaterThan(0);
    });
  });

  // 6. Three Portals RBAC & View Separation
  describe('6. Three Portals RBAC & Navigation Separation', () => {
    it('Student Portal renders personal dashboard, attendance, and scholarship gateway', () => {
      const html = renderComponent(<StudentPortal />);

      expect(html).toContain('JIS UNIVERSITY STUDENT PORTAL');
      expect(html).toContain('Student Identity: Ananya Das');
      expect(html).toContain('Personal Dashboard &amp; AC Records');
      expect(html).toContain('Complaint Tracking');
      expect(html).toContain('Lodge New Grievance');
      expect(html).toContain('Scholarships &amp; Internships');
    });

    it('Staff Portal renders role-filtered ticket inbox for wardens, maintenance, and faculty', () => {
      const html = renderComponent(<StaffPortal />);

      expect(html).toContain('STAFF &amp; FACULTY RESOLUTION INBOX');
      expect(html).toContain('Prof. Rahul Mehta');
      expect(html).toContain('All Role Inboxes');
      expect(html).toContain('Hostel Warden');
      expect(html).toContain('Estates &amp; Maintenance');
      expect(html).toContain('Academic &amp; Evaluator');
    });

    it('Admin Portal renders universal complaint command center and AC control', () => {
      const html = renderComponent(<AdminPortal />);

      expect(html).toContain('SUPER-USER ADMINISTRATIVE COMMAND CENTER');
      expect(html).toContain('Universal Complaint &amp; Academic Control Desk');
      expect(html).toContain('Complaint Command Center');
      expect(html).toContain('Student Academic (AC) Control');
      expect(html).toContain('Universal Docket Count');
      expect(html).toContain('SLA Adherence Compliance');
    });

    it('Sign In view provides dedicated login doors for Student, Staff, and Admin', () => {
      const html = renderComponent(<SignIn />);

      expect(html).toContain('CampusConnect Enterprise Portal');
      expect(html).toContain('Student Portal');
      expect(html).toContain('Staff &amp; Faculty Portal');
      expect(html).toContain('Administrative Command');
      expect(html).toContain('JISU/2024/CSE/0842');
      expect(html).toContain('JISU-STAFF-104');
      expect(html).toContain('JISU-ADM-001');
    });
  });

  // 7. Purge Verification: Zero Obsolete Modules (Workbench, Executive, Operation)
  describe('7. Purge Verification of Obsolete Modules', () => {
    it('header navigation contains only Student, Staff, and Admin portals — no Workbench, Executive, or Operations tabs', () => {
      const html = renderComponent(<Layout title="Portal Shell" />);

      expect(html).toContain('Student Portal');
      expect(html).toContain('Staff Portal');
      expect(html).toContain('Admin Command');

      // Purge assertions
      expect(html).not.toContain('Workbench</span>');
      expect(html).not.toContain('Executive</span>');
      expect(html).not.toContain('Operations</span>');
      expect(html).not.toContain('/ops/health');
      expect(html).not.toContain('/exec/overview');
    });
  });
});
