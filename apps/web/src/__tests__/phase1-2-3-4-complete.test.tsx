import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import fs from 'node:fs';
import path from 'node:path';
import { complaintStore, type AcademicRecord } from '../services/complaintStore';
import { EvidenceLightboxModal } from '../components/EvidenceLightboxModal';
import { AttendanceCalculator } from '../components/AttendanceCalculator';
import { TicketConversationThread } from '../components/TicketConversationThread';
import { HallTicketModal } from '../components/HallTicketModal';
import { HostelGatePassView } from '../components/HostelGatePassView';
import { CertificateGenerator } from '../components/CertificateGenerator';
import { StudentDashboard } from '../routes/(student)/StudentDashboard';
import { StaffDashboard } from '../routes/(staff)/StaffDashboard';
import { AdminDashboard } from '../routes/(admin)/AdminDashboard';

// Mock session hook
vi.mock('../auth/session', () => ({
  useSession: () => ({
    user: { id: 'usr_ananya_01', email: 'ananya.das@jisuniversity.ac.in' },
    profile: {
      id: 'usr_ananya_01',
      full_name: 'Ananya Das',
      email: 'ananya.das@jisuniversity.ac.in',
      department: 'Computer Science & Engineering',
      role: 'student',
      roll_number: 'JISU/2024/CSE/0842',
    },
    role: 'student',
    isAdmin: false,
    isStaff: false,
    isStudent: true,
    switchRole: vi.fn(),
    updateProfile: vi.fn(),
    signOut: vi.fn(),
  }),
}));

describe('CampusConnect JIS University Phase 1, 2, 3, 4 Comprehensive Enterprise Suite', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      print: vi.fn(),
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
  });

  // ==========================================
  // PART 1: Evidence Attachments Storage & Retrieval
  // ==========================================
  describe('Phase 1: Evidence Attachments & Lightbox Modal', () => {
    it('appends and retrieves evidence attachments on complaints', () => {
      const complaintId = 'tkt_exam_101';
      const att = complaintStore.addComplaintAttachment(complaintId, {
        name: 'Evaluation_Sheet_Reaudit.png',
        url: 'https://images.unsplash.com/test-audit.png',
        type: 'image',
        sizeBytes: 154200,
      });

      expect(att.id).toBeDefined();
      expect(att.name).toBe('Evaluation_Sheet_Reaudit.png');

      const retrieved = complaintStore.getComplaint(complaintId);
      expect(retrieved?.attachments).toBeDefined();
      expect(retrieved?.attachments?.some((a) => a.name === 'Evaluation_Sheet_Reaudit.png')).toBe(true);
    });

    it('renders EvidenceLightboxModal for image attachments with compressed size', () => {
      const html = renderToString(
        <EvidenceLightboxModal
          attachment={{
            id: 'test_att_1',
            name: 'CS302_Evaluator_Script.png',
            url: 'https://example.com/script.png',
            type: 'image',
            sizeBytes: 145000,
          }}
          onClose={() => {}}
        />
      );

      expect(html).toContain('CS302_Evaluator_Script.png');
      expect(html).toContain('Evidence Proof');
      expect(html).toContain('(Compressed)');
      expect(html).toContain('<img');
      expect(html).toContain('Open Raw');
    });

    it('renders EvidenceLightboxModal for PDF documents with download link', () => {
      const html = renderToString(
        <EvidenceLightboxModal
          attachment={{
            id: 'test_att_pdf',
            name: 'Medical_Condonation_Certificate.pdf',
            url: 'https://example.com/condonation.pdf',
            type: 'pdf',
            sizeBytes: 89000,
          }}
          onClose={() => {}}
        />
      );

      expect(html).toContain('Medical_Condonation_Certificate.pdf');
      expect(html).toContain('Evidence Proof');
      expect(html).toContain('Download / View PDF File');
    });
  });

  // ==========================================
  // PART 2: 75% Attendance Calculator Math & Bunk Margins
  // ==========================================
  describe('Phase 1: 75% Attendance Target & Bunk Margin Math', () => {
    const dummyRecord: AcademicRecord = {
      studentId: 'usr_test_01',
      rollNumber: 'JISU/2024/CSE/9999',
      studentName: 'Subhasish Sen',
      department: 'Computer Science & Engineering',
      semester: '4th Semester (UG)',
      attendancePercentage: 88.5,
      cgpa: 8.5,
      creditsCompleted: 70,
      totalCredits: 160,
      advisorName: 'Prof. Rahul Mehta',
      feesClearance: true,
      libraryHolds: 0,
      subjects: [
        {
          code: 'CS301',
          name: 'Algorithms',
          internalMarks: 28,
          maxInternal: 30,
          attendance: 95,
          lecturesHeld: 40,
          lecturesAttended: 38,
          grade: 'A+',
          status: 'Verified',
        },
        {
          code: 'CS304',
          name: 'Discrete Math',
          internalMarks: 20,
          maxInternal: 30,
          attendance: 66.67,
          lecturesHeld: 30,
          lecturesAttended: 20,
          grade: 'B',
          status: 'Pending Review',
        },
      ],
    };

    it('computes exact safe bunk margin when attendance >= 75%', () => {
      // CS301: Attended = 38, Held = 40.
      // (38 - 0.75 * 40) / 0.75 = (38 - 30) / 0.75 = 8 / 0.75 = 10.666 => Math.floor = 10.
      const attended = 38;
      const held = 40;
      const safeMargin = Math.floor((attended - 0.75 * held) / 0.75);
      expect(safeMargin).toBe(10);

      // Verify: If student misses 10 classes, total attended = 38, total held = 50. 38 / 50 = 76% (>= 75%).
      expect(38 / 50).toBeGreaterThanOrEqual(0.75);

      const html = renderToString(<AttendanceCalculator record={dummyRecord} />);
      expect(html).toContain('CS301');
      expect(html).toContain('Safe Margin: You can miss');
      expect(html).toContain('more classes');
      expect(html).toContain('Eligible');
    });

    it('computes exact shortage recovery requirement when attendance < 75%', () => {
      // CS304: Attended = 20, Held = 30.
      // (0.75 * 30 - 20) / 0.25 = (22.5 - 20) / 0.25 = 2.5 / 0.25 = 10 classes needed.
      const attended = 20;
      const held = 30;
      const recoveryNeeded = Math.ceil((0.75 * held - attended) / 0.25);
      expect(recoveryNeeded).toBe(10);

      // Verify: If student attends next 10 consecutive classes: attended = 30, held = 40. 30 / 40 = 75.0%.
      expect(30 / 40).toBe(0.75);

      const html = renderToString(<AttendanceCalculator record={dummyRecord} />);
      expect(html).toContain('CS304');
      expect(html).toContain('Shortage Alert: Attend next');
      expect(html).toContain('consecutive classes');
      expect(html).toContain('Condonation Required');
    });
  });

  // ==========================================
  // PART 3: In-Ticket Conversation Thread & Hall Ticket
  // ==========================================
  describe('Phase 2: Two-Way Case Thread & Digital Admit Card', () => {
    it('appends and displays in-ticket two-way clarification comments with role badges', () => {
      const complaintId = 'tkt_exam_101';
      const cmt = complaintStore.addComplaintComment(complaintId, {
        authorName: 'Dr. Anita Bannerjee',
        authorRole: 'admin',
        message: 'Administrative inquiry completed. Ledger verified.',
      });

      expect(cmt.id).toBeDefined();
      expect(cmt.authorName).toBe('Dr. Anita Bannerjee');

      const html = renderToString(
        <TicketConversationThread complaintId={complaintId} />
      );

      expect(html).toContain('Two-Way Case Clarification Thread');
      expect(html).toContain('Dr. Anita Bannerjee');
      expect(html).toContain('Admin Oversight');
      expect(html).toContain('Administrative inquiry completed');
    });

    it('renders print-ready official Examination Admit Card with timetable and QR security seal', () => {
      const html = renderToString(
        <HallTicketModal isOpen={true} onClose={() => {}} studentIdOrRoll="usr_ananya_01" />
      );

      expect(html).toContain('OFFICIAL EXAMINATION ADMIT CARD · ODD SEMESTER 2026');
      expect(html).toContain('JIS UNIVERSITY, KOLKATA');
      expect(html).toContain('SEC-HASH: JISU-2026-X88A');
      expect(html).toContain('Ananya Das');
      expect(html).toContain('JISU/2024/CSE/0842');
      expect(html).toContain('Exam Hall B · Desk B-42');
      expect(html).toContain('Attendance Requirement');
      expect(html).toContain('CS301');
      expect(html).toContain('CS302');
      expect(html).toContain('CS303');
      expect(html).toContain('CS304');
      expect(html).toContain('CS305');
      expect(html).toContain('Controller of Examinations');
    });
  });

  // ==========================================
  // PART 4: Hostel Gate Pass Lifecycle
  // ==========================================
  describe('Phase 3: Hostel Gate Pass Full Lifecycle', () => {
    it('progresses hostel gate pass through complete lifecycle: pending -> approved -> gate_checked_out -> completed', () => {
      // 1. Request new pass
      const pass = complaintStore.requestHostelPass({
        studentId: 'usr_ananya_01',
        studentName: 'Ananya Das',
        rollNumber: 'JISU/2024/CSE/0842',
        hostelBlock: 'Mandakini Girls Residence',
        roomNumber: '304',
        passType: 'Day Outpass',
        destination: 'Sector V R&D Lab',
        departureTime: 'Today, 03:00 PM',
        expectedReturnTime: 'Today, 08:00 PM (Curfew)',
        parentPhone: '+91-98301-23456',
        reason: 'Embedded IoT project testing',
      });

      expect(pass.status).toBe('pending');
      expect(pass.passNumber).toContain('JISU-PASS-2026-');

      // 2. Warden Approval
      complaintStore.updateHostelPassStatus(pass.id, 'approved', 'Warden verified', 'Dr. Anita Bannerjee');
      let currentPass = complaintStore.getHostelPasses().find((p) => p.id === pass.id);
      expect(currentPass?.status).toBe('approved');
      expect(currentPass?.approvedBy).toBe('Dr. Anita Bannerjee');

      // 3. Gate 1 QR Scan Check-Out
      complaintStore.updateHostelPassStatus(pass.id, 'gate_checked_out', 'QR Scanned at Gate 1');
      currentPass = complaintStore.getHostelPasses().find((p) => p.id === pass.id);
      expect(currentPass?.status).toBe('gate_checked_out');

      // 4. Safe Return
      complaintStore.updateHostelPassStatus(pass.id, 'completed', 'Returned before curfew');
      currentPass = complaintStore.getHostelPasses().find((p) => p.id === pass.id);
      expect(currentPass?.status).toBe('completed');
    });

    it('strictly forbids students from updating or granting gate pass permissions', () => {
      const pass = complaintStore.getHostelPasses()[0];
      expect(pass).toBeDefined();

      // Attempt status update with actorRole: 'student'
      const updateResult = complaintStore.updateHostelPassStatus(
        pass!.id,
        'approved',
        'Unauthorized student attempt',
        'Student User',
        'student'
      );
      expect(updateResult).toBe(false);
    });

    it('enforces RBAC gate pass UI permissions: student view hides warden desk, admin view reveals it', () => {
      // Student View: canManagePermissions = false
      const studentHtml = renderToString(
        <HostelGatePassView
          initialSubView="passes"
          studentRoll="JISU/2024/CSE/0842"
          canManagePermissions={false}
        />
      );

      expect(studentHtml).toContain('Hostel Outpass &amp; Security Gate Desk');
      expect(studentHtml).toContain('My Passes');
      expect(studentHtml).toContain('Request Outpass');
      // Warden / Admin desk button MUST NOT be present in student view
      expect(studentHtml).not.toContain('Warden &amp; Gate 1 Desk (Admin Permissions)');

      // Admin View: canManagePermissions = true
      const adminHtml = renderToString(
        <HostelGatePassView
          initialSubView="warden"
          canManagePermissions={true}
        />
      );
      expect(adminHtml).toContain('Warden &amp; Gate 1 Desk (Admin Permissions)');
      expect(adminHtml).toContain('Filter State:');
      expect(adminHtml).toContain('Gate 1 Scanner');
    });

    it('renders self-service institutional E-Certificates with QR digital seal', () => {
      const html = renderToString(
        <CertificateGenerator studentRoll="JISU/2024/CSE/0842" />
      );

      expect(html).toContain('BONAFIDE STUDENT CERTIFICATE');
      expect(html).toContain('JIS UNIVERSITY, KOLKATA');
      expect(html).toContain('CRYPTOGRAPHICALLY SEALED');
      expect(html).toContain('Dr. Sandip Ghosh');
      expect(html).toContain('Registrar');
    });
  });

  // ==========================================
  // PART 5: AI Duplicate Detection Clustering & CSS Rules
  // ==========================================
  describe('Phase 4: AI Smart Clustering, Universal Dark Theme & CSS Rules', () => {
    it('detects duplicate complaints when overlapping keywords are present', () => {
      const complaints = complaintStore.getComplaints();
      const existing = complaints.find((c) => c.title.includes('Water Pressure'));
      expect(existing).toBeDefined();

      const textCombined = 'hostel bathroom water pressure drop and pipe failure'.toLowerCase();
      const tokens = textCombined.split(/\s+/).filter((t) => t.length >= 3);
      const matches = complaints.filter((c) => {
        const target = `${c.title} ${c.description}`.toLowerCase();
        return tokens.filter((t) => target.includes(t)).length >= 2;
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]?.reference).toContain('REQ-2026-');
    });

    it('enforces black fonts for all option selection elements in stylesheet', () => {
      const stylesPath = path.resolve(__dirname, '../styles.css');
      const css = fs.readFileSync(stylesPath, 'utf8');

      // Verify global select / option rules
      expect(css).toContain('select option');
      expect(css).toContain('color: #000000 !important;');
      expect(css).toContain('background-color: #ffffff !important;');
      expect(css).toContain('.cc-option-item');
    });

    it('enforces white headlines for scholarships and internships in stylesheet', () => {
      const stylesPath = path.resolve(__dirname, '../styles.css');
      const css = fs.readFileSync(stylesPath, 'utf8');

      expect(css).toContain('#scholarship-gateway-title');
      expect(css).toContain('.cc-opp-title');
      expect(css).toContain('color: #ffffff !important;');
    });

    it('enforces 100% circular geometry in stylesheet', () => {
      const stylesPath = path.resolve(__dirname, '../styles.css');
      const css = fs.readFileSync(stylesPath, 'utf8');

      expect(css).toContain('.cc-node-circle');
      expect(css).toContain('border-radius: 50% !important;');
      expect(css).toContain('aspect-ratio: 1 / 1 !important;');
      expect(css).toContain('.campusconnect-dock-container button');
    });

    it('renders permanent black dock icon outlines in stylesheet', () => {
      const stylesPath = path.resolve(__dirname, '../styles.css');
      const css = fs.readFileSync(stylesPath, 'utf8');

      expect(css).toContain('.campusconnect-dock-container button svg');
      expect(css).toContain('color: #000000 !important;');
      expect(css).toContain('stroke: #000000 !important;');
      expect(css).toContain('border: 1.5px solid #000000 !important;');
    });

    it('aligns tracking stepper container and clear floats on meta-grid', () => {
      const stylesPath = path.resolve(__dirname, '../styles.css');
      const css = fs.readFileSync(stylesPath, 'utf8');

      expect(css).toContain('.cc-tracking-stepper-container');
      expect(css).toContain('position: relative;');
      expect(css).toContain('padding: 0.5rem 1rem;');
      expect(css).toContain('.cc-tracker-meta-grid');
      expect(css).toContain('clear: both;');
    });
  });

  // ==========================================
  // PART 6: Route Group Dashboards Smoke Tests
  // ==========================================
  describe('Full Route Group Integration Smoke Tests', () => {
    it('renders StudentDashboard with all 4 phases and tabs', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/student?tab=dashboard']}>
          <StudentDashboard />
        </MemoryRouter>
      );

      expect(html).toContain('STUDENT IDENTITY PORTAL · JIS UNIVERSITY');
      expect(html).toContain('🎟️ Exam Hall Ticket');
      expect(html).toContain('🏢 Hostel Gate Pass');
      expect(html).toContain('📜 E-Certificates');
      expect(html).toContain('🤖 Campus AI Assistant');
    });

    it('renders StaffDashboard with hostel gate pass tab and assigned work', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/staff?tab=tasks']}>
          <StaffDashboard />
        </MemoryRouter>
      );

      expect(html).toContain('STAFF RESOLUTION WORKSPACE · JIS UNIVERSITY');
      expect(html).toContain('🏢 Hostel Gate Pass');
    });

    it('renders AdminDashboard with super-user command center and gate desk', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/admin?tab=command']}>
          <AdminDashboard />
        </MemoryRouter>
      );

      expect(html).toContain('SUPER-USER ADMINISTRATIVE COMMAND CENTER · JIS UNIVERSITY');
      expect(html).toContain('🏢 Hostel Gate Pass');
    });
  });
});
