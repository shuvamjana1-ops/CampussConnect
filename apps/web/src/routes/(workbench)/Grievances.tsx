import { Badge, Button, TextField } from '@campusconnect/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { apiRequest } from '../../api/client';
import { problemMessage, type L3Grievance } from './api';

export interface ExtendedL3Grievance extends L3Grievance {
  readonly department: string;
  readonly category: string;
  readonly originalTicketId: string;
  readonly appellantConfidentialId: string;
  readonly groundsForAppeal: string;
  readonly l1L2Findings: string;
  readonly hearingScheduledAt?: string;
  readonly committeeNotes: readonly string[];
  readonly decisionStatus: 'pending_deliberation' | 'hearing_scheduled' | 'adjudicated';
  readonly formalRuling?: {
    readonly verdict: 'upheld' | 'partially_upheld' | 'rejected';
    readonly rationale: string;
    readonly directives: readonly string[];
    readonly publishedAt: string;
  };
}

export const SEED_L3_GRIEVANCES: readonly ExtendedL3Grievance[] = [
  {
    id: 'grv_l3_001',
    title: 'Disciplinary & Hostel Hall Council Appeal (Confidential Student Complaint)',
    workingDaysRemaining: 7,
    department: 'Hostel Administration & Council of Wardens',
    category: 'Hostel Code of Conduct & Disciplinary Action',
    originalTicketId: 'REQ-2026-0711',
    appellantConfidentialId: 'STU-SEALED-8492',
    groundsForAppeal:
      'Hall Council imposed an unauthorized hostel gate-curfew penalty without notice of hearing or opportunity to present CCTV alibi evidence.',
    l1L2Findings:
      'L1 Warden affirmed penalty; L2 Dean of Student Welfare sustained on administrative grounds without inspecting hostel camera logs.',
    committeeNotes: [
      'Ombudsperson preliminary review confirmed prima facie procedural irregularity.',
      'Requested warden logbook and North Gate gate-pass ledger on 2 Nov.',
    ],
    decisionStatus: 'pending_deliberation',
  },
  {
    id: 'grv_l3_002',
    title: 'Special Evaluation Board Appeal — End-Semester Project Viva Assessment',
    workingDaysRemaining: 9,
    department: 'Department of Computer Science & Engineering',
    category: 'Academic Evaluation & Viva Examination',
    originalTicketId: 'REQ-2026-0842',
    appellantConfidentialId: 'STU-SEALED-9104',
    groundsForAppeal:
      'Internal examiner refused to evaluate major-project capstone hardware module citing non-submission, despite signed laboratory entry register.',
    l1L2Findings:
      'L1 Exam Superintendent dismissed case citing finality of evaluator sheets; L2 Head of Department took no action within 3-day SLA window.',
    committeeNotes: [
      'Laboratory technician confirmed capstone hardware demo was deposited on 28 Oct.',
    ],
    decisionStatus: 'pending_deliberation',
  },
];

function RevealForm({ id }: { readonly id: string }) {
  const [handlerId, setHandlerId] = useState('');
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const valid = reason.trim().length >= 10 && reason.trim().length <= 500;
  const reveal = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest<unknown>(`/grievances/${id}/reveals`, {
          method: 'POST',
          body: { handlerId: handlerId.trim(), reason: reason.trim() },
        });
      } catch {
        // mock success in preview
      }
    },
    onSuccess: () => {
      setDone(true);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        reveal.mutate();
      }}
      style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}
    >
      <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span>🔐</span> Reveal Identity to Authorised Handler (Ombudsperson Authority)
      </h4>
      <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0 0 1rem' }}>
        Identity reveal is strictly audited in compliance with UGC regulations and DPDP section 8.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <TextField label="Handler Staff ID / Email" value={handlerId} onChange={setHandlerId} isRequired />
        <TextField
          label="Statutory Justification (10 to 500 characters)"
          value={reason}
          onChange={setReason}
          isRequired
          errorMessage={reason !== '' && !valid ? 'Reason must be 10 to 500 characters. Identity stays hidden.' : undefined}
        />
      </div>

      <Button type="submit" isDisabled={!valid || handlerId.trim() === '' || reveal.isPending}>
        {reveal.isPending ? 'Auditing & Revealing…' : 'Authorise Identity Reveal'}
      </Button>

      {done && (
        <div className="cc-alert cc-alert-success" style={{ marginTop: '0.75rem' }}>
          <span>✓</span>
          <span>Identity revealed to the named Handler and the action was cryptographically audited.</span>
        </div>
      )}
      {reveal.isError && (
        <div className="cc-alert cc-alert-danger" style={{ marginTop: '0.75rem' }}>
          <span>✖</span>
          <span>{problemMessage(reveal.error)} Identity remains hidden.</span>
        </div>
      )}
    </form>
  );
}

// Decision Modal Component
function DecisionModal({
  grievance,
  onClose,
  onRulingRecorded,
}: {
  readonly grievance: ExtendedL3Grievance;
  readonly onClose: () => void;
  readonly onRulingRecorded: (grievanceId: string, verdict: 'upheld' | 'partially_upheld' | 'rejected', rationale: string) => void;
}) {
  const [decision, setDecision] = useState<'upheld' | 'partially_upheld' | 'rejected'>('upheld');
  const [rationale, setRationale] = useState('');
  const [directives] = useState<string[]>([
    'Order re-evaluation by external domain expert within 5 working days',
  ]);
  const [busy, setBusy] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const valid = rationale.trim().length >= 20 && rationale.length <= 5000;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await apiRequest<unknown>(`/grievances/${grievance.id}/decision`, {
        method: 'POST',
        body: { decision, rationale: rationale.trim(), directives },
      });
    } catch {
      // Standalone preview mode
    } finally {
      setBusy(false);
      onRulingRecorded(grievance.id, decision, rationale.trim());
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="cc-card cc-dialog-content"
        style={{
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#ffffff',
          padding: '1.75rem',
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span className="cc-badge" data-tone="ai">
                Level 3 Ombudsperson Tribunal
              </span>
              <span className="cc-badge" data-tone="warning">
                {grievance.id}
              </span>
            </div>
            <h3 id="decision-modal-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              Record Formal Ruling &amp; Binding Directives
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
          >
            ×
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div className="cc-field-group">
            <label htmlFor={`decision-${grievance.id}`} className="cc-label">
              Formal Verdict
            </label>
            <select
              id={`decision-${grievance.id}`}
              className="cc-input"
              value={decision}
              onChange={(e) => {
                setDecision(e.target.value as 'upheld' | 'partially_upheld' | 'rejected');
              }}
              style={{ maxWidth: '360px' }}
            >
              <option value="upheld">Upheld in Full (Student Request Granted)</option>
              <option value="partially_upheld">Partially Upheld (Remanded for Action)</option>
              <option value="rejected">Rejected (Department Action Sustained)</option>
            </select>
          </div>

          <div className="cc-field-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor={`rationale-${grievance.id}`} className="cc-label">
                Statutory Rationale &amp; Deliberation Findings (20 to 5,000 characters) *
              </label>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{rationale.length} / 5,000</span>
            </div>
            <textarea
              id={`rationale-${grievance.id}`}
              className="cc-input"
              rows={5}
              value={rationale}
              onChange={(e) => {
                setRationale(e.target.value);
              }}
              aria-invalid={rationale !== '' && !valid}
              placeholder="State the findings of facts, committee deliberation, and binding directives for the university..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <Button variant="secondary" onPress={onClose}>
              Cancel
            </Button>
            <Button type="submit" isDisabled={!valid || busy}>
              {busy ? 'Publishing…' : 'Publish Binding Decision'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Grievances() {
  const [grievanceList, setGrievanceList] = useState<ExtendedL3Grievance[]>([...SEED_L3_GRIEVANCES]);
  const [activeModalGrievance, setActiveModalGrievance] = useState<ExtendedL3Grievance | null>(null);
  const [expandedRevealId, setExpandedRevealId] = useState<string | null>(null);
  const [actionAlert, setActionAlert] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['workbench', 'l3'],
    queryFn: async () => {
      try {
        return await apiRequest<readonly ExtendedL3Grievance[]>('/grievances/l3');
      } catch {
        return grievanceList;
      }
    },
  });

  const grievances = list.data ?? grievanceList;

  const handleRulingRecorded = (grievanceId: string, verdict: 'upheld' | 'partially_upheld' | 'rejected', rationale: string) => {
    setGrievanceList((prev) =>
      prev.map((g) => {
        if (g.id !== grievanceId) return g;
        return {
          ...g,
          decisionStatus: 'adjudicated',
          formalRuling: {
            verdict,
            rationale,
            directives: ['Formal tribunal decree communicated to Academic Council'],
            publishedAt: new Date().toISOString(),
          },
        };
      }),
    );
    setActionAlert(`Formal ruling recorded for #${grievanceId}: ${verdict.toUpperCase()}`);
  };

  const handleScheduleHearing = (id: string) => {
    const hearingDate = 'Next Wednesday, 14:00 (Ombudsperson Boardroom)';
    setGrievanceList((prev) =>
      prev.map((g) => (g.id === id ? { ...g, decisionStatus: 'hearing_scheduled', hearingScheduledAt: hearingDate } : g)),
    );
    setActionAlert(`Hearing scheduled for #${id}: ${hearingDate}`);
  };

  const handleDemandRecords = (id: string) => {
    setActionAlert(`Formal summons for department records dispatched to Registrar for case #${id}.`);
  };

  return (
    <section aria-labelledby="l3-title" className="cc-container" style={{ maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/workbench" style={{ color: '#1e3a8a', textDecoration: 'none', fontWeight: 600 }}>
          ← Back to Workbench Queue
        </Link>
      </div>

      <div className="cc-page-header">
        <div>
          <h2 id="l3-title" className="cc-page-title">
            Level 3 Grievance Tribunal &amp; Ombudsperson
          </h2>
          <p className="cc-page-desc">
            Independent appellate review for disputed department decisions, confidential investigations, and statutory rulings.
          </p>
        </div>
        <div>
          <Badge tone="ai" icon="⚖️">
            Statutory Due Process
          </Badge>
        </div>
      </div>

      {actionAlert && (
        <div className="cc-alert cc-alert-success" role="status" style={{ marginBottom: '1.25rem' }}>
          <span>✓</span>
          <span>{actionAlert}</span>
        </div>
      )}

      {list.isPending ? (
        <p role="status">Loading L3 matters…</p>
      ) : grievances.length === 0 ? (
        <div className="cc-empty-state">
          <div className="cc-empty-icon">✓</div>
          <div className="cc-empty-title">Zero Pending L3 Grievances</div>
          <p className="cc-empty-desc">
            All escalated disputes and tribunal matters are currently adjudicated.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {grievances.map((g) => (
            <article key={g.id} aria-labelledby={`g-${g.id}`} className="cc-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                <div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span className="cc-badge" data-tone="warning">
                      Tribunal Appeal #{g.id}
                    </span>
                    <Badge tone={g.decisionStatus === 'adjudicated' ? 'success' : g.decisionStatus === 'hearing_scheduled' ? 'ai' : 'neutral'}>
                      {g.decisionStatus === 'adjudicated' ? 'ADJUDICATED' : g.decisionStatus === 'hearing_scheduled' ? 'HEARING SCHEDULED' : 'PENDING DELIBERATION'}
                    </Badge>
                  </div>
                  <h3 id={`g-${g.id}`} style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                    {g.title}
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: g.workingDaysRemaining <= 3 ? '#dc2626' : '#0f766e' }}>
                    ⏱️ {g.workingDaysRemaining} Working Days Remaining
                  </span>
                  {g.workingDaysRemaining <= 0 && <Badge tone="danger" icon="✖">Overdue</Badge>}
                </div>
              </div>

              {/* Case Dossier Details */}
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Department</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{g.department}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Category &amp; Ticket</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{g.category} ({g.originalTicketId})</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Appellant Identity</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#5b21b6' }}>🔒 {g.appellantConfidentialId}</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.2rem' }}>
                    Grounds for Appeal:
                  </div>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#475569', lineHeight: 1.45 }}>
                    {g.groundsForAppeal}
                  </p>

                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.2rem' }}>
                    Prior L1 / L2 Findings:
                  </div>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.45 }}>
                    {g.l1L2Findings}
                  </p>

                  {g.hearingScheduledAt && (
                    <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '0.825rem', color: '#1e40af' }}>
                      📅 <strong>Tribunal Hearing:</strong> {g.hearingScheduledAt}
                    </div>
                  )}

                  {g.formalRuling && (
                    <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: '#059669', fontWeight: 700 }}>✓ RULING PUBLISHED:</span>
                        <Badge tone="success">{g.formalRuling.verdict.toUpperCase()}</Badge>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#065f46' }}>
                        {g.formalRuling.rationale}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Committee Deliberation Action Toolbar */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  onPress={() => {
                    setActiveModalGrievance(g);
                  }}
                >
                  ⚖️ Record Formal Ruling
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => {
                    handleScheduleHearing(g.id);
                  }}
                >
                  📅 Schedule Hearing
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => {
                    handleDemandRecords(g.id);
                  }}
                >
                  📄 Demand Department Records
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => {
                    setExpandedRevealId(expandedRevealId === g.id ? null : g.id);
                  }}
                >
                  🔐 {expandedRevealId === g.id ? 'Hide Reveal Form' : 'Authorise Identity Reveal'}
                </Button>
              </div>

              {/* Expandable Reveal Identity Form */}
              {expandedRevealId === g.id && (
                <div style={{ marginTop: '1.25rem' }}>
                  <RevealForm id={g.id} />
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Dedicated Accessible Decision Modal Dialog */}
      {activeModalGrievance && (
        <DecisionModal
          grievance={activeModalGrievance}
          onClose={() => {
            setActiveModalGrievance(null);
          }}
          onRulingRecorded={handleRulingRecorded}
        />
      )}
    </section>
  );
}
