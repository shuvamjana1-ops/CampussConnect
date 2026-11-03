import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSession } from '../auth/session';
import { complaintStore, type AcademicRecord } from '../services/complaintStore';
import { GlassCard } from './GlassCard';

export interface AcademicSectionViewProps {
  readonly defaultRollNumber?: string;
  readonly canEdit?: boolean;
}

export function AcademicSectionView({ defaultRollNumber = 'JISU/2024/CSE/0842', canEdit = false }: AcademicSectionViewProps) {
  const { profile, updateProfile } = useSession();
  const [searchParams] = useSearchParams();
  const rollFromQuery = searchParams.get('roll') || searchParams.get('studentId') || defaultRollNumber;

  const [record, setRecord] = useState<AcademicRecord | null>(() => complaintStore.getACRecord(rollFromQuery));
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [marksInput, setMarksInput] = useState<number>(22);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // AC Personal Data Edit State
  const [showPersonalEditModal, setShowPersonalEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editGuardian, setEditGuardian] = useState('');
  const [editEmergency, setEditEmergency] = useState('');
  const [editBloodGroup, setEditBloodGroup] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editSemester, setEditSemester] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editAdvisor, setEditAdvisor] = useState('');

  // AC Grievance Lodging Modal State
  const [showGrievanceModal, setShowGrievanceModal] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<{ code: string; name: string; marks: number } | null>(null);
  const [discrepancyReason, setDiscrepancyReason] = useState('Reported marks 12/30 on portal, expected 22/30 awarded on signed booklet.');
  const [grievancePriority, setGrievancePriority] = useState<'Urgent (P0)' | 'High (P1)' | 'Normal (P2)'>('Urgent (P0)');

  useEffect(() => {
    const unsubscribe = complaintStore.subscribe(() => {
      setRecord(complaintStore.getACRecord(rollFromQuery));
    });
    setRecord(complaintStore.getACRecord(rollFromQuery));
    return unsubscribe;
  }, [rollFromQuery]);

  const handleOpenPersonalEdit = () => {
    if (!record) return;
    setEditName(record.studentName);
    setEditPhone(record.phone || '+91-98301-23456');
    setEditEmail(record.email || 'ananya.das@jisuniversity.ac.in');
    setEditGuardian(record.guardianName || 'Dr. Subhash Das');
    setEditEmergency(record.emergencyContact || '+91-98300-11223');
    setEditBloodGroup(record.bloodGroup || 'O+ (Positive)');
    setEditAddress(record.permanentAddress || 'Plot 42, Salt Lake Sector V, Kolkata, West Bengal - 700091');
    setEditDob(record.dateOfBirth || '15 August 2004');
    setEditSemester(record.semester);
    setEditDept(record.department);
    setEditAdvisor(record.advisorName);
    setShowPersonalEditModal(true);
  };

  const handleSavePersonalData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;

    complaintStore.updateACPersonalData(record.studentId, {
      studentName: editName.trim(),
      phone: editPhone.trim(),
      email: editEmail.trim(),
      guardianName: editGuardian.trim(),
      emergencyContact: editEmergency.trim(),
      bloodGroup: editBloodGroup.trim(),
      permanentAddress: editAddress.trim(),
      dateOfBirth: editDob.trim(),
      semester: editSemester.trim(),
      department: editDept.trim(),
      advisorName: editAdvisor.trim(),
    });

    // If logged in student matches, also update session profile
    if (profile?.id === record.studentId || profile?.roll_number === record.rollNumber) {
      void updateProfile({
        full_name: editName.trim(),
        phone: editPhone.trim(),
        department: editDept.trim(),
        emergency_contact: editEmergency.trim(),
        semester: editSemester.trim(),
      });
    }

    setShowPersonalEditModal(false);
    setSuccessMsg('Academic Section (AC) personal data updated successfully!');
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  if (!record) {
    return (
      <GlassCard style={{ padding: '2rem', textAlign: 'center' }}>
        <p>No academic record found for query: {rollFromQuery}</p>
      </GlassCard>
    );
  }

  const handleSaveMarks = (subjectCode: string) => {
    complaintStore.updateACMarks(record.studentId, subjectCode, marksInput);
    setEditingCode(null);
    setSuccessMsg(`Marks updated for ${subjectCode} to ${marksInput}/30. Discrepancy logged as resolved.`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleOpenGrievanceModal = (sub?: { code: string; name: string; internalMarks: number }) => {
    if (sub) {
      setSelectedSubject({ code: sub.code, name: sub.name, marks: sub.internalMarks });
      setDiscrepancyReason(`Internal assessment marks recorded as ${sub.internalMarks}/30 in ${sub.code} (${sub.name}). Expected higher score as per evaluated booklet.`);
    } else if (record.subjects[0]) {
      const first = record.subjects[0];
      setSelectedSubject({ code: first.code, name: first.name, marks: first.internalMarks });
      setDiscrepancyReason(`Internal assessment marks recorded as ${first.internalMarks}/30 in ${first.code}. Expected score mismatch.`);
    }
    setShowGrievanceModal(true);
  };

  const handleLodgeACGrievance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject) return;

    const newTicket = complaintStore.addComplaint({
      type: 'Academic',
      title: `Internal assessment marks mismatch in ${selectedSubject.code} (${selectedSubject.name})`,
      description: discrepancyReason,
      department: 'Examination & Records Cell',
      priority: grievancePriority,
      currentStage: 'submitted',
      student: {
        id: record.studentId,
        name: record.studentName,
        rollNumber: record.rollNumber,
        department: record.department,
        semester: record.semester,
        cgpa: String(record.cgpa),
        academicStatus: 'Good Standing',
      },
      expectedResolutionTime: grievancePriority.includes('P0') ? 'Within 24 hours (Hall ticket cut-off)' : 'Within 48 hours',
    });

    setShowGrievanceModal(false);
    setSuccessMsg(`Grievance #${newTicket.reference} registered! Case dispatched to Admin Command Center and Worker Resolution Desk.`);
    setTimeout(() => setSuccessMsg(null), 6000);
  };

  return (
    <div className="cc-ac-module" style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* Top Banner */}
      <GlassCard style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#eff6ff', color: '#1e3a8a', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              <span>🏛️</span> OFFICIAL ACADEMIC SECTION (AC) RECORD · JIS UNIVERSITY
            </div>
            <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.6rem', fontWeight: 800, color: '#0f2850' }}>
              Academic Log: {record.studentName}
            </h2>
            <div style={{ display: 'flex', gap: '1rem', color: '#64748b', fontSize: '0.85rem', flexWrap: 'wrap' }}>
              <span>Roll No: <strong style={{ color: '#0f2850', fontFamily: 'monospace' }}>{record.rollNumber}</strong></span>
              <span>Department: <strong style={{ color: '#0f2850' }}>{record.department}</strong></span>
              <span>Semester: <strong style={{ color: '#0f2850' }}>{record.semester}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ textAlign: 'center', background: '#ffffff', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '12px' }}>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Attendance</span>
              <strong style={{ fontSize: '1.25rem', color: '#059669', fontWeight: 800 }}>{record.attendancePercentage}%</strong>
            </div>
            <div style={{ textAlign: 'center', background: '#ffffff', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '12px' }}>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>CGPA</span>
              <strong style={{ fontSize: '1.25rem', color: '#0f2850', fontWeight: 800 }}>{record.cgpa}</strong>
            </div>
          </div>
        </div>

        {successMsg && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600 }}>
            ✓ {successMsg}
          </div>
        )}
      </GlassCard>

      {/* AC Student Personal Dossier & Edit Trigger */}
      <GlassCard style={{ padding: '1.5rem', marginBottom: '1.5rem', borderLeft: '4px solid #2563eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>👤</span> ACADEMIC IDENTITY &amp; STUDENT DOSSIER
            </div>
            <h3 style={{ margin: '2px 0 0', fontSize: '1.2rem', fontWeight: 800, color: '#0f2850' }}>
              Personal Details &amp; Contact Information
            </h3>
          </div>
          <button
            type="button"
            onClick={handleOpenPersonalEdit}
            className="cf-btn cf-btn-student"
            style={{ padding: '6px 14px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span>✏️</span> Edit AC Personal Data
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.875rem' }}>
          <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Phone Contact</span>
            <strong style={{ color: '#0f2850', fontSize: '0.9rem' }}>{record.phone || '+91-98301-23456'}</strong>
          </div>

          <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Registered Email</span>
            <strong style={{ color: '#0f2850', fontSize: '0.9rem' }}>{record.email || 'ananya.das@jisuniversity.ac.in'}</strong>
          </div>

          <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Parent / Guardian</span>
            <strong style={{ color: '#0f2850', fontSize: '0.9rem' }}>{record.guardianName || 'Dr. Subhash Das'}</strong>
          </div>

          <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Emergency Number</span>
            <strong style={{ color: '#dc2626', fontSize: '0.9rem' }}>{record.emergencyContact || '+91-98300-11223'}</strong>
          </div>

          <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Blood Group</span>
            <strong style={{ color: '#b91c1c', fontSize: '0.9rem' }}>{record.bloodGroup || 'O+ (Positive)'}</strong>
          </div>

          <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Date of Birth</span>
            <strong style={{ color: '#0f2850', fontSize: '0.9rem' }}>{record.dateOfBirth || '15 August 2004'}</strong>
          </div>

          <div style={{ gridColumn: '1 / -1', background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Permanent Residential Address</span>
            <span style={{ color: '#1e293b', fontSize: '0.875rem', fontWeight: 600 }}>{record.permanentAddress || 'Plot 42, Salt Lake Sector V, Kolkata, West Bengal - 700091'}</span>
          </div>
        </div>
      </GlassCard>

      {/* Internal Assessment Marks Roster Table */}
      <GlassCard style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f2850' }}>
              Continuous Assessment & Internal Marks Roster
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Direct examination records synchronized with University Exam Cell.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!canEdit && (
              <button
                type="button"
                onClick={() => handleOpenGrievanceModal()}
                className="cf-btn cf-btn-student"
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              >
                ⚡ Register AC Marks Grievance
              </button>
            )}
            {canEdit && (
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.25rem 0.65rem', borderRadius: '9999px' }}>
                ✏️ Faculty Edit Mode Enabled
              </span>
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Subject Code</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Course Name</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Attendance</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Internal Marks</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Grade</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Audit Status</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {record.subjects.map((sub) => (
                <tr key={sub.code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.85rem 0.5rem', fontWeight: 700, color: '#0f2850', fontFamily: 'monospace' }}>
                    {sub.code}
                  </td>
                  <td style={{ padding: '0.85rem 0.5rem', color: '#1e293b', fontWeight: 600 }}>
                    {sub.name}
                  </td>
                  <td style={{ padding: '0.85rem 0.5rem', textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, color: sub.attendance >= 75 ? '#059669' : '#dc2626' }}>
                      {sub.attendance}%
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 0.5rem', textAlign: 'center' }}>
                    {editingCode === sub.code ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={marksInput}
                          onChange={(e) => setMarksInput(Number(e.target.value))}
                          style={{ width: '56px', padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid #f59e0b', textAlign: 'center', fontWeight: 700 }}
                        />
                        <span style={{ color: '#64748b' }}>/30</span>
                      </div>
                    ) : (
                      <strong style={{ fontSize: '1rem', color: sub.internalMarks < 15 ? '#dc2626' : '#0f2850' }}>
                        {sub.internalMarks} / {sub.maxInternal}
                      </strong>
                    )}
                  </td>
                  <td style={{ padding: '0.85rem 0.5rem', fontWeight: 800, color: '#0f2850' }}>
                    {sub.grade}
                  </td>
                  <td style={{ padding: '0.85rem 0.5rem' }}>
                    <span
                      style={{
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.55rem',
                        borderRadius: '9999px',
                        background: sub.status === 'Marks Discrepancy Resolved' ? '#fef3c7' : '#ecfdf5',
                        color: sub.status === 'Marks Discrepancy Resolved' ? '#92400e' : '#065f46',
                        border: `1px solid ${sub.status === 'Marks Discrepancy Resolved' ? '#fde68a' : '#a7f3d0'}`,
                      }}
                    >
                      {sub.status === 'Marks Discrepancy Resolved' ? '⚡ ' : '✓ '}
                      {sub.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                    {canEdit ? (
                      editingCode === sub.code ? (
                        <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => handleSaveMarks(sub.code)}
                            style={{ padding: '0.25rem 0.6rem', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCode(null)}
                            style={{ padding: '0.25rem 0.6rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCode(sub.code);
                            setMarksInput(sub.internalMarks);
                          }}
                          style={{ padding: '0.25rem 0.65rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f2850', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                        >
                          Modify Marks
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenGrievanceModal(sub)}
                        style={{ padding: '0.25rem 0.65rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                        title="Submit formal mark discrepancy to Admin & Evaluator"
                      >
                        ⚡ Flag Discrepancy
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* University Compliance & Clearance Footprint */}
      <GlassCard style={{ padding: '1.5rem' }}>
        <h4 style={{ margin: '0 0 0.85rem', fontSize: '0.95rem', fontWeight: 800, color: '#0f2850' }}>
          Statutory Clearances & Hall Ticket Readiness
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Fees Clearance</span>
            <strong style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              ✓ All Semester Dues Cleared
            </strong>
          </div>
          <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Library Obligations</span>
            <strong style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              ✓ 0 Outstanding Book Holds
            </strong>
          </div>
          <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Assigned Faculty Advisor</span>
            <strong style={{ color: '#0f2850', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              👨‍🏫 {record.advisorName}
            </strong>
          </div>
        </div>
      </GlassCard>

      {/* AC Grievance Lodging Modal */}
      {showGrievanceModal && selectedSubject && (
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
          <div className="cf-card" style={{ maxWidth: '520px', width: '100%', background: '#ffffff', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#0f2850', fontSize: '1.25rem', fontWeight: 800 }}>
              Raise Academic Marks Grievance
            </h3>
            <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.85rem' }}>
              Submit an official marks dispute for <strong>{selectedSubject.code} ({selectedSubject.name})</strong>. This will be immediately dispatched to Admin and Faculty Evaluator inboxes.
            </p>

            <form onSubmit={handleLodgeACGrievance} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                  Target Subject
                </label>
                <select
                  value={selectedSubject.code}
                  onChange={(e) => {
                    const sub = record.subjects.find((s) => s.code === e.target.value);
                    if (sub) {
                      setSelectedSubject({ code: sub.code, name: sub.name, marks: sub.internalMarks });
                    }
                  }}
                  className="cf-select"
                >
                  {record.subjects.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} - {s.name} (Current: {s.internalMarks}/30)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                  Discrepancy Details & Ground for Correction
                </label>
                <textarea
                  required
                  rows={4}
                  value={discrepancyReason}
                  onChange={(e) => setDiscrepancyReason(e.target.value)}
                  placeholder="Detail the expected marks, evaluator signature, answer script page references..."
                  className="cf-textarea"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                  Priority Level
                </label>
                <select
                  value={grievancePriority}
                  onChange={(e) => setGrievancePriority(e.target.value as any)}
                  className="cf-select"
                >
                  <option value="Urgent (P0)">Urgent (P0) — Exam Hall Ticket Cutoff</option>
                  <option value="High (P1)">High (P1) — Grade Card Finalization</option>
                  <option value="Normal (P2)">Normal (P2) — Standard Inquiry</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowGrievanceModal(false)}
                  className="cf-btn cf-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cf-btn cf-btn-student"
                >
                  ✓ Submit Grievance to Inboxes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AC Personal Data Edit Modal */}
      {showPersonalEditModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '1rem',
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="cf-card" style={{ maxWidth: '640px', width: '100%', background: '#ffffff', boxShadow: 'var(--shadow-xl)', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🏛️ ACADEMIC SECTION (AC) · PROFILE &amp; PERSONAL DATA
                </span>
                <h3 style={{ margin: '2px 0 0', color: '#0f2850', fontSize: '1.35rem', fontWeight: 800 }}>
                  Edit AC Personal Data: {record.studentName}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Roll Number: <strong>{record.rollNumber}</strong> · Directly updates academic section database.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPersonalEditModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePersonalData} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                    Full Student Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="cf-input"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                    Phone Contact Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="cf-input"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                    Registered Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="cf-input"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                    Parent / Guardian Name
                  </label>
                  <input
                    type="text"
                    value={editGuardian}
                    onChange={(e) => setEditGuardian(e.target.value)}
                    className="cf-input"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                    Emergency Contact Number
                  </label>
                  <input
                    type="tel"
                    value={editEmergency}
                    onChange={(e) => setEditEmergency(e.target.value)}
                    className="cf-input"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                    Blood Group
                  </label>
                  <select
                    value={editBloodGroup}
                    onChange={(e) => setEditBloodGroup(e.target.value)}
                    className="cf-select"
                  >
                    <option value="O+ (Positive)">O+ (Positive)</option>
                    <option value="A+ (Positive)">A+ (Positive)</option>
                    <option value="B+ (Positive)">B+ (Positive)</option>
                    <option value="AB+ (Positive)">AB+ (Positive)</option>
                    <option value="O- (Negative)">O- (Negative)</option>
                    <option value="A- (Negative)">A- (Negative)</option>
                    <option value="B- (Negative)">B- (Negative)</option>
                    <option value="AB- (Negative)">AB- (Negative)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                    Date of Birth
                  </label>
                  <input
                    type="text"
                    value={editDob}
                    onChange={(e) => setEditDob(e.target.value)}
                    placeholder="e.g. 15 August 2004"
                    className="cf-input"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                    Semester / Year
                  </label>
                  <input
                    type="text"
                    value={editSemester}
                    onChange={(e) => setEditSemester(e.target.value)}
                    className="cf-input"
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                    Permanent Residential Address
                  </label>
                  <textarea
                    rows={2}
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="cf-textarea"
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0f2850', marginBottom: '0.3rem' }}>
                    Assigned Faculty Advisor
                  </label>
                  <input
                    type="text"
                    value={editAdvisor}
                    onChange={(e) => setEditAdvisor(e.target.value)}
                    className="cf-input"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setShowPersonalEditModal(false)}
                  className="cf-btn cf-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cf-btn cf-btn-student"
                  style={{ padding: '8px 20px', fontWeight: 700 }}
                >
                  ✓ Save AC Personal Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AcademicSectionView;

