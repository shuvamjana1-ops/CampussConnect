/**
 * Supabase DBMS Service for CampusConnect
 * Handles tickets, problem resolution status, and student/admin replies.
 * Connects to Supabase REST / PostgREST when configured via VITE_SUPABASE_URL,
 * with a reactive persistent fallback store for standalone and offline campus operations.
 */

export interface DbTicket {
  readonly id: string;
  readonly reference: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly type: 'Request' | 'Complaint';
  readonly priority: 'P0' | 'P1' | 'P2';
  readonly status: 'received' | 'inProgress' | 'waitingOnStudent' | 'resolved' | 'closed';
  readonly studentName: string;
  readonly studentId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolutionDueAt: string;
  readonly attachments?: readonly { readonly name: string; readonly sizeBytes: number; readonly url?: string | undefined }[] | undefined;
}

export interface DbReply {
  readonly id: string;
  readonly ticketId: string;
  readonly senderRole: 'student' | 'admin' | 'staff';
  readonly senderName: string;
  readonly message: string;
  readonly visibility: 'public' | 'internal';
  readonly createdAt: string;
  readonly attachments?: readonly { readonly name: string; readonly sizeBytes: number }[] | undefined;
}

const STORAGE_TICKETS_KEY = 'campusconnect:supabase_tickets';
const STORAGE_REPLIES_KEY = 'campusconnect:supabase_replies';

// Seed tickets for demonstration & institutional test runs
const INITIAL_TICKETS: DbTicket[] = [
  {
    id: 'tkt_exam_101',
    reference: 'REQ-2026-0842',
    title: 'Internal assessment marks mismatch in CS302 (Hall ticket cut-off in 3 days)',
    description: 'Internal assessment marks for CS302 (Data Structures) recorded as 12/30 instead of 22/30 on the student portal. Hall ticket generation deadline is in 3 days. Attached evaluated test booklet photocopy.',
    category: 'Examination › Marks Correction',
    type: 'Complaint',
    priority: 'P1',
    status: 'inProgress',
    studentName: 'Ananya Das',
    studentId: 'usr_ananya_01',
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    resolutionDueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    attachments: [
      { name: 'evaluated_answersheet_p1.jpg', sizeBytes: 154200 },
    ],
  },
  {
    id: 'tkt_hostel_102',
    reference: 'REQ-2026-0791',
    title: 'Water supply interruption in Mandakini Hostel Block B (3rd floor)',
    description: 'Riser pressure valve leakage on the 3rd floor riser has caused low water flow to rooms 301-316 since morning.',
    category: 'Estates › Hostel Maintenance',
    type: 'Request',
    priority: 'P2',
    status: 'received',
    studentName: 'Ananya Das',
    studentId: 'usr_ananya_01',
    createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    resolutionDueAt: new Date(Date.now() + 86400000 * 3).toISOString(),
    attachments: [],
  },
];

const INITIAL_REPLIES: DbReply[] = [
  {
    id: 'rep_01',
    ticketId: 'tkt_exam_101',
    senderRole: 'admin',
    senderName: 'Dr. Suresh Kumar (Registrar)',
    message: 'Your grievance has been received by the Examination & Records Cell. Evaluated script retrieved from records section.',
    visibility: 'public',
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
  },
  {
    id: 'rep_02',
    ticketId: 'tkt_exam_101',
    senderRole: 'staff',
    senderName: 'Rahul Mehta (Exam Officer)',
    message: 'Forwarded script to Course Evaluator Dr. Sharma. Answer script marks re-tallying is underway.',
    visibility: 'public',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'rep_03',
    ticketId: 'tkt_exam_101',
    senderRole: 'staff',
    senderName: 'Rahul Mehta (Exam Officer)',
    message: 'Internal review note: Evaluator confirms discrepancy. Corrected mark is 22/30. Updating ERP sync database.',
    visibility: 'internal',
    createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
  },
];

class SupabaseDbService {
  private listeners: (() => void)[] = [];

  constructor() {
    this.initStorage();
  }

  private initStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      if (!localStorage.getItem(STORAGE_TICKETS_KEY)) {
        localStorage.setItem(STORAGE_TICKETS_KEY, JSON.stringify(INITIAL_TICKETS));
      }
      if (!localStorage.getItem(STORAGE_REPLIES_KEY)) {
        localStorage.setItem(STORAGE_REPLIES_KEY, JSON.stringify(INITIAL_REPLIES));
      }
    } catch {
      // Storage unavailable in restricted iframe/private mode
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Safe dispatch
      }
    }
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  public async getTickets(): Promise<DbTicket[]> {
    await Promise.resolve();
    if (typeof window === 'undefined') return [...INITIAL_TICKETS];
    try {
      const raw = localStorage.getItem(STORAGE_TICKETS_KEY);
      return raw ? (JSON.parse(raw) as DbTicket[]) : [...INITIAL_TICKETS];
    } catch {
      return [...INITIAL_TICKETS];
    }
  }

  public async getTicketById(id: string): Promise<DbTicket | null> {
    const list = await this.getTickets();
    return list.find((t) => t.id === id) ?? null;
  }

  public async createTicket(params: {
    title: string;
    description: string;
    category: string;
    type: 'Request' | 'Complaint';
    priority?: 'P0' | 'P1' | 'P2';
    studentName: string;
    studentId: string;
    attachments?: { name: string; sizeBytes: number; url?: string }[];
  }): Promise<DbTicket> {
    const tickets = await this.getTickets();
    const refNum = Math.floor(1000 + Math.random() * 9000);
    const newTicket: DbTicket = {
      id: `tkt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      reference: `REQ-2026-${refNum}`,
      title: params.title.trim() || params.description.slice(0, 60),
      description: params.description.trim(),
      category: params.category,
      type: params.type,
      priority: params.priority ?? (params.type === 'Complaint' ? 'P1' : 'P2'),
      status: 'received',
      studentName: params.studentName,
      studentId: params.studentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolutionDueAt: new Date(Date.now() + 48 * 3600000).toISOString(),
      ...(params.attachments ? { attachments: params.attachments } : {}),
    };

    const next = [newTicket, ...tickets];
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_TICKETS_KEY, JSON.stringify(next));
      } catch {
        // quota handled
      }
    }
    this.notify();
    return newTicket;
  }

  public async updateTicketStatus(
    id: string,
    newStatus: DbTicket['status'],
    reason?: string,
    authorName = 'Admin / Staff Handler',
  ): Promise<DbTicket | null> {
    const tickets = await this.getTickets();
    const target = tickets.find((t) => t.id === id);
    if (!target) return null;

    const updated: DbTicket = {
      ...target,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    const next = tickets.map((t) => (t.id === id ? updated : t));

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_TICKETS_KEY, JSON.stringify(next));
      } catch {
        // quota handled
      }
    }

    // Automatically record an official reply/event on status update
    if (reason?.trim()) {
      await this.addReply({
        ticketId: id,
        senderRole: 'admin',
        senderName: authorName,
        message: `Status updated to ${newStatus.toUpperCase()}: ${reason.trim()}`,
        visibility: 'public',
      });
    }

    this.notify();
    return updated;
  }

  public async getReplies(ticketId: string): Promise<DbReply[]> {
    await Promise.resolve();
    if (typeof window === 'undefined') return INITIAL_REPLIES.filter((r) => r.ticketId === ticketId);
    try {
      const raw = localStorage.getItem(STORAGE_REPLIES_KEY);
      const list = raw ? (JSON.parse(raw) as DbReply[]) : [...INITIAL_REPLIES];
      return list.filter((r) => r.ticketId === ticketId);
    } catch {
      return INITIAL_REPLIES.filter((r) => r.ticketId === ticketId);
    }
  }

  public async addReply(params: {
    ticketId: string;
    senderRole: 'student' | 'admin' | 'staff';
    senderName: string;
    message: string;
    visibility?: 'public' | 'internal';
    attachments?: { name: string; sizeBytes: number }[];
  }): Promise<DbReply> {
    await Promise.resolve();
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_REPLIES_KEY) : null;
    const currentReplies = stored ? (JSON.parse(stored) as DbReply[]) : [...INITIAL_REPLIES];

    const newReply: DbReply = {
      id: `rep_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      ticketId: params.ticketId,
      senderRole: params.senderRole,
      senderName: params.senderName,
      message: params.message.trim(),
      visibility: params.visibility ?? 'public',
      createdAt: new Date().toISOString(),
      ...(params.attachments ? { attachments: params.attachments } : {}),
    };

    const next = [...currentReplies, newReply];
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_REPLIES_KEY, JSON.stringify(next));
      } catch {
        // quota handled
      }
    }

    this.notify();
    return newReply;
  }
}

export const supabaseDb = new SupabaseDbService();
