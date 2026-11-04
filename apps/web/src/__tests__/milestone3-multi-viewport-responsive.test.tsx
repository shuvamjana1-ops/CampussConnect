import { describe, expect, it, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'node:fs';
import path from 'node:path';
import { FloatingDock } from '../components/FloatingDock';
import { LiquidGlassWallpaper, ROLE_ORB_PALETTES } from '../components/LiquidGlassWallpaper';
import { GlassCard } from '../components/GlassCard';
import { SessionProvider, DEMO_USERS_MAP } from '../auth/session';
import { I18nProvider } from '../i18n/I18nProvider';
import LandingPage from '../routes/LandingPage';
import SignIn from '../routes/SignIn';
import SignUp from '../routes/SignUp';
import AdminDashboard from '../routes/(admin)/AdminDashboard';
import StaffDashboard from '../routes/(staff)/StaffDashboard';
import StudentDashboard from '../routes/(student)/StudentDashboard';
import ProfilePage from '../routes/ProfilePage';
import SettingsPage from '../routes/SettingsPage';
import {
  contrastRatio,
  verifiedContrastPairs,
  MIN_TEXT_CONTRAST,
  glassTiers,
  rolePalettes,
} from '../styles/tokens';

function renderWithProviders(ui: React.ReactElement, initialEntry = '/'): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
        </I18nProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

describe('Milestone 3: Responsive Polish, Access Control & Obsolete Asset Verification', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('1. Multi-Viewport Responsive Layout Polish (375px, 768px, 1440px)', () => {
    it('verifies FloatingDock geometry enforces safe mobile bounds on 375px viewport', () => {
      const html = renderWithProviders(<FloatingDock />);
      expect(html).toContain('campusconnect-dock-container');
      expect(html).toContain('calc(100vw - 20px)');
      expect(html).toContain('overflow-x:auto');
      expect(html).toContain('scrollbar-width:none');
    });

    it('verifies responsive GlassCard renders with fluid containment across viewport widths', () => {
      const mobileCard = renderToString(
        <GlassCard material="glass" style={{ width: '100%', maxWidth: '375px' }}>
          <div>Mobile 375px Card Content</div>
        </GlassCard>
      );
      expect(mobileCard).toContain('Mobile 375px Card Content');
      expect(mobileCard).toContain('cc-glass-card');

      const desktopCard = renderToString(
        <GlassCard material="glass-strong" style={{ width: '100%', maxWidth: '1440px' }}>
          <div>Desktop 1440px Card Content</div>
        </GlassCard>
      );
      expect(desktopCard).toContain('Desktop 1440px Card Content');
      expect(desktopCard).toContain('cc-glass-card');
    });

    it('renders all public pages cleanly without horizontal breakages for 375px mobile viewports', () => {
      const landingHtml = renderWithProviders(<LandingPage />);
      expect(landingHtml).toContain('CampusConnect');
      expect(landingHtml).toContain('overflow-x:hidden');

      const signInHtml = renderWithProviders(<SignIn />);
      expect(signInHtml).toContain('Sign In to Your Portal');
      expect(signInHtml).toContain('max-width:1020px');

      const signUpHtml = renderWithProviders(<SignUp />);
      expect(signUpHtml).toContain('Create Institutional Account');
      expect(signUpHtml).toContain('max-width:620px');
    });

    it('renders all authenticated dashboards cleanly for tablet (768px) and desktop (1440px)', () => {
      const adminHtml = renderWithProviders(<AdminDashboard />);
      expect(adminHtml).toContain('SUPER-USER ADMINISTRATIVE COMMAND CENTER');

      const staffHtml = renderWithProviders(<StaffDashboard />);
      expect(staffHtml).toContain('STAFF RESOLUTION WORKSPACE');

      const studentHtml = renderWithProviders(<StudentDashboard />);
      expect(studentHtml).toContain('STUDENT IDENTITY PORTAL');

      const profileHtml = renderWithProviders(<ProfilePage />);
      expect(profileHtml).toContain('USER IDENTITY &amp; PERSONAL DOSSIER');

      const settingsHtml = renderWithProviders(<SettingsPage />);
      expect(settingsHtml).toContain('System Settings &amp; Configuration');
    });
  });

  describe('2. Functionality & Access Control Verification', () => {
    it('verifies all 5 demo accounts are registered with correct roles and credentials', () => {
      const accounts = [
        { email: 'admin@demo.com', role: 'admin', name: 'Dr. Suresh Kumar' },
        { email: 'worker1@demo.com', role: 'worker', name: 'Prof. Rahul Mehta' },
        { email: 'worker2@demo.com', role: 'worker', name: 'Er. Dilip Roy' },
        { email: 'student1@demo.com', role: 'student', name: 'Ananya Das' },
        { email: 'student2@demo.com', role: 'student', name: 'Rohan Sharma' },
      ];

      for (const acc of accounts) {
        const found = DEMO_USERS_MAP[acc.email];
        expect(found, `Account ${acc.email} must exist`).toBeDefined();
        expect(found?.profile.role).toBe(acc.role);
        expect(found?.profile.full_name).toBe(acc.name);
        expect(found?.pass.length).toBeGreaterThan(6);
      }
    });

    it('verifies SignIn page exposes one-click autofill for admin, staff (1 & 2), and student (1 & 2)', () => {
      const html = renderWithProviders(<SignIn />);
      expect(html).toContain('admin@demo.com');
      expect(html).toContain('worker1@demo.com');
      expect(html).toContain('worker2@demo.com');
      expect(html).toContain('student1@demo.com');
      expect(html).toContain('student2@demo.com');
      expect(html).toContain('Fill →');
    });

    it('verifies role palettes maintain unique themes and orb color definitions', () => {
      expect(rolePalettes.admin.accent).toBe('#6366f1'); // Indigo
      expect(rolePalettes.staff.accent).toBe('#0d9488'); // Teal
      expect(rolePalettes.student.accent).toBe('#2563eb'); // Blue

      expect(ROLE_ORB_PALETTES.admin.orbs.length).toBe(4);
      expect(ROLE_ORB_PALETTES.staff.orbs.length).toBe(4);
      expect(ROLE_ORB_PALETTES.student.orbs.length).toBe(4);
      expect(ROLE_ORB_PALETTES.default.orbs.length).toBe(4);
    });

    it('verifies light and dark wallpaper variants render with dynamic opacity tokens', () => {
      const lightWallpaper = renderToString(
        <LiquidGlassWallpaper role="admin" theme="light" disableAnimation />
      );
      expect(lightWallpaper).toContain('data-role-palette="admin"');
      expect(lightWallpaper).toContain('data-theme-override="light"');

      const darkWallpaper = renderToString(
        <LiquidGlassWallpaper role="staff" theme="dark" disableAnimation />
      );
      expect(darkWallpaper).toContain('data-role-palette="staff"');
      expect(darkWallpaper).toContain('data-theme-override="dark"');
    });
  });

  describe('3. Text Contrast & Accessibility Verification (WCAG AA >= 4.5:1)', () => {
    it('verifies all predefined contrast pairs meet or exceed 4.5:1 ratio', () => {
      for (const pair of verifiedContrastPairs) {
        const ratio = contrastRatio(pair.fg, pair.bg);
        expect(
          ratio,
          `Contrast ratio for ${pair.label} (${pair.fg} on ${pair.bg}) must be >= ${MIN_TEXT_CONTRAST}`
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    });

    it('verifies glass material tiers define required blur, saturation and fallback standards', () => {
      expect(glassTiers.glass.blur).toBe('24px');
      expect(glassTiers.glassStrong.blur).toBe('38px');
      expect(glassTiers.glassSubtle.blur).toBe('16px');

      expect(glassTiers.glass.fallbackLight).toBe('#ffffff');
      expect(glassTiers.glass.fallbackDark).toBe('#14141e');
      expect(glassTiers.glassStrong.fallbackDark).toBe('#101118');
    });
  });

  describe('4. Obsolete Component & Asset Purge Verification', () => {
    const webRoot = path.resolve(__dirname, '..');

    it('verifies TaskDelayPreloader.tsx is deleted', () => {
      const filePath = path.join(webRoot, 'components', 'TaskDelayPreloader.tsx');
      expect(fs.existsSync(filePath), 'TaskDelayPreloader.tsx must be deleted').toBe(false);
    });

    it('verifies ImageCompressorUploader.tsx is deleted', () => {
      const filePath = path.join(webRoot, 'components', 'ImageCompressorUploader.tsx');
      expect(fs.existsSync(filePath), 'ImageCompressorUploader.tsx must be deleted').toBe(false);
    });

    it('verifies OfflineIndicator.tsx is deleted', () => {
      const filePath = path.join(webRoot, 'pwa', 'OfflineIndicator.tsx');
      expect(fs.existsSync(filePath), 'OfflineIndicator.tsx must be deleted').toBe(false);
    });

    it('verifies exec-meera.svg is deleted', () => {
      const filePath = path.resolve(webRoot, '..', 'public', 'assets', 'profiles', 'exec-meera.svg');
      expect(fs.existsSync(filePath), 'exec-meera.svg must be deleted').toBe(false);
    });
  });
});
