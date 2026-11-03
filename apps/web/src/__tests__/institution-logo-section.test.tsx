import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../i18n/LanguageSelector', () => ({
  LanguageSelector: () => null,
}));
import {
  containsEmoji,
  setStoredLogo,
  getStoredLogo,
  resetStoredLogo,
  DEFAULT_LOGO_VALUE,
} from '../branding/logoStorage';
import { BrandLogo } from '../branding/BrandLogo';
import { InstitutionLogoSection } from '../branding/InstitutionLogoSection';
import { Layout } from '../shell/Layout';
import { SessionProvider } from '../auth/session';

describe('Institution Logo Section & Anti-Emoji Validation', () => {
  beforeEach(() => {
    resetStoredLogo();
  });

  describe('containsEmoji validator', () => {
    it('detects standard and pictographic emojis', () => {
      expect(containsEmoji('🏛️')).toBe(true);
      expect(containsEmoji('🎓')).toBe(true);
      expect(containsEmoji('🔥')).toBe(true);
      expect(containsEmoji('🚀')).toBe(true);
      expect(containsEmoji('icon 🏛️ logo')).toBe(true);
      expect(containsEmoji('🎉')).toBe(true);
    });

    it('passes standard image paths, URLs, and SVG strings', () => {
      expect(containsEmoji('/icon.svg')).toBe(false);
      expect(containsEmoji('https://example.edu/assets/crest.png')).toBe(false);
      expect(containsEmoji('<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>')).toBe(false);
      expect(containsEmoji('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false);
      expect(containsEmoji('nit-crest')).toBe(false);
    });
  });

  describe('Logo Storage Policy', () => {
    it('rejects saving an emoji as institution logo', () => {
      const result = setStoredLogo('🏛️');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Emojis are strictly prohibited');
      expect(getStoredLogo()).toBe(DEFAULT_LOGO_VALUE);
    });

    it('successfully saves a valid custom icon path', () => {
      const customPath = '/assets/custom-institution-crest.svg';
      const result = setStoredLogo(customPath);
      expect(result.ok).toBe(true);
      expect(getStoredLogo()).toBe(customPath);
    });

    it('resets back to default logo asset', () => {
      setStoredLogo('/assets/custom-crest.svg');
      expect(getStoredLogo()).toBe('/assets/custom-crest.svg');
      resetStoredLogo();
      expect(getStoredLogo()).toBe(DEFAULT_LOGO_VALUE);
    });
  });

  describe('BrandLogo Component', () => {
    it('renders vector icon without any emoji', () => {
      const html = renderToString(<BrandLogo size={32} />);
      expect(html).not.toContain('🏛️');
      expect(html).toContain('img');
    });

    it('falls back to vector crest if emoji is provided as customSrc', () => {
      const html = renderToString(<BrandLogo customSrc="🏛️" />);
      // Should sanitize and block the emoji from appearing
      expect(html).not.toContain('🏛️');
      expect(html).toContain('svg');
    });

    it('renders preset vector crests properly', () => {
      const html = renderToString(<BrandLogo customSrc="jis-crest" />);
      expect(html).not.toContain('🏛️');
      expect(html).toContain('svg');
      expect(html).toContain('viewBox="0 0 64 64"');
    });
  });

  describe('InstitutionLogoSection UI Component', () => {
    it('displays the strict emoji restriction notice and custom icon controls', () => {
      const html = renderToString(<InstitutionLogoSection />);
      expect(html).toContain('Emoji Restriction:');
      expect(html).toContain('No emojis allowed');
      expect(html).toContain('Institution Logo &amp; Identity (Custom Icons)');
      expect(html).toContain('Header Lockup Logo');
      expect(html).toContain('Upload Institution Icon File');
    });
  });

  describe('Layout Navigation Header Logo Lockup & Permissions', () => {
    it('renders BrandLogo inside .cc-brand-logo and restricts customize trigger to admin', () => {
      const queryClient = new QueryClient();

      // Student route: student cannot edit logo
      const studentHtml = renderToString(
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <MemoryRouter initialEntries={['/student']}>
              <Layout title="Test" />
            </MemoryRouter>
          </SessionProvider>
        </QueryClientProvider>
      );
      expect(studentHtml).toContain('cc-brand-lockup');
      expect(studentHtml).toContain('cc-brand-logo');
      expect(studentHtml).not.toContain('🏛️');
      expect(studentHtml).not.toContain('cc-logo-customize-trigger');

      // Admin route: admin can edit logo
      const adminHtml = renderToString(
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <MemoryRouter initialEntries={['/admin/config']}>
              <Layout title="Test" />
            </MemoryRouter>
          </SessionProvider>
        </QueryClientProvider>
      );
      expect(adminHtml).toContain('cc-brand-lockup');
      expect(adminHtml).toContain('cc-brand-logo');
      expect(adminHtml).toContain('cc-logo-customize-trigger');
      expect(adminHtml).toContain('CampusConnect');
      expect(adminHtml).toContain('JIS UNIVERSITY');
    });
  });
});
