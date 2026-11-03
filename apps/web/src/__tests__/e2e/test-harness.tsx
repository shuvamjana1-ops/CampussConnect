import { vi } from 'vitest';
import React, { type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

// Load locale JSON dictionaries for English
import adminEn from '../../../../../packages/i18n/locales/en/admin.json';
import commonEn from '../../../../../packages/i18n/locales/en/common.json';
import execEn from '../../../../../packages/i18n/locales/en/exec.json';
import opsEn from '../../../../../packages/i18n/locales/en/ops.json';
import studentEn from '../../../../../packages/i18n/locales/en/student.json';
import ticketsEn from '../../../../../packages/i18n/locales/en/tickets.json';

const DICTIONARY: Record<string, Record<string, string>> = {
  admin: adminEn,
  common: commonEn,
  exec: execEn,
  ops: opsEn,
  student: studentEn,
  tickets: ticketsEn,
};

export function lookupTranslation(key: string): string {
  let ns = 'common';
  let subKey = key;
  if (key.includes(':')) {
    const [prefix, ...rest] = key.split(':');
    ns = prefix ?? 'common';
    subKey = rest.join(':');
  }
  const match = DICTIONARY[ns]?.[subKey] ?? DICTIONARY.common?.[subKey] ?? DICTIONARY.student?.[subKey];
  return match ?? key;
}

// Hoistable mocks for Vitest Node environment
vi.mock('../../i18n/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: ReactNode }) => children,
  useI18n: () => ({
    locale: 'en',
    t: (k: string) => lookupTranslation(k),
    setLocale: async () => {},
  }),
}));

vi.mock('../../i18n/LanguageSelector', () => ({
  LanguageSelector: () => null,
}));

// Independent, isolated test fixtures to guarantee zero circular import issues
export const FIXTURE_STUDENT_TICKETS = [
  {
    id: 'tkt_exam_101',
    reference: 'REQ-2026-0842',
    type: 'Complaint' as const,
    status: 'inProgress' as const,
    departmentName: 'Examination & Records Cell',
    categoryName: 'Internal Marks Discrepancy',
    firstResponseDueAt: new Date(Date.now() - 3600000).toISOString(),
    resolutionDueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    updatedAt: new Date().toISOString(),
    description:
      'Internal assessment marks for CS302 (Data Structures) recorded as 12/30 instead of 22/30 on the student portal.',
    version: 1,
    confidential: true,
    history: [
      {
        at: new Date(Date.now() - 7200000).toISOString(),
        actor: 'Ananya Das',
        fromStatus: null,
        toStatus: 'new' as const,
        reason: 'Ticket raised with attached answer sheet copy',
      },
      {
        at: new Date(Date.now() - 3600000).toISOString(),
        actor: 'Rahul Mehta (Exam Officer)',
        fromStatus: 'new' as const,
        toStatus: 'inProgress' as const,
        reason: 'Under re-verification with Course Evaluator Dr. Sharma',
      },
    ],
  },
  {
    id: 'tkt_hostel_102',
    reference: 'REQ-2026-0791',
    type: 'Request' as const,
    status: 'resolvedPending' as const,
    departmentName: 'Estates & Facilities',
    categoryName: 'Hostel Maintenance - Plumbing',
    firstResponseDueAt: new Date(Date.now() - 86400000).toISOString(),
    resolutionDueAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
    description: 'Low water pressure on 2nd floor of Mandakini Hostel Block B.',
    version: 2,
    confidential: false,
    confirmationWindowEndsAt: new Date(Date.now() + 86400000 * 5).toISOString(),
    history: [],
  },
  {
    id: 'tkt_lib_103',
    reference: 'REQ-2026-0610',
    type: 'Request' as const,
    status: 'closed' as const,
    departmentName: 'Central Library',
    categoryName: 'Digital Library Access',
    firstResponseDueAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    resolutionDueAt: new Date(Date.now() - 86400000 * 9).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    description: 'Requesting remote IEEE Xplore / ACM Digital Library access.',
    version: 3,
    confidential: false,
    rating: 5,
    history: [],
  },
];

export const FIXTURE_QUEUE_ROWS = [
  {
    id: 'tkt_exam_101',
    title: 'Internal assessment marks mismatch in CS302 (Hall ticket cut-off in 3 days)',
    band: 'P1' as const,
    status: 'inProgress' as const,
    category: 'Examination › Marks Correction',
    resolutionDueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    slaState: null,
    needsVerification: true,
    assigneeName: 'Rahul Mehta',
  },
  {
    id: 'tkt_eval_104',
    title: 'End-semester hall ticket blocked due to elective attendance calculation',
    band: 'P0' as const,
    status: 'new' as const,
    category: 'Examination › Hall Tickets & Grades',
    resolutionDueAt: new Date(Date.now() + 3600000 * 4).toISOString(),
    slaState: 'atRisk' as const,
    needsVerification: true,
    assigneeName: 'Unassigned',
  },
];

export const FIXTURE_TENANT_CONFIG = {
  slaMinutes: { P0: 240, P1: 1440, P2: 2880, P3: 7200 },
  confidenceThreshold: 0.85,
  copilotConfidenceThreshold: 0.9,
  kAnonymity: 5,
  calendar: {
    timezone: 'Asia/Kolkata',
    startTime: '09:00',
    endTime: '17:00',
    workDays: [1, 2, 3, 4, 5],
  },
  categories: [
    'Examination › Marks Correction',
    'Examination › Hall Tickets & Grades',
    'Academic Affairs › Attendance Exemption',
    'Estates › Hostel Maintenance',
  ],
  departments: [
    'Examination & Records Cell',
    'Estates & Facilities',
    'Academic Affairs & Dean Office',
  ],
  routingRules: [
    { category: 'Examination › Marks Correction', department: 'Examination & Records Cell' },
  ],
};

export const FIXTURE_STUDENT_PROFILE = {
  academic: {
    rollNumber: '2024BCSE042',
    studentName: 'Ananya Das',
    degree: 'Bachelor of Technology (B.Tech)',
    department: 'Computer Science and Engineering',
    batch: '2024 - 2028',
    currentSemester: 4,
    cgpa: 8.42,
    creditsCompleted: 78,
    hostelBlock: 'Mandakini Hall of Residence (Block B)',
    roomNumber: 'B-204',
    erpSyncTime: new Date().toISOString(),
  },
  interests: ['Algorithms & Data Structures', 'Distributed Systems'],
  skills: ['TypeScript', 'Python', 'C++', 'React', 'SQL', 'Git & Linux'],
  careerGoal: 'Higher Studies & Research Fellowship',
  incomeBracket: 'bracket_2_5_to_6',
  dpdpConsentGranted: true,
  completenessPercent: 84,
  missingFields: ['Resume PDF in Locker'],
};

export const FIXTURE_OPPORTUNITIES = [
  {
    id: 'opp_merit_means_2026',
    title: 'Central Sector Merit-cum-Means Scholarship 2026',
    provider: 'Ministry of Education / National Scholarship Portal',
    type: 'Scholarship' as const,
    awardText: '₹50,000 / academic year + Tuition waiver',
    deadline: new Date(Date.now() + 86400000 * 12).toISOString(),
    daysRemaining: 12,
    matchScore: 96,
    description: 'Central sector scheme for meritorious collegiate students from economically weaker sections.',
    eligibilitySummary: 'Family income < ₹4.5 LPA · > 80th percentile in Class XII',
    criteria: [
      { label: 'Minimum CGPA', studentValue: '8.42 CGPA', requiredValue: 'Minimum 7.50 CGPA', matched: true },
    ],
    requiredDocuments: [
      { id: 'doc_1', title: 'Income Certificate (Tehsildar/Revenue Officer)', lockerStatus: 'verified' as const, required: true },
    ],
    externalUrl: 'https://scholarships.gov.in',
    isSaved: false,
  },
];

import { SessionProvider, DEMO_PROFILES, type RouteGroup, type Session } from '../../auth/session';
import { App } from '../../App';

// Polyfill in-memory localStorage for Node test runner
const memoryStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = String(val);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
})();

if (!globalThis.localStorage?.setItem) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    writable: true,
  });
}

export function resetTestStorage(): void {
  globalThis.localStorage.clear();
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export interface RenderAppOptions {
  readonly initialRoute?: string;
  readonly role?: RouteGroup | 'all';
  readonly session?: Session | null;
  readonly queryClient?: QueryClient;
  readonly preloadedQueries?: readonly { readonly queryKey: readonly unknown[]; readonly data: unknown }[];
}

export function renderAppWithRoute(options: RenderAppOptions = {}): {
  html: string;
  queryClient: QueryClient;
} {
  const {
    initialRoute = '/sign-in',
    role = 'student',
    queryClient = createTestQueryClient(),
    preloadedQueries = [],
  } = options;

  resetTestStorage();
  globalThis.localStorage.setItem('campusconnect:active_role', role);

  const sessionData = options.session !== undefined ? options.session : DEMO_PROFILES[role];
  queryClient.setQueryData(['auth', 'session'], sessionData);

  // Preload test fixtures across all portals
  queryClient.setQueryData(['student', 'tickets'], { data: FIXTURE_STUDENT_TICKETS, offlineAsOf: null });
  queryClient.setQueryData(['student', 'ticket', 'tkt_exam_101'], { data: FIXTURE_STUDENT_TICKETS[0], offlineAsOf: null });
  queryClient.setQueryData(['student', 'ticket', 'tkt_hostel_102'], { data: FIXTURE_STUDENT_TICKETS[1], offlineAsOf: null });
  queryClient.setQueryData(['student', 'ticket', 'tkt_lib_103'], { data: FIXTURE_STUDENT_TICKETS[2], offlineAsOf: null });
  queryClient.setQueryData(['student', 'profile'], FIXTURE_STUDENT_PROFILE);
  queryClient.setQueryData(['student', 'opportunities'], FIXTURE_OPPORTUNITIES);
  queryClient.setQueryData(['student', 'categories'], [
    { id: 'cat_exam', name: 'Examination › Marks Correction' },
    { id: 'cat_hostel', name: 'Estates › Hostel Maintenance' },
  ]);

  queryClient.setQueryData(['workbench', 'queue', 'all'], {
    pages: [{ items: FIXTURE_QUEUE_ROWS, nextCursor: null, needsVerificationCount: 1 }],
    pageParams: [null],
  });
  queryClient.setQueryData(['workbench', 'queue', 'verification'], {
    pages: [{ items: FIXTURE_QUEUE_ROWS.filter((r) => r.needsVerification), nextCursor: null, needsVerificationCount: 1 }],
    pageParams: [null],
  });
  queryClient.setQueryData(['workbench', 'ticket', 'tkt_exam_101'], {
    id: 'tkt_exam_101',
    version: 1,
    title: 'Internal assessment marks mismatch in CS302 (Hall ticket cut-off in 3 days)',
    description: 'Internal assessment marks for CS302 (Data Structures) recorded as 12/30 instead of 22/30.',
    band: 'P1' as const,
    status: 'inProgress' as const,
    category: 'Examination › Marks Correction',
    categoryOptions: ['Examination › Marks Correction', 'Examination › Hall Tickets & Grades'],
    needsVerification: true,
    escalationLevel: 'L0' as const,
    etaSet: false,
    slaState: null,
    resolutionDueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    messages: [
      {
        id: 'msg_1',
        visibility: 'internal' as const,
        author: 'AI Triage Agent',
        body: 'Category: Examination › Marks Correction (Confidence: 94%).',
        createdAt: new Date().toISOString(),
      },
    ],
  });
  queryClient.setQueryData(['workbench', 'l3'], [
    { id: 'grv_l3_001', title: 'Disciplinary & Hostel Hall Council Appeal', workingDaysRemaining: 7 },
  ]);
  queryClient.setQueryData(['workbench', 'canned'], [
    { id: 'c1', title: 'Marks Correction - Evaluator Verification', body: 'Evaluator verification underway.' },
  ]);

  queryClient.setQueryData(['student', 'notifications'], [
    { id: 'notif_1', title: 'Campus update', body: 'Marks discrepancy review', createdAt: new Date().toISOString(), read: false },
  ]);
  queryClient.setQueryData(['student', 'notification-prefs'], { inApp: true, webPush: true, email: true });

  queryClient.setQueryData(['student', 'consents'], [
    { purpose: 'Scholarship AI Matching', description: 'Opportunity matching', decision: 'granted', decidedAt: new Date().toISOString(), withdrawnAt: null },
  ]);
  queryClient.setQueryData(['student', 'data-requests'], [
    { id: 'req_1', kind: 'export', status: 'open', dueAt: new Date().toISOString() },
  ]);

  queryClient.setQueryData(['admin', 'config'], FIXTURE_TENANT_CONFIG);
  queryClient.setQueryData(['admin', 'erp-status'], {
    state: 'ok',
    lastSuccessfulSyncAt: Date.now() - 3600000 * 4,
    lastAttemptAt: Date.now() - 3600000 * 4,
    attemptsInCycle: 0,
  });
  queryClient.setQueryData(['admin', 'erp', 'status'], {
    state: 'ok',
    lastSyncAt: new Date().toISOString(),
    recordsSynced: 12450,
  });

  queryClient.setQueryData(['reports', 'schedules'], {
    schedules: [
      { id: 'sch_1', frequency: 'weekly', format: 'pdf', recipients: ['registrar@nit.ac.in'] },
    ],
  });

  queryClient.setQueryData(['ops', 'tenants'], {
    tenants: [{ id: 'ten_01', name: 'NIT Karnataka' }],
  });
  queryClient.setQueryData(['ops', 'guardrails'], {
    metrics: [
      { key: 'pii_exposure_rate', value: 0.001, threshold: 0.01, breached: false, computedAt: Date.now() },
    ],
  });

  for (const item of preloadedQueries) {
    queryClient.setQueryData(item.queryKey, item.data);
  }

  const html = renderToString(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        SessionProvider,
        null,
        React.createElement(
          MemoryRouter,
          { initialEntries: [initialRoute] },
          React.createElement(App, null)
        )
      )
    )
  );

  return { html, queryClient };
}

export { DEMO_PROFILES };
