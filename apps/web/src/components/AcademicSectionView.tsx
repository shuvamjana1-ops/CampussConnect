import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Ticket, Paperclip, UploadCloud } from 'lucide-react';
import { useSession } from '../auth/session';
import { complaintStore, type AcademicRecord, type ComplaintAttachment } from '../services/complaintStore';
import { GlassCard } from './GlassCard';
import { AttendanceCalculator } from './AttendanceCalculator';
import { HallTicketModal } from './HallTicketModal';
import { compressImage } from '../utils/image-compressor';

export interface AcademicSectionViewProps {
  readonly defaultRollNumber?: string;
  readonly canEdit?: boolean;
}

export function AcademicSectionView({
  defaultRollNumber = 'JISU/2024/CSE/0842',
  canEdit = false,
}: AcademicSectionViewProps) {
  const { profile, updateProfile } = useSession();
  const [searchParams] = useSearchParams();
  const rollFromQuery =
    searchParams.get('roll') || searchParams.get('studentId') || defaultRollNumber;

  const [record, setRecord] = useState<AcademicRecord | null>(() =>
    complaintStore.getACRecord(rollFromQuery)
  );
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
  const [selectedSubject, setSelectedSubject] = useState<{
    code: string;
    name: string;
    marks: number;
  } | null>(null);
  const [discrepancyReason, setDiscrepancyReason] = useState(
    'Reported marks 12/30 on portal, expected 22/30 awarded on signed booklet.'
  );
  const [grievancePriority, setGrievancePriority] = useState<
    'Urgent (P0)' | 'High (P1)' | 'Normal (P2)'
  >('Urgent (P0)');
  const [showHallTicket, setShowHallTicket] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string>('');
  const [compressedBytes, setCompressedBytes] = useState<number | undefined>(undefined);
  const [compressing, setCompressing] = useState(false);

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    try {
      const res = await compressImage(file);
      setProofFile(res.file);
      setProofPreviewUrl(res.previewUrl);
      setCompressedBytes(res.compressedBytes);
    } catch (err) {
      console.error('Evidence compression failed:', err);
    } finally {
      setCompressing(false);
    }
  };

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
    setEditAddress(
      record.permanentAddress || 'Plot 42, Salt Lake Sector V, Kolkata, West Bengal - 700091'
    );
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

  const handleSaveMarks = (subjectCode: string) => {
    if (!record) return;
    complaintStore.updateACMarks(record.studentId, subjectCode, marksInput);
    setEditingCode(null);
    setSuccessMsg(
      `Marks updated for ${subjectCode} to ${marksInput}/30. Discrepancy logged as resolved.`
    );
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleOpenGrievanceModal = (sub?: {
    code: string;
    name: string;
    internalMarks: number;
  }) => {
    if (!record) return;
    if (sub) {
      setSelectedSubject({ code: sub.code, name: sub.name, marks: sub.internalMarks });
      setDiscrepancyReason(
        `Internal assessment marks recorded as ${sub.internalMarks}/30 in ${sub.code} (${sub.name}). Expected higher score as per evaluated booklet.`
      );
    } else if (record.subjects[0]) {
      const first = record.subjects[0];
      setSelectedSubject({ code: first.code, name: first.name, marks: first.internalMarks });
      setDiscrepancyReason(
        `Internal assessment marks recorded as ${first.internalMarks}/30 in ${first.code}. Expected score mismatch.`
      );
    }
    setShowGrievanceModal(true);
  };

  const handleLodgeACGrievance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record || !selectedSubject) return;

    const attachments: ComplaintAttachment[] = proofPreviewUrl
      ? [
          {
            id: `att_${Date.now()}`,
            name: proofFile?.name || 'Answer_Script_Proof.png',
            url: proofPreviewUrl,
            type: (proofFile?.type === 'application/pdf' ? 'pdf' : 'image') as 'pdf' | 'image',
            ...(compressedBytes !== undefined ? { sizeBytes: compressedBytes } : {}),
          },
        ]
      : [];

    const newTicket = complaintStore.addComplaint({
      type: 'Academic',
      title: `Internal assessment marks mismatch in ${selectedSubject.code} (${selectedSubject.name})`,
      description: discrepancyReason,
      department: 'Examination & Records Cell',
      priority: grievancePriority,
      currentStage: 'submitted',
      attachments,
      student: {
        id: record.studentId,
        name: record.studentName,
        rollNumber: record.rollNumber,
        department: record.department,
        semester: record.semester,
        cgpa: String(record.cgpa),
        academicStatus: 'Good Standing',
      },
      expectedResolutionTime: grievancePriority.includes('P0')
        ? 'Within 24 hours (Hall ticket cut-off)'
        : 'Within 48 hours',
    });

    setProofFile(null);
    setProofPreviewUrl('');
    setCompressedBytes(undefined);
    setShowGrievanceModal(false);
    setSuccessMsg(
      `Grievance #${newTicket.reference} registered! Case dispatched to Admin Command Center and Staff Resolution Desk.`
    );
    setTimeout(() => setSuccessMsg(null), 6000);
  };

  if (!record) {
    return (
      <GlassCard material="glass" style={{ padding: '32px', textAlign: 'center' }}>
        <p style={{ margin: 0, color: 'var(--text-muted, #64748b)' }}>
          No academic record found for query: {rollFromQuery}
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="cc-ac-module" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Top Banner */}
      <GlassCard material="glass" style={{ padding: '24px 28px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(37, 99, 235, 0.12)',
                color: '#1d4ed8',
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 800,
                marginBottom: '8px',
                border: '1px solid rgba(37, 99, 235, 0.25)',
              }}
            >
              <span>🏛️</span>
              <span>OFFICIAL ACADEMIC SECTION (AC) RECORD · JIS UNIVERSITY</span>
            </div>
            <h2
              style={{
                margin: '0 0 6px 0',
                fontSize: '1.65rem',
                fontWeight: 800,
                color: 'var(--text-main, #0f172a)',
                letterSpacing: '-0.02em',
              }}
            >
              Academic Log: {record.studentName}
            </h2>
            <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted, #64748b)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
              <span>
                Roll No: <strong style={{ color: 'var(--text-main, #0f172a)', fontFamily: 'monospace' }}>{record.rollNumber}</strong>
              </span>
              <span>
                Department: <strong style={{ color: 'var(--text-main, #0f172a)' }}>{record.department}</strong>
              </span>
              <span>
                Semester: <strong style={{ color: 'var(--text-main, #0f172a)' }}>{record.semester}</strong>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowHallTicket(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 800,
                fontSize: '0.825rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
              }}
            >
              <Ticket size={16} />
              <span>🎟️ Exam Hall Ticket</span>
            </button>
            <div
              className="glass-subtle"
              style={{
                textAlign: 'center',
                padding: '8px 16px',
                borderRadius: '12px',
              }}
            >
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', fontWeight: 700, textTransform: 'uppercase' }}>
                Attendance
              </span>
              <strong style={{ fontSize: '1.3rem', color: '#059669', fontWeight: 800 }}>
                {record.attendancePercentage}%
              </strong>
            </div>
            <div
              className="glass-subtle"
              style={{
                textAlign: 'center',
                padding: '8px 16px',
                borderRadius: '12px',
              }}
            >
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', fontWeight: 700, textTransform: 'uppercase' }}>
                CGPA
              </span>
              <strong style={{ fontSize: '1.3rem', color: 'var(--text-main, #0f172a)', fontWeight: 800 }}>
                {record.cgpa}
              </strong>
            </div>
          </div>
        </div>

        {successMsg && (
          <div
            style={{
              marginTop: '16px',
              padding: '10px 16px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              color: '#059669',
              borderRadius: '12px',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            ✓ {successMsg}
          </div>
        )}
      </GlassCard>

      {/* AC Student Personal Dossier & Edit Trigger */}
      <GlassCard
        material="glass"
        style={{
          padding: '24px',
          marginBottom: '24px',
          borderLeft: '4px solid #2563eb',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>👤</span> ACADEMIC IDENTITY &amp; STUDENT DOSSIER
            </div>
            <h3 style={{ margin: '2px 0 0 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
              Personal Details &amp; Contact Information
            </h3>
          </div>
          <button
            type="button"
            onClick={handleOpenPersonalEdit}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff',
              fontSize: '0.825rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
            }}
          >
            <span>✏️</span> Edit AC Personal Data
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', fontSize: '0.875rem' }}>
          <div className="glass-subtle" style={{ padding: '12px 16px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>
              Phone Contact
            </span>
            <strong style={{ color: 'var(--text-main, #0f172a)', fontSize: '0.925rem' }}>
              {record.phone || '+91-98301-23456'}
            </strong>
          </div>

          <div className="glass-subtle" style={{ padding: '12px 16px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>
              Registered Email
            </span>
            <strong style={{ color: 'var(--text-main, #0f172a)', fontSize: '0.925rem' }}>
              {record.email || 'ananya.das@jisuniversity.ac.in'}
            </strong>
          </div>

          <div className="glass-subtle" style={{ padding: '12px 16px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>
              Parent / Guardian
            </span>
            <strong style={{ color: 'var(--text-main, #0f172a)', fontSize: '0.925rem' }}>
              {record.guardianName || 'Dr. Subhash Das'}
            </strong>
          </div>

          <div className="glass-subtle" style={{ padding: '12px 16px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>
              Emergency Number
            </span>
            <strong style={{ color: '#dc2626', fontSize: '0.925rem' }}>
              {record.emergencyContact || '+91-98300-11223'}
            </strong>
          </div>

          <div className="glass-subtle" style={{ padding: '12px 16px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>
              Blood Group
            </span>
            <strong style={{ color: '#b91c1c', fontSize: '0.925rem' }}>
              {record.bloodGroup || 'O+ (Positive)'}
            </strong>
          </div>

          <div className="glass-subtle" style={{ padding: '12px 16px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>
              Date of Birth
            </span>
            <strong style={{ color: 'var(--text-main, #0f172a)', fontSize: '0.925rem' }}>
              {record.dateOfBirth || '15 August 2004'}
            </strong>
          </div>

          <div className="glass-subtle" style={{ gridColumn: '1 / -1', padding: '12px 16px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>
              Permanent Residential Address
            </span>
            <span style={{ color: 'var(--text-main, #0f172a)', fontSize: '0.875rem', fontWeight: 600 }}>
              {record.permanentAddress || 'Plot 42, Salt Lake Sector V, Kolkata, West Bengal - 700091'}
            </span>
          </div>
        </div>
      </GlassCard>

      {/* 75% Target & Bunk Margin Calculator */}
      <div style={{ marginBottom: '24px' }}>
        <AttendanceCalculator
          record={record}
          onFlagDiscrepancy={(sub) =>
            handleOpenGrievanceModal({
              code: sub.code,
              name: sub.name,
              internalMarks: sub.internalMarks,
            })
          }
        />
      </div>

      {/* Continuous Assessment & Internal Marks Roster Table */}
      <GlassCard material="glass" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
              Continuous Assessment &amp; Internal Marks Roster
            </h3>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted, #64748b)' }}>
              Direct examination records synchronized with University Exam Cell.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!canEdit && (
              <button
                type="button"
                onClick={() => handleOpenGrievanceModal()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#ffffff',
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                }}
              >
                ⚡ Register AC Marks Grievance
              </button>
            )}
            {canEdit && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#92400e',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                }}
              >
                ✏️ Faculty Edit Mode Enabled
              </span>
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto', borderRadius: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.35)', borderBottom: '1px solid rgba(0, 0, 0, 0.08)', color: 'var(--text-muted, #64748b)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 14px' }}>Subject Code</th>
                <th style={{ padding: '12px 14px' }}>Course Name</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>Attendance</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>Internal Marks</th>
                <th style={{ padding: '12px 14px' }}>Grade</th>
                <th style={{ padding: '12px 14px' }}>Audit Status</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {record.subjects.map((sub) => (
                <tr key={sub.code} style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.05)' }}>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--text-main, #0f172a)', fontFamily: 'monospace' }}>
                    {sub.code}
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-main, #0f172a)', fontWeight: 600 }}>
                    {sub.name}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, color: sub.attendance >= 75 ? '#059669' : '#dc2626' }}>
                      {sub.attendance}%
                    </span>
                  </td>
                  <td style={{ padding: '14px', textAlign: 'center' }}>
                    {editingCode === sub.code ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={marksInput}
                          onChange={(e) => setMarksInput(Number(e.target.value))}
                          className="glass-subtle"
                          style={{
                            width: '56px',
                            padding: '4px 6px',
                            borderRadius: '6px',
                            border: '1px solid #f59e0b',
                            textAlign: 'center',
                            fontWeight: 700,
                          }}
                        />
                        <span style={{ color: 'var(--text-muted, #64748b)' }}>/30</span>
                      </div>
                    ) : (
                      <strong style={{ fontSize: '0.95rem', color: sub.internalMarks < 15 ? '#dc2626' : 'var(--text-main, #0f172a)' }}>
                        {sub.internalMarks} / {sub.maxInternal}
                      </strong>
                    )}
                  </td>
                  <td style={{ padding: '14px', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
                    {sub.grade}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <span
                      style={{
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: '9999px',
                        background: sub.status === 'Marks Discrepancy Resolved' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: sub.status === 'Marks Discrepancy Resolved' ? '#d97706' : '#059669',
                        border: `1px solid ${sub.status === 'Marks Discrepancy Resolved' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
                      }}
                    >
                      {sub.status === 'Marks Discrepancy Resolved' ? '⚡ ' : '✓ '}
                      {sub.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right' }}>
                    {canEdit ? (
                      editingCode === sub.code ? (
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleSaveMarks(sub.code)}
                            style={{
                              padding: '4px 10px',
                              background: '#059669',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCode(null)}
                            style={{
                              padding: '4px 10px',
                              background: 'rgba(0,0,0,0.06)',
                              color: 'var(--text-main, #0f172a)',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
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
                          style={{
                            padding: '4px 12px',
                            background: 'transparent',
                            border: '1px solid rgba(0, 0, 0, 0.15)',
                            color: 'var(--text-main, #0f172a)',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Modify Marks
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenGrievanceModal(sub)}
                        style={{
                          padding: '6px 12px',
                          background: 'rgba(37, 99, 235, 0.1)',
                          border: '1px solid rgba(37, 99, 235, 0.25)',
                          color: '#1d4ed8',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
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

      {/* Statutory Clearances Footprint */}
      <GlassCard material="glass" style={{ padding: '24px' }}>
        <h4 style={{ margin: '0 0 14px 0', fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
          Statutory Clearances &amp; Hall Ticket Readiness
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div className="glass-subtle" style={{ padding: '14px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', display: 'block', marginBottom: '4px' }}>
              Fees Clearance
            </span>
            <strong style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
              ✓ All Semester Dues Cleared
            </strong>
          </div>
          <div className="glass-subtle" style={{ padding: '14px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', display: 'block', marginBottom: '4px' }}>
              Library Obligations
            </span>
            <strong style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
              ✓ 0 Outstanding Book Holds
            </strong>
          </div>
          <div className="glass-subtle" style={{ padding: '14px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', display: 'block', marginBottom: '4px' }}>
              Assigned Faculty Advisor
            </span>
            <strong style={{ color: 'var(--text-main, #0f172a)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
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
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          role="dialog"
          aria-modal="true"
        >
          <GlassCard material="glass-strong" style={{ maxWidth: '520px', width: '100%', padding: '28px' }}>
            <h3 style={{ margin: '0 0 6px 0', color: 'var(--text-main, #0f172a)', fontSize: '1.25rem', fontWeight: 800 }}>
              Raise Academic Marks Grievance
            </h3>
            <p style={{ margin: '0 0 18px 0', color: 'var(--text-muted, #64748b)', fontSize: '0.85rem' }}>
              Submit an official marks dispute for <strong>{selectedSubject.code} ({selectedSubject.name})</strong>. This will be immediately dispatched to Admin and Faculty Evaluator inboxes.
            </p>

            <form onSubmit={handleLodgeACGrievance} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
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
                  className="glass-subtle"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                >
                  {record.subjects.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} - {s.name} (Current: {s.internalMarks}/30)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                  Discrepancy Details &amp; Ground for Correction
                </label>
                <textarea
                  required
                  rows={4}
                  value={discrepancyReason}
                  onChange={(e) => setDiscrepancyReason(e.target.value)}
                  placeholder="Detail the expected marks, evaluator signature, answer script page references..."
                  className="glass-subtle"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.1)', fontFamily: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                  Supporting Proof (Evaluator-Signed Answer Script / Evidence)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      background: 'rgba(37, 99, 235, 0.15)',
                      color: '#60a5fa',
                      border: '1px solid rgba(37, 99, 235, 0.3)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <UploadCloud size={14} />
                    <span>{compressing ? 'Compressing Proof...' : 'Upload Scanned Proof'}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleProofUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {proofFile && (
                    <span style={{ fontSize: '0.785rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Paperclip size={12} />
                      {proofFile.name} {compressedBytes ? `(${(compressedBytes / 1024).toFixed(0)} KB compressed)` : ''}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                  Priority Level
                </label>
                <select
                  value={grievancePriority}
                  onChange={(e) => setGrievancePriority(e.target.value as any)}
                  className="glass-subtle"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                >
                  <option value="Urgent (P0)">Urgent (P0) — Exam Hall Ticket Cutoff</option>
                  <option value="High (P1)">High (P1) — Grade Card Finalization</option>
                  <option value="Normal (P2)">Normal (P2) — Standard Inquiry</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowGrievanceModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    background: 'transparent',
                    fontWeight: 600,
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  ✓ Submit Grievance to Inboxes
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* AC Personal Data Edit Modal */}
      {showPersonalEditModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '16px',
          }}
          role="dialog"
          aria-modal="true"
        >
          <GlassCard material="glass-strong" style={{ maxWidth: '640px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🏛️ ACADEMIC SECTION (AC) · PROFILE &amp; PERSONAL DATA
                </span>
                <h3 style={{ margin: '2px 0 0 0', color: 'var(--text-main, #0f172a)', fontSize: '1.35rem', fontWeight: 800 }}>
                  Edit AC Personal Data: {record.studentName}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                  Roll Number: <strong>{record.rollNumber}</strong> · Directly updates academic section database.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPersonalEditModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--text-muted, #64748b)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePersonalData} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                    Full Student Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="glass-subtle"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                    Phone Contact Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="glass-subtle"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                    Registered Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="glass-subtle"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                    Parent / Guardian Name
                  </label>
                  <input
                    type="text"
                    value={editGuardian}
                    onChange={(e) => setEditGuardian(e.target.value)}
                    className="glass-subtle"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                    Emergency Contact Number
                  </label>
                  <input
                    type="tel"
                    value={editEmergency}
                    onChange={(e) => setEditEmergency(e.target.value)}
                    className="glass-subtle"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                    Blood Group
                  </label>
                  <select
                    value={editBloodGroup}
                    onChange={(e) => setEditBloodGroup(e.target.value)}
                    className="glass-subtle"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
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
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                    Date of Birth
                  </label>
                  <input
                    type="text"
                    value={editDob}
                    onChange={(e) => setEditDob(e.target.value)}
                    placeholder="e.g. 15 August 2004"
                    className="glass-subtle"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                    Department / Academic Unit
                  </label>
                  <input
                    type="text"
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                    className="glass-subtle"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                    Semester / Year
                  </label>
                  <input
                    type="text"
                    value={editSemester}
                    onChange={(e) => setEditSemester(e.target.value)}
                    className="glass-subtle"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                    Assigned Faculty Advisor
                  </label>
                  <input
                    type="text"
                    value={editAdvisor}
                    onChange={(e) => setEditAdvisor(e.target.value)}
                    className="glass-subtle"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)' }}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '4px' }}>
                    Permanent Residential Address
                  </label>
                  <textarea
                    rows={2}
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="glass-subtle"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0, 0, 0, 0.1)', fontFamily: 'inherit' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(0, 0, 0, 0.08)' }}>
                <button
                  type="button"
                  onClick={() => setShowPersonalEditModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    background: 'transparent',
                    fontWeight: 600,
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 22px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  ✓ Save AC Personal Data
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
      {/* Official Exam Hall Ticket Modal */}
      {showHallTicket && record && (
        <HallTicketModal
          isOpen={showHallTicket}
          onClose={() => setShowHallTicket(false)}
          studentIdOrRoll={record.studentId}
        />
      )}
    </div>
  );
}

export default AcademicSectionView;
