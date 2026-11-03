import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'react-router';
import {
  GraduationCap,
  ClipboardList,
  BookOpen,
  CheckCircle2,
  UserCheck,
  Send,
} from 'lucide-react';
import { useSession } from '../../auth/session';
import { AcademicSectionView } from '../../components/AcademicSectionView';
import { ScholarshipDirectory } from '../../components/ScholarshipDirectory';
import { UserProfileSection } from '../../components/UserProfileSection';
import { GlassCard } from '../../components/GlassCard';
import { StatTile } from '../../components/StatTile';
import { useToast } from '../../components/Toast';
import { isSupabaseConfigured, supabase, type DbTask } from '../../lib/supabase';
import { complaintStore, type ComplaintData } from '../../services/complaintStore';

export function StudentDashboard() {
  const { user, profile } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  const [complaints, setComplaints] = useState<readonly ComplaintData[]>(() => complaintStore.getComplaints());
  const [, setTasks] = useState<DbTask[]>([]);
  const [, setIsLoading] = useState(false);

  // New Grievance Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Examination');
  const [priority, setPriority] = useState<DbTask['priority']>('high');
  const [submitting, setSubmitting] = useState(false);

  // Subscribe to complaintStore for real-time synchronization
  useEffect(() => {
    const unsubscribe = complaintStore.subscribe(() => {
      setComplaints(complaintStore.getComplaints());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    async function loadStudentData() {
      setIsLoading(true);
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
        setIsLoading(false);
      }
    }

    void loadStudentData();
  }, [user]);

  const handleLodgeGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      const priorityLabel =
        priority === 'urgent' ? 'Urgent (P0)' : priority === 'high' ? 'High (P1)' : 'Normal (P2)';
      const typeLabel =
        category === 'Examination' || category === 'Academic'
          ? 'Academic'
          : category === 'Hostel'
          ? 'Hostel'
          : 'Infrastructure';

      const newComplaint = complaintStore.addComplaint({
        type: typeLabel,
        title,
        description,
        department:
          category === 'Examination'
            ? 'Examination & Records Cell'
            : category === 'Hostel'
            ? 'Hostel Administration & Estates'
            : 'Campus Infrastructure & IT Services',
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
        expectedResolutionTime:
          priority === 'urgent' ? 'Within 24 hours (Hall ticket cut-off)' : 'Within 48 hours',
      });

      if (isSupabaseConfigured && user) {
        await supabase.from('tasks').insert({
          owner_id: user.id,
          title,
          description,
          category,
          priority,
          status: 'pending',
        });
      }

      toast(`Grievance #${newComplaint.reference} lodged and dispatched to Admin and Staff panels!`, 'success');
      setTitle('');
      setDescription('');
      setSearchParams({ tab: 'dashboard' });
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const activeComplaintsCount = complaints.filter((c) => c.currentStage !== 'resolved').length;

  return (
    <div
      className="cc-student-dashboard"
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '0 8px 3rem 8px',
      }}
    >
      {/* Header Lockup */}
      <GlassCard
        material="glass"
        style={{
          padding: '24px 28px',
          marginBottom: '24px',
          borderLeft: '4px solid var(--student-primary, #1d4ed8)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 12px',
                borderRadius: '9999px',
                background: 'rgba(37, 99, 235, 0.12)',
                color: 'var(--student-primary, #1d4ed8)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                marginBottom: '8px',
              }}
            >
              <span>🎓</span>
              <span>STUDENT IDENTITY PORTAL · JIS UNIVERSITY</span>
            </div>

            <h1
              style={{
                fontSize: '2rem',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                color: 'var(--text-main, #0f172a)',
                margin: '0 0 6px 0',
                lineHeight: 1.15,
              }}
            >
              {profile?.full_name || 'Ananya Das'} · {profile?.department || 'Computer Science & Engineering'}
            </h1>
            <p
              style={{
                margin: 0,
                color: 'var(--text-muted, #64748b)',
                fontSize: '0.925rem',
                maxWidth: '720px',
                lineHeight: 1.45,
              }}
            >
              Student Registration: <strong>JISU/2024/CSE/0842</strong> · RLS Encrypted Identity Sandbox · 4th Semester UG
            </p>
          </div>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              background: 'rgba(37, 99, 235, 0.12)',
              color: '#1d4ed8',
              border: '1px solid rgba(37, 99, 235, 0.25)',
              fontSize: '0.785rem',
              fontWeight: 700,
            }}
          >
            <UserCheck size={14} />
            <span>Active Student Standing</span>
          </span>
        </div>
      </GlassCard>

      {/* Metric Tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <StatTile
          label="Semester Attendance"
          value="92.4%"
          icon={<CheckCircle2 size={20} />}
          trend={{ value: 'Eligible', isPositive: true }}
          subtitle="Hall Ticket Examination Cleared"
        />
        <StatTile
          label="Cumulative CGPA"
          value="8.92 / 10"
          icon={<GraduationCap size={20} />}
          trend={{ value: 'Top 5%', isPositive: true }}
          subtitle="First Class with Distinction"
        />
        <StatTile
          label="Active Grievance Tickets"
          value={activeComplaintsCount}
          icon={<ClipboardList size={20} />}
          trend={{ value: 'Live Triage', isPositive: activeComplaintsCount === 0 }}
          subtitle="Direct SLA Tracking"
        />
        <StatTile
          label="Academic Clearances"
          value="CLEARED"
          icon={<BookOpen size={20} />}
          trend={{ value: '0 Holds', isPositive: true }}
          subtitle="Library & Fees Dues Cleared"
        />
      </div>

      {/* Segmented Control Tabs */}
      <div
        className="glass-subtle"
        style={{
          display: 'inline-flex',
          padding: '4px',
          borderRadius: '16px',
          marginBottom: '24px',
          gap: '4px',
          maxWidth: '100%',
          overflowX: 'auto',
        }}
      >
        {[
          { key: 'dashboard', label: `📋 My Grievances & Progress (${complaints.length})` },
          { key: 'lodge', label: '➕ Lodge New Ticket' },
          { key: 'scholarships', label: '🎯 Indian Scholarship Gateway' },
          { key: 'ac', label: '📊 Academic Section (AC) Log' },
          { key: 'profile', label: '👤 Profile Photo & Details' },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                startTransition(() => {
                  setSearchParams({ tab: tab.key });
                });
              }}
              style={{
                border: 'none',
                background: isActive
                  ? 'linear-gradient(135deg, var(--student-primary, #1d4ed8), var(--accent, #2563eb))'
                  : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-main, #0f172a)',
                padding: '8px 18px',
                borderRadius: '12px',
                fontSize: '0.825rem',
                fontWeight: isActive ? 700 : 600,
                cursor: 'pointer',
                boxShadow: isActive ? '0 4px 12px rgba(37, 99, 235, 0.35)' : 'none',
                transition: 'all 180ms cubic-bezier(0.32, 0.72, 0, 1)',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Grievance Tracking */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {complaints.length === 0 ? (
            <GlassCard material="glass" style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📭</div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 800 }}>
                No Active Grievance Tickets
              </h3>
              <p style={{ margin: '0 0 18px 0', color: 'var(--text-muted, #64748b)', fontSize: '0.9rem' }}>
                You currently have zero pending issues lodged. All academic records are up to date.
              </p>
              <button
                type="button"
                onClick={() => setSearchParams({ tab: 'lodge' })}
                style={{
                  padding: '10px 22px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--student-primary, #1d4ed8), var(--accent, #2563eb))',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                + Lodge Your First Grievance
              </button>
            </GlassCard>
          ) : (
            complaints.map((c) => {
              const currentStep =
                c.currentStage === 'resolved'
                  ? 4
                  : c.currentStage === 'assigned_to_staff'
                  ? 3
                  : c.currentStage === 'under_review'
                  ? 2
                  : 1;
              const isP0 = c.priority.includes('P0');
              const latestEvent = c.timeline[c.timeline.length - 1];

              return (
                <GlassCard key={c.id} material="glass" style={{ padding: '24px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '16px',
                      marginBottom: '20px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontSize: '0.725rem',
                            fontWeight: 700,
                            background: isP0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: isP0 ? '#dc2626' : '#d97706',
                          }}
                        >
                          {c.priority}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                          Category: {c.type}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', fontFamily: 'monospace' }}>
                          · {c.reference}
                        </span>
                        {c.assignedStaffName && (
                          <span
                            className="glass-subtle"
                            style={{
                              fontSize: '0.75rem',
                              padding: '2px 10px',
                              borderRadius: '9999px',
                              color: 'var(--text-main, #0f172a)',
                              fontWeight: 600,
                            }}
                          >
                            👨‍🏫 Assigned: {c.assignedStaffName}
                          </span>
                        )}
                      </div>

                      <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', color: 'var(--text-main, #0f172a)', fontWeight: 800 }}>
                        {c.title}
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted, #64748b)', lineHeight: 1.45 }}>
                        {c.description}
                      </p>
                    </div>

                    <span
                      style={{
                        padding: '6px 14px',
                        borderRadius: '9999px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        background: currentStep === 4 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                        color: currentStep === 4 ? '#059669' : '#1d4ed8',
                        border: `1px solid ${currentStep === 4 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(37, 99, 235, 0.25)'}`,
                      }}
                    >
                      {c.currentStage.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>

                  {/* 4-Stage Visual Progression Tracking Bar */}
                  <div
                    className="glass-subtle cc-stepper-track"
                    style={{
                      padding: '20px 24px',
                      borderRadius: '16px',
                      marginBottom: '16px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        color: 'var(--text-muted, #64748b)',
                        marginBottom: '16px',
                        letterSpacing: '0.05em',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Case Resolution Pipeline</span>
                      <span>Target SLA: {c.expectedResolutionTime || 'Within 24 hours'}</span>
                    </div>

                    <div
                      className="cc-stepper-nodes"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        position: 'relative',
                      }}
                    >
                      {/* Connecting Line */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '16px',
                          left: '20px',
                          right: '20px',
                          height: '3px',
                          background: 'rgba(0, 0, 0, 0.08)',
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
                          background: currentStep === 4 ? '#059669' : 'var(--student-primary, #1d4ed8)',
                          zIndex: 2,
                          transition: 'width 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
                        }}
                      />

                      {/* Step 1 */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3, position: 'relative' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: currentStep >= 1 ? 'var(--student-primary, #1d4ed8)' : '#ffffff',
                            border: `2px solid ${currentStep >= 1 ? 'var(--student-primary, #1d4ed8)' : 'rgba(0,0,0,0.1)'}`,
                            color: currentStep >= 1 ? '#ffffff' : 'var(--text-muted, #64748b)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.8rem',
                          }}
                        >
                          ✓
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '8px', color: 'var(--text-main, #0f172a)' }}>
                          Submitted
                        </span>
                      </div>

                      {/* Step 2 */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3, position: 'relative' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: currentStep >= 2 ? 'var(--student-primary, #1d4ed8)' : '#ffffff',
                            border: `2px solid ${currentStep >= 2 ? 'var(--student-primary, #1d4ed8)' : 'rgba(0,0,0,0.1)'}`,
                            color: currentStep >= 2 ? '#ffffff' : 'var(--text-muted, #64748b)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.8rem',
                          }}
                        >
                          {currentStep >= 2 ? '✓' : '2'}
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '8px', color: currentStep >= 2 ? 'var(--text-main, #0f172a)' : 'var(--text-muted, #64748b)' }}>
                          Under Review
                        </span>
                      </div>

                      {/* Step 3 */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3, position: 'relative' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: currentStep >= 3 ? 'var(--student-primary, #1d4ed8)' : '#ffffff',
                            border: `2px solid ${currentStep >= 3 ? 'var(--student-primary, #1d4ed8)' : 'rgba(0,0,0,0.1)'}`,
                            color: currentStep >= 3 ? '#ffffff' : 'var(--text-muted, #64748b)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.8rem',
                          }}
                        >
                          {currentStep >= 3 ? '✓' : '3'}
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '8px', color: currentStep >= 3 ? 'var(--text-main, #0f172a)' : 'var(--text-muted, #64748b)' }}>
                          Assigned to Staff
                        </span>
                      </div>

                      {/* Step 4 */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3, position: 'relative' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: currentStep >= 4 ? '#059669' : '#ffffff',
                            border: `2px solid ${currentStep >= 4 ? '#059669' : 'rgba(0,0,0,0.1)'}`,
                            color: currentStep >= 4 ? '#ffffff' : 'var(--text-muted, #64748b)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.8rem',
                          }}
                        >
                          {currentStep >= 4 ? '✓' : '4'}
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '8px', color: currentStep >= 4 ? '#059669' : 'var(--text-muted, #64748b)' }}>
                          Resolved
                        </span>
                      </div>
                    </div>
                  </div>

                  {latestEvent && (
                    <div
                      className="glass-subtle"
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        fontSize: '0.875rem',
                        borderLeft: `4px solid ${currentStep === 4 ? '#059669' : 'var(--student-primary, #1d4ed8)'}`,
                      }}
                    >
                      <strong style={{ color: currentStep === 4 ? '#065f46' : 'var(--student-primary, #1d4ed8)' }}>
                        Latest Update ({latestEvent.actor}):
                      </strong>{' '}
                      {latestEvent.description}
                    </div>
                  )}
                </GlassCard>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Lodge New Ticket */}
      {activeTab === 'lodge' && (
        <GlassCard material="glass" style={{ maxWidth: '720px', margin: '0 auto', padding: '28px' }}>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
            Lodge Student Grievance / Service Docket
          </h2>
          <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted, #64748b)', fontSize: '0.9rem' }}>
            Direct submission into JIS University workflow. The ticket will be assigned directly to faculty or estates staff.
          </p>

          <form onSubmit={handleLodgeGrievance} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '6px' }}>
                  Classification
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="glass-subtle"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                >
                  <option value="Examination">Examination & Marks Correction</option>
                  <option value="Hostel">Hostel & Accommodation</option>
                  <option value="Infrastructure">Infrastructure & Campus IT</option>
                  <option value="Academic">Academic Credits & Clearances</option>
                  <option value="Accounts">Fee Clearance & Accounts</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '6px' }}>
                  Priority Level
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="glass-subtle"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                >
                  <option value="urgent">Urgent — Exam Hall Ticket Cutoff</option>
                  <option value="high">High — Infrastructure / Hostel Stoppage</option>
                  <option value="medium">Medium — General Inquiry & Records</option>
                  <option value="low">Low — General Request</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '6px' }}>
                Subject / Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Internal Assessment Marks Discrepancy in CS302"
                className="glass-subtle"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, marginBottom: '6px' }}>
                Detailed Description & Location Details
              </label>
              <textarea
                required
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="State the room number, course code, evaluator name, and dates involved..."
                className="glass-subtle"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.1)', fontFamily: 'inherit' }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                alignSelf: 'flex-start',
                padding: '12px 28px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, var(--student-primary, #1d4ed8), var(--accent, #2563eb))',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Send size={15} />
              <span>{submitting ? 'Submitting...' : 'Submit Ticket to Triage Queue'}</span>
            </button>
          </form>
        </GlassCard>
      )}

      {/* Tab 3: Scholarships & Internships */}
      {activeTab === 'scholarships' && <ScholarshipDirectory />}

      {/* Tab 4: Academic Section (AC) Log */}
      {activeTab === 'ac' && (
        <AcademicSectionView defaultRollNumber="JISU/2024/CSE/0842" canEdit={false} />
      )}

      {/* Tab 5: Profile Photo & Details */}
      {activeTab === 'profile' && <UserProfileSection />}
    </div>
  );
}

export default StudentDashboard;
