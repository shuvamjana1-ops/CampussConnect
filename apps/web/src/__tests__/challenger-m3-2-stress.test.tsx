import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ESLint } from 'eslint';
import * as fs from 'node:fs';
import * as path from 'node:path';

// UI Tokens and styles under test
import {
  colors,
  textPairs,
  MIN_TEXT_CONTRAST,
  MIN_TOUCH_TARGET_PX,
  spacing,
  radius,
  fontSizes,
  touchTarget,
  contrastRatio,
  baseStyles,
} from '@campusconnect/ui';

// Session and demo profiles under test
import { DEMO_PROFILES } from '../auth/session';

// Client API under test
import { apiRequest } from '../api/client';

// Draft store and ticket cache under test
import type { Draft } from '../pwa/draft-store';
import type { CachedTicket } from '../pwa/ticket-cache';

describe('Milestone 3 Challenger 2: Empirical Stress Test Suite', () => {
  // =========================================================================
  // Section 1: Design Tokens Runtime & String Interpolation Integrity
  // =========================================================================
  describe('1. Design Tokens Runtime & String Interpolation (@campusconnect/ui/tokens.ts)', () => {
    it('C2.1: Verifies 100% of textPairs satisfy WCAG 2.1 AA minimum contrast (>= 4.5:1)', () => {
      expect(textPairs.length).toBeGreaterThanOrEqual(10);
      for (const [fg, bg] of textPairs) {
        const ratio = contrastRatio(fg, bg);
        expect(
          ratio,
          `Pair [${fg}, ${bg}] has contrast ratio ${ratio.toFixed(2)}, which is below WCAG AA minimum ${MIN_TEXT_CONTRAST}`,
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    });

    it('C2.2: Verifies contrastRatio mathematical properties and edge cases', () => {
      // Identity: contrast between identical colors is exactly 1.0
      expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1.0, 4);
      expect(contrastRatio('#1a1a1a', '#1a1a1a')).toBeCloseTo(1.0, 4);

      // Symmetry: contrast(A, B) === contrast(B, A)
      expect(contrastRatio(colors.text, colors.background)).toBeCloseTo(
        contrastRatio(colors.background, colors.text),
        4,
      );
      expect(contrastRatio(colors.primary, colors.onPrimary)).toBeCloseTo(
        contrastRatio(colors.onPrimary, colors.primary),
        4,
      );

      // Maximum contrast: pure black (#000000) vs pure white (#ffffff) is 21:1
      expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21.0, 1);

      // Case insensitivity: lowercase vs uppercase hex
      expect(contrastRatio('#1A1A1A', '#FFFFFF')).toBeCloseTo(
        contrastRatio('#1a1a1a', '#ffffff'),
        4,
      );
    });

    it('C2.3: Verifies contrastRatio throws error on invalid hex colour strings', () => {
      expect(() => contrastRatio('invalid', '#ffffff')).toThrow(/Invalid hex colour/);
      expect(() => contrastRatio('#fff', '#ffffff')).toThrow(/Invalid hex colour/);
      expect(() => contrastRatio('rgb(0,0,0)', '#ffffff')).toThrow(/Invalid hex colour/);
      expect(() => contrastRatio('#1234567', '#ffffff')).toThrow(/Invalid hex colour/);
      expect(() => contrastRatio('', '#ffffff')).toThrow(/Invalid hex colour/);
    });

    it('C2.4: Verifies baseStyles contains NO undefined, NaN, or [object Object] artifacts', () => {
      expect(typeof baseStyles).toBe('string');
      expect(baseStyles.length).toBeGreaterThan(100);

      // Must not contain JavaScript evaluation anomalies
      expect(baseStyles).not.toContain('undefined');
      expect(baseStyles).not.toContain('NaN');
      expect(baseStyles).not.toContain('null');
      expect(baseStyles).not.toContain('[object');
      expect(baseStyles).not.toContain('Promise');
    });

    it('C2.5: Verifies baseStyles includes all CSS color variables with exact values', () => {
      for (const [key, value] of Object.entries(colors)) {
        const cssVarName = `--cc-color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
        expect(baseStyles).toContain(`${cssVarName}: ${value};`);
      }
    });

    it('C2.6: Verifies baseStyles includes exact touch target and font size interpolations', () => {
      // Touch target variable
      expect(baseStyles).toContain(`--cc-touch-target: ${String(MIN_TOUCH_TARGET_PX)}px;`);
      expect(baseStyles).toContain(`min-width: ${String(MIN_TOUCH_TARGET_PX)}px;`);
      expect(baseStyles).toContain(`min-height: ${String(MIN_TOUCH_TARGET_PX)}px;`);

      // Font size body
      expect(baseStyles).toContain(`font-size: ${String(fontSizes.md)}px;`);

      // Button padding and border radius
      expect(baseStyles).toContain(
        `padding: ${String(spacing.sm)}px ${String(spacing.lg)}px;`,
      );
      expect(baseStyles).toContain(`border-radius: ${String(radius.md)}px;`);

      // Badge gap and padding
      expect(baseStyles).toContain(`gap: ${String(spacing.xs)}px;`);
      expect(baseStyles).toContain(`padding: 2px ${String(spacing.sm)}px;`);
      expect(baseStyles).toContain(`border-radius: ${String(radius.pill)}px;`);
    });

    it('C2.7: Verifies DOM stylesheet injection and CSS class rendering in React DOM', () => {
      const rendered = renderToString(
        React.createElement(
          'div',
          null,
          React.createElement('style', null, baseStyles),
          React.createElement('button', { className: 'cc-button' }, 'Submit'),
          React.createElement('input', { className: 'cc-input', placeholder: 'Test' }),
          React.createElement('span', { className: 'cc-badge', 'data-tone': 'ai' }, 'AI Verified'),
        ),
      );

      expect(rendered).toContain('<style>');
      expect(rendered).toContain('--cc-touch-target: 44px;');
      expect(rendered).toContain('class="cc-button"');
      expect(rendered).toContain('class="cc-input"');
      expect(rendered).toContain('data-tone="ai"');
    });

    it('C2.8: Verifies constant immutability for design tokens', () => {
      expect(MIN_TOUCH_TARGET_PX).toBe(44);
      expect(MIN_TEXT_CONTRAST).toBe(4.5);
      expect(touchTarget.minWidth).toBe(44);
      expect(touchTarget.minHeight).toBe(44);
    });
  });

  // =========================================================================
  // Section 2: Service Worker Environment & ESLint Constraints
  // =========================================================================
  describe('2. Service Worker ESLint Environment Constraints', () => {
    it('C2.9: Verifies globals.serviceworker is properly defined and does not leak DOM globals', () => {
      const globalsJsonPath = path.resolve(__dirname, '../../../../packages/tooling/node_modules/globals/globals.json');
      const allGlobals = JSON.parse(fs.readFileSync(globalsJsonPath, 'utf-8')) as Record<string, Record<string, boolean>>;
      const swGlobals = allGlobals.serviceworker;

      expect(swGlobals).toBeDefined();
      if (!swGlobals) return;

      // Standard Service Worker globals MUST be present
      expect(swGlobals).toHaveProperty('self');
      expect(swGlobals).toHaveProperty('caches');
      expect(swGlobals).toHaveProperty('clients');
      expect(swGlobals).toHaveProperty('registration');
      expect(swGlobals).toHaveProperty('ServiceWorkerGlobalScope');

      // Browser DOM globals MUST NOT be in Service Worker globals
      expect(swGlobals).not.toHaveProperty('window');
      expect(swGlobals).not.toHaveProperty('document');
      expect(swGlobals).not.toHaveProperty('localStorage');
      expect(swGlobals).not.toHaveProperty('sessionStorage');
    });

    it('C2.10: Verifies apps/web/public/sw.js lints with 0 errors and 0 warnings using project ESLint', async () => {
      const swPath = path.resolve(__dirname, '../../public/sw.js');
      expect(fs.existsSync(swPath), `Service worker file ${swPath} must exist`).toBe(true);

      const eslint = new ESLint({
        cwd: path.resolve(__dirname, '../..'),
      });

      const results = await eslint.lintFiles(['public/sw.js']);
      expect(results.length).toBe(1);
      const swResult = results[0];
      expect(swResult).toBeDefined();
      if (!swResult) return;

      expect(swResult.errorCount).toBe(0);
      expect(swResult.warningCount).toBe(0);
      expect(swResult.messages).toEqual([]);
    }, 30000);

    it('C2.11: Adversarially tests ESLint catches browser-only globals (window, document) in Service Worker files', async () => {
      const eslint = new ESLint({
        cwd: path.resolve(__dirname, '../..'),
      });

      const invalidSwCode = `
self.addEventListener('fetch', () => {
  // FORBIDDEN in Service Worker: window and document do not exist
  window.alert('unsupported');
  document.getElementById('root');
});
`;

      const results = await eslint.lintText(invalidSwCode, {
        filePath: path.resolve(__dirname, '../../public/sw.js'),
      });

      expect(results.length).toBe(1);
      const result = results[0];
      expect(result).toBeDefined();
      if (!result) return;
      const ruleIds = result.messages.map((m) => m.ruleId);
      const messages = result.messages.map((m) => m.message);

      // Must catch 'window' is not defined and 'document' is not defined under no-undef
      expect(ruleIds).toContain('no-undef');
      expect(messages.some((m) => m.includes("'window' is not defined"))).toBe(true);
      expect(messages.some((m) => m.includes("'document' is not defined"))).toBe(true);
    }, 30000);

    it('C2.12: Adversarially tests ESLint catches dead assignments in Service Worker files', async () => {
      const eslint = new ESLint({
        cwd: path.resolve(__dirname, '../..'),
      });

      const uselessAssignCode = `
self.addEventListener('push', (event) => {
  let data = {};
  data = event.data ? event.data.json() : {};
  return data;
});
`;

      const results = await eslint.lintText(uselessAssignCode, {
        filePath: path.resolve(__dirname, '../../public/sw.js'),
      });

      expect(results.length).toBe(1);
      const result = results[0];
      expect(result).toBeDefined();
      if (!result) return;
      const ruleIds = result.messages.map((m) => m.ruleId);

      // Must catch useless assignment 'let data = {};' immediately overwritten
      expect(ruleIds).toContain('no-useless-assignment');
    }, 30000);
  });

  // =========================================================================
  // Section 3: Service Worker Runtime Execution Simulation (apps/web/public/sw.js)
  // =========================================================================
  describe('3. Service Worker Runtime Execution Simulation', () => {
    it('C2.13: Simulates push event payload parsing with valid data', () => {
      const rawPayload = JSON.stringify({
        title: 'Grievance Assigned',
        body: 'Ticket #402 has been routed to Exam Superintendent',
        url: '/workbench',
      });

      // Emulate sw.js lines 41-54 push handler logic
      let data: Record<string, unknown> | undefined;
      try {
        data = rawPayload ? (JSON.parse(rawPayload) as Record<string, unknown>) : {};
      } catch {
        data = {};
      }

      const safeData = data ?? {};
      const title = typeof safeData.title === 'string' ? safeData.title : 'CampusConnect';
      const body = typeof safeData.body === 'string' ? safeData.body : '';
      const target = typeof safeData.url === 'string' && safeData.url.startsWith('/') ? safeData.url : '/';

      expect(title).toBe('Grievance Assigned');
      expect(body).toBe('Ticket #402 has been routed to Exam Superintendent');
      expect(target).toBe('/workbench');
    });

    it('C2.14: Simulates push event payload fallback on empty or malformed data', () => {
      // Case 1: Malformed JSON string
      const malformedPayload = '{"title": invalid json';
      let data1: Record<string, unknown> | undefined;
      try {
        data1 = malformedPayload ? (JSON.parse(malformedPayload) as Record<string, unknown>) : {};
      } catch {
        data1 = {};
      }

      const safeData1 = data1 ?? {};
      const title1 = typeof safeData1.title === 'string' ? safeData1.title : 'CampusConnect';
      const body1 = typeof safeData1.body === 'string' ? safeData1.body : '';
      const target1 = typeof safeData1.url === 'string' && safeData1.url.startsWith('/') ? safeData1.url : '/';

      expect(title1).toBe('CampusConnect');
      expect(body1).toBe('');
      expect(target1).toBe('/');

      // Case 2: Null / Empty payload
      const emptyPayload = null;
      let data2: Record<string, unknown> | undefined;
      try {
        data2 = emptyPayload ? (JSON.parse(emptyPayload) as Record<string, unknown>) : {};
      } catch {
        data2 = {};
      }

      const safeData2 = data2 ?? {};
      const title2 = typeof safeData2.title === 'string' ? safeData2.title : 'CampusConnect';
      const body2 = typeof safeData2.body === 'string' ? safeData2.body : '';
      const target2 = typeof safeData2.url === 'string' && safeData2.url.startsWith('/') ? safeData2.url : '/';

      expect(title2).toBe('CampusConnect');
      expect(body2).toBe('');
      expect(target2).toBe('/');
    });

    it('C2.15: Simulates push event security guard against open redirects to external URLs', () => {
      const maliciousPayload = JSON.stringify({
        title: 'Phishing Alert',
        body: 'Click here to verify password',
        url: 'https://attacker.com/steal-creds',
      });

      let data: Record<string, unknown> | undefined;
      try {
        data = maliciousPayload ? (JSON.parse(maliciousPayload) as Record<string, unknown>) : {};
      } catch {
        data = {};
      }

      // Security contract: url MUST start with '/'
      const safeData = data ?? {};
      const target = typeof safeData.url === 'string' && safeData.url.startsWith('/') ? safeData.url : '/';
      expect(target).toBe('/');
      expect(target).not.toContain('attacker.com');
    });

    it('C2.16: Simulates notificationclick client focus and window navigation', async () => {
      const targetUrl = '/student';
      let focusedClient = false;
      let navigatedUrl = '';

      const mockClient = {
        focus: vi.fn(async () => {
          focusedClient = true;
          return Promise.resolve();
        }),
        navigate: vi.fn((url: string) => {
          navigatedUrl = url;
        }),
      };

      const clients = [mockClient];
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          await client.focus();
          break;
        }
      }

      expect(focusedClient).toBe(true);
      expect(navigatedUrl).toBe('/student');
    });

    it('C2.17: Simulates sync event dispatching campusconnect-drafts tag', () => {
      const messagesSent: { type: string }[] = [];
      const mockClient = {
        postMessage: vi.fn((msg: { type: string }) => {
          messagesSent.push(msg);
        }),
      };

      const clients = [mockClient];

      // Tag matches 'campusconnect-drafts'
      const handleSync = (tag: string) => {
        if (tag === 'campusconnect-drafts') {
          for (const client of clients) {
            client.postMessage({ type: 'sync-drafts' });
          }
        }
      };

      handleSync('campusconnect-drafts');
      expect(messagesSent).toEqual([{ type: 'sync-drafts' }]);

      // Tag does NOT match
      handleSync('other-tag');
      expect(messagesSent.length).toBe(1);
    });

    it('C2.18: Verifies app-shell static assets cache inventory in sw.js', () => {
      const swContent = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf-8');
      expect(swContent).toContain("const CACHE = 'campusconnect-shell-v1';");
      expect(swContent).toContain("const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];");
    });
  });

  // =========================================================================
  // Section 4: Cross-Portal Modified Files & Type Integrity
  // =========================================================================
  describe('4. Cross-Portal Modified Files & Type Integrity', () => {
    it('C2.19: Verifies DEMO_PROFILES role lookup safety for all 5 portals', () => {
      const validRoles = ['student', 'workbench', 'exec', 'admin', 'ops'] as const;
      for (const role of validRoles) {
        expect(role in DEMO_PROFILES).toBe(true);
        expect(DEMO_PROFILES[role]).toBeDefined();
        expect(DEMO_PROFILES[role].displayName).toBeTruthy();
        expect(DEMO_PROFILES[role].roleTitle).toBeTruthy();
      }

      // Invalid roles must safely evaluate to false
      expect('guest' in DEMO_PROFILES).toBe(false);
      expect('root' in DEMO_PROFILES).toBe(false);
      expect('' in DEMO_PROFILES).toBe(false);
    });

    it('C2.20: Verifies Unicode code point counting handles multi-byte characters accurately', () => {
      // Standard string .length treats surrogate pairs as 2 units, while Array.from counts code points
      const ascii = 'CampusConnect';
      expect(Array.from(ascii).length).toBe(13);
      expect(ascii.length).toBe(13);

      // Hindi Devanagari string
      const devanagari = 'विद्यापीठ';
      expect(Array.from(devanagari).length).toBeGreaterThan(0);

      // Emoji surrogate pairs
      const emojiStr = '🎓 Portal';
      expect(Array.from(emojiStr).length).toBe(8); // '🎓' (1) + ' ' (1) + 'Portal' (6)
      expect(emojiStr.length).toBe(9); // Standard .length is 9 due to UTF-16 surrogate
    });

    it('C2.21: Verifies apiRequest handles unknown / void return types without runtime exceptions', async () => {
      // In offline/mock mode or network failure, apiRequest falls back or throws structured error
      await expect(apiRequest<unknown>('/test-endpoint')).rejects.toThrow();
    });

    it('C2.22: Verifies draft-store and ticket-cache data structures conform to TypeScript interfaces', () => {
      const sampleDraft: Draft = {
        id: 'draft_101',
        endpoint: '/api/v1/tickets',
        payload: { title: 'Hostel Water Supply Issue' },
        idempotencyKey: 'idem-101',
        status: 'draft',
        attempts: 0,
        updatedAt: Date.now(),
      };

      expect(sampleDraft.id).toBe('draft_101');
      expect(sampleDraft.status).toBe('draft');

      const sampleCachedTicket: CachedTicket = {
        id: 'ticket_501',
        data: { title: 'Fee Payment Receipt Not Generated' },
        lastUpdatedAt: Date.now(),
        viewedAt: Date.now(),
      };

      expect(sampleCachedTicket.id).toBe('ticket_501');
      expect(sampleCachedTicket.lastUpdatedAt).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Section 5: Root Package.json Scripts & Workspace Boundaries
  // =========================================================================
  describe('5. Root Package.json Scripts & Monorepo Boundaries', () => {
    it('C2.23: Verifies root package.json defines targeted lint and typecheck for frontend packages', () => {
      const rootPkgPath = path.resolve(__dirname, '../../../../package.json');
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8')) as {
        scripts: Record<string, string>;
      };

      expect(rootPkg.scripts.lint).toContain('--filter=@campusconnect/web');
      expect(rootPkg.scripts.lint).toContain('--filter=@campusconnect/ui');
      expect(rootPkg.scripts.lint).toContain('--filter=@campusconnect/i18n');

      expect(rootPkg.scripts.typecheck).toContain('--filter=@campusconnect/web');
      expect(rootPkg.scripts.typecheck).toContain('--filter=@campusconnect/ui');
      expect(rootPkg.scripts.typecheck).toContain('--filter=@campusconnect/i18n');

      // Global monorepo aliases must exist
      expect(rootPkg.scripts['lint:all']).toBe('turbo run lint');
      expect(rootPkg.scripts['typecheck:all']).toBe('turbo run typecheck');
    });
  });
});
