import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AcademicSectionView } from '../../components/AcademicSectionView';
import { ComplaintTracker, type ComplaintData } from '../../components/ComplaintTracker';
import { GlassCard } from '../../components/GlassCard';
import { ScholarshipDirectory } from '../../components/ScholarshipDirectory';
import { StudentPill } from '../../components/StudentPill';
import { UserProfileSection } from '../../components/UserProfileSection';
import { complaintStore } from '../../services/complaintStore';

export default function StudentPortal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';

  const [complaints, setComplaints] = useState<readonly ComplaintData[]>(() => complaintStore.getComplaints());

  // Ticket lodging form state
  const [complaintType, setComplaintType] = useState<'Academic' | 'Hostel' | 'Infrastructure' | 'Grievance'>('Academic');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('Examination & Records Cell');
  const [priority, setPriority] = useState<'Urgent (P0)' | 'High (P1)' | 'Normal (P2)'>('Urgent (P0)');
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = complaintStore.subscribe(() => {
      setComplaints(complaintStore.getComplaints());
    });
    return unsubscribe;
  }, []);

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
  };

  const handleLodgeTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    const newTicket = complaintStore.addComplaint({
      type: complaintType,
      title,
      description,
      department,
      priority,
      currentStage: 'submitted',
      student: {
        id: 'usr_ananya_01',
        name: 'Ananya Das',
        rollNumber: 'JISU/2024/CSE/0842',
        department: 'Computer Science & Engineering',
        semester: '4th',
        cgpa: '8.92',
        email: 'ananya.das@jisuniversity.ac.in',
        academicStatus: 'Good Standing',
      },
      expectedResolutionTime: priority.includes('P0') ? 'Within 24 hours' : 'Within 48 hours',
    });

    setTitle('');
    setDescription('');
    setFormSuccess(`Ticket lodged successfully! Assigned reference #${newTicket.reference}`);
    setTimeout(() => setFormSuccess(null), 5000);
  };

  return (
    <div className="cc-student-portal" style={{ maxWidth: '1100px', margin: '0 auto', padding: '1rem 0 3rem' }}>
      {/* Top Welcome Header */}
      <GlassCard style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#0f2850', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
              JIS UNIVERSITY STUDENT PORTAL · ACADEMIC SESSION 2026-27
            </div>
            <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.75rem', fontWeight: 800, color: '#0f2850', letterSpacing: '-0.02em' }}>
              Student Identity: Ananya Das
            </h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
              B.Tech Computer Science & Engineering · Roll No: JISU/2024/CSE/0842
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <StudentPill
              student={{
                id: 'usr_ananya_01',
                name: 'Ananya Das',
                rollNumber: 'JISU/2024/CSE/0842',
                department: 'Computer Science & Engineering',
                semester: '4th',
                cgpa: '8.92',
                academicStatus: 'Good Standing',
              }}
              size="lg"
              showRoll
            />
          </div>
        </div>

        {/* Clean Subnav Tabs */}
        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.5rem', borderTop: '1px solid rgba(15, 40, 80, 0.08)', paddingTop: '1.25rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => handleTabChange('dashboard')}
            className={`cc-gateway-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            📊 Personal Dashboard & AC Records
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('tracker')}
            className={`cc-gateway-tab ${activeTab === 'tracker' ? 'active' : ''}`}
          >
            📋 Complaint Tracking ({complaints.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('lodge')}
            className={`cc-gateway-tab ${activeTab === 'lodge' ? 'active' : ''}`}
          >
            ➕ Lodge New Grievance
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('scholarships')}
            className={`cc-gateway-tab ${activeTab === 'scholarships' ? 'active' : ''}`}
          >
            🎯 Scholarships & Internships (Indian Gateway)
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('profile')}
            className={`cc-gateway-tab ${activeTab === 'profile' ? 'active' : ''}`}
          >
            👤 Profile Photo &amp; Details
          </button>
        </div>
      </GlassCard>

      {/* Tab 1: Dashboard & AC Log */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Quick Metrics Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <GlassCard style={{ padding: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Aggregate Attendance
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#059669', margin: '0.35rem 0' }}>
                92.4%
              </div>
              <span style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>
                ✓ Eligible for End-Semester Exam Hall Ticket
              </span>
            </GlassCard>

            <GlassCard style={{ padding: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Cumulative CGPA
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f2850', margin: '0.35rem 0' }}>
                8.92 / 10
              </div>
              <span style={{ fontSize: '0.8rem', color: '#1e3a8a', fontWeight: 600 }}>
                Department Rank: Top 5% in CSE 2024 Batch
              </span>
            </GlassCard>

            <GlassCard style={{ padding: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Active Grievance Tickets
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b', margin: '0.35rem 0' }}>
                {complaints.filter((c) => c.currentStage !== 'resolved').length} Open
              </div>
              <button
                type="button"
                onClick={() => handleTabChange('tracker')}
                style={{ background: 'none', border: 'none', color: '#0f2850', fontSize: '0.8rem', fontWeight: 700, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Track Live Progress →
              </button>
            </GlassCard>
          </div>

          {/* Full Academic Section (AC) Roster View */}
          <AcademicSectionView defaultRollNumber="JISU/2024/CSE/0842" canEdit={false} />
        </div>
      )}

      {/* Tab 2: Complaint Tracking */}
      {activeTab === 'tracker' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f2850', margin: 0 }}>
              Live Grievance Tracking Bar & Logs
            </h2>
            <button
              type="button"
              onClick={() => handleTabChange('lodge')}
              className="cc-opp-direct-btn"
              style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            >
              + Lodge Another Ticket
            </button>
          </div>

          {complaints.map((comp) => (
            <ComplaintTracker
              key={comp.id}
              complaint={comp}
              allowStatusUpdate={false}
            />
          ))}
        </div>
      )}

      {/* Tab 3: Direct Ticket Lodging Form */}
      {activeTab === 'lodge' && (
        <GlassCard style={{ padding: '2rem', maxWidth: '780px', margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 800, color: '#0f2850' }}>
            Lodge Student Grievance / Service Docket
          </h2>
          <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.9rem' }}>
            Submit an official complaint directly into the JIS University resolution workflow.
          </p>

          {formSuccess && (
            <div style={{ padding: '1rem', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: '12px', marginBottom: '1.5rem', fontWeight: 700 }}>
              ✓ {formSuccess}
            </div>
          )}

          <form onSubmit={handleLodgeTicket}>
            {/* Category Grid */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.4rem' }}>
                Grievance Classification
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
                {(['Academic', 'Hostel', 'Infrastructure', 'Grievance'] as const).map((t) => (
                  <div
                    key={t}
                    onClick={() => {
                      setComplaintType(t);
                      if (t === 'Academic') setDepartment('Examination & Records Cell');
                      if (t === 'Hostel') setDepartment('Hostel Administration & Estates');
                      if (t === 'Infrastructure') setDepartment('Campus Infrastructure & IT Services');
                      if (t === 'Grievance') setDepartment('Statutory Grievance Committee');
                    }}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '10px',
                      border: `2px solid ${complaintType === t ? '#0f2850' : '#e2e8f0'}`,
                      background: complaintType === t ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: complaintType === t ? '#0f2850' : '#475569',
                      fontSize: '0.85rem',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Department & Priority Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.4rem' }}>
                  Target University Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="cc-gateway-search-input"
                  style={{ width: '100%' }}
                >
                  <option value="Examination & Records Cell">Examination & Records Cell</option>
                  <option value="Hostel Administration & Estates">Hostel Administration & Estates</option>
                  <option value="Campus Infrastructure & IT Services">Campus Infrastructure & IT Services</option>
                  <option value="Statutory Grievance Committee">Statutory Grievance Committee</option>
                  <option value="Accounts & Fee Clearance">Accounts & Fee Clearance</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.4rem' }}>
                  Priority Level
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="cc-gateway-search-input"
                  style={{ width: '100%' }}
                >
                  <option value="Urgent (P0)">Urgent (P0) — Exam / Hall ticket issue</option>
                  <option value="High (P1)">High (P1) — Infrastructure / Hostel stoppage</option>
                  <option value="Normal (P2)">Normal (P2) — General inquiry & records</option>
                </select>
              </div>
            </div>

            {/* Subject Title */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.4rem' }}>
                Complaint Subject
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Internal Assessment Marks Discrepancy in CS302..."
                className="cc-gateway-search-input"
              />
            </div>

            {/* Detailed Description */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.4rem' }}>
                Detailed Description & Evidence Notes
              </label>
              <textarea
                required
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="State the exact room number, subject code, roll number, and dates involved..."
                className="cc-gateway-search-input"
                style={{ width: '100%', minHeight: '120px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => handleTabChange('dashboard')}
                className="cc-social-action-secondary"
                style={{ padding: '0.65rem 1.25rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="cc-opp-direct-btn"
                style={{ width: 'auto', padding: '0.65rem 1.75rem' }}
              >
                Submit Ticket to Triage Queue
              </button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* Tab 4: Scholarships & Internships */}
      {activeTab === 'scholarships' && (
        <ScholarshipDirectory />
      )}

      {/* Tab 5: Profile Photo & Details */}
      {activeTab === 'profile' && (
        <UserProfileSection />
      )}
    </div>
  );
}

