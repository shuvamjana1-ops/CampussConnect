import { useQuery } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../../api/client';
import { cacheTicket, getCachedTicket, listCachedTickets } from '../../pwa/ticket-cache';
import { isNetworkError, type Category, type TicketDetail, type TicketSummary } from './api';

/**
 * Determines whether a query error should fall back to seed/offline data.
 * Catches offline fetch exceptions (no response) AND HTTP 404 / 500+ status codes
 * encountered when the dev server is served without an active backend.
 */
export function shouldFallbackToSeed(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  if (error instanceof ApiError) {
    return error.status === 404 || error.status >= 500;
  }
  return false;
}

/** Data plus, when it came from the offline cache, the time it was last updated (20.2). */
export interface Cached<T> {
  readonly data: T;
  readonly offlineAsOf: number | null;
}

function updatedMs(ticket: { readonly updatedAt: string }): number {
  const ms = Date.parse(ticket.updatedAt);
  return Number.isNaN(ms) ? Date.now() : ms;
}

export const SEED_STUDENT_TICKETS: readonly TicketDetail[] = [
  {
    id: 'tkt_exam_101',
    reference: 'REQ-2026-0842',
    type: 'Complaint',
    status: 'inProgress',
    departmentName: 'Examination & Records Cell',
    categoryName: 'Internal Marks Discrepancy',
    firstResponseDueAt: new Date(Date.now() - 3600000).toISOString(),
    resolutionDueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    updatedAt: new Date().toISOString(),
    description:
      'Internal assessment marks for CS302 (Data Structures) recorded as 12/30 instead of 22/30 on the student portal. Hall ticket generation cut-off is in 3 days.',
    version: 1,
    confidential: true,
    history: [
      {
        at: new Date(Date.now() - 7200000).toISOString(),
        actor: 'Ananya Das',
        fromStatus: null,
        toStatus: 'new',
        reason: 'Ticket raised with attached answer sheet copy',
      },
      {
        at: new Date(Date.now() - 3600000).toISOString(),
        actor: 'Rahul Mehta (Exam Officer)',
        fromStatus: 'new',
        toStatus: 'inProgress',
        reason: 'Under re-verification with Course Evaluator Dr. Sharma',
      },
    ],
  },
  {
    id: 'tkt_hostel_102',
    reference: 'REQ-2026-0791',
    type: 'Request',
    status: 'resolvedPending',
    departmentName: 'Estates & Facilities',
    categoryName: 'Hostel Maintenance - Plumbing',
    firstResponseDueAt: new Date(Date.now() - 86400000).toISOString(),
    resolutionDueAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
    description: 'Low water pressure on 2nd floor of Mandakini Hostel Block B. Needs maintenance before exam week.',
    version: 2,
    confidential: false,
    confirmationWindowEndsAt: new Date(Date.now() + 86400000 * 5).toISOString(),
    history: [
      {
        at: new Date(Date.now() - 86400000 * 2).toISOString(),
        actor: 'Ananya Das',
        fromStatus: null,
        toStatus: 'new',
        reason: 'Issue submitted',
      },
      {
        at: new Date(Date.now() - 86400000).toISOString(),
        actor: 'K. Raman (Hostel Supervisor)',
        fromStatus: 'new',
        toStatus: 'inProgress',
        reason: 'Plumber dispatched to overhead pump line',
      },
      {
        at: new Date(Date.now() - 3600000).toISOString(),
        actor: 'K. Raman (Hostel Supervisor)',
        fromStatus: 'inProgress',
        toStatus: 'resolvedPending',
        reason: 'Pressure regulator valve replaced on Block B riser. Water supply restored.',
      },
    ],
  },
  {
    id: 'tkt_lib_103',
    reference: 'REQ-2026-0610',
    type: 'Request',
    status: 'closed',
    departmentName: 'Central Library',
    categoryName: 'Digital Library Access',
    firstResponseDueAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    resolutionDueAt: new Date(Date.now() - 86400000 * 9).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    description: 'Requesting remote IEEE Xplore / ACM Digital Library off-campus VPN credentials for B.Tech project research.',
    version: 3,
    confidential: false,
    rating: 5,
    history: [
      {
        at: new Date(Date.now() - 86400000 * 10).toISOString(),
        actor: 'Ananya Das',
        fromStatus: null,
        toStatus: 'new',
        reason: 'Access requested',
      },
      {
        at: new Date(Date.now() - 86400000 * 9).toISOString(),
        actor: 'Library Desk',
        fromStatus: 'new',
        toStatus: 'resolvedPending',
        reason: 'Institutional proxy credentials provisioned and sent to campus email',
      },
      {
        at: new Date(Date.now() - 86400000 * 7).toISOString(),
        actor: 'Ananya Das',
        fromStatus: 'resolvedPending',
        toStatus: 'closed',
        reason: 'Confirmed resolved with 5-star rating',
      },
    ],
  },
];

export function useTicketList() {
  return useQuery<Cached<readonly TicketSummary[]>>({
    queryKey: ['student', 'tickets'],
    queryFn: async () => {
      try {
        const page = await apiRequest<{ readonly items: readonly TicketSummary[] }>('/tickets?scope=mine');
        return { data: page.items, offlineAsOf: null };
      } catch (error) {
        if (!shouldFallbackToSeed(error)) throw error;
        const cached = await listCachedTickets();
        if (cached.length > 0) {
          return {
            data: cached.map((c) => c.data as TicketSummary),
            offlineAsOf: Math.min(...cached.map((c) => c.lastUpdatedAt)),
          };
        }
        // If empty cache in offline / preview mode, return realistic student seed items
        return {
          data: SEED_STUDENT_TICKETS,
          offlineAsOf: Date.now(),
        };
      }
    },
  });
}

export function useTicket(id: string) {
  return useQuery<Cached<TicketDetail>>({
    queryKey: ['student', 'ticket', id],
    queryFn: async () => {
      try {
        const ticket = await apiRequest<TicketDetail>(`/tickets/${encodeURIComponent(id)}`);
        await cacheTicket(id, ticket, updatedMs(ticket)).catch(() => undefined);
        return { data: ticket, offlineAsOf: null };
      } catch (error) {
        if (!shouldFallbackToSeed(error)) throw error;
        const cached = await getCachedTicket(id);
        if (cached) {
          return { data: cached.data as TicketDetail, offlineAsOf: cached.lastUpdatedAt };
        }
        const seedMatch = SEED_STUDENT_TICKETS.find((t) => t.id === id);
        if (seedMatch) {
          return { data: seedMatch, offlineAsOf: Date.now() };
        }
        throw error;
      }
    },
  });
}

export const SEED_CATEGORIES: readonly Category[] = [
  { id: 'cat_exam_marks', name: 'Examination › Marks Correction' },
  { id: 'cat_exam_hall', name: 'Examination › Hall Ticket & Schedule' },
  { id: 'cat_acad_attend', name: 'Academic Affairs › Attendance Exemption' },
  { id: 'cat_hostel_maint', name: 'Estates › Hostel Maintenance' },
  { id: 'cat_mess_food', name: 'Student Welfare › Mess & Dining' },
  { id: 'cat_finance_fee', name: 'Finance › Fee Receipt & Dues' },
  { id: 'cat_scholarship', name: 'Scholarships & Aid Cell › Verification' },
];

export function useCategories() {
  return useQuery<readonly Category[]>({
    queryKey: ['student', 'categories'],
    queryFn: async () => {
      try {
        const result = await apiRequest<{ readonly items: readonly Category[] }>('/categories');
        return result.items;
      } catch {
        return SEED_CATEGORIES;
      }
    },
    staleTime: 5 * 60_000,
  });
}
