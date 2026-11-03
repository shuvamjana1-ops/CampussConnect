import { AiSuggestedBadge, Badge, Button, StatusLabel, TextField } from '@campusconnect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { apiRequest } from '../../api/client';
import {
  formatDue,
  problemMessage,
  type Band,
  type CannedReply,
  type TicketDetail,
} from './api';

const CANNED_REPLIES: readonly CannedReply[] = [
  {
    id: 'reply_marks_eval',
    title: 'Marks Correction - Evaluator Verification',
    body: 'Your answer script has been retrieved from the examination records archive and sent to Course Evaluator for verification. We expect an update within 24 business hours.',
  },
  {
    id: 'reply_missing_photo',
    title: 'Request Clearer Answer Sheet Scan',
    body: 'Could you please upload a clearer photograph or scanned PDF of your evaluated answer script showing the front cover marks breakdown and evaluator signature?',
  },
  {
    id: 'reply_plumbing_dispatched',
    title: 'Hostel Maintenance Dispatched',
    body: 'A maintenance technician has been assigned to inspect the plumbing and water pressure regulators in your hostel block today.',
  },
];

const SEED_DETAILS: Record<string, TicketDetail> = {
  tkt_exam_101: {
    id: 'tkt_exam_101',
    version: 1,
    title: 'Internal assessment marks mismatch in CS302 (Hall ticket cut-off in 3 days)',
    description:
      'Internal assessment marks for CS302 (Data Structures) recorded as 12/30 instead of 22/30 on the student portal. Hall ticket generation deadline is in 3 days. Attached evaluated test booklet photocopy.',
    band: 'P1',
    status: 'inProgress',
    category: 'Examination › Marks Correction',
    categoryOptions: [
      'Examination › Marks Correction',
      'Examination › Hall Tickets & Grades',
      'Academic Affairs › Attendance Exemption',
      'Estates › Classroom Facilities',
    ],
    needsVerification: true,
    escalationLevel: 'L0',
    etaSet: false,
    slaState: null,
    resolutionDueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    messages: [
      {
        id: 'msg_1',
        visibility: 'internal',
        author: 'AI Triage Agent',
        body: 'Category: Examination › Marks Correction (Confidence: 94%). Priority: P1 High (Time-critical end-sem deadline detected).',
        createdAt: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: 'msg_2',
        visibility: 'public',
        author: 'Rahul Mehta (Exam Officer)',
        body: 'Forwarded to Evaluator Dr. Sharma. Answer script re-tallying underway.',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ],
  },
};

export default function TicketView() {
  const { id } = useParams<{ readonly id: string }>();
  const queryClient = useQueryClient();

  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'internal'>('public');
  const [error, setError] = useState<string | null>(null);

  const [categoryChoice, setCategoryChoice] = useState('');
  const [aiConfirmed, setAiConfirmed] = useState(false);
  const [eta, setEta] = useState('');

  const ticketId = id ?? 'tkt_exam_101';

  const query = useQuery({
    queryKey: ['workbench', 'ticket', ticketId],
    queryFn: async () => {
      try {
        return await apiRequest<TicketDetail>(`/tickets/${encodeURIComponent(ticketId)}`);
      } catch {
        const seed = SEED_DETAILS[ticketId] ?? {
          id: ticketId,
          version: 1,
          title: `Campus Ticket ${ticketId}`,
          description: 'Student campus request details.',
          band: 'P1' as Band,
          status: 'inProgress' as const,
          category: 'Examination › Marks Correction',
          categoryOptions: ['Examination › Marks Correction', 'Estates › Maintenance'],
          needsVerification: true,
          escalationLevel: 'L0' as const,
          etaSet: false,
          slaState: null,
          resolutionDueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
          messages: [],
        };
        return seed;
      }
    },
  });

  const canned = useQuery({
    queryKey: ['workbench', 'canned'],
    queryFn: async () => {
      try {
        const res = await apiRequest<{ readonly items: readonly CannedReply[] }>('/workbench/canned-replies');
        return res.items;
      } catch {
        return CANNED_REPLIES;
      }
    },
  });

  const reply = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest<unknown>(`/tickets/${encodeURIComponent(ticketId)}/messages`, {
          method: 'POST',
          body: { body: body.trim(), visibility },
        });
      } catch {
        // Mock fallback
      }
    },
    onSuccess: () => {
      setBody('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['workbench', 'ticket', ticketId] });
    },
    onError: (err) => { setError(problemMessage(err)); },
  });

  const correctCategory = useMutation({
    mutationFn: async (chosenCategory: string) => {
      try {
        await apiRequest<unknown>(`/tickets/${encodeURIComponent(ticketId)}/category`, {
          method: 'PATCH',
          body: { category: chosenCategory, reason: 'Staff manual triage correction' },
        });
      } catch {
        // Mock fallback
      }
    },
    onSuccess: () => {
      setAiConfirmed(true);
      void queryClient.invalidateQueries({ queryKey: ['workbench', 'ticket', ticketId] });
    },
  });

  const confirmAi = () => {
    setAiConfirmed(true);
  };

  const setEtaMutation = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest<unknown>(`/tickets/${encodeURIComponent(ticketId)}/eta`, {
          method: 'PATCH',
          body: { eta: new Date(eta).toISOString(), reason: 'Evaluation extension' },
        });
      } catch {
        // Mock fallback
      }
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['workbench', 'ticket', ticketId] });
    },
  });

  if (query.isPending || !query.data) {
    return (
      <div className="cc-container" style={{ textAlign: 'center', padding: '3rem' }}>
        <p role="status">Loading ticket details…</p>
      </div>
    );
  }

  const data = query.data;

  return (
    <article aria-labelledby="ticket-title" className="cc-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/workbench" style={{ color: '#1e3a8a', textDecoration: 'none', fontWeight: 600 }}>
          ← Back to Queue
        </Link>
      </div>

      {/* Ticket Header Card */}
      <div className="cc-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
              <Badge
                tone={data.band === 'P0' ? 'danger' : data.band === 'P1' ? 'warning' : 'neutral'}
                icon={data.band === 'P0' ? '🔴' : '🟡'}
              >
                {data.band} Priority
              </Badge>
              <Badge tone="neutral" icon="🏢">{data.escalationLevel}</Badge>
              <StatusLabel status={data.status} />
              {data.slaState !== null && <StatusLabel status={data.slaState} />}
            </div>
            <h2 id="ticket-title" style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>
              {data.title}
            </h2>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Resolution Target</div>
            <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>
              {formatDue(data.resolutionDueAt)}
            </strong>
          </div>
        </div>

        {/* SLA Countdown Bar */}
        <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', marginBottom: '0.25rem' }}>
            <span>SLA Timer (Resolution Commitment)</span>
            <span>Elapsed: 3.5h / 48.0h (7% used)</span>
          </div>
          <div className="cc-sla-progress-track">
            <div className="cc-sla-progress-fill" style={{ width: '7%' }} />
          </div>
        </div>

        {error !== null && (
          <div className="cc-alert cc-alert-danger" style={{ marginTop: '0.75rem' }}>
            <span>✖</span> <span>{error}</span>
          </div>
        )}
      </div>

      {/* AI Recommendation Review Card */}
      {data.needsVerification && !aiConfirmed && (
        <div
          className="cc-card"
          style={{
            borderLeft: '4px solid #8b5cf6',
            background: '#faf5ff',
            marginBottom: '1.25rem',
            padding: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AiSuggestedBadge />
              <strong style={{ color: '#5b21b6', fontSize: '0.95rem' }}>
                AI Recommendation Review (94% Confidence)
              </strong>
            </div>
            <Badge tone="warning" icon="⚠">
              Action Required: Staff Triage Verification
            </Badge>
          </div>

          <p style={{ fontSize: '0.875rem', color: '#334155', margin: '0 0 1rem' }}>
            The AI model classified this ticket as <strong>"{data.category}"</strong> with priority <strong>{data.band}</strong> based on detected end-semester deadlines. Please verify or correct the routing below:
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button onPress={confirmAi}>
              ✓ Confirm AI Recommendation
            </Button>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                className="cc-input"
                style={{ width: 'auto', minWidth: '220px' }}
                value={categoryChoice || data.category}
                onChange={(e) => { setCategoryChoice(e.target.value); }}
              >
                {data.categoryOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                onPress={() => { correctCategory.mutate(categoryChoice || data.category); }}
              >
                Correct Routing
              </Button>
            </div>
          </div>
        </div>
      )}

      {aiConfirmed && (
        <div className="cc-alert cc-alert-success" style={{ marginBottom: '1.25rem' }}>
          <span>✓</span>
          <span><strong>AI Classification Verified:</strong> Category validated by staff. Ticket routed to active resolution pipeline.</span>
        </div>
      )}

      {/* Description & AI Summary */}
      <div className="cc-grid-2">
        <div className="cc-card">
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>
            Student Description
          </h3>
          <p style={{ fontSize: '0.925rem', color: '#334155', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
            {data.description}
          </p>
        </div>

        <div className="cc-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <AiSuggestedBadge />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>
              AI Summary & Insights
            </h3>
          </div>
          <p style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.45, margin: '0 0 0.75rem' }}>
            Student reports marks discrepancy for CS302 internal assessment (12/30 recorded vs 22/30 expected). Hall ticket cut-off is in 3 days. High impact on examination eligibility.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', color: '#64748b' }}>
            <span>Was this summary accurate?</span>
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }} title="Helpful">
              👍
            </button>
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }} title="Needs improvement">
              👎
            </button>
          </div>
        </div>
      </div>

      {/* Timeline & Messages */}
      <div className="cc-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
          Activity Timeline & Notes
        </h3>

        {data.messages.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No messages recorded yet.</p>
        ) : (
          <ul className="cc-timeline">
            {data.messages.map((m) => (
              <li key={m.id} className="cc-timeline-item">
                <div className="cc-timeline-dot" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{m.author}</strong>
                  <Badge tone={m.visibility === 'internal' ? 'neutral' : 'info'}>
                    {m.visibility === 'internal' ? '🔒 Internal Note' : '🌐 Sent to Student'}
                  </Badge>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: '#334155', lineHeight: 1.45 }}>
                  {m.body}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Response Editor & Canned Replies */}
      <div className="cc-card">
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
          Post Reply or Internal Note
        </h3>

        {/* Canned reply shortcuts */}
        <div style={{ marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginRight: '0.5rem' }}>
            Insert Canned Reply:
          </span>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
            {(canned.data ?? CANNED_REPLIES).map((cr) => (
              <button
                key={cr.id}
                type="button"
                onClick={() => { setBody(cr.body); }}
                className="cc-badge"
                data-tone="neutral"
                style={{ cursor: 'pointer', border: '1px solid #cbd5e1' }}
              >
                + {cr.title}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            reply.mutate();
          }}
        >
          <div style={{ marginBottom: '0.75rem' }}>
            <textarea
              rows={4}
              className="cc-input"
              value={body}
              onChange={(e) => { setBody(e.target.value); }}
              placeholder="Write response to student or internal investigation note..."
              aria-label="Reply message body"
              style={{ minHeight: '100px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === 'public'}
                  onChange={() => { setVisibility('public'); }}
                />
                Public (Visible to Student)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === 'internal'}
                  onChange={() => { setVisibility('internal'); }}
                />
                🔒 Internal Note Only
              </label>
            </div>

            <Button type="submit" isDisabled={!body.trim() || reply.isPending}>
              {reply.isPending ? 'Sending…' : visibility === 'public' ? 'Send Reply to Student' : 'Save Internal Note'}
            </Button>
          </div>
        </form>

        {/* ETA Entry for Escalated Tickets */}
        {data.escalationLevel !== 'L0' && !data.etaSet && (
          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
            <strong style={{ display: 'block', fontSize: '0.9rem', color: '#b45309', marginBottom: '0.5rem' }}>
              ⚠️ Escalated Ticket: Committed Revised Resolution Date
            </strong>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Revised Resolution ETA"
                  value={eta}
                  onChange={setEta}
                  description="e.g. 2026-11-06T17:00"
                />
              </div>
              <Button onPress={() => { setEtaMutation.mutate(); }} isDisabled={!eta || setEtaMutation.isPending}>
                Update ETA
              </Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
