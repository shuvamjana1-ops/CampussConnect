import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { FloatingDock } from '../components/FloatingDock';

// Mock session hook
vi.mock('../auth/session', () => ({
  useSession: () => ({
    role: 'student',
    profile: {
      id: 'usr_student_01',
      full_name: 'Ananya Das',
      email: 'ananya.das@campusconnect.ac.in',
      role: 'student',
    },
    isAdmin: false,
    isStaff: false,
    isStudent: true,
  }),
}));

describe('FloatingDock Dark Theme & Contrast Specification', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key in store) delete store[key];
    (globalThis as any).localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key in store) delete store[key];
      },
    };
    (globalThis as any).window = {
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
  });

  it('renders student navigation dock items correctly in light mode', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/student']}>
        <FloatingDock />
      </MemoryRouter>
    );

    // Verify presence of all key student items
    expect(html).toContain('Student Portal');
    expect(html).toContain('Lodge Grievance / Task');
    expect(html).toContain('Scholarships &amp; Internships');
    expect(html).toContain('Academic Section (AC)');
    expect(html).toContain('campusconnect-dock-container');
    expect(html).toContain('dock-tooltip');
  });

  it('renders dark theme with pure black icons (#000000) and high contrast tooltip text', () => {
    (globalThis as any).localStorage.setItem('campusconnect:theme', 'dark');

    const html = renderToString(
      <MemoryRouter initialEntries={['/student']}>
        <FloatingDock />
      </MemoryRouter>
    );

    // Verify presence of black color/stroke styling in dark mode
    expect(html).toContain('#000000');
    expect(html).toContain('campusconnect-dock-btn');
    expect(html).toContain('Student Portal');
    expect(html).toContain('Lodge Grievance / Task');
    expect(html).toContain('Academic Section (AC)');
  });
});
