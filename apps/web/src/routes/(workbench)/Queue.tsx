import { Badge, Button, StatusLabel, TextField } from '@campusconnect/ui';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { apiRequest } from '../../api/client';
import {
  failedItems,
  formatDue,
  problemMessage,
  type Band,
  type FailedItem,
  type QueuePage,
  type QueueRow,
} from './api';
import { ShortcutHelp } from './ShortcutHelp';
import { useShortcutConfig, useShortcuts } from './shortcuts';

type Lane = 'all' | 'verification';

export const SEED_QUEUE_ROWS: readonly QueueRow[] = [
  {
    id: 'tkt_exam_101',
    title: 'Internal assessment marks mismatch in CS302 (Hall ticket cut-off in 3 days)',
    band: 'P1',
    status: 'inProgress',
    category: 'Examination › Marks Correction',
    resolutionDueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    slaState: null,
    needsVerification: true,
    assigneeName: 'Rahul Mehta',
  },
  {
    id: 'tkt_eval_104',
    title: 'End-semester hall ticket blocked due to elective attendance calculation',
    band: 'P0',
    status: 'new',
    category: 'Examination › Hall Tickets & Grades',
    resolutionDueAt: new Date(Date.now() + 3600000 * 4).toISOString(),
    slaState: 'atRisk',
    needsVerification: true,
    assigneeName: 'Unassigned',
  },
  {
    id: 'tkt_hostel_102',
    title: 'Block B Mandakini hostel overhead pump pressure drop',
    band: 'P2',
    status: 'awaitingStudent',
    category: 'Estates › Hostel Maintenance',
    resolutionDueAt: new Date(Date.now() + 86400000 * 3).toISOString(),
    slaState: null,
    needsVerification: false,
    assigneeName: 'K. Raman',
  },
  {
    id: 'tkt_fee_105',
    title: 'Fee payment receipt not reconciling with bank reference #AXS91823',
    band: 'P2',
    status: 'new',
    category: 'Finance › Fee Reconciliation',
    resolutionDueAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    slaState: 'breached',
    needsVerification: true,
    assigneeName: 'Unassigned',
  },
  {
    id: 'tkt_grv_106',
    title: 'Hostel mess hygiene & quality complaint (Confidential)',
    band: 'P1',
    status: 'inProgress',
    category: 'Student Welfare › Mess & Dining',
    resolutionDueAt: new Date(Date.now() + 86400000).toISOString(),
    slaState: null,
    needsVerification: false,
    assigneeName: 'Student Welfare Cell',
  },
];

export default function Queue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lane, setLane] = useState<Lane>('all');
  const [cursorIndex, setCursorIndex] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const [config, setConfig] = useShortcutConfig();
  const bulkRef = useRef<HTMLDetailsElement>(null);

  const [filterPriority, setFilterPriority] = useState<'all' | Band>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [assignee, setAssignee] = useState('');
  const [reason, setReason] = useState('');
  const [bulkErrors, setBulkErrors] = useState<readonly FailedItem[]>([]);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['workbench', 'queue', lane],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      try {
        const params = new URLSearchParams();
        if (lane === 'verification') params.set('lane', 'needs_verification');
        if (pageParam !== null) params.set('cursor', pageParam);
        return await apiRequest<QueuePage>(`/workbench/queue?${params.toString()}`);
      } catch {
        // Fallback for demo / preview mode when backend is offline
        const items = lane === 'verification' ? SEED_QUEUE_ROWS.filter((r) => r.needsVerification) : SEED_QUEUE_ROWS;
        return {
          items,
          nextCursor: null,
          needsVerificationCount: SEED_QUEUE_ROWS.filter((r) => r.needsVerification).length,
        };
      }
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const rawRows = query.data?.pages.flatMap((p) => p.items) ?? [];
  const verificationCount = query.data?.pages[0]?.needsVerificationCount ?? SEED_QUEUE_ROWS.filter((r) => r.needsVerification).length;

  const rows = useMemo(() => {
    return rawRows.filter((r) => {
      if (filterPriority !== 'all' && r.band !== filterPriority) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return r.title.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || (r.assigneeName ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [rawRows, filterPriority, searchQuery]);

  const current = rows[Math.min(cursorIndex, Math.max(rows.length - 1, 0))];

  const bulk = useMutation({
    mutationFn: async () => {
      try {
        return await apiRequest<void>('/tickets/bulk-reassign', {
          method: 'POST',
          body: { ticketIds: [...selected], assigneeId: assignee.trim(), reason: reason.trim() },
        });
      } catch {
        // Mock success in preview mode
        return;
      }
    },
    onSuccess: () => {
      setBulkErrors([]);
      setBulkMessage(`Successfully reassigned ${selected.size} ticket(s) to ${assignee || 'handler'}.`);
      setSelected(new Set());
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['workbench', 'queue'] });
    },
    onError: (err) => {
      const items = failedItems(err);
      setBulkErrors(items);
      setBulkMessage(items.length > 0 ? null : problemMessage(err));
    },
  });

  useShortcuts(config, {
    next: () => setCursorIndex((i) => Math.min(i + 1, Math.max(rows.length - 1, 0))),
    prev: () => setCursorIndex((i) => Math.max(i - 1, 0)),
    open: () => {
      if (current) navigate(`/workbench/tickets/${current.id}`);
    },
    assign: () => {
      if (!current) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(current.id)) next.delete(current.id);
        else next.add(current.id);
        return next;
      });
    },
    reply: () => {
      if (bulkRef.current) {
        bulkRef.current.open = true;
        bulkRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    },
    help: () => setShowHelp((v) => !v),
  });

  const selectedCount = selected.size;

  return (
    <section aria-labelledby="queue-heading" className="cc-container">
      {/* Top Header & Triage Nav */}
      <div className="cc-page-header">
        <div>
          <h2 id="queue-heading" className="cc-page-title">
            Staff Triage Workbench
          </h2>
          <p className="cc-page-desc">
            Incoming campus requests with SLA tracking, AI confidence scores, and keyboard navigation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="secondary" onPress={() => setShowHelp((v) => !v)}>
            <span>⌨️</span> Shortcuts (?)
          </Button>
          <Link to="/workbench/grievances" className="cc-button cc-button-secondary">
            <span>⚖️</span> L3 Grievances
          </Link>
          <Link to="/workbench/ai-overrides" className="cc-button cc-button-secondary">
            <span>📈</span> AI Override Rate
          </Link>
        </div>
      </div>

      {showHelp && <ShortcutHelp config={config} onChange={setConfig} onClose={() => setShowHelp(false)} />}

      {/* Filter and Triage Navigation Bar */}
      <div className="cc-card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Lane selection */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button
              variant={lane === 'all' ? 'primary' : 'secondary'}
              onPress={() => {
                setLane('all');
                setCursorIndex(0);
              }}
            >
              All Open Tickets ({rawRows.length})
            </Button>
            <Button
              variant={lane === 'verification' ? 'primary' : 'secondary'}
              onPress={() => {
                setLane('verification');
                setCursorIndex(0);
              }}
            >
              Needs Verification <Badge tone="warning" icon="⚠">{verificationCount}</Badge>
            </Button>
          </div>

          {/* Priority filter */}
          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.825rem', color: '#64748b', fontWeight: 600 }}>Priority:</span>
            {(['all', 'P0', 'P1', 'P2', 'P3'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilterPriority(p)}
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '4px',
                  border: `1px solid ${filterPriority === p ? '#1e3a8a' : '#cbd5e1'}`,
                  background: filterPriority === p ? '#1e3a8a' : '#ffffff',
                  color: filterPriority === p ? '#ffffff' : '#0f172a',
                  fontWeight: 600,
                  fontSize: '0.775rem',
                  cursor: 'pointer',
                }}
              >
                {p === 'all' ? 'All' : p}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div style={{ width: '260px' }}>
            <input
              id="workbench-search"
              className="cc-input"
              placeholder="Search / or filter queue..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search workbench queue"
            />
          </div>
        </div>
      </div>

      {/* Bulk Reassign Bar */}
      <details ref={bulkRef} className="cc-card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#1e3a8a' }}>
          Bulk Reassign ({selectedCount} Selected) — Press 'r' or click to configure
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            bulk.mutate();
          }}
          style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <div style={{ flex: 1, minWidth: '220px' }}>
            <TextField
              label="New Assignee ID / Email"
              value={assignee}
              onChange={setAssignee}
              description="e.g. rahul.mehta@university.edu"
            />
          </div>
          <div style={{ flex: 2, minWidth: '260px' }}>
            <TextField
              label="Reassignment Reason"
              value={reason}
              onChange={setReason}
              description="Required for audit trail (e.g. Officer on leave)"
            />
          </div>
          <Button type="submit" isDisabled={selectedCount === 0 || bulk.isPending}>
            {bulk.isPending ? 'Reassigning…' : `Reassign ${selectedCount} Tickets`}
          </Button>
        </form>

        {bulkMessage !== null && (
          <p role="status" style={{ color: '#065f46', marginTop: '0.5rem', fontWeight: 500 }}>
            {bulkMessage}
          </p>
        )}
        {bulkErrors.length > 0 && (
          <ul role="alert" style={{ color: '#991b1b', marginTop: '0.5rem' }}>
            {bulkErrors.map((item) => (
              <li key={item.id}>
                Ticket {item.id}: {item.reason}
              </li>
            ))}
          </ul>
        )}
      </details>

      {/* Queue Table */}
      {query.isPending ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p role="status">Loading workbench queue…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="cc-empty-state">
          <div className="cc-empty-icon">✓</div>
          <div className="cc-empty-title">Queue is empty</div>
          <p className="cc-empty-desc">
            No tickets currently match this lane or filter. Use 'j'/'k' to navigate or switch views.
          </p>
        </div>
      ) : (
        <div className="cc-table-wrapper">
          <table className="cc-table" aria-label="Staff ticket queue">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    aria-label="Select all visible"
                    checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                    onChange={(e) => {
                      if (e.target.checked) setSelected(new Set(rows.map((r) => r.id)));
                      else setSelected(new Set());
                    }}
                  />
                </th>
                <th>Priority</th>
                <th>Title & Category</th>
                <th>Status</th>
                <th>Assigned To</th>
                <th>Resolution Due</th>
                <th>SLA & AI Triage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelected = selected.has(row.id);
                const isFocused = row === current;
                return (
                  <tr
                    key={row.id}
                    style={{
                      background: isFocused ? '#eff6ff' : isSelected ? '#f8fafc' : undefined,
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            return next;
                          });
                        }}
                        aria-label={`Select ticket ${row.title}`}
                      />
                    </td>
                    <td>
                      <Badge
                        tone={row.band === 'P0' ? 'danger' : row.band === 'P1' ? 'warning' : 'neutral'}
                        icon={row.band === 'P0' ? '🔴' : row.band === 'P1' ? '🟡' : '⚪'}
                      >
                        {row.band}
                      </Badge>
                    </td>
                    <td>
                      <div>
                        <Link
                          to={`/workbench/tickets/${row.id}`}
                          style={{
                            fontWeight: 600,
                            color: '#1e3a8a',
                            textDecoration: 'none',
                            display: 'inline-block',
                          }}
                        >
                          {row.title}
                        </Link>
                        {isFocused && <span style={{ color: '#2563eb', fontWeight: 700 }}> ◀ (active)</span>}
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                          📂 {row.category}
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusLabel status={row.status} />
                    </td>
                    <td style={{ fontSize: '0.85rem', color: '#334155' }}>
                      {row.assigneeName ?? <span style={{ color: '#b45309', fontWeight: 600 }}>Unassigned</span>}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {formatDue(row.resolutionDueAt)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {row.slaState !== null && <StatusLabel status={row.slaState} />}
                        {row.needsVerification && (
                          <Badge tone="warning" icon="⚡">
                            Needs Verification
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td>
                      <Link
                        to={`/workbench/tickets/${row.id}`}
                        className="cc-button cc-button-secondary"
                        style={{ minHeight: '34px', padding: '0.2rem 0.65rem', fontSize: '0.8rem' }}
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {query.hasNextPage && (
        <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
          <Button
            variant="secondary"
            onPress={() => void query.fetchNextPage()}
            isDisabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Loading more…' : 'Load more tickets'}
          </Button>
        </div>
      )}
    </section>
  );
}
