import { useEffect, useState } from 'react';
import { AcademicSectionView } from '../../components/AcademicSectionView';
import { ComplaintTracker, type ComplaintData } from '../../components/ComplaintTracker';
import { GlassCard } from '../../components/GlassCard';
import { StudentPill } from '../../components/StudentPill';
import { UserProfileSection } from '../../components/UserProfileSection';
import { complaintStore, type AcademicRecord } from '../../services/complaintStore';

export default function AdminPortal() {
  const [complaints, setComplaints] = useState<readonly ComplaintData[]>(() => complaintStore.getComplaints());
  const [acRecords, setAcRecords] = useState<readonly AcademicRecord[]>(() => complaintStore.getAllACRecords());
  const [adminTab, setAdminTab] = useState<'command' | 'ac-control' | 'profile'>('command');
  const [selectedStudentRoll, setSelectedStudentRoll] = useState<string>('JISU/2024/CSE/0842');
  const [adminNotice, setAdminNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = complaintStore.subscribe(() => {
      setComplaints(complaintStore.getComplaints());
      setAcRecords(complaintStore.getAllACRecords());
    });
    return unsubscribe;
  }, []);

  const total = complaints.length;
  const resolved = complaints.filter((c) => c.currentStage === 'resolved').length;
  const pending = total - resolved;
  const p0Urgent = complaints.filter((c) => c.priority.includes('P0') && c.currentStage !== 'resolved').length;
  const slaCompliance = total > 0 ? Math.round(((resolved + 1) / (total + 1)) * 100) : 100;

  const handleManualReassign = (complaintId: string, staffName: string) => {
    complaintStore.reassignStaff(complaintId, staffName);
    setAdminNotice(`Administrative Override: Case reassigned to ${staffName}. Immediate notification dispatched.`);
    setTimeout(() => setAdminNotice(null), 4000);
  };

  const handleManualStageChange = (complaintId: string, newStage: any, note: string) => {
    complaintStore.updateStatus(complaintId, newStage, note, 'Dr. Suresh Kumar (Admin Super-User)');
    setAdminNotice(`Administrative Override: Stage updated to ${newStage}. Audit log recorded.`);
    setTimeout(() => setAdminNotice(null), 4000);
  };

  return (
    <div className="cc-admin-portal" style={{ maxWidth: '1100px', margin: '0 auto', padding: '1rem 0 3rem' }}>
      {/* Top Banner */}
      <GlassCard style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#0f2850', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
              JIS UNIVERSITY · SUPER-USER ADMINISTRATIVE COMMAND CENTER
            </div>
            <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.75rem', fontWeight: 800, color: '#0f2850', letterSpacing: '-0.02em' }}>
              Universal Complaint & Academic Control Desk
            </h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
              Administrator: Dr. Suresh Kumar · Registrar Office · Root Authority
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setAdminTab('command')}
              className={`cc-gateway-tab ${adminTab === 'command' ? 'active' : ''}`}
            >
              ⚡ Complaint Command Center
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('ac-control')}
              className={`cc-gateway-tab ${adminTab === 'ac-control' ? 'active' : ''}`}
            >
              🏛️ Student Academic (AC) Control
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('profile')}
              className={`cc-gateway-tab ${adminTab === 'profile' ? 'active' : ''}`}
            >
              👤 Administrator Profile
            </button>
          </div>
        </div>

        {adminNotice && (
          <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700 }}>
            ✓ {adminNotice}
          </div>
        )}
      </GlassCard>

      {/* Analytics KPI Row */}
      {adminTab === 'command' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <GlassCard style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Universal Docket Count
            </span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f2850', margin: '0.35rem 0' }}>
              {total} Total
            </div>
            <span style={{ fontSize: '0.8rem', color: '#1e3a8a', fontWeight: 600 }}>
              Across All Campus Departments
            </span>
          </GlassCard>

          <GlassCard style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              P0 Urgent Complaints
            </span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#b91c1c', margin: '0.35rem 0' }}>
              {p0Urgent} Active
            </div>
            <span style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 600 }}>
              24-Hour Statutory SLA Mandate
            </span>
          </GlassCard>

          <GlassCard style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              SLA Adherence Compliance
            </span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#059669', margin: '0.35rem 0' }}>
              {slaCompliance}%
            </div>
            <span style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>
              Average Resolution: 18.2 Hours
            </span>
          </GlassCard>

          <GlassCard style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Pending vs Resolved
            </span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b', margin: '0.35rem 0' }}>
              {pending} / {resolved}
            </div>
            <span style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>
              {Math.round((resolved / (total || 1)) * 100)}% Clearance Rate
            </span>
          </GlassCard>
        </div>
      )}

      {/* Tab Content 1: Universal Command Center */}
      {adminTab === 'command' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f2850', margin: 0 }}>
              Universal Complaint Dossiers & Manual Override
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Super-User Override: Force reassign staff or resolve tickets directly
            </span>
          </div>

          {complaints.map((comp) => (
            <ComplaintTracker
              key={comp.id}
              complaint={comp}
              allowStatusUpdate={true}
              onStatusChange={(newStage, note) => handleManualStageChange(comp.id, newStage, note)}
              onAssignStaff={(staffName) => handleManualReassign(comp.id, staffName)}
            />
          ))}
        </div>
      )}

      {/* Tab Content 2: Student Academic (AC) Control */}
      {adminTab === 'ac-control' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Student Picker Roster */}
          <GlassCard style={{ padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.15rem', fontWeight: 800, color: '#0f2850' }}>
              Select Student to Audit & Modify AC Marks
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
              {acRecords.map((stu) => (
                <div
                  key={stu.studentId}
                  onClick={() => setSelectedStudentRoll(stu.rollNumber)}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '12px',
                    border: `2px solid ${selectedStudentRoll === stu.rollNumber ? '#0f2850' : '#e2e8f0'}`,
                    background: selectedStudentRoll === stu.rollNumber ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <StudentPill
                        student={{
                          id: stu.studentId,
                          name: stu.studentName,
                          rollNumber: stu.rollNumber,
                          department: stu.department,
                          cgpa: String(stu.cgpa),
                        }}
                      />
                    </div>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {stu.department} · {stu.semester}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ fontSize: '0.9rem', color: '#0f2850' }}>{stu.cgpa} CGPA</strong>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                      {stu.attendancePercentage}% Att.
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Full Academic Section with Faculty/Admin Edit Enabled */}
          <AcademicSectionView defaultRollNumber={selectedStudentRoll} canEdit={true} />
        </div>
      )}

      {/* Tab 3: Administrator Profile & Details */}
      {adminTab === 'profile' && (
        <UserProfileSection />
      )}
    </div>
  );
}

