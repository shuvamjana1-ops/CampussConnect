import { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Minus,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';
import { GlassCard } from './GlassCard';
import { type AcademicRecord, type AcademicSubject } from '../services/complaintStore';

export interface AttendanceCalculatorProps {
  readonly record: AcademicRecord;
  readonly onFlagDiscrepancy?: (subject: AcademicSubject) => void;
}

interface SimState {
  extraAttended: number;
  extraMissed: number;
}

export function AttendanceCalculator({ record, onFlagDiscrepancy }: AttendanceCalculatorProps) {
  // Per-subject simulation state: { [subjectCode]: { extraAttended: number, extraMissed: number } }
  const [simulations, setSimulations] = useState<Record<string, SimState>>({});

  const handleAdjust = (code: string, type: 'attended' | 'missed', delta: number) => {
    setSimulations((prev) => {
      const current = prev[code] || { extraAttended: 0, extraMissed: 0 };
      if (type === 'attended') {
        const nextVal = Math.max(0, current.extraAttended + delta);
        return { ...prev, [code]: { ...current, extraAttended: nextVal } };
      } else {
        const nextVal = Math.max(0, current.extraMissed + delta);
        return { ...prev, [code]: { ...current, extraMissed: nextVal } };
      }
    });
  };

  const handleReset = (code?: string) => {
    if (code) {
      setSimulations((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
    } else {
      setSimulations({});
    }
  };

  // Aggregated totals across all subjects
  let totalHeld = 0;
  let totalAttended = 0;

  record.subjects.forEach((sub) => {
    const sim = simulations[sub.code] || { extraAttended: 0, extraMissed: 0 };
    const held = (sub.lecturesHeld || 30) + sim.extraAttended + sim.extraMissed;
    const attended = (sub.lecturesAttended || Math.round(30 * (sub.attendance / 100))) + sim.extraAttended;
    totalHeld += held;
    totalAttended += attended;
  });

  const overallPct = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : record.attendancePercentage;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner Card */}
      <GlassCard
        material="glass"
        style={{
          padding: '24px',
          borderLeft: '4px solid #10b981',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 12px',
                borderRadius: '9999px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                marginBottom: '10px',
              }}
            >
              <Sparkles size={14} />
              <span>STATUTORY 75% ATTENDANCE TARGET &amp; BUNK MARGIN CALCULATOR</span>
            </div>

            <h2
              style={{
                fontSize: '1.6rem',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                color: '#f8fafc',
                margin: '0 0 6px 0',
              }}
            >
              Official Attendance Audit &amp; Examination Eligibility Engine
            </h2>
            <p
              style={{
                margin: 0,
                color: '#cbd5e1',
                fontSize: '0.9rem',
                maxWidth: '720px',
                lineHeight: 1.45,
              }}
            >
              JIS University Examination Regulations mandate a minimum of <strong>75.0%</strong> lecture
              attendance to appear for Odd Semester 2026 End-Term Examinations. Use the interactive simulator
              below to calculate exact safe margin or required recovery classes.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '8px',
            }}
          >
            <div
              style={{
                padding: '12px 20px',
                borderRadius: '16px',
                background:
                  overallPct >= 75
                    ? 'rgba(16, 185, 129, 0.15)'
                    : overallPct >= 65
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${
                  overallPct >= 75
                    ? 'rgba(16, 185, 129, 0.35)'
                    : overallPct >= 65
                    ? 'rgba(245, 158, 11, 0.35)'
                    : 'rgba(239, 68, 68, 0.35)'
                }`,
                textAlign: 'right',
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Aggregate Attendance
              </span>
              <div
                style={{
                  fontSize: '1.85rem',
                  fontWeight: 900,
                  color: overallPct >= 75 ? '#34d399' : overallPct >= 65 ? '#fbbf24' : '#f87171',
                }}
              >
                {overallPct.toFixed(1)}%
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: overallPct >= 75 ? '#34d399' : overallPct >= 65 ? '#fbbf24' : '#f87171',
                }}
              >
                {overallPct >= 75
                  ? '✓ Eligible for Hall Ticket'
                  : overallPct >= 65
                  ? '⚠️ Condonation Application Required'
                  : '✕ Barred from Examination'}
              </span>
            </div>

            {Object.keys(simulations).length > 0 && (
              <button
                type="button"
                onClick={() => handleReset()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  fontSize: '0.785rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={14} />
                <span>Reset All Simulations</span>
              </button>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Subject-Wise Breakdown Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {record.subjects.map((sub) => {
          const sim = simulations[sub.code] || { extraAttended: 0, extraMissed: 0 };
          const baseHeld = sub.lecturesHeld || 30;
          const baseAttended = sub.lecturesAttended || Math.round(30 * (sub.attendance / 100));

          const curHeld = baseHeld + sim.extraAttended + sim.extraMissed;
          const curAttended = baseAttended + sim.extraAttended;
          const pct = curHeld > 0 ? (curAttended / curHeld) * 100 : sub.attendance;

          // Safe Margin Math:
          // Attended / (Held + m) >= 0.75 => m <= (Attended - 0.75*Held)/0.75
          const safeMargin = Math.max(0, Math.floor((curAttended - 0.75 * curHeld) / 0.75));

          // Recovery Math:
          // (Attended + c) / (Held + c) >= 0.75 => 0.25*c >= 0.75*Held - Attended => c >= (0.75*Held - Attended)/0.25
          const recoveryNeeded = Math.max(0, Math.ceil((0.75 * curHeld - curAttended) / 0.25));

          const isEligible = pct >= 75;
          const isCondonation = pct >= 65 && pct < 75;
          const isBarred = pct < 65;

          const isSimulated = sim.extraAttended > 0 || sim.extraMissed > 0;

          return (
            <GlassCard
              key={sub.code}
              material="glass"
              style={{
                padding: '20px 24px',
                borderRadius: '18px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                background: 'rgba(20, 20, 32, 0.65)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '14px',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '8px',
                        background: 'rgba(37, 99, 235, 0.2)',
                        color: '#60a5fa',
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        border: '1px solid rgba(37, 99, 235, 0.35)',
                      }}
                    >
                      {sub.code}
                    </span>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
                      {sub.name}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.825rem', color: '#94a3b8' }}>
                    <span>
                      Lectures Attended: <strong style={{ color: '#f8fafc' }}>{curAttended} / {curHeld}</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Grade: <strong style={{ color: '#f8fafc' }}>{sub.grade}</strong>
                    </span>
                    {isSimulated && (
                      <>
                        <span>·</span>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                          (Simulating: +{sim.extraAttended} attended, +{sim.extraMissed} missed)
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Badge Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isEligible && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '9999px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#34d399',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        fontSize: '0.785rem',
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle2 size={14} />
                      <span>{pct.toFixed(1)}% · Eligible</span>
                    </span>
                  )}
                  {isCondonation && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '9999px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#fbbf24',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        fontSize: '0.785rem',
                        fontWeight: 700,
                      }}
                    >
                      <AlertTriangle size={14} />
                      <span>{pct.toFixed(1)}% · Condonation Required</span>
                    </span>
                  )}
                  {isBarred && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '9999px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        fontSize: '0.785rem',
                        fontWeight: 700,
                      }}
                    >
                      <XCircle size={14} />
                      <span>{pct.toFixed(1)}% · Barred from Hall Ticket</span>
                    </span>
                  )}

                  {onFlagDiscrepancy && (
                    <button
                      type="button"
                      onClick={() => onFlagDiscrepancy(sub)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#cbd5e1',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Flag Issue
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  position: 'relative',
                  height: '10px',
                  borderRadius: '9999px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  overflow: 'hidden',
                  marginBottom: '16px',
                }}
              >
                {/* 75% Cutoff Marker */}
                <div
                  style={{
                    position: 'absolute',
                    left: '75%',
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: '#ffffff',
                    zIndex: 2,
                    boxShadow: '0 0 6px rgba(255, 255, 255, 0.8)',
                  }}
                  title="75% Mandatory Cutoff"
                />
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, Math.max(0, pct))}%`,
                    background:
                      isEligible
                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : isCondonation
                        ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                        : 'linear-gradient(90deg, #ef4444, #f87171)',
                    borderRadius: '9999px',
                    transition: 'width 250ms ease',
                  }}
                />
              </div>

              {/* Guidance Advisory & Bunk Margin Callout */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '14px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: 'rgba(10, 14, 24, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Info size={16} style={{ color: isEligible ? '#34d399' : '#fbbf24', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: 600 }}>
                    {isEligible ? (
                      <>
                        Safe Margin: You can miss{' '}
                        <strong style={{ color: '#34d399' }}>{safeMargin} more classes</strong> in {sub.code} and
                        stay &gt;=75%.
                      </>
                    ) : (
                      <>
                        Shortage Alert: Attend next{' '}
                        <strong style={{ color: '#f87171' }}>{recoveryNeeded} consecutive classes</strong> to
                        reach 75%.
                      </>
                    )}
                  </span>
                </div>

                {/* Simulation Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Attend:</span>
                    <button
                      type="button"
                      aria-label="Decrease attended simulation"
                      onClick={() => handleAdjust(sub.code, 'attended', -1)}
                      disabled={sim.extraAttended <= 0}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: sim.extraAttended <= 0 ? 'not-allowed' : 'pointer',
                        opacity: sim.extraAttended <= 0 ? 0.4 : 1,
                      }}
                    >
                      <Minus size={12} />
                    </button>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#34d399', minWidth: '18px', textAlign: 'center' }}>
                      +{sim.extraAttended}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase attended simulation"
                      onClick={() => handleAdjust(sub.code, 'attended', 1)}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: 'rgba(16, 185, 129, 0.2)',
                        color: '#34d399',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Miss:</span>
                    <button
                      type="button"
                      aria-label="Decrease missed simulation"
                      onClick={() => handleAdjust(sub.code, 'missed', -1)}
                      disabled={sim.extraMissed <= 0}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: sim.extraMissed <= 0 ? 'not-allowed' : 'pointer',
                        opacity: sim.extraMissed <= 0 ? 0.4 : 1,
                      }}
                    >
                      <Minus size={12} />
                    </button>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f87171', minWidth: '18px', textAlign: 'center' }}>
                      +{sim.extraMissed}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase missed simulation"
                      onClick={() => handleAdjust(sub.code, 'missed', 1)}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: 'rgba(239, 68, 68, 0.2)',
                        color: '#f87171',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {isSimulated && (
                    <button
                      type="button"
                      aria-label="Reset subject simulation"
                      onClick={() => handleReset(sub.code)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'transparent',
                        color: '#94a3b8',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

export default AttendanceCalculator;

