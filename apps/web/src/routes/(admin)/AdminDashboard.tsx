import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useToast } from '../../components/Toast';
import { UserProfileSection } from '../../components/UserProfileSection';
import { isSupabaseConfigured, supabase, type DbTask, type Profile } from '../../lib/supabase';
import { complaintStore, type ComplaintData } from '../../services/complaintStore';

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'command';
  const { toast } = useToast();

  const [complaints, setComplaints] = useState<readonly ComplaintData[]>(() => complaintStore.getComplaints());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<DbTask[]>([]);
  const [, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Admin action modal state
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintData | null>(null);
  const [targetStage, setTargetStage] = useState<string>('resolved');
  const [assignedStaff, setAssignedStaff] = useState<string>('Prof. Rahul Mehta');
  const [adminResolutionNote, setAdminResolutionNote] = useState<string>('');
  const [acMarksInput, setAcMarksInput] = useState<number>(22);

  // Subscribe to complaintStore for real-time sync with Student AC and Worker actions
  useEffect(() => {
    const unsubscribe = complaintStore.subscribe(() => {
      setComplaints(complaintStore.getComplaints());
    });
    return unsubscribe;
  }, []);

  // Load live data from Supabase
  useEffect(() => {
    async function loadAdminData() {
      setLoading(true);
      try {
        if (isSupabaseConfigured) {
          const { data: profs } = await supabase.from('profiles').select('*');
          if (profs) setProfiles(profs as Profile[]);

          const { data: ts } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
          if (ts) setTasks(ts as DbTask[]);
        } else {
          // Demo fallback
          setProfiles([
            { id: 'usr-admin-01', full_name: 'Dr. Suresh Kumar', email: 'admin@demo.com', role: 'admin', department: 'Administration' },
            { id: 'usr-worker-01', full_name: 'Prof. Rahul Mehta', email: 'worker1@demo.com', role: 'worker', department: 'Examination & Records' },
            { id: 'usr-worker-02', full_name: 'Er. Dilip Roy', email: 'worker2@demo.com', role: 'worker', department: 'Facilities & Infrastructure' },
            { id: 'usr-student-01', full_name: 'Ananya Das', email: 'student1@demo.com', role: 'student', department: 'Computer Science & Engineering' },
            { id: 'usr-student-02', full_name: 'Rohan Sharma', email: 'student2@demo.com', role: 'student', department: 'Electronics & Communication' },
          ]);

          setTasks([
            {
              id: 'task-01',
              owner_id: 'usr-student-01',
              title: 'Internal Assessment Marks Discrepancy in CS302',
              description: 'Mid-term evaluation was recorded as 12/30 instead of 22/30 in grade book.',
              category: 'Examination',
              priority: 'high',
              status: 'in_progress',
              resolution_notes: 'Retrieved exam script from archives; re-tallying underway with evaluator.',
              created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'task-02',
              owner_id: 'usr-student-01',
              title: 'Mandakini Hostel Block B Wi-Fi Router Downtime',
              description: 'Access point AP-304 on 3rd floor corridor has been unreachable since 08:00 AM.',
              category: 'Infrastructure',
              priority: 'urgent',
              status: 'pending',
              created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'task-03',
              owner_id: 'usr-student-02',
              title: 'NPTEL Credit Transfer Verification Request',
              description: 'Submitted 12-week NPTEL course in Embedded Systems for 3 academic credit points.',
              category: 'Academic',
              priority: 'low',
              status: 'in_progress',
              created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'task-04',
              owner_id: 'usr-worker-01',
              title: 'CS302 Answer Script Batch Audit & Moderation',
              description: 'Audit 65 student answer scripts and cross-reference with marks entry portal.',
              category: 'Examination',
              priority: 'urgent',
              status: 'in_progress',
              created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]);
        }
      } catch (e) {
        console.error('Error loading admin data:', e);
      } finally {
        setLoading(false);
      }
    }

    void loadAdminData();
  }, []);

  const handleUpdateStatus = async (taskId: string, newStatus: DbTask['status']) => {
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
        if (error) {
          toast(error.message, 'error');
          return;
        }
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
      toast(`Task #${taskId.slice(0, 8)} status updated to ${newStatus}`, 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleApplyAdminOverride = (stage: any, staff: string) => {
    if (!selectedComplaint) return;
    complaintStore.updateStatus(selectedComplaint.id, stage, adminResolutionNote || `Admin Super-User updated status to ${stage}`, staff);
    complaintStore.reassignStaff(selectedComplaint.id, staff);
    toast(`Admin Override: Grievance #${selectedComplaint.reference} updated to ${stage} and assigned to ${staff}`, 'success');
    setSelectedComplaint(null);
    setAdminResolutionNote('');
  };

  const handleAdminDirectMarksCorrection = (subjectCode: string, studentId: string) => {
    if (!selectedComplaint) return;
    complaintStore.updateACMarks(studentId, subjectCode, acMarksInput);
    complaintStore.updateStatus(
      selectedComplaint.id,
      'resolved',
      `Administrative Dean clearance: Answer script re-verified and marks corrected on official university transcript to ${acMarksInput}/30. Discrepancy resolved.`,
      'Dr. Suresh Kumar (Registrar & Admin)',
    );
    toast(`Academic record updated to ${acMarksInput}/30! Grievance #${selectedComplaint.reference} resolved.`, 'success');
    setSelectedComplaint(null);
    setAdminResolutionNote('');
  };

  const filteredTasks = statusFilter === 'all' ? tasks : tasks.filter((t) => t.status === statusFilter);

  return (
    <div>
      {/* Top Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--admin-accent)', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
          <span>🏛️</span> SUPER-USER COMMAND CENTER · JIS UNIVERSITY
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)', margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>
          Universal Operations & Governance
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Administrator oversight with full cross-tenant visibility, audit capabilities, and real-time SLA tracking.
        </p>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        <div className="cf-card" style={{ borderLeft: '4px solid var(--admin-accent)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Total User Profiles
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)', margin: '0.4rem 0' }}>
            {profiles.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--admin-accent)', fontWeight: 600 }}>
            Active across 3 RBAC Roles
          </div>
        </div>

        <div className="cf-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Global Tasks & Grievances
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)', margin: '0.4rem 0' }}>
            {tasks.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 600 }}>
            {tasks.filter((t) => t.status !== 'completed').length} Pending Resolution
          </div>
        </div>

        <div className="cf-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Security Layer
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#059669', margin: '0.6rem 0' }}>
            RLS ENFORCED
          </div>
          <div style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>
            Row-Level Postgres Policies
          </div>
        </div>

        <div className="cf-card" style={{ borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Role Tampering Defense
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#2563eb', margin: '0.6rem 0' }}>
            TRIGGER LOCKED
          </div>
          <div style={{ fontSize: '0.8rem', color: '#1d4ed8', fontWeight: 600 }}>
            Only Admin Can Mutate Role
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'command' })}
          className={`cf-btn ${activeTab === 'command' ? 'cf-btn-admin' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          📋 Universal Task Roster ({tasks.length})
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'users' })}
          className={`cf-btn ${activeTab === 'users' ? 'cf-btn-admin' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          👥 User Directory ({profiles.length})
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'security' })}
          className={`cf-btn ${activeTab === 'security' ? 'cf-btn-admin' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          🛡️ RLS Isolation Audit
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'profile' })}
          className={`cf-btn ${activeTab === 'profile' ? 'cf-btn-admin' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          👤 Profile Photo &amp; Details
        </button>
      </div>

      {/* Tab 1: Tasks Command Center */}
      {activeTab === 'command' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Active Student Grievances Section */}
          <div className="cf-card" style={{ borderLeft: '4px solid var(--admin-accent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  🎓 Student Grievances & Academic AC Cases ({complaints.length})
                </h3>
                <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                  Synchronized live from Student Portal & Academic Section (AC) registrations.
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--admin-accent)', background: 'var(--admin-light)', padding: '4px 10px', borderRadius: '6px' }}>
                Universal Super-User Access
              </span>
            </div>

            <div className="cf-table-container">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Docket / Reference</th>
                    <th>Student Identity</th>
                    <th>Classification</th>
                    <th>Assigned Staff</th>
                    <th>Current Stage</th>
                    <th style={{ textAlign: 'right' }}>Admin Action</th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.map((c) => {
                    const isP0 = c.priority.includes('P0');
                    const isResolved = c.currentStage === 'resolved';

                    return (
                      <tr key={c.id}>
                        <td>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                            {c.reference}
                          </span>
                          <strong style={{ display: 'block', color: 'var(--text-main)', marginTop: '2px' }}>
                            {c.title}
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {c.description.slice(0, 80)}...
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{c.student.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {c.student.rollNumber}
                          </div>
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                            {c.student.department}
                          </div>
                        </td>
                        <td>
                          <span className={`cf-status-badge ${isP0 ? 'cf-status-urgent' : 'cf-status-pending'}`} style={{ display: 'inline-block', marginBottom: '4px' }}>
                            {c.priority}
                          </span>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{c.type}</div>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: c.assignedStaffName ? 'var(--text-main)' : 'var(--text-muted)' }}>
                            {c.assignedStaffName || 'Unassigned (In Triage Queue)'}
                          </span>
                        </td>
                        <td>
                          <span className={`cf-status-badge cf-status-${isResolved ? 'completed' : 'in_progress'}`}>
                            {c.currentStage.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedComplaint(c);
                              setTargetStage(c.currentStage);
                              setAssignedStaff(c.assignedStaffName || 'Prof. Rahul Mehta');
                              setAdminResolutionNote(c.timeline[c.timeline.length - 1]?.description || '');
                            }}
                            className="cf-btn cf-btn-admin"
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          >
                            ⚡ Work on Case
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* System Work Tasks */}
          <div className="cf-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                System-Level Work Orders & Tasks ({filteredTasks.length})
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Filter:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="cf-select"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '0.85rem' }}
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="cf-table-container">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Task / Grievance</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Owner ID</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong style={{ display: 'block', color: 'var(--text-main)', marginBottom: '2px' }}>
                          {t.title}
                        </strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {t.description.slice(0, 90)}...
                        </span>
                      </td>
                      <td>
                        <span style={{ padding: '3px 8px', background: 'var(--bg-surface-subtle)', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {t.category}
                        </span>
                      </td>
                      <td>
                        <span className={`cf-status-badge ${t.priority === 'urgent' ? 'cf-status-urgent' : 'cf-status-pending'}`}>
                          {t.priority.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className={`cf-status-badge cf-status-${t.status}`}>
                          {t.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {t.owner_id.slice(0, 12)}...
                      </td>
                      <td>
                        <select
                          value={t.status}
                          onChange={(e) => handleUpdateStatus(t.id, e.target.value as any)}
                          className="cf-select"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'auto' }}
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: User Profiles Directory */}
      {activeTab === 'users' && (
        <div className="cf-card">
          <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.15rem', fontWeight: 800 }}>
            Registered Users & Assigned RBAC Roles
          </h3>
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>User Identity</th>
                  <th>Email</th>
                  <th>Assigned Role</th>
                  <th>Department / Academic Unit</th>
                  <th>User ID</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem' }}>
                          {p.full_name[0]}
                        </div>
                        <span style={{ fontWeight: 700 }}>{p.full_name}</span>
                      </div>
                    </td>
                    <td>{p.email}</td>
                    <td>
                      <span className={`cf-role-badge cf-badge-${p.role}`}>
                        {p.role}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {p.department || 'General Campus'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {p.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Security & RLS Proof */}
      {activeTab === 'security' && (
        <div className="cf-card">
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 800 }}>
            Row-Level Security (RLS) Isolation Audit
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Verified guarantees enforced directly in PostgreSQL engine. Tested via <code style={{ background: 'var(--bg-surface-subtle)', padding: '2px 6px', borderRadius: '4px' }}>scripts/test-isolation.js</code>.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ padding: '1rem', background: 'var(--bg-surface-subtle)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.4rem' }}>
                ✓ Cross-Student Isolation
              </strong>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Student 1 selecting Student 2 profiles or tasks returns 0 rows. Modifying Student 2 data is rejected.
              </p>
            </div>

            <div style={{ padding: '1rem', background: 'var(--bg-surface-subtle)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.4rem' }}>
                ✓ Worker Isolation
              </strong>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Worker 1 cannot view student data or tasks owned by Worker 2.
              </p>
            </div>

            <div style={{ padding: '1rem', background: 'var(--bg-surface-subtle)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.4rem' }}>
                ✓ Anti-Privilege Escalation Trigger
              </strong>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <code style={{ fontSize: '0.75rem' }}>trg_protect_role</code> rejects any attempt by non-admins to change role to admin.
              </p>
            </div>

            <div style={{ padding: '1rem', background: 'var(--bg-surface-subtle)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.4rem' }}>
                ✓ Super-User Universal Visibility
              </strong>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Admin role bypasses owner filter via <code style={{ fontSize: '0.75rem' }}>public.get_my_role() = 'admin'</code> to triage all institutional workflows.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Profile Photo & Details */}
      {activeTab === 'profile' && (
        <UserProfileSection />
      )}

      {/* Admin Grievance Oversight & Action Modal */}
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
          <div className="cf-card" style={{ maxWidth: '600px', width: '100%', boxShadow: 'var(--shadow-xl)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className={`cf-status-badge ${selectedComplaint.priority.includes('P0') ? 'cf-status-urgent' : 'cf-status-pending'}`}>
                {selectedComplaint.priority}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {selectedComplaint.reference}
              </span>
            </div>

            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Super-User Case Work: {selectedComplaint.title}
            </h3>

            <div style={{ padding: '10px 14px', background: 'var(--bg-surface-subtle)', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              <div><strong>Student:</strong> {selectedComplaint.student.name} ({selectedComplaint.student.rollNumber})</div>
              <div><strong>Department:</strong> {selectedComplaint.student.department}</div>
              <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>{selectedComplaint.description}</div>
            </div>

            {/* Direct AC Marks Correction for Academic Grievances */}
            {(selectedComplaint.type === 'Academic' || selectedComplaint.title.toLowerCase().includes('marks')) && (
              <div style={{ padding: '14px', background: 'var(--admin-light, #f5f3ff)', borderRadius: '12px', border: '1px solid #ddd6fe', marginBottom: '1.25rem' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--admin-accent, #6d28d9)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span>⚡</span> Dean / Registrar Direct Academic Marks Correction
                </strong>
                <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Override student assessment marks directly in the Academic Section database and resolve the complaint.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--admin-accent, #6d28d9)' }}>
                    Corrected Internal Marks:
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={acMarksInput}
                    onChange={(e) => setAcMarksInput(Number(e.target.value))}
                    className="cf-input"
                    style={{ width: '80px', padding: '6px 10px', fontWeight: 800 }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>/ 30</span>
                  <button
                    type="button"
                    onClick={() => handleAdminDirectMarksCorrection('CS302', selectedComplaint.student.id)}
                    className="cf-btn cf-btn-admin"
                    style={{ padding: '8px 16px', fontSize: '0.825rem' }}
                  >
                    ✓ Correct Marks to {acMarksInput}/30 &amp; Resolve Ticket
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  Update Workflow Stage
                </label>
                <select
                  value={targetStage}
                  onChange={(e) => setTargetStage(e.target.value)}
                  className="cf-select"
                >
                  <option value="submitted">Submitted</option>
                  <option value="under_review">Under Review</option>
                  <option value="assigned_to_staff">Assigned to Staff</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  Assign Responsible Staff
                </label>
                <select
                  value={assignedStaff}
                  onChange={(e) => setAssignedStaff(e.target.value)}
                  className="cf-select"
                >
                  <option value="Prof. Rahul Mehta">Prof. Rahul Mehta (Exam Records)</option>
                  <option value="Er. Dilip Roy">Er. Dilip Roy (Facilities)</option>
                  <option value="Dr. Anita Bannerjee">Dr. Anita Bannerjee (Hostel Warden)</option>
                  <option value="Dr. Suresh Kumar">Dr. Suresh Kumar (Administration)</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Administrative Resolution Directive / Audit Note
              </label>
              <textarea
                rows={3}
                value={adminResolutionNote}
                onChange={(e) => setAdminResolutionNote(e.target.value)}
                placeholder="Enter administrative directive, approval code, or resolution audit summary..."
                className="cf-textarea"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setSelectedComplaint(null)}
                className="cf-btn cf-btn-secondary"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleApplyAdminOverride(targetStage, assignedStaff)}
                className="cf-btn cf-btn-admin"
              >
                ✓ Apply Admin Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
