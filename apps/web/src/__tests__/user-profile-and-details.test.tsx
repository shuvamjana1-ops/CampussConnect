import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserProfileSection, ProfileEditorModal } from '../components/UserProfileSection';
import { SessionProvider } from '../auth/session';
import { I18nProvider } from '../i18n/I18nProvider';
import { Layout } from '../shell/Layout';
import LandingPage from '../routes/LandingPage';
import SignIn from '../routes/SignIn';
import StudentPortal from '../routes/(student)/StudentPortal';

function renderWithProviders(ui: React.ReactElement): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <I18nProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </I18nProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

describe('CampusConnect Branding & User Profile Editor Feature', () => {
  it('enforces CampusConnect website brand name across navigation and landing views', () => {
    const landingHtml = renderWithProviders(<LandingPage />);
    expect(landingHtml).toContain('CampusConnect');
    expect(landingHtml).toContain('JIS UNIVERSITY ENTERPRISE');

    const signInHtml = renderWithProviders(<SignIn />);
    expect(signInHtml).toContain('CampusConnect Enterprise Portal');
    expect(signInHtml).toContain('JIS University CampusConnect Portal');

    const layoutHtml = renderWithProviders(<Layout title="Portal Shell" />);
    expect(layoutHtml).toContain('CampusConnect');
    expect(layoutHtml).toContain('JIS UNIVERSITY');
  });

  it('renders UserProfileSection with circular photo manager, presets, and personal details', () => {
    const html = renderWithProviders(<UserProfileSection />);

    // Header & identity
    expect(html).toContain('Profile Photo &amp; Personal Details');
    expect(html).toContain('USER IDENTITY &amp; PERSONAL DOSSIER');

    // Photo manager & circular geometry
    expect(html).toContain('Upload Photo');
    expect(html).toContain('Presets:');
    expect(html).toContain('Student Ananya');
    expect(html).toContain('Faculty Rahul');
    expect(html).toContain('Dean Suresh');

    // Personal details fields
    expect(html).toContain('Full Name');
    expect(html).toContain('Institutional Email');
    expect(html).toContain('Phone Number');
    expect(html).toContain('Roll / Registration Number');
    expect(html).toContain('Department / Academic Unit');
    expect(html).toContain('Emergency / Alternate Contact');
    expect(html).toContain('Bio / Academic Dossier Notes');

    // Security & Save
    expect(html).toContain('PostgreSQL RLS Protected');
    expect(html).toContain('Save Profile &amp; Details');
  });

  it('renders Profile button and interactive trigger in the main application layout header', () => {
    const html = renderWithProviders(<Layout title="Dashboard" />);

    expect(html).toContain('👤 Profile');
    expect(html).toContain('Edit Profile:');
    expect(html).toContain('cc-avatar-circle');
  });

  it('renders Profile Editor Modal when open', () => {
    const openHtml = renderWithProviders(<ProfileEditorModal isOpen={true} onClose={() => {}} />);
    expect(openHtml).toContain('Profile Photo &amp; Personal Details');

    const closedHtml = renderWithProviders(<ProfileEditorModal isOpen={false} onClose={() => {}} />);
    expect(closedHtml).toBe('');
  });

  it('integrates Profile tab in Student Portal', () => {
    const html = renderWithProviders(<StudentPortal />);
    expect(html).toContain('Profile Photo &amp; Details');
  });
});

