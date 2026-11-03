import { type ComplaintData, type ComplaintStage } from '../components/ComplaintTracker';

export type { ComplaintData, ComplaintStage };

export interface AcademicRecord {
  readonly studentId: string;
  readonly rollNumber: string;
  readonly studentName: string;
  readonly department: string;
  readonly semester: string;
  readonly attendancePercentage: number;
  readonly cgpa: number;
  readonly creditsCompleted: number;
  readonly totalCredits: number;
  readonly subjects: readonly {
    readonly code: string;
    readonly name: string;
    readonly internalMarks: number;
    readonly maxInternal: number;
    readonly attendance: number;
    readonly grade: string;
    readonly status: 'Verified' | 'Pending Review' | 'Marks Discrepancy Resolved';
  }[];
  readonly feesClearance: boolean;
  readonly libraryHolds: number;
  readonly advisorName: string;
  readonly phone?: string;
  readonly email?: string;
  readonly guardianName?: string;
  readonly emergencyContact?: string;
  readonly bloodGroup?: string;
  readonly permanentAddress?: string;
  readonly dateOfBirth?: string;
}

export const INITIAL_COMPLAINTS: ComplaintData[] = [
  {
    id: 'tkt_exam_101',
    reference: 'REQ-2026-0842',
    type: 'Academic',
    title: 'Internal assessment marks mismatch in CS302 (Data Structures)',
    description: 'Internal assessment marks for CS302 were recorded as 12/30 on the student portal instead of 22/30 awarded on the signed answer script.',
    student: {
      id: 'usr_ananya_01',
      name: 'Ananya Das',
      rollNumber: 'JISU/2024/CSE/0842',
      department: 'Computer Science & Engineering',
      semester: '4th',
      cgpa: '8.92',
      email: 'ananya.das@jisuniversity.ac.in',
      phone: '+91-98301-23456',
      academicStatus: 'Good Standing',
      avatarUrl: '/assets/profiles/student-ananya.svg',
    },
    department: 'Examination & Records Cell',
    priority: 'Urgent (P0)',
    currentStage: 'assigned_to_staff',
    assignedStaffName: 'Prof. Rahul Mehta',
    assignedStaffRole: 'Course Evaluator & Exam Superintendent',
    createdAt: 'Today, 09:30 AM',
    expectedResolutionTime: 'Within 24 hours (Hall ticket cut-off)',
    timeline: [
      {
        id: 'ev_1',
        stage: 'submitted',
        title: 'Grievance Lodged by Student',
        description: 'Uploaded scanned copy of evaluator-signed mark-sheet verifying 22/30.',
        actor: 'Ananya Das (Student)',
        timestamp: '09:30 AM',
      },
      {
        id: 'ev_2',
        stage: 'under_review',
        title: 'Triage Intake & Verification',
        description: 'Triage evaluated priority as P0 due to upcoming hall ticket release.',
        actor: 'Admin Auto-Triage',
        timestamp: '10:05 AM',
      },
      {
        id: 'ev_3',
        stage: 'assigned_to_staff',
        title: 'Assigned to Course Evaluator',
        description: 'Physical answer script requested from record room for verification.',
        actor: 'Prof. Rahul Mehta',
        timestamp: '11:15 AM',
      },
    ],
  },
  {
    id: 'tkt_hostel_102',
    reference: 'REQ-2026-0791',
    type: 'Hostel',
    title: 'Mandakini Hostel Block B — Water Pressure & Riser Pipe Failure',
    description: 'Low water pressure on 3rd floor bathrooms affecting rooms 301 to 316. Urgent plumbing inspection requested.',
    student: {
      id: 'usr_rohit_02',
      name: 'Rohit Verma',
      rollNumber: 'JISU/2023/ME/0411',
      department: 'Mechanical Engineering',
      semester: '6th',
      cgpa: '8.14',
      email: 'rohit.v@jisuniversity.ac.in',
      phone: '+91-98302-34567',
      academicStatus: 'Good Standing',
    },
    department: 'Hostel Administration & Estates',
    priority: 'High (P1)',
    currentStage: 'under_review',
    assignedStaffName: 'Er. Dilip Roy',
    assignedStaffRole: 'Chief Maintenance Engineer',
    createdAt: 'Yesterday, 04:15 PM',
    expectedResolutionTime: 'Within 12 hours',
    timeline: [
      {
        id: 'ev_4',
        stage: 'submitted',
        title: 'Facility Issue Reported',
        description: 'Student hall representative reported water pressure drop on 3rd floor.',
        actor: 'Rohit Verma (Student)',
        timestamp: 'Yesterday, 04:15 PM',
      },
      {
        id: 'ev_5',
        stage: 'under_review',
        title: 'Warden Inspection Scheduled',
        description: 'Hostel warden Dr. Anita Bannerjee logged urgent maintenance docket.',
        actor: 'Dr. Anita Bannerjee (Hostel Warden)',
        timestamp: 'Yesterday, 05:00 PM',
      },
    ],
  },
  {
    id: 'tkt_infra_103',
    reference: 'REQ-2026-0720',
    type: 'Infrastructure',
    title: 'ECE Lab 204 Overhead Projector & HDMI Interface Malfunction',
    description: 'Projector turns off automatically after 10 minutes of display during lectures. Replacement HDMI adapter needed.',
    student: {
      id: 'usr_priya_03',
      name: 'Priya Mukherjee',
      rollNumber: 'JISU/2024/ECE/0155',
      department: 'Electronics & Communication',
      semester: '4th',
      cgpa: '9.05',
      email: 'priya.m@jisuniversity.ac.in',
      phone: '+91-98303-45678',
      academicStatus: 'Honor Roll',
    },
    department: 'Campus Infrastructure & IT Services',
    priority: 'Normal (P2)',
    currentStage: 'resolved',
    assignedStaffName: 'Er. Dilip Roy',
    assignedStaffRole: 'Chief Maintenance Engineer',
    createdAt: '2 days ago',
    expectedResolutionTime: 'Resolved',
    timeline: [
      {
        id: 'ev_6',
        stage: 'submitted',
        title: 'IT Helpdesk Ticket Filed',
        description: 'Lab representative submitted projector malfunction docket.',
        actor: 'Priya Mukherjee (Student)',
        timestamp: '2 days ago',
      },
      {
        id: 'ev_7',
        stage: 'assigned_to_staff',
        title: 'Field Tech Dispatched',
        description: 'Lamp unit replaced and firmware updated.',
        actor: 'Er. Dilip Roy',
        timestamp: 'Yesterday, 11:00 AM',
      },
      {
        id: 'ev_8',
        stage: 'resolved',
        title: 'Projector Tested & Confirmed Operational',
        description: 'Resolution verified by Lab In-charge Prof. Das.',
        actor: 'Er. Dilip Roy',
        timestamp: 'Yesterday, 02:30 PM',
      },
    ],
  },
];

export const INITIAL_AC_RECORDS: Record<string, AcademicRecord> = {
  'usr_ananya_01': {
    studentId: 'usr_ananya_01',
    rollNumber: 'JISU/2024/CSE/0842',
    studentName: 'Ananya Das',
    department: 'Computer Science & Engineering',
    semester: '4th Semester (UG)',
    attendancePercentage: 92.4,
    cgpa: 8.92,
    creditsCompleted: 78,
    totalCredits: 160,
    advisorName: 'Prof. Rahul Mehta',
    feesClearance: true,
    libraryHolds: 0,
    phone: '+91-98301-23456',
    email: 'ananya.das@jisuniversity.ac.in',
    guardianName: 'Dr. Subhash Das',
    emergencyContact: '+91-98300-11223',
    bloodGroup: 'O+ (Positive)',
    permanentAddress: 'Plot 42, Salt Lake Sector V, Kolkata, West Bengal - 700091',
    dateOfBirth: '15 August 2004',
    subjects: [
      { code: 'CS301', name: 'Design & Analysis of Algorithms', internalMarks: 28, maxInternal: 30, attendance: 95, grade: 'A+', status: 'Verified' },
      { code: 'CS302', name: 'Advanced Data Structures & OOP', internalMarks: 22, maxInternal: 30, attendance: 91, grade: 'A', status: 'Marks Discrepancy Resolved' },
      { code: 'CS303', name: 'Database Management Systems', internalMarks: 27, maxInternal: 30, attendance: 93, grade: 'A+', status: 'Verified' },
      { code: 'CS304', name: 'Discrete Mathematics', internalMarks: 26, maxInternal: 30, attendance: 88, grade: 'A', status: 'Verified' },
      { code: 'CS305', name: 'Computer Architecture & Microprocessors', internalMarks: 25, maxInternal: 30, attendance: 94, grade: 'A', status: 'Verified' },
    ],
  },
  'usr_rohit_02': {
    studentId: 'usr_rohit_02',
    rollNumber: 'JISU/2023/ME/0411',
    studentName: 'Rohit Verma',
    department: 'Mechanical Engineering',
    semester: '6th Semester (UG)',
    attendancePercentage: 86.8,
    cgpa: 8.14,
    creditsCompleted: 114,
    totalCredits: 160,
    advisorName: 'Dr. Anita Bannerjee',
    feesClearance: true,
    libraryHolds: 0,
    subjects: [
      { code: 'ME501', name: 'Heat Transfer & Fluid Mechanics', internalMarks: 24, maxInternal: 30, attendance: 87, grade: 'A', status: 'Verified' },
      { code: 'ME502', name: 'Thermodynamics & Energy Conversion', internalMarks: 25, maxInternal: 30, attendance: 89, grade: 'A', status: 'Verified' },
      { code: 'ME503', name: 'Machine Design & Kinematics', internalMarks: 23, maxInternal: 30, attendance: 84, grade: 'B+', status: 'Verified' },
    ],
  },
  'usr_priya_03': {
    studentId: 'usr_priya_03',
    rollNumber: 'JISU/2024/ECE/0155',
    studentName: 'Priya Mukherjee',
    department: 'Electronics & Communication',
    semester: '4th Semester (UG)',
    attendancePercentage: 96.2,
    cgpa: 9.05,
    creditsCompleted: 80,
    totalCredits: 160,
    advisorName: 'Dr. Suresh Kumar',
    feesClearance: true,
    libraryHolds: 0,
    subjects: [
      { code: 'EC401', name: 'Analog Electronic Circuits', internalMarks: 29, maxInternal: 30, attendance: 98, grade: 'O', status: 'Verified' },
      { code: 'EC402', name: 'Signals and Systems', internalMarks: 28, maxInternal: 30, attendance: 95, grade: 'A+', status: 'Verified' },
      { code: 'EC403', name: 'Digital Signal Processing', internalMarks: 27, maxInternal: 30, attendance: 96, grade: 'A+', status: 'Verified' },
    ],
  },
};

class ComplaintStore {
  private complaints: ComplaintData[] = [...INITIAL_COMPLAINTS];
  private acRecords: Record<string, AcademicRecord> = { ...INITIAL_AC_RECORDS };
  private listeners: (() => void)[] = [];

  public getComplaints(): readonly ComplaintData[] {
    return this.complaints;
  }

  public getComplaint(id: string): ComplaintData | undefined {
    return this.complaints.find((c) => c.id === id);
  }

  public getACRecord(studentIdOrRoll: string): AcademicRecord | null {
    const byId = this.acRecords[studentIdOrRoll];
    if (byId) return byId;
    const byRoll = Object.values(this.acRecords).find(
      (r) => r.rollNumber.toLowerCase() === studentIdOrRoll.toLowerCase()
    );
    return byRoll ?? this.acRecords['usr_ananya_01'] ?? null;
  }

  public getAllACRecords(): readonly AcademicRecord[] {
    return Object.values(this.acRecords);
  }

  public addComplaint(newComplaint: Omit<ComplaintData, 'id' | 'reference' | 'timeline' | 'createdAt'>): ComplaintData {
    const id = `tkt_${Date.now()}`;
    const reference = `REQ-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const fullComplaint: ComplaintData = {
      ...newComplaint,
      id,
      reference,
      createdAt: 'Just now',
      timeline: [
        {
          id: `ev_${Date.now()}`,
          stage: 'submitted',
          title: 'Ticket Lodged in University System',
          description: newComplaint.description,
          actor: `${newComplaint.student.name} (Student)`,
          timestamp: 'Just now',
        },
      ],
    };
    this.complaints = [fullComplaint, ...this.complaints];
    this.notify();
    return fullComplaint;
  }

  public updateStatus(complaintId: string, stage: ComplaintStage, note?: string, staffName?: string): void {
    this.complaints = this.complaints.map((c): ComplaintData => {
      if (c.id !== complaintId) return c;
      const newEvent = {
        id: `ev_${Date.now()}`,
        stage,
        title: `Stage Updated to ${stage.replace(/_/g, ' ').toUpperCase()}`,
        description: note || `Complaint progressed to stage ${stage}`,
        actor: staffName ?? 'Staff Desk',
        timestamp: 'Just now',
      };
      const effectiveStaff = staffName ?? c.assignedStaffName;
      return {
        ...c,
        currentStage: stage,
        ...(effectiveStaff ? { assignedStaffName: effectiveStaff } : {}),
        timeline: [...c.timeline, newEvent],
      };
    });
    this.notify();
  }

  public reassignStaff(complaintId: string, staffName: string): void {
    this.complaints = this.complaints.map((c) => {
      if (c.id !== complaintId) return c;
      const newEvent = {
        id: `ev_${Date.now()}`,
        stage: c.currentStage,
        title: `Reassigned to ${staffName}`,
        description: `Direct administrative assignment to ${staffName}`,
        actor: 'Super Admin Override',
        timestamp: 'Just now',
      };
      return {
        ...c,
        assignedStaffName: staffName,
        timeline: [...c.timeline, newEvent],
      };
    });
    this.notify();
  }

  public updateACMarks(studentId: string, subjectCode: string, newMarks: number): void {
    const record = this.acRecords[studentId];
    if (!record) return;
    this.acRecords[studentId] = {
      ...record,
      subjects: record.subjects.map((s) =>
        s.code === subjectCode
          ? { ...s, internalMarks: newMarks, status: 'Marks Discrepancy Resolved' }
          : s
      ),
    };
    this.notify();
  }

  public updateACPersonalData(studentIdOrRoll: string, updates: Partial<Omit<AcademicRecord, 'studentId' | 'subjects'>>): AcademicRecord | null {
    const existing = this.getACRecord(studentIdOrRoll);
    if (!existing) return null;
    const targetKey = existing.studentId;
    const updated: AcademicRecord = {
      ...existing,
      ...updates,
    };
    this.acRecords[targetKey] = updated;
    this.notify();
    return updated;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error(e);
      }
    }
  }
}

export const complaintStore = new ComplaintStore();
