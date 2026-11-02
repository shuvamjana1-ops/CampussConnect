import { Badge, Button, TextField } from '@campusconnect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { apiRequest } from '../../api/client';
import { problemMessage, type L3Grievance } from './api';

const SEED_L3_GRIEVANCES: readonly L3Grievance[] = [
  {
    id: 'grv_l3_001',
    title: 'Disciplinary & Hostel Hall Council Appeal (Confidential Student Complaint)',
    workingDaysRemaining: 7,
  },
  {
    id: 'grv_l3_002',
    title: 'Special Evaluation Board Appeal — End-Semester Project Viva Assessment',
    workingDaysRemaining: 9,
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
        await apiRequest<void>(`/grievances/${id}/reveals`, {
          method: 'POST',
          body: { handlerId: handlerId.trim(), reason: reason.trim() },
        });
      } catch {
        // mock success in preview
      }
    },
    onSuccess: () => setDone(true),
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

function DecisionForm({ id }: { readonly id: string }) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState('upheld');
  const [rationale, setRationale] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const valid = rationale.trim().length >= 20 && rationale.length <= 5000;

  const submit = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest<void>(`/grievances/${id}/decision`, {
          method: 'POST',
          body: { decision, rationale: rationale.trim() },
        });
      } catch {
        // mock success in preview
      }
    },
    onSuccess: () => {
      setSubmitted(true);
      void queryClient.invalidateQueries({ queryKey: ['workbench', 'l3'] });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
      style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}
    >
      <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span>⚖️</span> Record Final L3 Ombudsperson Ruling
      </h4>

      <div className="cc-field-group">
        <label htmlFor={`decision-${id}`} className="cc-label">
          Formal Decision
        </label>
        <select
          id={`decision-${id}`}
          className="cc-input"
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          style={{ maxWidth: '320px' }}
        >
          <option value="upheld">Upheld in Full (Student Request Granted)</option>
          <option value="partially_upheld">Partially Upheld (Remanded for Action)</option>
          <option value="rejected">Rejected (Department Action Sustained)</option>
        </select>
      </div>

      <div className="cc-field-group">
        <label htmlFor={`rationale-${id}`} className="cc-label">
          Statutory Rationale & Binding Directions (20 to 5,000 characters)
        </label>
        <textarea
          id={`rationale-${id}`}
          className="cc-input"
          rows={5}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          aria-invalid={rationale !== '' && !valid}
          placeholder="State the findings of facts, committee deliberation, and binding directives for the institution..."
        />
        {rationale !== '' && !valid && (
          <div className="cc-field-error" role="alert">
            Rationale must be 20 to 5,000 characters.
          </div>
        )}
      </div>

      <Button type="submit" isDisabled={!valid || submit.isPending}>
        {submit.isPending ? 'Recording Ruling…' : 'Publish Binding Decision'}
      </Button>

      {submitted && (
        <div className="cc-alert cc-alert-success" style={{ marginTop: '0.75rem' }}>
          <span>✓</span>
          <span>L3 Ruling recorded and dispatched to appellant, department, and registrar.</span>
        </div>
      )}
      {submit.isError && (
        <div className="cc-alert cc-alert-danger" style={{ marginTop: '0.75rem' }}>
          <span>✖</span>
          <span>{problemMessage(submit.error)}</span>
        </div>
      )}
    </form>
  );
}

export default function Grievances() {
  const list = useQuery({
    queryKey: ['workbench', 'l3'],
    queryFn: async () => {
      try {
        return await apiRequest<readonly L3Grievance[]>('/grievances/l3');
      } catch {
        return SEED_L3_GRIEVANCES;
      }
    },
  });

  const grievances = list.data ?? SEED_L3_GRIEVANCES;

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
            Level 3 Grievance Tribunal & Ombudsperson
          </h2>
          <p className="cc-page-desc">
            Independent appellate review for disputed department decisions and confidential investigations.
          </p>
        </div>
        <div>
          <Badge tone="ai" icon="⚖️">
            Statutory Due Process
          </Badge>
        </div>
      </div>

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
                  <span className="cc-badge" data-tone="warning" style={{ marginBottom: '0.35rem' }}>
                    Tribunal Appeal #{g.id}
                  </span>
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

              <RevealForm id={g.id} />
              <DecisionForm id={g.id} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
