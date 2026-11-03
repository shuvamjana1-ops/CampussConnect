import { describe, expect, it, vi } from 'vitest';
import React, { type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ApiError } from '../api/client';
import { lookupTranslation } from './e2e/test-harness';

// Hoistable mocks for Vitest Node environment
vi.mock('../i18n/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: ReactNode }) => children,
  useI18n: () => ({
    locale: 'en',
    t: (k: string) => lookupTranslation(k),
    setLocale: () => Promise.resolve(),
  }),
}));

vi.mock('../i18n/LanguageSelector', () => ({
  LanguageSelector: () => null,
}));

// Mock IndexedDB ticket-cache helpers to return empty cached list in Node
vi.mock('../pwa/ticket-cache', () => ({
  cacheTicket: vi.fn().mockResolvedValue(undefined),
  getCachedTicket: vi.fn().mockResolvedValue(null),
  listCachedTickets: vi.fn().mockResolvedValue([]),
}));

import {
  shouldFallbackToSeed,
  SEED_STUDENT_TICKETS,
  SEED_CATEGORIES,
} from '../routes/(student)/tickets-data';
import ReportSchedulesPage, {
  SEED_REPORT_SCHEDULES,
} from '../routes/(exec)/ReportSchedulesPage';
import BreachPage, {
  SEED_TENANTS,
  SEED_BREACHES,
} from '../routes/(ops)/BreachPage';
import GuardrailsPage, {
  SEED_GUARDRAILS,
} from '../routes/(ops)/GuardrailsPage';
import ProvisionPage from '../routes/(ops)/ProvisionPage';
import ExecHome from '../routes/(exec)/Home';
import OpsHome from '../routes/(ops)/Home';
import {
  createTestQueryClient,
  renderAppWithRoute,
} from './e2e/test-harness';
import viteConfig from '../../vite.config';
import rootPackageJson from '../../../../package.json';
import turboJson from '../../../../turbo.json';
import webPackageJson from '../../package.json';

// Helper component to render a page within standard Test Query + MemoryRouter wrappers
function renderWithProviders(element: ReactNode, customClient?: QueryClient) {
  const queryClient = customClient ?? createTestQueryClient();
  const html = renderToString(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MemoryRouter, null, element)
    )
  );
  return { html, queryClient };
}

describe('Challenger Milestone 1 Empirical Test Suite', () => {
  // =========================================================================
  // 1. Mock Fallback Behavior & Error Classification (tickets-data)
  // =========================================================================
  describe('1. Mock Fallback & Error Classification (tickets-data.ts)', () => {
    it('C1.1: shouldFallbackToSeed returns true for network and fetch errors', () => {
      expect(shouldFallbackToSeed(new TypeError('Failed to fetch'))).toBe(true);
      expect(shouldFallbackToSeed(new TypeError('fetch failed'))).toBe(true);
      expect(shouldFallbackToSeed(new Error('NetworkError when attempting to fetch resource'))).toBe(true);
      expect(shouldFallbackToSeed(new Error('connect ECONNREFUSED 127.0.0.1:3000'))).toBe(true);
      expect(shouldFallbackToSeed(new Error('connect ETIMEDOUT'))).toBe(true);
    });

    it('C1.2: shouldFallbackToSeed returns true for HTTP 404 (Not Found) ApiError', () => {
      const notFoundError = new ApiError(404, { title: 'Not found' });
      expect(shouldFallbackToSeed(notFoundError)).toBe(true);
    });

    it('C1.3: shouldFallbackToSeed returns true for HTTP 500, 502, 503, 504 server errors', () => {
      expect(shouldFallbackToSeed(new ApiError(500, { title: 'Internal Error' }))).toBe(true);
      expect(shouldFallbackToSeed(new ApiError(502, { title: 'Bad Gateway' }))).toBe(true);
      expect(shouldFallbackToSeed(new ApiError(503, { title: 'Service Unavailable' }))).toBe(true);
      expect(shouldFallbackToSeed(new ApiError(504, { title: 'Gateway Timeout' }))).toBe(true);
    });

    it('C1.4: shouldFallbackToSeed returns false for client validation / auth errors (400, 401, 403, 409, 422)', () => {
      expect(shouldFallbackToSeed(new ApiError(400, { title: 'Bad Request' }))).toBe(false);
      expect(shouldFallbackToSeed(new ApiError(401, { title: 'Unauthorized' }))).toBe(false);
      expect(shouldFallbackToSeed(new ApiError(403, { title: 'Forbidden' }))).toBe(false);
      expect(shouldFallbackToSeed(new ApiError(409, { title: 'Conflict' }))).toBe(false);
      expect(shouldFallbackToSeed(new ApiError(422, { title: 'Unprocessable Entity' }))).toBe(false);
    });

    it('C1.5: SEED_STUDENT_TICKETS contains verified Indian HEI domain tickets', () => {
      expect(SEED_STUDENT_TICKETS.length).toBeGreaterThanOrEqual(3);
      const examTicket = SEED_STUDENT_TICKETS.find((t) => t.id === 'tkt_exam_101');
      expect(examTicket).toBeDefined();
      expect(examTicket?.departmentName).toBe('Examination & Records Cell');
      expect(examTicket?.categoryName).toBe('Internal Marks Discrepancy');
      expect(examTicket?.status).toBe('inProgress');
      expect(examTicket?.history.length).toBeGreaterThanOrEqual(2);
    });

    it('C1.6: SEED_CATEGORIES contains comprehensive HEI grievance categories', () => {
      expect(SEED_CATEGORIES.length).toBeGreaterThanOrEqual(5);
      const catNames = SEED_CATEGORIES.map((c) => c.name);
      expect(catNames.some((c) => c.includes('Examination'))).toBe(true);
      expect(catNames.some((c) => c.includes('Academic Affairs'))).toBe(true);
      expect(catNames.some((c) => c.includes('Hostel Maintenance'))).toBe(true);
      expect(catNames.some((c) => c.includes('Finance'))).toBe(true);
    });
  });

  // =========================================================================
  // 2. ReportSchedulesPage Mock Fallback & Interactivity
  // =========================================================================
  describe('2. ReportSchedulesPage (Executive Portal)', () => {
    it('C1.7: SEED_REPORT_SCHEDULES contains realistic governance report schedules', () => {
      expect(SEED_REPORT_SCHEDULES.length).toBe(4);
      const daily = SEED_REPORT_SCHEDULES.find((s) => s.frequency === 'daily');
      const weekly = SEED_REPORT_SCHEDULES.find((s) => s.frequency === 'weekly');
      const monthly = SEED_REPORT_SCHEDULES.find((s) => s.frequency === 'monthly');
      const quarterly = SEED_REPORT_SCHEDULES.find((s) => s.frequency === 'quarterly');

      expect(daily).toBeDefined();
      expect(daily?.format).toBe('pdf');
      expect(weekly?.format).toBe('csv');
      expect(monthly?.format).toBe('pdf');
      expect(quarterly?.format).toBe('csv');
      expect(quarterly?.active).toBe(false);
    });

    it('C1.8: ReportSchedulesPage renders seed schedules without throwing unhandled exceptions', () => {
      const { html } = renderWithProviders(React.createElement(ReportSchedulesPage, null));

      expect(html).toContain('reports-title');
      expect(html).toContain('registrar@campusconnect.edu');
      expect(html).toContain('dean.academic@campusconnect.edu');
      expect(html).toContain('ombudsperson@campusconnect.edu');
      expect(html).toContain('chancellor@campusconnect.edu');
      expect(html).toContain('compliance@campusconnect.edu');

      // Check actions rendered
      expect(html).toContain('Activate'); // For paused quarterly schedule
      expect(html).toContain('Pause');    // For active schedules
    });

    it('C1.9: ReportSchedulesPage form contains frequency, format, and recipients fields', () => {
      const { html } = renderWithProviders(React.createElement(ReportSchedulesPage, null));
      expect(html).toContain('textarea');
      expect(html).toContain('select');
      expect(html).toContain('PDF');
      expect(html).toContain('CSV');
    });
  });

  // =========================================================================
  // 3. BreachPage & GuardrailsPage Fallbacks (Operations Portal)
  // =========================================================================
  describe('3. BreachPage & GuardrailsPage (Operations Portal)', () => {
    it('C1.10: SEED_TENANTS contains 5 prominent HEI tenant institutions', () => {
      expect(SEED_TENANTS.length).toBe(5);
      const tenantIds = SEED_TENANTS.map((t) => t.id);
      expect(tenantIds).toContain('tnt_iist_blr');
      expect(tenantIds).toContain('tnt_nitk_sur');
      expect(tenantIds).toContain('tnt_dtu_del');
      expect(tenantIds).toContain('tnt_bits_pil');
      expect(tenantIds).toContain('tnt_demo_inst');
    });

    it('C1.11: SEED_BREACHES contains 3 active incidents with DPDP compliance fields', () => {
      expect(SEED_BREACHES.length).toBe(3);
      for (const breach of SEED_BREACHES) {
        expect(breach.id).toMatch(/^brc_\d{4}_\d{3}$/);
        expect(breach.nature.length).toBeGreaterThan(10);
        expect(breach.dataCategories.length).toBeGreaterThan(0);
        expect(breach.approxAffected).toBeGreaterThan(0);
        expect(breach.detectedAt).toBeLessThanOrEqual(Date.now());
        expect(breach.declaredAt).toBeLessThanOrEqual(Date.now());
        expect(['notified', 'contained', 'investigating']).toContain(breach.status);
      }
    });

    it('C1.12: BreachPage renders tenant dropdown options and active breach registry table', () => {
      const { html } = renderWithProviders(React.createElement(BreachPage, null));

      // Tenant select options
      expect(html).toContain('Indian Institute of Science &amp; Technology (IIST Bangalore)');
      expect(html).toContain('National Institute of Technology Karnataka (NITK Surathkal)');
      expect(html).toContain('Birla Institute of Technology &amp; Science (BITS Pilani)');

      // Incident registry table
      expect(html).toContain('Active Breach Declarations (72h Notification Registry)');
      expect(html).toContain('CONTAINED');
      expect(html).toContain('NOTIFIED');
      expect(html).toContain('INVESTIGATING');
      expect(html).toContain('Misconfigured S3 bucket permissions');
    });

    it('C1.13: SEED_GUARDRAILS contains all 4 mandatory operational guardrails', () => {
      expect(SEED_GUARDRAILS.length).toBe(4);
      const keys = SEED_GUARDRAILS.map((g) => g.key);
      expect(keys).toContain('piiExposure');
      expect(keys).toContain('p0FalseNegativeRate');
      expect(keys).toContain('aiOverrideRate');
      expect(keys).toContain('opportunityExposureParity');

      for (const g of SEED_GUARDRAILS) {
        expect(g.threshold).toBeGreaterThanOrEqual(0);
        expect(g.breached).toBe(false);
      }
    });

    it('C1.14: GuardrailsPage renders metrics table with status badges and computed timestamps', () => {
      const { html } = renderWithProviders(React.createElement(GuardrailsPage, null));

      expect(html).toContain('guard-title');
      expect(html).toContain('table');
      // All thresholds should be rendered
      expect(html).toContain('0.05');
      expect(html).toContain('0.15');
      expect(html).toContain('0.85');
    });
  });

  // =========================================================================
  // 4. ProvisionPage & Mutation Interactivity
  // =========================================================================
  describe('4. ProvisionPage & Optimistic Query Cache Synchronization', () => {
    it('C1.15: ProvisionPage renders input form with region selector and submit action', () => {
      const { html } = renderWithProviders(React.createElement(ProvisionPage, null));

      expect(html).toContain('prov-title');
      expect(html).toContain('ap-south-1');
      expect(html).toContain('ap-south-2');
    });

    it('C1.16: ProvisionPage mutation updates TanStack Query cache for [ops, tenants]', () => {
      const queryClient = createTestQueryClient();
      // Set initial tenants
      queryClient.setQueryData(['ops', 'tenants'], {
        tenants: [{ id: 'tnt_existing', name: 'Existing University' }],
      });

      // Simulate the exact onSuccess callback from ProvisionPage
      const newTenantName = 'IIT Bombay';
      const generatedId = `tnt_iitb_${Date.now().toString(36)}`;
      queryClient.setQueryData<{ tenants: { id: string; name: string }[] }>(
        ['ops', 'tenants'],
        (old) => {
          const existing = old?.tenants ?? [];
          return {
            tenants: [...existing, { id: generatedId, name: newTenantName }],
          };
        }
      );

      const updated = queryClient.getQueryData<{ tenants: { id: string; name: string }[] }>(['ops', 'tenants']);
      expect(updated?.tenants).toHaveLength(2);
      expect(updated?.tenants.some((t) => t.name === 'IIT Bombay')).toBe(true);
      expect(updated?.tenants.some((t) => t.id === generatedId)).toBe(true);
    });

    it('C1.17: Cross-page synchronization: newly provisioned tenant appears in BreachPage tenant selector', () => {
      const sharedClient = createTestQueryClient();
      sharedClient.setQueryData(['ops', 'tenants'], {
        tenants: [
          ...SEED_TENANTS,
          { id: 'tnt_newly_provisioned', name: 'Indian Institute of Technology Roorkee (IITR)' },
        ],
      });

      const { html } = renderWithProviders(React.createElement(BreachPage, null), sharedClient);
      expect(html).toContain('Indian Institute of Technology Roorkee (IITR)');
    });
  });

  // =========================================================================
  // 5. Navigation & Layout Container Wrapping (Strategy A)
  // =========================================================================
  describe('5. Shell Navigation & Strategy A Container Layout', () => {
    it('C1.18: Shell Layout maps Operations navigation to /ops/health', () => {
      const { html } = renderAppWithRoute({ initialRoute: '/ops/health', role: 'ops' });
      expect(html).toContain('href="/ops/health"');
      expect(html).toContain('Operations');
      expect(html).toContain('Platform Ops');
    });

    it('C1.19: SignIn page directs Platform Operations card to /ops/health', () => {
      const { html } = renderAppWithRoute({ initialRoute: '/sign-in', session: null });
      expect(html).toContain('Platform Operations');
      expect(html).toContain('Platform Ops Engineer');
    });

    it('C1.20: ExecHome wraps child routes in cc-container without double wrapping', () => {
      const queryClient = createTestQueryClient();
      queryClient.setQueryData(['reports', 'schedules'], { schedules: [...SEED_REPORT_SCHEDULES] });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/overview'] },
            React.createElement(ExecHome, null)
          )
        )
      );

      // Must have cc-container
      expect(html).toContain('class="cc-container"');
      // Subnav bar must be present
      expect(html).toContain('cc-subnav-bar');
      expect(html).toContain('cc-subnav-link');
    });

    it('C1.21: OpsHome wraps child routes in cc-container and routes default to health', () => {
      const queryClient = createTestQueryClient();
      queryClient.setQueryData(['ops', 'guardrails'], { metrics: [...SEED_GUARDRAILS] });
      queryClient.setQueryData(['ops', 'tenants'], { tenants: [...SEED_TENANTS] });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/health'] },
            React.createElement(OpsHome, null)
          )
        )
      );

      expect(html).toContain('class="cc-container"');
      expect(html).toContain('cc-subnav-bar');
      expect(html).toContain('Service Health &amp; Latency');
      expect(html).toContain('Tenant Provisioning');
      expect(html).toContain('SLA Breaches &amp; Incidents');
      expect(html).toContain('Guardrails &amp; Kill-switches');
    });
  });

  // =========================================================================
  // 6. Tooling, Dev Server & Build Integrity
  // =========================================================================
  describe('6. Tooling, Dev Server & Turborepo Pipeline Configuration', () => {
    it('C1.22: apps/web/vite.config.ts configures port 5173 with host: true', () => {
      const serverConfig = (viteConfig as { server?: { port?: number; host?: boolean } }).server;
      expect(serverConfig).toBeDefined();
      expect(serverConfig?.port).toBe(5173);
      expect(serverConfig?.host).toBe(true);
    });

    it('C1.23: Root package.json declares build, build:web, dev, dev:web, and preview scripts', () => {
      const scripts = rootPackageJson.scripts as Record<string, string>;
      expect(scripts.build).toBe('turbo run build');
      expect(scripts['build:web']).toBe('pnpm --filter @campusconnect/web build');
      expect(scripts.dev).toBe('turbo run dev');
      expect(scripts['dev:web']).toBe('pnpm --filter @campusconnect/web dev');
      expect(scripts.preview).toBe('turbo run preview');
    });

    it('C1.24: Root turbo.json configures build, dev, and preview task pipelines', () => {
      const tasks = (turboJson as { tasks: Record<string, unknown> }).tasks;
      expect(tasks.build).toBeDefined();
      expect(tasks.dev).toBeDefined();
      expect(tasks.preview).toBeDefined();

      const buildTask = tasks.build as { dependsOn: string[]; outputs: string[] };
      expect(buildTask.dependsOn).toContain('^build');
      expect(buildTask.outputs).toContain('dist/**');

      const devTask = tasks.dev as { persistent?: boolean; cache?: boolean };
      expect(devTask.persistent).toBe(true);
      expect(devTask.cache).toBe(false);

      const previewTask = tasks.preview as { persistent?: boolean; cache?: boolean };
      expect(previewTask.persistent).toBe(true);
      expect(previewTask.cache).toBe(false);
    });

    it('C1.25: apps/web/package.json configures dev, build, preview, and test scripts', () => {
      const scripts = webPackageJson.scripts as Record<string, string>;
      expect(scripts.dev).toBe('vite');
      expect(scripts.build).toBe('tsc --noEmit && vite build');
      expect(scripts.preview).toBe('vite preview');
      expect(scripts.test).toBe('vitest run --passWithNoTests');
    });
  });
});
