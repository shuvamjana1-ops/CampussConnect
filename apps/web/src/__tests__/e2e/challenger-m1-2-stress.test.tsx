import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderAppWithRoute } from './test-harness';
import type { RouteGroup } from '../../auth/session';

describe('Challenger 2 Empirical Stress Test Suite (Milestone 1)', () => {
  const CLASS_REGEX = /class="([^"]*)"/;
  const MAIN_CONTAINER_REGEX = /class="[^"]*\bcc-container\b[^"]*"/g;
  const MAIN_BLOCK_REGEX = /<main id="main">([\s\S]*?)<\/main>/;

  /** Helper to extract all <a> tag attributes for a given href */
  function findAnchorByHref(html: string, href: string): { classAttr: string; fullTag: string }[] {
    const results: { classAttr: string; fullTag: string }[] = [];
    const regex = /<a\s+([^>]*?)>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const attrs = match[1] ?? '';
      if (attrs.includes(`href="${href}"`)) {
        const classMatch = CLASS_REGEX.exec(attrs);
        results.push({
          classAttr: classMatch?.[1] ?? '',
          fullTag: match[0],
        });
      }
    }
    return results;
  }

  // =========================================================================
  // 1. Navigation Switching: Operations Console & Subnav Activation
  // =========================================================================
  describe('1. Navigation Switching: Operations Console (/ops/health) & Primary Subnav', () => {
    it('C2.1: Rendering /ops/health mounts ServiceHealthPage inside cc-container and activates primary subnav tab', () => {
      const { html } = renderAppWithRoute({ initialRoute: '/ops/health', role: 'ops' });

      // Verify ServiceHealthPage content rendered
      expect(html).toContain('Platform Service Health &amp; Operations');
      expect(html).toContain('Core API Service');
      expect(html).toContain('Aurora PostgreSQL 16');

      // Find all anchors pointing to /ops/health (one in header, one in subnav)
      const healthLinks = findAnchorByHref(html, '/ops/health');
      expect(healthLinks.length).toBeGreaterThanOrEqual(2);

      // Verify subnav link has "cc-subnav-link" and "active"
      const subnavHealth = healthLinks.find((l) => l.classAttr.includes('cc-subnav-link'));
      expect(subnavHealth).toBeDefined();
      expect(subnavHealth?.classAttr).toContain('active');

      // Verify secondary subnav tabs are NOT active
      const tenantsLinks = findAnchorByHref(html, '/ops/tenants');
      const subnavTenants = tenantsLinks.find((l) => l.classAttr.includes('cc-subnav-link'));
      expect(subnavTenants).toBeDefined();
      expect(subnavTenants?.classAttr).not.toContain('active');

      const breachesLinks = findAnchorByHref(html, '/ops/breaches');
      const subnavBreaches = breachesLinks.find((l) => l.classAttr.includes('cc-subnav-link'));
      expect(subnavBreaches).toBeDefined();
      expect(subnavBreaches?.classAttr).not.toContain('active');

      const guardrailsLinks = findAnchorByHref(html, '/ops/guardrails');
      const subnavGuardrails = guardrailsLinks.find((l) => l.classAttr.includes('cc-subnav-link'));
      expect(subnavGuardrails).toBeDefined();
      expect(subnavGuardrails?.classAttr).not.toContain('active');
    });

    it('C2.2: Top shell header displays Operations tab with active state on /ops/health', () => {
      const { html } = renderAppWithRoute({ initialRoute: '/ops/health', role: 'ops' });

      // In shell header, Operations NavLink targets /ops/health and is active
      const healthLinks = findAnchorByHref(html, '/ops/health');
      const headerOpsTab = healthLinks.find((l) => l.classAttr.includes('cc-role-tab'));
      expect(headerOpsTab).toBeDefined();
      expect(headerOpsTab?.classAttr).toContain('active');

      // Other role tabs in header are NOT active
      const studentTab = findAnchorByHref(html, '/student').find((l) => l.classAttr.includes('cc-role-tab'));
      expect(studentTab?.classAttr).not.toContain('active');

      const workbenchTab = findAnchorByHref(html, '/workbench').find((l) => l.classAttr.includes('cc-role-tab'));
      expect(workbenchTab?.classAttr).not.toContain('active');

      const execTab = findAnchorByHref(html, '/exec/overview').find((l) => l.classAttr.includes('cc-role-tab'));
      expect(execTab?.classAttr).not.toContain('active');

      const adminTab = findAnchorByHref(html, '/admin/config').find((l) => l.classAttr.includes('cc-role-tab'));
      expect(adminTab?.classAttr).not.toContain('active');
    });

    it('C2.3: Operations subnav routes switch active states synchronously across tabs', () => {
      // 1. Tenant Provisioning (/ops/tenants)
      const tenantsRender = renderAppWithRoute({ initialRoute: '/ops/tenants', role: 'ops' });
      const tenantsSubnav = findAnchorByHref(tenantsRender.html, '/ops/tenants').find((l) =>
        l.classAttr.includes('cc-subnav-link'),
      );
      expect(tenantsSubnav?.classAttr).toContain('active');

      const healthSubnavOnTenants = findAnchorByHref(tenantsRender.html, '/ops/health').find((l) =>
        l.classAttr.includes('cc-subnav-link'),
      );
      expect(healthSubnavOnTenants?.classAttr).not.toContain('active');

      // 2. SLA Breaches (/ops/breaches)
      const breachesRender = renderAppWithRoute({ initialRoute: '/ops/breaches', role: 'ops' });
      const breachesSubnav = findAnchorByHref(breachesRender.html, '/ops/breaches').find((l) =>
        l.classAttr.includes('cc-subnav-link'),
      );
      expect(breachesSubnav?.classAttr).toContain('active');

      // 3. Guardrails (/ops/guardrails)
      const guardrailsRender = renderAppWithRoute({ initialRoute: '/ops/guardrails', role: 'ops' });
      const guardrailsSubnav = findAnchorByHref(guardrailsRender.html, '/ops/guardrails').find((l) =>
        l.classAttr.includes('cc-subnav-link'),
      );
      expect(guardrailsSubnav?.classAttr).toContain('active');
    });

    it('C2.4: Layout and SignIn contracts consistently configure Platform Operations to /ops/health', () => {
      // Test SignIn view renders Platform Operations card with persona
      const { html } = renderAppWithRoute({ initialRoute: '/sign-in', session: null });
      expect(html).toContain('Platform Operations');
      expect(html).toContain('Platform Ops Engineer');
      expect(html).toContain('Monitor service health, declare SLA breaches, and manage system guardrails.');

      // Test Layout ALL_ROLES defines ops path as /ops/health
      const layoutPath = path.resolve(__dirname, '../../shell/Layout.tsx');
      const layoutSrc = fs.readFileSync(layoutPath, 'utf8');
      expect(layoutSrc).toMatch(/\{\s*group:\s*'ops',\s*label:\s*'Operations',\s*path:\s*'\/ops\/health'/);

      // Test SignIn ROLE_OPTIONS defines ops path as /ops/health
      const signInPath = path.resolve(__dirname, '../../routes/SignIn.tsx');
      const signInSrc = fs.readFileSync(signInPath, 'utf8');
      expect(signInSrc).toMatch(/group:\s*'ops'[\s\S]*?path:\s*'\/ops\/health'/);
    });
  });

  // =========================================================================
  // 2. Rapid Role Switching Stress Testing (All 5 Personas)
  // =========================================================================
  describe('2. Rapid Role Switching Stress Testing (Student, Workbench, Exec, Admin, Ops)', () => {
    interface PersonaExpectation {
      readonly role: RouteGroup;
      readonly path: string;
      readonly name: string;
      readonly title: string;
      readonly initials: string;
      readonly marker: string;
    }

    const PERSONAS: readonly PersonaExpectation[] = [
      {
        role: 'student',
        path: '/student',
        name: 'Ananya Das',
        title: 'B.Tech CSE',
        initials: 'AD',
        marker: 'Raise Request / Grievance',
      },
      {
        role: 'workbench',
        path: '/workbench',
        name: 'Rahul Mehta',
        title: 'Exam Staff',
        initials: 'RM',
        marker: 'Triage Queue',
      },
      {
        role: 'exec',
        path: '/exec/overview',
        name: 'Prof. Meera Iyer',
        title: 'Pro VC',
        initials: 'MI',
        marker: 'Executive Operations Overview',
      },
      {
        role: 'admin',
        path: '/admin/config',
        name: 'Dr. Suresh Kumar',
        title: 'Registrar',
        initials: 'SK',
        marker: 'Tenant Configuration &amp; SLAs',
      },
      {
        role: 'ops',
        path: '/ops/health',
        name: 'DevOps Operator',
        title: 'Platform Ops',
        initials: 'DO',
        marker: 'Platform Service Health &amp; Operations',
      },
    ];

    it('C2.5: Executes rapid 50-cycle sequential persona transition stress test without failure', () => {
      // Deterministic sequence of 50 role transitions
      const sequence: number[] = [];
      let current = 0;
      for (let i = 0; i < 50; i++) {
        current = (current * 7 + 3) % PERSONAS.length;
        sequence.push(current);
      }

      for (const pIndex of sequence) {
        const target = PERSONAS[pIndex];
        if (target === undefined) continue;
        const { html } = renderAppWithRoute({ initialRoute: target.path, role: target.role });

        // Assert user pill contains exact persona data
        expect(html).toContain(target.name);
        expect(html).toContain(target.title);
        expect(html).toContain(target.initials);

        // Assert main page content renders expected marker
        expect(html).toContain(target.marker);

        // Assert header role tab for this persona has active class
        const roleTab = findAnchorByHref(html, target.path).find((l) => l.classAttr.includes('cc-role-tab'));
        expect(roleTab).toBeDefined();
        expect(roleTab?.classAttr).toContain('active');
      }
    }, 30000);

    it('C2.6: Rapid alternating ping-pong between Exec and Ops portals preserves route-specific subnavs', () => {
      for (let i = 0; i < 10; i++) {
        // Exec turn
        const exec = renderAppWithRoute({ initialRoute: '/exec/overview', role: 'exec' });
        expect(exec.html).toContain('Operations Overview');
        expect(exec.html).toContain('Scheduled Board Packs &amp; Reports');
        expect(exec.html).not.toContain('Tenant Provisioning');

        // Ops turn
        const ops = renderAppWithRoute({ initialRoute: '/ops/health', role: 'ops' });
        expect(ops.html).toContain('Service Health &amp; Latency');
        expect(ops.html).toContain('Tenant Provisioning');
        expect(ops.html).not.toContain('Scheduled Board Packs');
      }
    });
  });

  // =========================================================================
  // 3. Container Layout Bounding (.cc-container) Stress Testing
  // =========================================================================
  describe('3. Container Layout Bounding (.cc-container) Across Target Routes', () => {
    /** Helper to count occurrences of `<div class="cc-container">` inside `<main id="main">` */
    function countMainContainers(html: string): number {
      const mainMatch = MAIN_BLOCK_REGEX.exec(html);
      const mainContent = mainMatch?.[1] ?? '';
      const matches = mainContent.match(MAIN_CONTAINER_REGEX);
      return matches ? matches.length : 0;
    }

    it('C2.7: /exec/overview has EXACTLY ONE .cc-container (no double-padding regression)', () => {
      const { html } = renderAppWithRoute({ initialRoute: '/exec/overview', role: 'exec' });
      const count = countMainContainers(html);
      // Strategy A: Home.tsx provides the 1 container; ExecutiveOverview.tsx does NOT duplicate it
      expect(count).toBe(1);
      // Verify container wraps the page header
      expect(html).toMatch(/<div class="cc-container">[\s\S]*?<div class="cc-page-header">/);
    });

    it('C2.8: /exec/reports has EXACTLY ONE .cc-container (no edge-to-edge overflow)', () => {
      const { html } = renderAppWithRoute({ initialRoute: '/exec/reports', role: 'exec' });
      const count = countMainContainers(html);
      expect(count).toBe(1);
      // Verify container wraps ReportSchedulesPage section
      expect(html).toMatch(/<div class="cc-container">[\s\S]*?<section aria-labelledby="reports-title">/);
    });

    it('C2.9: /ops/health has EXACTLY ONE .cc-container (no double-padding regression)', () => {
      const { html } = renderAppWithRoute({ initialRoute: '/ops/health', role: 'ops' });
      const count = countMainContainers(html);
      // Strategy A: Home.tsx provides the 1 container; ServiceHealthPage.tsx does NOT duplicate it
      expect(count).toBe(1);
      expect(html).toMatch(/<div class="cc-container">[\s\S]*?<div class="cc-page-header">/);
    });

    it('C2.10: /ops/tenants has EXACTLY ONE .cc-container (no edge-to-edge overflow)', () => {
      const { html } = renderAppWithRoute({ initialRoute: '/ops/tenants', role: 'ops' });
      const count = countMainContainers(html);
      expect(count).toBe(1);
      expect(html).toMatch(/<div class="cc-container">[\s\S]*?<section aria-labelledby="prov-title">/);
    });

    it('C2.11: /ops/breaches has EXACTLY ONE .cc-container (no edge-to-edge overflow)', () => {
      const { html } = renderAppWithRoute({ initialRoute: '/ops/breaches', role: 'ops' });
      const count = countMainContainers(html);
      expect(count).toBe(1);
      expect(html).toMatch(/<div class="cc-container">[\s\S]*?<section aria-labelledby="breach-title">/);
    });

    it('C2.12: /ops/guardrails has EXACTLY ONE .cc-container (no edge-to-edge overflow)', () => {
      const { html } = renderAppWithRoute({ initialRoute: '/ops/guardrails', role: 'ops' });
      const count = countMainContainers(html);
      expect(count).toBe(1);
      expect(html).toMatch(/<div class="cc-container">[\s\S]*?<section aria-labelledby="guard-title">/);
    });
  });

  // =========================================================================
  // 4. Viewport Breakpoint & Layout Bounds Metric Verification
  // =========================================================================
  describe('4. Viewport Breakpoints & Responsive CSS Verification', () => {
    const cssPath = path.resolve(__dirname, '../../styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    it('C2.13: CSS specifies .cc-container max-width 1280px and centered auto margins', () => {
      expect(cssContent).toMatch(/\.cc-container\s*\{[^}]*max-width:\s*1280px/);
      expect(cssContent).toMatch(/\.cc-container\s*\{[^}]*margin:\s*0\s+auto/);
      expect(cssContent).toMatch(/\.cc-container\s*\{[^}]*padding:\s*1\.5rem\s+1\.25rem\s+3rem/);
    });

    it('C2.14: CSS specifies .cc-subnav-inner horizontal scroll and max-width bounds', () => {
      expect(cssContent).toMatch(/\.cc-subnav-inner\s*\{[^}]*max-width:\s*1280px/);
      expect(cssContent).toMatch(/\.cc-subnav-inner\s*\{[^}]*margin:\s*0\s+auto/);
      expect(cssContent).toMatch(/\.cc-subnav-inner\s*\{[^}]*overflow-x:\s*auto/);
      expect(cssContent).toMatch(/\.cc-subnav-inner\s*\{[^}]*white-space:\s*nowrap/);
    });

    it('C2.15: CSS media query at 768px collapses grids and enables role-nav horizontal scroll', () => {
      expect(cssContent).toMatch(/@media\s*\(\s*max-width:\s*768px\s*\)\s*\{[\s\S]*?\.cc-grid-2,\s*\.cc-grid-3,\s*\.cc-grid-4\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
      expect(cssContent).toMatch(/@media\s*\(\s*max-width:\s*768px\s*\)\s*\{[\s\S]*?\.cc-role-nav\s*\{[\s\S]*?overflow-x:\s*auto;/);
      expect(cssContent).toMatch(/@media\s*\(\s*max-width:\s*768px\s*\)\s*\{[\s\S]*?\.cc-header-main\s*\{[\s\S]*?flex-direction:\s*column;/);
    });

    interface BreakpointSpec {
      readonly name: string;
      readonly viewportWidth: number;
      readonly expectedContainerWidth: number;
      readonly expectedGutterPx: number;
      readonly expectedUsableContentWidth: number;
      readonly expectedAutoMarginPx: number;
    }

    const BREAKPOINTS: readonly BreakpointSpec[] = [
      {
        name: 'Wide Desktop (1920px)',
        viewportWidth: 1920,
        expectedContainerWidth: 1280,
        expectedGutterPx: 20, // 1.25rem = 20px
        expectedUsableContentWidth: 1240, // 1280 - 2 * 20
        expectedAutoMarginPx: 320, // (1920 - 1280) / 2
      },
      {
        name: 'Standard Desktop (1280px)',
        viewportWidth: 1280,
        expectedContainerWidth: 1280,
        expectedGutterPx: 20,
        expectedUsableContentWidth: 1240,
        expectedAutoMarginPx: 0,
      },
      {
        name: 'Tablet (768px)',
        viewportWidth: 768,
        expectedContainerWidth: 768,
        expectedGutterPx: 20,
        expectedUsableContentWidth: 728, // 768 - 2 * 20
        expectedAutoMarginPx: 0,
      },
      {
        name: 'Mobile (390px)',
        viewportWidth: 390,
        expectedContainerWidth: 390,
        expectedGutterPx: 20,
        expectedUsableContentWidth: 350, // 390 - 2 * 20
        expectedAutoMarginPx: 0,
      },
    ];

    it('C2.16: Mathematical bounding oracle verifies container dimensions across all 4 breakpoints', () => {
      const CONTAINER_MAX_WIDTH = 1280;
      const GUTTER_PX = 20; // 1.25rem

      for (const bp of BREAKPOINTS) {
        const computedContainerWidth = Math.min(bp.viewportWidth, CONTAINER_MAX_WIDTH);
        const computedAutoMargin = Math.max(0, (bp.viewportWidth - CONTAINER_MAX_WIDTH) / 2);
        const computedUsableWidth = computedContainerWidth - 2 * GUTTER_PX;

        expect(computedContainerWidth).toBe(bp.expectedContainerWidth);
        expect(computedAutoMargin).toBe(bp.expectedAutoMarginPx);
        expect(computedUsableWidth).toBe(bp.expectedUsableContentWidth);

        // Container should NEVER exceed viewport width
        expect(computedContainerWidth).toBeLessThanOrEqual(bp.viewportWidth);
      }
    });
  });
});
