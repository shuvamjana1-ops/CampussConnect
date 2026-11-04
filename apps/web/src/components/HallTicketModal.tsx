import { useState } from 'react';
import {
  Printer,
  X,
  CheckCircle2,
  ShieldCheck,
  QrCode,
  Calendar,
  GraduationCap,
} from 'lucide-react';
import { GlassCard } from './GlassCard';
import { complaintStore, type AcademicRecord } from '../services/complaintStore';

export interface HallTicketModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly studentIdOrRoll?: string;
}

export function HallTicketModal({
  isOpen,
  onClose,
  studentIdOrRoll = 'usr_ananya_01',
}: HallTicketModalProps) {
  const [record] = useState<AcademicRecord | null>(() =>
    complaintStore.getACRecord(studentIdOrRoll)
  );

  if (!isOpen) return null;

  const currentRecord = record || complaintStore.getACRecord('usr_ananya_01');

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const timetable = [
    { code: 'CS301', name: 'Design & Analysis of Algorithms', date: '15 Dec 2026', time: '10:00 AM – 01:00 PM', hall: 'Exam Hall B', desk: 'Desk B-42' },
    { code: 'CS302', name: 'Advanced Data Structures & OOP', date: '18 Dec 2026', time: '10:00 AM – 01:00 PM', hall: 'Exam Hall B', desk: 'Desk B-42' },
    { code: 'CS303', name: 'Database Management Systems', date: '21 Dec 2026', time: '10:00 AM – 01:00 PM', hall: 'Exam Hall B', desk: 'Desk B-42' },
    { code: 'CS304', name: 'Discrete Mathematics', date: '24 Dec 2026', time: '10:00 AM – 01:00 PM', hall: 'Exam Hall B', desk: 'Desk B-42' },
    { code: 'CS305', name: 'Computer Architecture & Microprocessors', date: '28 Dec 2026', time: '10:00 AM – 01:00 PM', hall: 'Exam Hall B', desk: 'Desk B-42' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 8, 16, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px',
        overflowY: 'auto',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hall-ticket-title"
    >
      <GlassCard
        material="glass-strong"
        style={{
          maxWidth: '880px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '24px',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
          background: 'rgba(15, 20, 32, 0.95)',
          padding: 0,
        }}
      >
        {/* Controls Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 24px',
            background: 'rgba(20, 26, 42, 0.85)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(37, 99, 235, 0.2)',
                color: '#60a5fa',
              }}
            >
              <GraduationCap size={16} />
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#f8fafc' }}>
              OFFICIAL EXAMINATION ADMIT CARD · ODD SEMESTER 2026
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.825rem',
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(37, 99, 235, 0.4)',
              }}
            >
              <Printer size={15} />
              <span>Print / Download Admit Card</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Printable Admit Card Content */}
        <div
          id="printable-admit-card"
          style={{
            padding: '28px 32px',
            overflowY: 'auto',
            color: '#f8fafc',
          }}
        >
          {/* Institution Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '2px solid rgba(255, 255, 255, 0.2)',
              paddingBottom: '20px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1d4ed8, #0f2850)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '1.25rem',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                }}
              >
                JIS
              </div>
              <div>
                <h1
                  id="hall-ticket-title"
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: '1.45rem',
                    fontWeight: 900,
                    letterSpacing: '-0.01em',
                    color: '#f8fafc',
                  }}
                >
                  JIS UNIVERSITY, KOLKATA
                </h1>
                <p style={{ margin: 0, fontSize: '0.825rem', color: '#94a3b8' }}>
                  Controller of Examinations · Nilgunj Road, Agarpara, Kolkata - 700109
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'rgba(37, 99, 235, 0.2)',
                      color: '#60a5fa',
                      fontSize: '0.725rem',
                      fontWeight: 700,
                    }}
                  >
                    NAAC ACCREDITED 'A' GRADE
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#34d399',
                      fontSize: '0.725rem',
                      fontWeight: 700,
                    }}
                  >
                    AUTONOMOUS
                  </span>
                </div>
              </div>
            </div>

            {/* Cryptographic Seal & Barcode */}
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  marginBottom: '6px',
                }}
              >
                <ShieldCheck size={14} />
                <span>SEC-HASH: JISU-2026-X88A</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                Issued: 03 Nov 2026 · Valid for Odd Sem 2026
              </div>
            </div>
          </div>

          {/* Candidate Dossier Card */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 140px',
              gap: '20px',
              padding: '18px 20px',
              borderRadius: '16px',
              background: 'rgba(20, 26, 44, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              marginBottom: '20px',
            }}
          >
            {/* Student Photo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <img
                src={currentRecord?.email?.includes('ananya') ? '/assets/profiles/student-ananya.svg' : '/assets/profiles/student-ananya.svg'}
                alt={currentRecord?.studentName || 'Candidate'}
                style={{
                  width: '96px',
                  height: '96px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '3px solid #2563eb',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                }}
                onError={(e) => {
                  (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="%231e3a8a"/><text x="48" y="54" font-size="28" fill="%23ffffff" text-anchor="middle" font-weight="bold">AD</text></svg>';
                }}
              />
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>CANDIDATE</span>
            </div>

            {/* Candidate Metadata */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 18px', fontSize: '0.85rem' }}>
              <div>
                <span style={{ fontSize: '0.725rem', color: '#94a3b8', textTransform: 'uppercase' }}>Candidate Name</span>
                <strong style={{ display: 'block', color: '#f8fafc', fontSize: '0.95rem' }}>
                  {currentRecord?.studentName || 'Ananya Das'}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.725rem', color: '#94a3b8', textTransform: 'uppercase' }}>University Roll No.</span>
                <strong style={{ display: 'block', color: '#60a5fa', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                  {currentRecord?.rollNumber || 'JISU/2024/CSE/0842'}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.725rem', color: '#94a3b8', textTransform: 'uppercase' }}>Department / Degree</span>
                <strong style={{ display: 'block', color: '#f8fafc' }}>
                  B.Tech · {currentRecord?.department || 'Computer Science & Engineering'}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.725rem', color: '#94a3b8', textTransform: 'uppercase' }}>Semester / Session</span>
                <strong style={{ display: 'block', color: '#f8fafc' }}>
                  4th Semester (UG) · Odd Term 2026
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.725rem', color: '#94a3b8', textTransform: 'uppercase' }}>Designated Seating</span>
                <strong style={{ display: 'block', color: '#34d399', fontWeight: 800 }}>
                  Exam Hall B · Desk B-42
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.725rem', color: '#94a3b8', textTransform: 'uppercase' }}>Center Code</span>
                <strong style={{ display: 'block', color: '#f8fafc' }}>
                  JISU-MAIN-01 (Campus Hall)
                </strong>
              </div>
            </div>

            {/* Verification QR Seal */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                paddingLeft: '14px',
              }}
            >
              <div
                style={{
                  width: '84px',
                  height: '84px',
                  borderRadius: '12px',
                  background: '#ffffff',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <QrCode size={72} color="#0a1128" />
              </div>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '4px', textAlign: 'center' }}>
                Scan to Verify
              </span>
            </div>
          </div>

          {/* Statutory Clearances Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <CheckCircle2 size={18} color="#34d399" />
              <div>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>
                  Attendance Requirement
                </span>
                <strong style={{ fontSize: '0.825rem', color: '#34d399' }}>
                  {currentRecord?.attendancePercentage || 92.4}% (Eligible &gt;=75%)
                </strong>
              </div>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <CheckCircle2 size={18} color="#34d399" />
              <div>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>
                  Accounts &amp; Tuition Dues
                </span>
                <strong style={{ fontSize: '0.825rem', color: '#34d399' }}>
                  100% Cleared (0 Dues)
                </strong>
              </div>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <CheckCircle2 size={18} color="#34d399" />
              <div>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>
                  Central Library Holds
                </span>
                <strong style={{ fontSize: '0.825rem', color: '#34d399' }}>
                  0 Books Due · All Cleared
                </strong>
              </div>
            </div>
          </div>

          {/* Subject Timetable Table */}
          <div style={{ marginBottom: '22px' }}>
            <div
              style={{
                fontSize: '0.785rem',
                fontWeight: 800,
                color: '#cbd5e1',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Calendar size={14} style={{ color: '#60a5fa' }} />
              <span>Examination Schedule &amp; Course Timetable (CS301 – CS305)</span>
            </div>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.825rem',
                borderRadius: '12px',
                overflow: 'hidden',
                background: 'rgba(20, 26, 44, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
            >
              <thead>
                <tr style={{ background: 'rgba(30, 41, 59, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.15)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#94a3b8' }}>Code</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#94a3b8' }}>Course Subject</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#94a3b8' }}>Date</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#94a3b8' }}>Session Time</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#94a3b8' }}>Seating</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8' }}>Invigilator Sign</th>
                </tr>
              </thead>
              <tbody>
                {timetable.map((row) => (
                  <tr key={row.code} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#60a5fa' }}>{row.code}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f8fafc' }}>{row.name}</td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{row.date}</td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{row.time}</td>
                    <td style={{ padding: '10px 12px', color: '#34d399', fontWeight: 600 }}>{row.desk}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>
                      <div style={{ height: '24px', borderBottom: '1px dashed rgba(255, 255, 255, 0.2)' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Signatures & Instructions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              paddingTop: '16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            <div style={{ maxWidth: '440px', fontSize: '0.725rem', color: '#94a3b8', lineHeight: 1.4 }}>
              <strong>Important Instructions:</strong>
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                <li>Candidate must report to Exam Hall B strictly 20 minutes prior to session start time.</li>
                <li>Possession of mobile phones, smartwatches or electronic gadgets inside the hall is strictly prohibited.</li>
                <li>Digital Admit Card must be presented along with physical JIS University Student ID card.</li>
              </ul>
            </div>

            <div style={{ textAlign: 'center', minWidth: '180px' }}>
              <div
                style={{
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'cursive',
                  fontSize: '1.15rem',
                  color: '#93c5fd',
                }}
              >
                Dr. B. K. Sarkar
              </div>
              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.2)', paddingTop: '4px' }}>
                <strong style={{ fontSize: '0.8rem', color: '#f8fafc', display: 'block' }}>
                  Controller of Examinations
                </strong>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>JIS University, Kolkata</span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

export default HallTicketModal;
