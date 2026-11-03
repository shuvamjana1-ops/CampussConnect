import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

export interface StudentInfo {
  readonly id: string;
  readonly name: string;
  readonly rollNumber: string;
  readonly department: string;
  readonly avatarUrl?: string;
  readonly semester?: string;
  readonly cgpa?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly academicStatus?: 'Good Standing' | 'Verification Required' | 'Honor Roll';
}

export interface StudentPillProps {
  readonly student: StudentInfo;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly showRoll?: boolean;
}

export function StudentPill({ student, size = 'md', showRoll = false }: StudentPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  // Close on Click Outside or Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const initials = student.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const handleDirectToAC = () => {
    setIsOpen(false);
    navigate(`/portal/student/ac?studentId=${encodeURIComponent(student.id)}&roll=${encodeURIComponent(student.rollNumber)}`);
  };

  const handleViewAcademicLog = () => {
    setIsOpen(false);
    navigate(`/portal/student?tab=academic-log&roll=${encodeURIComponent(student.rollNumber)}`);
  };

  const handleOfficialComms = () => {
    window.location.href = `mailto:${student.email ?? `${student.rollNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}@jisuniversity.ac.in`}?subject=Official University Communication: ${student.name} (${student.rollNumber})`;
  };

  return (
    <div className="cc-student-pill-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`cc-student-pill-trigger cc-student-pill-${size}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title={`View student profile: ${student.name}`}
      >
        <span className="cc-student-avatar-circle" aria-hidden="true">
          {student.avatarUrl ? (
            <img src={student.avatarUrl} alt="" className="cc-student-avatar-img" />
          ) : (
            <span className="cc-student-avatar-text">{initials}</span>
          )}
        </span>
        <span className="cc-student-pill-name">{student.name}</span>
        {showRoll && <span className="cc-student-pill-roll">({student.rollNumber})</span>}
        <span className="cc-student-pill-badge" aria-hidden="true">✓</span>
      </button>

      {/* Social-Style Instagram/FB Popover Card */}
      {isOpen && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`Student Profile: ${student.name}`}
          className="glass-popover cc-student-social-popover"
        >
          {/* Cover Header Graphic */}
          <div className="cc-social-cover">
            <span className="cc-social-tag">JIS UNIVERSITY · VERIFIED STUDENT</span>
            <button
              type="button"
              className="cc-social-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close profile card"
            >
              ×
            </button>
          </div>

          {/* Floating Circular Avatar */}
          <div className="cc-social-avatar-container">
            <div className="cc-social-avatar-circle">
              {student.avatarUrl ? (
                <img src={student.avatarUrl} alt={student.name} className="cc-social-avatar-img" />
              ) : (
                <div className="cc-social-avatar-initials">{initials}</div>
              )}
            </div>
            <div className="cc-social-verified-badge" title="Verified JIS University Student Record">
              ✓
            </div>
          </div>

          {/* Profile Meta Body */}
          <div className="cc-social-body">
            <h4 className="cc-social-name">{student.name}</h4>
            <div className="cc-social-roll">{student.rollNumber}</div>
            <p className="cc-social-dept">
              🏛️ {student.department}
              {student.semester ? ` · Sem ${student.semester}` : ''}
            </p>

            <div className="cc-social-stats-row">
              <div className="cc-social-stat">
                <span className="cc-stat-num">{student.cgpa ?? '8.92'}</span>
                <span className="cc-stat-label">CGPA</span>
              </div>
              <div className="cc-social-stat">
                <span className="cc-stat-num">{student.academicStatus ?? 'Active'}</span>
                <span className="cc-stat-label">Status</span>
              </div>
              <div className="cc-social-stat">
                <span className="cc-stat-num">98.4%</span>
                <span className="cc-stat-label">Attendance</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="cc-social-actions">
              <button
                type="button"
                onClick={handleDirectToAC}
                className="cc-social-action-primary"
                title="Direct to Academic Section (AC) module without intermediate steps"
              >
                <span>⚡</span> Direct to Academic Section (AC)
              </button>

              <div className="cc-social-actions-subgrid">
                <button
                  type="button"
                  onClick={handleViewAcademicLog}
                  className="cc-social-action-secondary"
                >
                  <span>📜</span> View Academic Log
                </button>
                <button
                  type="button"
                  onClick={handleOfficialComms}
                  className="cc-social-action-secondary"
                >
                  <span>✉️</span> Official Comms
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StudentPill;

