import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Search,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  GraduationCap,
  ClipboardList,
  Sparkles,
  BookOpen,
  User,
  Settings,
  Sun,
  Moon,
  Laptop,
  LogOut,
  X,
} from 'lucide-react';
import { useSession } from '../auth/session';

export interface CommandItem {
  id: string;
  category: 'Navigation' | 'Quick Actions' | 'Appearance';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  keywords?: string[];
  action: () => void;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { switchRole, signOut } = useSession();
  const navigate = useNavigate();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Open / Close event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    const handleCustomOpen = () => {
      setIsOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('campusconnect:open-command-palette', handleCustomOpen);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('campusconnect:open-command-palette', handleCustomOpen);
    };
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Theme Helpers
  const setTheme = (mode: 'light' | 'dark' | 'system') => {
    try {
      if (mode === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
        localStorage.setItem('campusconnect:theme', 'dark');
      } else if (mode === 'light') {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.classList.remove('dark');
        localStorage.setItem('campusconnect:theme', 'light');
      } else {
        localStorage.removeItem('campusconnect:theme');
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.setAttribute('data-theme', 'dark');
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.removeAttribute('data-theme');
          document.documentElement.classList.remove('dark');
        }
      }
    } catch {
      // ignore
    }
  };

  // Commands Directory
  const commands: CommandItem[] = useMemo(() => {
    return [
      // Navigation
      {
        id: 'nav-admin',
        category: 'Navigation',
        title: 'Admin Command Center',
        subtitle: 'Overview, analytics, and institutional governance',
        icon: <ShieldCheck size={18} />,
        shortcut: 'G A',
        keywords: ['admin', 'dashboard', 'analytics', 'governance'],
        action: () => navigate('/admin'),
      },
      {
        id: 'nav-staff',
        category: 'Navigation',
        title: 'Staff Work Queue',
        subtitle: 'Assigned dockets and resolution pipeline',
        icon: <CheckCircle2 size={18} />,
        shortcut: 'G W',
        keywords: ['staff', 'worker', 'queue', 'tickets', 'dockets'],
        action: () => navigate('/staff'),
      },
      {
        id: 'nav-student',
        category: 'Navigation',
        title: 'Student Portal',
        subtitle: 'Grievance lodge, status tracker & services',
        icon: <GraduationCap size={18} />,
        shortcut: 'G S',
        keywords: ['student', 'portal', 'complaints', 'status'],
        action: () => navigate('/student'),
      },
      {
        id: 'nav-academic',
        category: 'Navigation',
        title: 'Academic Section (AC)',
        subtitle: 'Examination script records & course evaluation',
        icon: <BookOpen size={18} />,
        shortcut: 'G C',
        keywords: ['academic', 'grades', 'marks', 'exam', 'section', 'ac'],
        action: () => navigate('/portal/student/ac'),
      },
      {
        id: 'nav-scholarships',
        category: 'Navigation',
        title: 'Scholarships & Internships',
        subtitle: 'Institutional grants & industry fellowships',
        icon: <Sparkles size={18} />,
        shortcut: 'G I',
        keywords: ['scholarships', 'internships', 'grants', 'careers'],
        action: () => navigate('/student?tab=scholarships'),
      },
      {
        id: 'nav-profile',
        category: 'Navigation',
        title: 'User Profile & Identity Dossier',
        subtitle: 'View photo presets and personal details',
        icon: <User size={18} />,
        shortcut: 'G P',
        keywords: ['profile', 'user', 'photo', 'avatar', 'dossier', 'roll'],
        action: () => navigate('/profile'),
      },
      {
        id: 'nav-settings',
        category: 'Navigation',
        title: 'System Settings',
        subtitle: 'Institution logo, preferences, notifications',
        icon: <Settings size={18} />,
        shortcut: 'G ,',
        keywords: ['settings', 'logo', 'config', 'theme', 'preferences'],
        action: () => navigate('/settings'),
      },

      // Quick Actions
      {
        id: 'action-lodge',
        category: 'Quick Actions',
        title: 'Lodge New Grievance / Task',
        subtitle: 'Create and submit a new ticket docket',
        icon: <ClipboardList size={18} />,
        keywords: ['create', 'lodge', 'new', 'grievance', 'ticket'],
        action: () => navigate('/student?tab=lodge'),
      },
      {
        id: 'action-switch-admin',
        category: 'Quick Actions',
        title: 'Switch Role to Administrator',
        subtitle: 'Access Registrar & Command Center views',
        icon: <ShieldCheck size={18} />,
        keywords: ['switch', 'role', 'admin'],
        action: () => {
          switchRole('admin');
          navigate('/admin');
        },
      },
      {
        id: 'action-switch-staff',
        category: 'Quick Actions',
        title: 'Switch Role to Staff',
        subtitle: 'Access Faculty & Work Queue views',
        icon: <CheckCircle2 size={18} />,
        keywords: ['switch', 'role', 'staff', 'worker'],
        action: () => {
          switchRole('staff');
          navigate('/staff');
        },
      },
      {
        id: 'action-switch-student',
        category: 'Quick Actions',
        title: 'Switch Role to Student',
        subtitle: 'Access Student Portal & Services',
        icon: <GraduationCap size={18} />,
        keywords: ['switch', 'role', 'student'],
        action: () => {
          switchRole('student');
          navigate('/student');
        },
      },
      {
        id: 'action-signout',
        category: 'Quick Actions',
        title: 'Sign Out / Exit Session',
        subtitle: 'Safely terminate active authentication session',
        icon: <LogOut size={18} />,
        keywords: ['signout', 'logout', 'exit'],
        action: async () => {
          await signOut();
          navigate('/login');
        },
      },

      // Appearance
      {
        id: 'theme-dark',
        category: 'Appearance',
        title: 'Switch to Dark Mode',
        subtitle: 'Deep macOS obsidian glass aesthetic',
        icon: <Moon size={18} />,
        keywords: ['dark', 'mode', 'theme', 'black'],
        action: () => setTheme('dark'),
      },
      {
        id: 'theme-light',
        category: 'Appearance',
        title: 'Switch to Light Mode',
        subtitle: 'Crisp Apple frosted crystal aesthetic',
        icon: <Sun size={18} />,
        keywords: ['light', 'mode', 'theme', 'white'],
        action: () => setTheme('light'),
      },
      {
        id: 'theme-system',
        category: 'Appearance',
        title: 'Match System Theme',
        subtitle: 'Follow OS appearance preferences automatically',
        icon: <Laptop size={18} />,
        keywords: ['system', 'automatic', 'auto', 'match'],
        action: () => setTheme('system'),
      },
    ];
  }, [navigate, switchRole, signOut]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const clean = query.trim().toLowerCase();
    return commands.filter((c) => {
      if (c.title.toLowerCase().includes(clean)) return true;
      if (c.subtitle && c.subtitle.toLowerCase().includes(clean)) return true;
      if (c.keywords && c.keywords.some((k) => k.toLowerCase().includes(clean))) return true;
      return false;
    });
  }, [commands, query]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(0);
    }
  }, [filteredCommands.length, selectedIndex]);

  // Scroll active item into view
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const activeEl = listEl.querySelector(`[data-command-index="${selectedIndex}"]`) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Key navigation in input
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredCommands.length > 0 ? (prev + 1) % filteredCommands.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredCommands.length > 0 ? (prev - 1 + filteredCommands.length) % filteredCommands.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        setIsOpen(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onClick={() => setIsOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        paddingLeft: '16px',
        paddingRight: '16px',
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        animation: 'cf-fade-in 200ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {/* Dialog Window */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '620px',
          borderRadius: '24px',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(40px) saturate(190%)',
          WebkitBackdropFilter: 'blur(40px) saturate(190%)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          boxShadow:
            '0 25px 60px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'cf-slide-up 240ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          }}
        >
          <Search size={20} style={{ color: 'var(--text-muted, #64748b)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a command or destination (e.g. 'tickets', 'dark', 'profile')..."
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: '1rem',
              color: 'var(--text-main, #0f172a)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              style={{
                background: 'rgba(0, 0, 0, 0.06)',
                border: 'none',
                borderRadius: '50%',
                width: '22px',
                height: '22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-muted, #64748b)',
              }}
            >
              <X size={13} />
            </button>
          ) : (
            <kbd
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(0, 0, 0, 0.06)',
                color: 'var(--text-muted, #64748b)',
                border: '1px solid rgba(0, 0, 0, 0.1)',
              }}
            >
              ESC
            </kbd>
          )}
        </div>

        {/* Command List Results */}
        <div
          ref={listRef}
          role="listbox"
          style={{
            maxHeight: '360px',
            overflowY: 'auto',
            padding: '10px',
          }}
        >
          {filteredCommands.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-muted, #64748b)',
                fontSize: '0.875rem',
              }}
            >
              No matching commands found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredCommands.map((item, idx) => {
              const isSelected = selectedIndex === idx;
              return (
                <div
                  key={item.id}
                  data-command-index={idx}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    item.action();
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(99, 102, 241, 0.12))'
                      : 'transparent',
                    border: isSelected
                      ? '1px solid rgba(59, 130, 246, 0.3)'
                      : '1px solid transparent',
                    transition: 'background-color 140ms ease, border-color 140ms ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isSelected ? 'var(--accent, #3b82f6)' : 'rgba(0, 0, 0, 0.05)',
                        color: isSelected ? '#ffffff' : 'var(--text-main, #0f172a)',
                        transition: 'background-color 160ms ease, color 160ms ease',
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: 'var(--text-main, #0f172a)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted, #64748b)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                    {item.shortcut && (
                      <kbd
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '6px',
                          background: 'rgba(0, 0, 0, 0.05)',
                          color: 'var(--text-muted, #64748b)',
                          border: '1px solid rgba(0, 0, 0, 0.08)',
                        }}
                      >
                        {item.shortcut}
                      </kbd>
                    )}
                    {isSelected && <ArrowRight size={15} style={{ color: 'var(--accent, #3b82f6)' }} />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Legend */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 18px',
            borderTop: '1px solid rgba(0, 0, 0, 0.06)',
            background: 'rgba(0, 0, 0, 0.02)',
            fontSize: '0.725rem',
            color: 'var(--text-muted, #64748b)',
          }}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <span>
              <kbd style={{ padding: '1px 5px', borderRadius: '4px', background: 'rgba(0,0,0,0.06)' }}>↑</kbd>{' '}
              <kbd style={{ padding: '1px 5px', borderRadius: '4px', background: 'rgba(0,0,0,0.06)' }}>↓</kbd> Navigate
            </span>
            <span>
              <kbd style={{ padding: '1px 5px', borderRadius: '4px', background: 'rgba(0,0,0,0.06)' }}>↵</kbd> Select
            </span>
          </div>
          <div>
            <span>CampusConnect Spotlight</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
