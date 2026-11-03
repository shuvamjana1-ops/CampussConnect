import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from '../auth/session';
import { I18nProvider } from '../i18n/I18nProvider';

// Track A Pages
import LandingPage from '../routes/LandingPage';
import SignIn from '../routes/SignIn';
import SignUp from '../routes/SignUp';
import NotFoundPage from '../routes/NotFoundPage';

// Track B Dashboards & Views
import AdminDashboard from '../routes/(admin)/AdminDashboard';
import StaffDashboard from '../routes/(staff)/StaffDashboard';
import WorkerDashboardBridge, { WorkerDashboard, StaffDashboard as StaffDashboardFromBridge } from '../routes/(staff)/WorkerDashboard';
import StudentDashboard from '../routes/(student)/StudentDashboard';
import { AcademicSectionView } from '../components/AcademicSectionView';

// Track C Pages & Main App
import ProfilePage from '../routes/ProfilePage';
import SettingsPage from '../routes/SettingsPage';
import App from '../App';

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

describe('Milestone 2: Liquid Glass Frontend & JIS University Brand Architecture', () => {
  describe('Track A: Public & Authentication Pages', () => {
    it('renders LandingPage with Apple Sequoia Liquid Glass hero and JIS University enterprise branding', () => {
      const html = renderWithProviders(<LandingPage />);
      expect(html).toContain('CampusConnect');
      expect(html).toContain('JIS UNIVERSITY ENTERPRISE');
      expect(html).toContain('Next-Generation College Operating System');
      expect(html).toContain('ZERO-TRUST POSTGRESQL MULTI-ROLE ARCHITECTURE');
      expect(html).toContain('Student Portal');
      expect(html).toContain('Staff Workspace');
      expect(html).toContain('Administrative Command');
      expect(html).not.toContain('CampusFlow');
    });

    it('renders SignIn page with macOS centered frosted window and 1-click quick fill', () => {
      const html = renderWithProviders(<SignIn />);
      expect(html).toContain('CampusConnect');
      expect(html).toContain('JIS University CampusConnect Portal');
      expect(html).toContain('CampusConnect Enterprise Portal');
      expect(html).toContain('Sign In to Your Portal');
      expect(html).toContain('JISU/2024/CSE/0842');
      expect(html).toContain('JISU-STAFF-104');
      expect(html).toContain('JISU-ADM-001');
      expect(html).not.toContain('CampusFlow');
    });

    it('renders SignUp page with dual-mode registration and role selection', () => {
      const html = renderWithProviders(<SignUp />);
      expect(html).toContain('Create Institutional Account');
      expect(html).toContain('CampusConnect');
      expect(html).toContain('JIS UNIVERSITY');
      expect(html).toContain('Select Institutional Role');
      expect(html).toContain('Student Scholar');
      expect(html).toContain('Staff / Faculty');
      expect(html).toContain('Full Name');
      expect(html).toContain('Institutional Email');
      expect(html).not.toContain('CampusFlow');
    });

    it('renders NotFoundPage with macOS 404 card and return pill button', () => {
      const html = renderWithProviders(<NotFoundPage />, '/nonexistent-route-path');
      expect(html).toContain('404');
      expect(html).toContain('Page Not Found');
      expect(html).toContain('CampusConnect architecture');
      expect(html).toContain('Return to CampusConnect');
      expect(html).toContain('Student Portal');
      expect(html).toContain('Staff Workspace');
      expect(html).not.toContain('CampusFlow');
    });
  });

  describe('Track B: Dashboards & Role-Guarded Views', () => {
    it('renders AdminDashboard with super-user command center and universal SLA controls', () => {
      const html = renderWithProviders(<AdminDashboard />);
      expect(html).toContain('SUPER-USER COMMAND CENTER · JIS UNIVERSITY');
      expect(html).toContain('SUPER-USER ADMINISTRATIVE COMMAND CENTER');
      expect(html).toContain('Universal Complaint &amp; Academic Control Desk');
      expect(html).toContain('Student Academic (AC) Control');
      expect(html).toContain('Universal Docket Count');
      expect(html).toContain('SLA Adherence Compliance');
      expect(html).toContain('Student Grievances &amp; Academic AC Cases');
      expect(html).toContain('Work on Case');
      expect(html).not.toContain('CampusFlow');
    });

    it('renders StaffDashboard with staff resolution workspace and triage queue', () => {
      const html = renderWithProviders(<StaffDashboard />);
      expect(html).toContain('STAFF RESOLUTION WORKSPACE · JIS UNIVERSITY');
      expect(html).toContain('Assigned Work Orders &amp; Docket Triage');
      expect(html).toContain('Assigned Student Grievances');
      expect(html).toContain('Work on This Case');
      expect(html).not.toContain('CampusFlow');
    });

    it('provides backward-compatible WorkerDashboard bridge export pointing to StaffDashboard', () => {
      expect(WorkerDashboardBridge).toBe(StaffDashboard);
      expect(WorkerDashboard).toBe(StaffDashboard);
      expect(StaffDashboardFromBridge).toBe(StaffDashboard);

      const html = renderWithProviders(<WorkerDashboardBridge />);
      expect(html).toContain('STAFF RESOLUTION WORKSPACE · JIS UNIVERSITY');
      expect(html).toContain('Assigned Student Grievances');
    });

    it('renders StudentDashboard with live grievance progression tracking stepper', () => {
      const html = renderWithProviders(<StudentDashboard />);
      expect(html).toContain('STUDENT IDENTITY PORTAL · JIS UNIVERSITY');
      expect(html).toContain('My Grievances &amp; Progress');
      expect(html).toContain('Lodge New Ticket');
      expect(html).toContain('Case Resolution Pipeline');
      expect(html).toContain('CS302');
      expect(html).not.toContain('CampusFlow');
    });

    it('renders AcademicSectionView with verified marks and dossier discrepancy flagging', () => {
      const html = renderWithProviders(<AcademicSectionView />);
      expect(html).toContain('ACADEMIC IDENTITY &amp; STUDENT DOSSIER');
      expect(html).toContain('Personal Details &amp; Contact Information');
      expect(html).toContain('Edit AC Personal Data');
      expect(html).toContain('Flag Discrepancy');
      expect(html).toContain('CS302');
      expect(html).not.toContain('CampusFlow');
    });
  });

  describe('Track C: Shared Suite, Routing & Brand Normalization', () => {
    it('renders ProfilePage with circular avatar, institutional presets and RLS protection notice', () => {
      const html = renderWithProviders(<ProfilePage />);
      expect(html).toContain('Profile Photo &amp; Personal Details');
      expect(html).toContain('USER IDENTITY &amp; PERSONAL DOSSIER');
      expect(html).toContain('PostgreSQL RLS Protected');
      expect(html).toContain('Save Profile &amp; Details');
      expect(html).toContain('Presets:');
      expect(html).toContain('Student Ananya');
      expect(html).toContain('Faculty Rahul');
      expect(html).toContain('Dean Suresh');
      expect(html).toContain('Institutional Email');
      expect(html).toContain('Phone Number');
      expect(html).toContain('Roll / Registration Number');
      expect(html).not.toContain('CampusFlow');
    });

    it('renders SettingsPage with brand lockup classes and system telemetry', () => {
      const html = renderWithProviders(<SettingsPage />);
      expect(html).toContain('System Settings &amp; Configuration');
      expect(html).toContain('Appearance &amp; Visual Theme');
      expect(html).toContain('Notification Channels');
      expect(html).toContain('System Telemetry &amp; RLS Protection');
      expect(html).toContain('PostgreSQL RLS Active');
      expect(html).toContain('Supabase Auth v2 (JWT)');
      expect(html).toContain('cc-brand-lockup');
      expect(html).toContain('cc-brand-logo');
      expect(html).not.toContain('CampusFlow');
    });

    it('App router mounts public, authenticated, and 404 routes properly', () => {
      // 1. Landing route
      const landingHtml = renderWithProviders(<App />, '/');
      expect(landingHtml).toContain('CampusConnect');
      expect(landingHtml).toContain('JIS UNIVERSITY ENTERPRISE');

      // 2. SignIn route
      const signInHtml = renderWithProviders(<App />, '/login');
      expect(signInHtml).toContain('Sign In to Your Portal');
      expect(signInHtml).toContain('CampusConnect Enterprise Portal');

      // 3. SignUp route
      const signUpHtml = renderWithProviders(<App />, '/signup');
      expect(signUpHtml).toContain('Create Institutional Account');

      // 4. 404 Fallback route
      const notFoundHtml = renderWithProviders(<App />, '/unknown-wildcard-route-xyz');
      expect(notFoundHtml).toContain('404');
      expect(notFoundHtml).toContain('Page Not Found');
    });
  });
});
