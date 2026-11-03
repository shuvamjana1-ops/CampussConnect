import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  colors,
  textPairs,
  MIN_TEXT_CONTRAST,
  MIN_TOUCH_TARGET_PX,
  spacing,
  radius,
  fontSizes,
  contrastRatio,
  baseStyles,
} from '@campusconnect/ui';
import { globals } from '@campusconnect/tooling/eslint';
import { ApiError } from '../api/client';
import { DEMO_PROFILES } from '../auth/session';
import type { Draft } from '../pwa/draft-store';
import type { CachedTicket } from '../pwa/ticket-cache';

describe('Milestone 3 Challenger 1: Empirical Adversarial & Pipeline Stress Suite', () => {
  // =========================================================================
  // Section 1: Design Tokens Runtime & String Casting Integrity
  // =========================================================================
  describe('1. Design Tokens Runtime & CSS Variable Generation (@campusconnect/ui)', () => {
    it('C1.1: Verifies baseStyles contains all expected CSS custom properties without NaN, undefined, or [object Object]', () => {
      expect(typeof baseStyles).toBe('string');
      expect(baseStyles.length).toBeGreaterThan(100);

      // Verify no template literal interpolation errors leaked into generated CSS
      expect(baseStyles).not.toContain('undefined');
      expect(baseStyles).not.toContain('null');
      expect(baseStyles).not.toContain('NaN');
      expect(baseStyles).not.toContain('[object Object]');

      // Verify touch target CSS variable is properly interpolated
      expect(baseStyles).toContain(`--cc-touch-target: ${String(MIN_TOUCH_TARGET_PX)}px;`);
      expect(baseStyles).toContain(`font-size: ${String(fontSizes.md)}px;`);
      expect(baseStyles).toContain(`border-radius: ${String(radius.md)}px;`);
    });

    it('C1.2: Verifies touch target accessibility compliance (>= 44px) across all interactive elements', () => {
      expect(MIN_TOUCH_TARGET_PX).toBeGreaterThanOrEqual(44);

      // Verify button, input, select, and tab tokens meet touch target threshold
      expect(baseStyles).toContain(
        `.cc-button, .cc-input, .cc-select, .cc-tab { min-width: ${String(MIN_TOUCH_TARGET_PX)}px; min-height: ${String(MIN_TOUCH_TARGET_PX)}px; }`,
      );
    });

    it('C1.3: Verifies WCAG 2.1 AA text contrast ratio on all defined text/background pairs', () => {
      expect(textPairs.length).toBeGreaterThanOrEqual(8);
      for (const [fg, bg] of textPairs) {
        const ratio = contrastRatio(fg, bg);
        expect(
          ratio,
          `Contrast ratio between ${fg} and ${bg} is ${ratio.toFixed(2)}, which must be >= ${String(MIN_TEXT_CONTRAST)}`,
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    });

    it('C1.4: Tests contrastRatio mathematical edge cases (identical colors, inversion symmetry)', () => {
      // Identity: identical colors yield exactly 1.0 contrast ratio
      expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1.0, 3);
      expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1.0, 3);
      expect(contrastRatio(colors.primary, colors.primary)).toBeCloseTo(1.0, 3);

      // Symmetry: contrast(A, B) === contrast(B, A)
      expect(contrastRatio(colors.text, colors.background)).toBeCloseTo(
        contrastRatio(colors.background, colors.text),
        4,
      );
      expect(contrastRatio(colors.primary, colors.onPrimary)).toBeCloseTo(
        contrastRatio(colors.onPrimary, colors.primary),
        4,
      );

      // Maximum contrast (Black vs White) is 21.0
      expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21.0, 1);
    });

    it('C1.5: Verifies font scale and spacing tokens are positive numbers', () => {
      expect(fontSizes.sm).toBeGreaterThan(0);
      expect(fontSizes.md).toBeGreaterThan(fontSizes.sm);
      expect(fontSizes.lg).toBeGreaterThan(fontSizes.md);

      expect(spacing.xs).toBeGreaterThan(0);
      expect(spacing.sm).toBeGreaterThan(spacing.xs);
      expect(spacing.md).toBeGreaterThan(spacing.sm);
      expect(spacing.lg).toBeGreaterThan(spacing.md);
      expect(spacing.xl).toBeGreaterThan(spacing.lg);
    });
  });

  // =========================================================================
  // Section 2: Service Worker & Tooling ESLint Globals Integrity
  // =========================================================================
  describe('2. Service Worker & Tooling ESLint Globals (@campusconnect/tooling/eslint & sw.js)', () => {
    it('C1.6: Verifies tooling/eslint re-exports globals with serviceworker and browser scopes', () => {
      const typedGlobals = globals;
      expect(typedGlobals).toBeDefined();
      expect(typedGlobals.serviceworker).toBeDefined();
      expect(typedGlobals.browser).toBeDefined();
      expect(typedGlobals.node).toBeDefined();

      // Service worker globals must define standard ServiceWorker APIs
      const sw = typedGlobals.serviceworker ?? {};
      expect('self' in sw).toBe(true);
      expect('caches' in sw).toBe(true);
      expect('clients' in sw).toBe(true);
      expect('registration' in sw).toBe(true);
      expect('ServiceWorkerGlobalScope' in sw).toBe(true);

      // Service worker must NOT contain DOM globals that cause runtime errors if accessed
      expect('window' in sw).toBe(false);
      expect('document' in sw).toBe(false);
    });

    it('C1.7: Empirically reads apps/web/public/sw.js and verifies push notification handler logic', () => {
      const swFilePath = path.resolve(__dirname, '../../public/sw.js');
      expect(fs.existsSync(swFilePath)).toBe(true);

      const swContent = fs.readFileSync(swFilePath, 'utf-8');

      // Verify no dead variable assignment 'let data = {};' exists
      expect(swContent).not.toContain('let data = {};');
      expect(swContent).toContain('let data;');

      // Verify push event listener is properly registered
      expect(swContent).toContain("self.addEventListener('push'");
      expect(swContent).toContain("self.addEventListener('fetch'");
      expect(swContent).toContain("self.addEventListener('notificationclick'");

      // Verify open-redirect defense in sw.js: target must start with '/'
      expect(swContent).toContain("data.url.startsWith('/') ? data.url : '/'");
    });

    it('C1.8: Simulates Service Worker push data extraction with diverse payloads', () => {
      // Test function matching sw.js push listener semantics
      const parsePushData = (rawJson: string | null): { title: string; body: string; target: string } => {
        let data: Record<string, unknown> | undefined;
        try {
          data = rawJson ? (JSON.parse(rawJson) as Record<string, unknown>) : {};
        } catch {
          data = {};
        }
        const title = typeof data.title === 'string' ? data.title : 'CampusConnect';
        const body = typeof data.body === 'string' ? data.body : '';
        const target = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
        return { title, body, target };
      };

      // 1. Valid payload with relative target
      const res1 = parsePushData(JSON.stringify({ title: 'Grade Released', body: 'CS101 Grade is out', url: '/student/grades' }));
      expect(res1.title).toBe('Grade Released');
      expect(res1.body).toBe('CS101 Grade is out');
      expect(res1.target).toBe('/student/grades');

      // 2. Malformed JSON payload fallback
      const res2 = parsePushData('invalid-json{{{');
      expect(res2.title).toBe('CampusConnect');
      expect(res2.body).toBe('');
      expect(res2.target).toBe('/');

      // 3. Null / empty payload fallback
      const res3 = parsePushData(null);
      expect(res3.title).toBe('CampusConnect');
      expect(res3.body).toBe('');
      expect(res3.target).toBe('/');

      // 4. Malicious absolute external URL (open-redirect attack vector) sanitized to '/'
      const res4 = parsePushData(JSON.stringify({ title: 'Alert', url: 'https://evil-phishing.com/login' }));
      expect(res4.target).toBe('/');
    });
  });

  // =========================================================================
  // Section 3: Typed Client & Session Authentication Guards
  // =========================================================================
  describe('3. Typed Client & Session Authentication Guards', () => {
    it('C1.9: Verifies ApiError preserves HTTP status and problem document details', () => {
      const errorWithTitle = new ApiError(404, { title: 'Resource Not Found', detail: 'Ticket #999 does not exist' });
      expect(errorWithTitle.status).toBe(404);
      expect(errorWithTitle.message).toBe('Resource Not Found');
      expect(errorWithTitle.problem?.detail).toBe('Ticket #999 does not exist');
      expect(errorWithTitle.name).toBe('ApiError');

      const errorWithoutTitle = new ApiError(500, undefined);
      expect(errorWithoutTitle.status).toBe(500);
      expect(errorWithoutTitle.message).toBe('Request failed with status 500');
    });

    it('C1.10: Verifies DEMO_PROFILES contains all 5 portal personas and guards against invalid roles', () => {
      // 5 required portal roles
      const expectedRoles = ['student', 'workbench', 'exec', 'admin', 'ops'] as const;
      for (const role of expectedRoles) {
        expect(role in DEMO_PROFILES).toBe(true);
        const profile = DEMO_PROFILES[role];
        expect(profile).toBeDefined();
        expect(profile.userId.length).toBeGreaterThan(0);
        expect(profile.displayName.length).toBeGreaterThan(0);
        expect(profile.groups).toContain(role);
      }

      // Guard test: non-existent roles are safely rejected
      const invalidRoles = ['superadmin', 'root', 'guest', 'hacker', ''];
      for (const r of invalidRoles) {
        expect(r in DEMO_PROFILES).toBe(false);
      }

      // Adversarial insight: Prototype inheritance behavior on plain objects
      // 'in' operator checks the prototype chain, whereas Object.hasOwn checks own properties
      expect(Object.hasOwn(DEMO_PROFILES, 'toString')).toBe(false);
      expect(Object.hasOwn(DEMO_PROFILES, 'valueOf')).toBe(false);
    });

    it('C1.11: Verifies draft-store and ticket-cache types conform to PWA contracts', () => {
      const mockDraft: Draft = {
        id: 'draft_student_ticket_1',
        portal: 'student',
        data: {
          category: 'hostel',
          subject: 'Broken Water Pipe',
          description: 'Emergency leak in Block B',
        },
        status: 'pending',
        updatedAt: Date.now(),
      };

      expect(mockDraft.id).toBe('draft_student_ticket_1');
      expect(mockDraft.status).toBe('pending');
      expect(typeof mockDraft.updatedAt).toBe('number');

      const mockTicket: CachedTicket = {
        id: 'ticket_infra_88',
        data: {
          title: 'Campus WiFi Outage',
          status: 'in_progress',
        },
        lastUpdatedAt: Date.now(),
        viewedAt: Date.now(),
      };

      expect(mockTicket.id).toBe('ticket_infra_88');
      expect(mockTicket.lastUpdatedAt).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Section 4: Monorepo Root Script Configuration & Target Filters
  // =========================================================================
  describe('4. Monorepo Root Script Configuration & Target Filters', () => {
    it('C1.12: Verifies root package.json scopes lint and typecheck to frontend workspaces', () => {
      const rootPkgPath = path.resolve(__dirname, '../../../../package.json');
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8')) as {
        scripts: Record<string, string>;
      };

      const { lint, typecheck, build, test } = rootPkg.scripts;

      // Verify lint script targets web, ui, and i18n
      expect(lint).toContain('turbo run lint');
      expect(lint).toContain('--filter=@campusconnect/web');
      expect(lint).toContain('--filter=@campusconnect/ui');
      expect(lint).toContain('--filter=@campusconnect/i18n');

      // Verify typecheck script targets web, ui, and i18n
      expect(typecheck).toContain('turbo run typecheck');
      expect(typecheck).toContain('--filter=@campusconnect/web');
      expect(typecheck).toContain('--filter=@campusconnect/ui');
      expect(typecheck).toContain('--filter=@campusconnect/i18n');

      // Verify root build and test scripts
      expect(build).toBe('turbo run build');
      expect(test).toBe('turbo run test');

      // Verify monorepo-wide fallback aliases
      expect(rootPkg.scripts['lint:all']).toBe('turbo run lint');
      expect(rootPkg.scripts['typecheck:all']).toBe('turbo run typecheck');
    });
  });
});
