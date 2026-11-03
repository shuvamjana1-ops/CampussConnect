import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSession } from '../../auth/session';
import { AcademicSectionView } from '../../components/AcademicSectionView';
import { ScholarshipDirectory } from '../../components/ScholarshipDirectory';
import { UserProfileSection } from '../../components/UserProfileSection';
import { useToast } from '../../components/Toast';
import { isSupabaseConfigured, supabase, type DbTask } from '../../lib/supabase';
import { complaintStore, type ComplaintData } from '../../services/complaintStore';

export default function StudentDashboard() {
  const { user, profile } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';
  const { toast } = useToast();

  const [complaints, setComplaints] = useState<readonly ComplaintData[]>(() => complaintStore.getComplaints());
  const [, setTasks] = useState<DbTask[]>([]);
  const [, setLoading] = useState(true);

  // New Grievance Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Examination');
  const [priority, setPriority] = useState<DbTask['priority']>('high');
  const [submitting, setSubmitting] = useState(false);

  // Subscribe to complaintStore for real-time synchronization with AC & Admin/Worker updates
  useEffect(() => {
    const unsubscribe = complaintStore.subscribe(() => {
      setComplaints(complaintStore.getComplaints());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    async function loadStudentData() {
      setLoading(true);
      try {
        if (isSupabaseConfigured && user) {
          const { data } = await supabase
            .from('tasks')
            .select('*')
            .order('created_at', { ascending: false });

          if (data) setTasks(data as DbTask[]);
        }
      } catch (e) {
        console.error('Error loading student data:', e);
      } finally {
        setLoading(false);
      }
    }

    void loadStudentData();
  }, [user]);

  const handleLodgeGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      const priorityLabel = priority === 'urgent' ? 'Urgent (P0)' : priority === 'high' ? 'High (P1)' : 'Normal (P2)';
      const typeLabel = category === 'Examination' || category === 'Academic' ? 'Academic' : category === 'Hostel' ? 'Hostel' : 'Infrastructure';

      const newComplaint = complaintStore.addComplaint({
        type: typeLabel,
        title,
        description,
        department: category === 'Examination' ? 'Examination & Records Cell' : category === 'Hostel' ? 'Hostel Administration & Estates' : 'Campus Infrastructure & IT Services',
        priority: priorityLabel,
        currentStage: 'submitted',
        student: {
          id: user?.id || 'usr_ananya_01',
          name: profile?.full_name || 'Ananya Das',
          rollNumber: 'JISU/2024/CSE/0842',
          department: profile?.department || 'Computer Science & Engineering',
          semester: '4th',
          cgpa: '8.92',
          academicStatus: 'Good Standing',
        },
        expectedResolutionTime: priority === 'urgent' ? 'Within 24 hours (Hall ticket cut-off)' : 'Within 48 hours',
      });

      if (isSupabaseConfigured && user) {
        await supabase
          .from('tasks')
          .insert({
            owner_id: user.id,
            title,
            description,
            category,
            priority,
            status: 'pending',
          });
      }

      toast(`Grievance #${newComplaint.reference} lodged and dispatched to Admin and Worker panels!`, 'success');
      setTitle('');
      setDescription('');
      setSearchParams({ tab: 'dashboard' });
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--student-primary)', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
          <span>🎓</span> STUDENT IDENTITY PORTAL · JIS UNIVERSITY
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)', margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>
          {profile?.full_name || 'Ananya Das'} · {profile?.department || 'Computer Science & Engineering'}
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Student Registration: <strong>JISU/2024/CSE/0842</strong> · RLS Encrypted Identity Sandbox
        </p>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        <div className="cf-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Semester Attendance
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#059669', margin: '0.4rem 0' }}>
            92.4%
          </div>
          <div style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>
            ✓ Hall Ticket Examination Eligible
          </div>
        </div>

        <div className="cf-card" style={{ borderLeft: '4px solid var(--student-primary)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Cumulative CGPA
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)', margin: '0.4rem 0' }}>
            8.92 / 10
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--student-primary)', fontWeight: 600 }}>
            Top 5% Batch Standing
          </div>
        </div>

        <div className="cf-card" style={{ borderLeft: '4px solid var(--student-accent)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Active Grievance Tickets
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--student-accent)', margin: '0.4rem 0' }}>
            {complaints.filter((c) => c.currentStage !== 'resolved').length}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#c2410c', fontWeight: 600 }}>
            Direct Triage & Live Tracking
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'dashboard' })}
          className={`cf-btn ${activeTab === 'dashboard' ? 'cf-btn-student' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          📋 My Grievances & Progress ({complaints.length})
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'lodge' })}
          className={`cf-btn ${activeTab === 'lodge' ? 'cf-btn-student' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          ➕ Lodge New Ticket
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'scholarships' })}
          className={`cf-btn ${activeTab === 'scholarships' ? 'cf-btn-student' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          🎯 Indian Scholarship Gateway
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'ac' })}
          className={`cf-btn ${activeTab === 'ac' ? 'cf-btn-student' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          📊 Academic Section (AC) Log
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'profile' })}
          className={`cf-btn ${activeTab === 'profile' ? 'cf-btn-student' : 'cf-btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
        >
          👤 Profile Photo &amp; Details
        </button>
      </div>

      {/* Tab 1: Grievance Tracking */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {complaints.length === 0 ? (
            <div className="cf-card cf-empty-state">
              <div className="cf-empty-icon">📭</div>
              <h3 style={{ margin: '0 0 0.5rem' }}>No Active Grievance Tickets</h3>
              <p style={{ margin: '0 0 1rem' }}>You currently have zero pending issues lodged.</p>
              <button
                type="button"
                onClick={() => setSearchParams({ tab: 'lodge' })}
                className="cf-btn cf-btn-student"
              >
                + Lodge Your First Grievance
              </button>
            </div>
          ) : (
            complaints.map((c) => {
              const currentStep = c.currentStage === 'resolved' ? 4 : c.currentStage === 'assigned_to_staff' ? 3 : c.currentStage === 'under_review' ? 2 : 1;
              const isP0 = c.priority.includes('P0');
              const latestEvent = c.timeline[c.timeline.length - 1];

              return (
                <div key={c.id} className="cf-card cf-card-hover">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span className={`cf-status-badge ${isP0 ? 'cf-status-urgent' : 'cf-status-pending'}`}>
                          {c.priority}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Category: {c.type}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          · {c.reference}
                        </span>
                        {c.assignedStaffName && (
                          <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-surface-subtle)', color: 'var(--text-main)', fontWeight: 600 }}>
                            👨‍🏫 Assigned: {c.assignedStaffName}
                          </span>
                        )}
                      </div>
                      <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', color: 'var(--text-main)', fontWeight: 800 }}>
                        {c.title}
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {c.description}
                      </p>
                    </div>

                    <span className={`cf-status-badge cf-status-${c.currentStage === 'resolved' ? 'completed' : 'in_progress'}`} style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
                      {c.currentStage.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>

                  {/* 4-Stage Visual Progression Bar */}
                  <div style={{ background: 'var(--bg-surface-subtle)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Case Resolution Pipeline</span>
                      <span>Target SLA: {c.expectedResolutionTime || 'Within 24 hours'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                      {/* Connecting line */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '16px',
                          left: '20px',
                          right: '20px',
                          height: '3px',
                          background: 'var(--border-strong)',
                          zIndex: 1,
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: '16px',
                          left: '20px',
                          width: `${((currentStep - 1) / 3) * 100}%`,
                          height: '3px',
                          background: currentStep === 4 ? '#059669' : 'var(--student-primary)',
                          zIndex: 2,
                          transition: 'width 0.4s ease',
                        }}
                      />

                      {/* Step 1 */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3, position: 'relative' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: currentStep >= 1 ? 'var(--student-primary)' : 'var(--bg-surface)', border: `2px solid ${currentStep >= 1 ? 'var(--student-primary)' : 'var(--border-strong)'}`, color: currentStep >= 1 ? '#ffffff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem' }}>
                          ✓
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '6px', color: 'var(--text-main)' }}>
                          Submitted
                        </span>
                      </div>

                      {/* Step 2 */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3, position: 'relative' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: currentStep >= 2 ? 'var(--student-primary)' : 'var(--bg-surface)', border: `2px solid ${currentStep >= 2 ? 'var(--student-primary)' : 'var(--border-strong)'}`, color: currentStep >= 2 ? '#ffffff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem' }}>
                          {currentStep >= 2 ? '✓' : '2'}
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '6px', color: currentStep >= 2 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                          Under Review
                        </span>
                      </div>

                      {/* Step 3 */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3, position: 'relative' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: currentStep >= 3 ? 'var(--student-primary)' : 'var(--bg-surface)', border: `2px solid ${currentStep >= 3 ? 'var(--student-primary)' : 'var(--border-strong)'}`, color: currentStep >= 3 ? '#ffffff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem' }}>
                          {currentStep >= 3 ? '✓' : '3'}
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '6px', color: currentStep >= 3 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                          Assigned to Staff
                        </span>
                      </div>

                      {/* Step 4 */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3, position: 'relative' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: currentStep >= 4 ? '#059669' : 'var(--bg-surface)', border: `2px solid ${currentStep >= 4 ? '#059669' : 'var(--border-strong)'}`, color: currentStep >= 4 ? '#ffffff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem' }}>
                          {currentStep >= 4 ? '✓' : '4'}
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '6px', color: currentStep >= 4 ? '#059669' : 'var(--text-muted)' }}>
                          Resolved
                        </span>
                      </div>
                    </div>
                  </div>

                  {latestEvent && (
                    <div style={{ padding: '10px 14px', background: 'var(--bg-surface-subtle)', borderRadius: '10px', fontSize: '0.875rem', borderLeft: `4px solid ${currentStep === 4 ? '#059669' : 'var(--student-primary)'}` }}>
                      <strong style={{ color: currentStep === 4 ? '#065f46' : 'var(--student-primary)' }}>
                        Latest Update ({latestEvent.actor}):
                      </strong>{' '}
                      {latestEvent.description}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Lodge New Ticket */}
      {activeTab === 'lodge' && (
        <div className="cf-card" style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}>
            Lodge Student Grievance / Service Docket
          </h2>
          <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Direct submission into JIS University workflow. The ticket will be assigned directly to faculty or estates staff.
          </p>

          <form onSubmit={handleLodgeGrievance} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  Classification
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="cf-select"
                >
                  <option value="Examination">Examination & Marks Correction</option>
                  <option value="Hostel">Hostel & Accommodation</option>
                  <option value="Infrastructure">Infrastructure & Campus IT</option>
                  <option value="Academic">Academic Credits & Clearances</option>
                  <option value="Accounts">Fee Clearance & Accounts</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  Priority Level
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="cf-select"
                >
                  <option value="urgent">Urgent — Exam Hall Ticket Cutoff</option>
                  <option value="high">High — Infrastructure / Hostel Stoppage</option>
                  <option value="medium">Medium — General Inquiry & Records</option>
                  <option value="low">Low — General Request</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Subject / Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Internal Assessment Marks Discrepancy in CS302"
                className="cf-input"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Detailed Description & Location Details
              </label>
              <textarea
                required
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="State the room number, course code, evaluator name, and dates involved..."
                className="cf-textarea"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="cf-btn cf-btn-student"
              style={{ alignSelf: 'flex-start', padding: '10px 24px', fontSize: '0.95rem' }}
            >
              {submitting ? 'Submitting...' : '✓ Submit Ticket to Triage Queue'}
            </button>
          </form>
        </div>
      )}

      {/* Tab 3: Scholarships & Internships */}
      {activeTab === 'scholarships' && (
        <ScholarshipDirectory />
      )}

      {/* Tab 4: Academic Section (AC) Log */}
      {activeTab === 'ac' && (
        <AcademicSectionView defaultRollNumber="JISU/2024/CSE/0842" canEdit={false} />
      )}

      {/* Tab 5: Profile Photo & Details */}
      {activeTab === 'profile' && (
        <UserProfileSection />
      )}
    </div>
  );
}
