import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSession } from '../../auth/session';
import { useToast } from '../../components/Toast';
import { UserProfileSection } from '../../components/UserProfileSection';
import { isSupabaseConfigured, supabase, type DbTask, type DbWorkItem } from '../../lib/supabase';
import { complaintStore, type ComplaintData } from '../../services/complaintStore';

export default function WorkerDashboard() {
  const { user, profile } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'tasks';
  const { toast } = useToast();

  const [complaints, setComplaints] = useState<readonly ComplaintData[]>(() => complaintStore.getComplaints());
  const [tasks, setTasks] = useState<DbTask[]>([]);
  const [workItems, setWorkItems] = useState<DbWorkItem[]>([]);
  const [, setLoading] = useState(true);

  // Resolution modal state
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintData | null>(null);
  const [selectedTask, setSelectedTask] = useState<DbTask | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [newStatus, setNewStatus] = useState<DbTask['status']>('in_progress');
  const [acMarksCorrection, setAcMarksCorrection] = useState<number>(22);

  // New Work item submission form
  const [workTitle, setWorkTitle] = useState('');
  const [workDetails, setWorkDetails] = useState('');

  // Subscribe to complaintStore for real-time AC complaint updates
  useEffect(() => {
    const unsubscribe = complaintStore.subscribe(() => {
      setComplaints(complaintStore.getComplaints());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    async function loadWorkerData() {
      setLoading(true);
      try {
        if (isSupabaseConfigured && user) {
          // In Supabase, RLS automatically restricts to tasks owned by user or accessible
          const { data: t } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
          if (t) setTasks(t as DbTask[]);

          const { data: w } = await supabase.from('work_items').select('*').order('created_at', { ascending: false });
          if (w) setWorkItems(w as DbWorkItem[]);
        } else {
          // Demo fallback
          setTasks([
            {
              id: 'task-w1-01',
              owner_id: user?.id || 'usr-worker-demo-01',
              title: 'CS302 Answer Script Batch Audit & Moderation',
              description: 'Audit 65 student answer scripts and cross-reference with marks entry portal.',
              category: 'Examination',
              priority: 'urgent',
              status: 'in_progress',
              resolution_notes: 'Checking answer scripts for hall ticket cut-off deadline.',
              created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'task-w1-02',
              owner_id: user?.id || 'usr-worker-demo-01',
              title: 'Mandakini Hostel Wi-Fi Diagnostic & Hardware Inspection',
              description: 'Diagnose router failure on 3rd floor corridor and replace power adaptor.',
              category: 'Infrastructure',
              priority: 'high',
              status: 'pending',
              created_at: new Date(Date.now() - 3600000 * 10).toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]);

          setWorkItems([
            {
              id: 'wi-01',
              owner_id: user?.id || 'usr-worker-demo-01',
              title: 'CS302 Moderation Worksheet',
              details: 'Tabulated marks comparison sheet with signed dean authorization.',
              status: 'reviewed',
              created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
            },
          ]);
        }
      } catch (e) {
        console.error('Error loading worker data:', e);
      } finally {
        setLoading(false);
      }
    }

    void loadWorkerData();
  }, [user]);

  const handleApplyResolution = async () => {
    if (!selectedTask) return;

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('tasks')
          .update({
            status: newStatus,
            resolution_notes: resolutionNote,
          })
          .eq('id', selectedTask.id);

        if (error) {
          toast(error.message, 'error');
          return;
        }
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === selectedTask.id ? { ...t, status: newStatus, resolution_notes: resolutionNote } : t,
        ),
      );

      toast('Work order & resolution note updated!', 'success');
      setSelectedTask(null);
      setResolutionNote('');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleApplyComplaintResolution = (stage: any) => {
    if (!selectedComplaint) return;
    const actor = profile?.full_name || 'Staff Specialist';
    complaintStore.updateStatus(selectedComplaint.id, stage, resolutionNote || `Evaluator progressed status to ${stage}`, actor);
    toast(`Grievance #${selectedComplaint.reference} updated to ${stage}!`, 'success');
    setSelectedComplaint(null);
    setResolutionNote('');
  };

  const handleDirectMarksCorrection = (subjectCode: string, studentId: string) => {
    if (!selectedComplaint) return;
    const actor = profile?.full_name || 'Prof. Rahul Mehta (Course Evaluator)';
    complaintStore.updateACMarks(studentId, subjectCode, acMarksCorrection);
    complaintStore.updateStatus(
      selectedComplaint.id,
      'resolved',
      `Physical exam booklet retrieved from archive and re-tallied. Internal marks for ${subjectCode} updated to ${acMarksCorrection}/30. Discrepancy resolved.`,
      actor,
    );
    toast(`Marks updated to ${acMarksCorrection}/30 for ${studentId}. Grievance marked as Resolved!`, 'success');
    setSelectedComplaint(null);
    setResolutionNote('');
  };

  const handleCreateWorkItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workTitle.trim() || !workDetails.trim()) return;

    try {
      const newItem: DbWorkItem = {
        id: `wi-${Date.now()}`,
        owner_id: user?.id || 'usr-worker-01',
        title: workTitle,
        details: workDetails,
        status: 'submitted',
        created_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured && user) {
        const { data, error } = await supabase
          .from('work_items')
          .insert({
            owner_id: user.id,
            title: workTitle,
            details: workDetails,
            status: 'submitted',
          })
          .select()
          .single();

        if (error) {
          toast(error.message, 'error');
          return;
        }
        if (data) setWorkItems((prev) => [data as DbWorkItem, ...prev]);
      } else {
        setWorkItems((prev) => [newItem, ...prev]);
      }

      toast('Work docket registered into your isolated queue!', 'success');
      setWorkTitle('');
      setWorkDetails('');
      setSearchParams({ tab: 'submissions' });
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const isFacilitiesWorker = user?.email?.includes('worker2') || profile?.department?.includes('Facilities');
  const relevantComplaints = complaints.filter((c: ComplaintData) => {
    if (isFacilitiesWorker) {
      return c.type === 'Hostel' || c.type === 'Infrastructure' || c.assignedStaffName?.includes('Dilip');
    }
    // Worker 1 (Examination / Records / Academic):
    return c.type === 'Academic' || c.type === 'Grievance' || c.assignedStaffName?.includes('Rahul') || !c.assignedStaffName;
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--worker-primary)', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
          <span>🔧</span> STAFF RESOLUTION WORKSPACE · JIS UNIVERSITY
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)', margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>
          Assigned Work Orders & Docket Triage
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Logged in as <strong>{profile?.full_name}</strong> ({profile?.department}). All action records are strictly partitioned via Postgres RLS.
        </p>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        <div className="cf-card" style={{ borderLeft: '4px solid var(--worker-primary)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            My Active Work Orders
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)', margin: '0.4rem 0' }}>
            {tasks.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--worker-primary)', fontWeight: 600 }}>
            {tasks.filter((t) => t.status === 'in_progress').length} In Active Execution
          </div>
        </div>

        <div className="cf-card" style={{ borderLeft: '4px solid #14b8a6' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Submitted Work Items
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)', margin: '0.4rem 0' }}>
            {workItems.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#0f766e', fontWeight: 600 }}>
            Logged In Isolated Queue
          </div>
        </div>

        <div className="cf-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            RLS Isolation Status
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#059669', margin: '0.6rem 0' }}>
            ENFORCED
          </div>
          <div style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>
            No Cross-Worker Data Leakage
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'tasks' })}
          className={`cf-btn ${activeTab === 'tasks' ? 'cf-btn-worker' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          📋 Assigned Tasks ({tasks.length})
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'submissions' })}
          className={`cf-btn ${activeTab === 'submissions' ? 'cf-btn-worker' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          📂 Work Items & Evidence ({workItems.length})
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'create' })}
          className={`cf-btn ${activeTab === 'create' ? 'cf-btn-worker' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          ➕ Register Work Docket
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'profile' })}
          className={`cf-btn ${activeTab === 'profile' ? 'cf-btn-worker' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          👤 Profile Photo &amp; Details
        </button>
      </div>

      {/* Tab 1: Tasks Queue */}
      {activeTab === 'tasks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section: Student AC Complaints & Grievances */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>🎓</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)', fontWeight: 800 }}>
                  Assigned Student Grievances & Academic Cases ({relevantComplaints.length})
                </h3>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--worker-primary)', background: 'var(--worker-light)', padding: '3px 8px', borderRadius: '6px' }}>
                Real-Time Triage Synced
              </span>
            </div>

            {relevantComplaints.length === 0 ? (
              <div className="cf-card cf-empty-state" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>No student grievances currently assigned to your department queue.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                {relevantComplaints.map((c) => {
                  const isResolved = c.currentStage === 'resolved';
                  const isP0 = c.priority.includes('P0');

                  return (
                    <div key={c.id} className="cf-card cf-card-hover" style={{ borderLeft: `4px solid ${isResolved ? '#059669' : isP0 ? '#dc2626' : 'var(--worker-primary)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ flex: 1, minWidth: '280px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <span className={`cf-status-badge ${isP0 ? 'cf-status-urgent' : 'cf-status-pending'}`}>
                              {c.priority}
                            </span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                              {c.type}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              · {c.reference}
                            </span>
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700 }}>
                              👤 {c.student.name} ({c.student.rollNumber})
                            </span>
                          </div>

                          <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', color: 'var(--text-main)', fontWeight: 800 }}>
                            {c.title}
                          </h3>
                          <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            {c.description}
                          </p>

                          {c.timeline.length > 0 && (
                            <div style={{ padding: '8px 12px', background: 'var(--bg-surface-subtle)', borderRadius: '8px', fontSize: '0.825rem', color: 'var(--text-main)', borderLeft: '3px solid var(--worker-primary)' }}>
                              <strong>Latest Status:</strong> {c.timeline[c.timeline.length - 1]?.description}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                          <span className={`cf-status-badge cf-status-${isResolved ? 'completed' : 'in_progress'}`} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            {c.currentStage.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedComplaint(c);
                              setResolutionNote(c.timeline[c.timeline.length - 1]?.description || '');
                            }}
                            className="cf-btn cf-btn-worker"
                            style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                          >
                            ⚡ Work on This Case →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section: Internal Department Tasks */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.1rem' }}>🔧</span>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)', fontWeight: 800 }}>
                Internal Department Tasks & Work Orders ({tasks.length})
              </h3>
            </div>

            {tasks.map((t) => (
              <div key={t.id} className="cf-card cf-card-hover" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span className={`cf-status-badge ${t.priority === 'urgent' ? 'cf-status-urgent' : 'cf-status-pending'}`}>
                        {t.priority.toUpperCase()}
                      </span>
                      <span className={`cf-status-badge cf-status-${t.status}`}>
                        {t.status.replace('_', ' ').toUpperCase()}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Category: <strong>{t.category}</strong>
                      </span>
                    </div>

                    <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', color: 'var(--text-main)', fontWeight: 800 }}>
                      {t.title}
                    </h3>
                    <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {t.description}
                    </p>

                    {t.resolution_notes && (
                      <div style={{ padding: '8px 12px', background: 'var(--bg-surface-subtle)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-main)', borderLeft: '3px solid var(--worker-primary)' }}>
                        <strong>Latest Resolution Note:</strong> {t.resolution_notes}
                      </div>
                    )}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTask(t);
                        setNewStatus(t.status);
                        setResolutionNote(t.resolution_notes || '');
                      }}
                      className="cf-btn cf-btn-worker"
                      style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                    >
                      ⚡ Update Task Status
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Work Items */}
      {activeTab === 'submissions' && (
        <div className="cf-card">
          <h3 style={{ margin: '0 0 1rem', fontSize: '1.15rem', fontWeight: 800 }}>
            My Registered Work Items & Inspection Dossiers
          </h3>
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Details & Finding Notes</th>
                  <th>Status</th>
                  <th>Recorded At</th>
                </tr>
              </thead>
              <tbody>
                {workItems.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <strong style={{ color: 'var(--text-main)' }}>{w.title}</strong>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {w.details}
                    </td>
                    <td>
                      <span className="cf-status-badge cf-status-completed">
                        {w.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(w.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Create Work Docket */}
      {activeTab === 'create' && (
        <div className="cf-card" style={{ maxWidth: '680px', margin: '0 auto' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 800 }}>
            Register New Work Docket
          </h3>
          <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Store official findings, equipment test forms, or answer script re-tally moderation sheets into your isolated tenant storage.
          </p>

          <form onSubmit={handleCreateWorkItem} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Docket Title
              </label>
              <input
                type="text"
                required
                value={workTitle}
                onChange={(e) => setWorkTitle(e.target.value)}
                placeholder="e.g., CS302 Moderation Worksheet / Substation Generator Log"
                className="cf-input"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Detailed Findings & Resolution Summary
              </label>
              <textarea
                required
                rows={4}
                value={workDetails}
                onChange={(e) => setWorkDetails(e.target.value)}
                placeholder="Include specific roll numbers, equipment readings, action taken, and clearance approvals..."
                className="cf-textarea"
              />
            </div>

            <button type="submit" className="cf-btn cf-btn-worker" style={{ alignSelf: 'flex-start', padding: '10px 20px' }}>
              ✓ Save Work Docket (RLS Secured)
            </button>
          </form>
        </div>
      )}

      {/* Tab 4: Profile Photo & Details */}
      {activeTab === 'profile' && (
        <UserProfileSection />
      )}

      {/* Resolution Modal */}
      {selectedTask && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div className="cf-card" style={{ maxWidth: '520px', width: '100%', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 800 }}>
              Update Work Order: #{selectedTask.id.slice(0, 8)}
            </h3>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {selectedTask.title}
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                New Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as any)}
                className="cf-select"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Resolution / Investigation Note
              </label>
              <textarea
                rows={4}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="State the findings, corrections made, or service dispatch details..."
                className="cf-textarea"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="cf-btn cf-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyResolution}
                className="cf-btn cf-btn-worker"
              >
                Save & Apply Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Grievance Action Modal */}
      {selectedComplaint && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="cf-card" style={{ maxWidth: '560px', width: '100%', boxShadow: 'var(--shadow-xl)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className={`cf-status-badge ${selectedComplaint.priority.includes('P0') ? 'cf-status-urgent' : 'cf-status-pending'}`}>
                {selectedComplaint.priority}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {selectedComplaint.reference}
              </span>
            </div>

            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 800 }}>
              Work on Grievance: {selectedComplaint.title}
            </h3>

            <div style={{ padding: '8px 12px', background: 'var(--bg-surface-subtle)', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              <div><strong>Student:</strong> {selectedComplaint.student.name} ({selectedComplaint.student.rollNumber})</div>
              <div><strong>Department:</strong> {selectedComplaint.student.department}</div>
              <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>{selectedComplaint.description}</div>
            </div>

            {/* If Academic marks complaint: Direct marks adjustment */}
            {(selectedComplaint.type === 'Academic' || selectedComplaint.title.toLowerCase().includes('marks')) && (
              <div style={{ padding: '14px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe', marginBottom: '1.25rem' }}>
                <strong style={{ fontSize: '0.9rem', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span>⚡</span> Direct Academic Section (AC) Marks Correction
                </strong>
                <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#1d4ed8' }}>
                  Evaluator authority: verify physical script from exam records and update the recorded marks on the university server.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e3a8a' }}>New Internal Marks:</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={acMarksCorrection}
                    onChange={(e) => setAcMarksCorrection(Number(e.target.value))}
                    className="cf-input"
                    style={{ width: '80px', padding: '6px 10px', fontWeight: 800 }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e3a8a' }}>/ 30</span>
                  <button
                    type="button"
                    onClick={() => handleDirectMarksCorrection('CS302', selectedComplaint.student.id)}
                    className="cf-btn cf-btn-worker"
                    style={{ padding: '8px 16px', fontSize: '0.825rem' }}
                  >
                    ✓ Correct Marks to {acMarksCorrection}/30 &amp; Resolve Ticket
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Resolution / Investigation Findings
              </label>
              <textarea
                rows={3}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Document verification findings, answer script re-tallying, or work order dispatch..."
                className="cf-textarea"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setSelectedComplaint(null)}
                className="cf-btn cf-btn-secondary"
              >
                Cancel
              </button>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleApplyComplaintResolution('under_review')}
                  className="cf-btn cf-btn-secondary"
                >
                  Mark Under Review
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyComplaintResolution('resolved')}
                  className="cf-btn cf-btn-worker"
                >
                  ✓ Mark as Resolved
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
