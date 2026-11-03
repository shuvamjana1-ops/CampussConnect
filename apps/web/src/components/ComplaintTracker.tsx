import { useState } from 'react';
import { GlassCard } from './GlassCard';
import { StudentPill, type StudentInfo } from './StudentPill';

export type ComplaintStage = 'submitted' | 'under_review' | 'assigned_to_staff' | 'resolved';

export interface TimelineEvent {
  readonly id: string;
  readonly stage: ComplaintStage;
  readonly title: string;
  readonly description: string;
  readonly actor: string;
  readonly timestamp: string;
}

export interface ComplaintData {
  readonly id: string;
  readonly reference: string;
  readonly type: 'Grievance' | 'Infrastructure' | 'Hostel' | 'Academic';
  readonly title: string;
  readonly description: string;
  readonly student: StudentInfo;
  readonly department: string;
  readonly priority: 'Urgent (P0)' | 'High (P1)' | 'Normal (P2)';
  readonly currentStage: ComplaintStage;
  readonly assignedStaffName?: string;
  readonly assignedStaffRole?: string;
  readonly createdAt: string;
  readonly expectedResolutionTime?: string;
  readonly timeline: readonly TimelineEvent[];
}

export interface ComplaintTrackerProps {
  readonly complaint: ComplaintData;
  readonly allowStatusUpdate?: boolean;
  readonly onStatusChange?: (newStage: ComplaintStage, note: string) => void;
  readonly onAssignStaff?: (staffName: string) => void;
}

const STAGES: readonly { readonly key: ComplaintStage; readonly label: string; readonly stepNum: number }[] = [
  { key: 'submitted', label: 'Submitted', stepNum: 1 },
  { key: 'under_review', label: 'Under Review', stepNum: 2 },
  { key: 'assigned_to_staff', label: 'Assigned to Staff', stepNum: 3 },
  { key: 'resolved', label: 'Resolved', stepNum: 4 },
];

export function ComplaintTracker({
  complaint,
  allowStatusUpdate = false,
  onStatusChange,
  onAssignStaff,
}: ComplaintTrackerProps) {
  const [currentStage, setCurrentStage] = useState<ComplaintStage>(complaint.currentStage);
  const [newNote, setNewNote] = useState('');
  const [selectedStaff, setSelectedStaff] = useState(complaint.assignedStaffName ?? 'Prof. Rahul Mehta');
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const stageIndex = STAGES.findIndex((s) => s.key === currentStage);

  const handleStageSelect = (stage: ComplaintStage) => {
    if (!allowStatusUpdate) return;
    setCurrentStage(stage);
    if (onStatusChange) {
      onStatusChange(stage, newNote || `Status updated to ${stage.replace('_', ' ')}`);
    }
  };

  const handleApplyUpdate = () => {
    if (onStatusChange) {
      onStatusChange(currentStage, newNote);
    }
    if (onAssignStaff && selectedStaff) {
      onAssignStaff(selectedStaff);
    }
    setShowUpdateModal(false);
    setNewNote('');
  };

  return (
    <GlassCard className="cc-complaint-tracker-card" style={{ padding: '1.75rem' }}>
      {/* Header Info */}
      <div className="cc-tracker-header">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
            <span className="cc-tracker-ref">{complaint.reference}</span>
            <span className={`cc-priority-badge ${complaint.priority.includes('P0') ? 'urgent' : 'normal'}`}>
              {complaint.priority}
            </span>
            <span className="cc-category-badge">{complaint.type}</span>
          </div>
          <h3 className="cc-tracker-title">{complaint.title}</h3>
          <p className="cc-tracker-desc">{complaint.description}</p>
        </div>

        {/* Student Social Pill */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
            Lodged By Student
          </span>
          <StudentPill student={complaint.student} showRoll />
        </div>
      </div>

      {/* Visual Tracking Progress Bar (Submitted -> Under Review -> Assigned to Staff -> Resolved) */}
      <div className="cc-tracking-stepper-container" aria-label="Complaint Progress Stepper">
        <div className="cc-stepper-track">
          <div
            className="cc-stepper-track-progress"
            style={{ width: `${(stageIndex / (STAGES.length - 1)) * 100}%` }}
          />
        </div>

        <div className="cc-stepper-nodes">
          {STAGES.map((s, idx) => {
            const isCompleted = idx < stageIndex;
            const isCurrent = idx === stageIndex;
            return (
              <div
                key={s.key}
                className={`cc-stepper-node ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
              >
                <div
                  className="cc-node-circle"
                  onClick={() => {
                    if (allowStatusUpdate) handleStageSelect(s.key);
                  }}
                  title={`Step ${s.stepNum}: ${s.label}`}
                  style={{ cursor: allowStatusUpdate ? 'pointer' : 'default' }}
                >
                  {isCompleted ? '✓' : s.stepNum}
                </div>
                <span className="cc-node-label">{s.label}</span>
                {isCurrent && (
                  <span className="cc-node-status-glow">Active Stage</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Details Meta Grid */}
      <div className="cc-tracker-meta-grid">
        <div className="cc-tracker-meta-item">
          <span className="cc-meta-label">Department</span>
          <strong className="cc-meta-val">🏛️ {complaint.department}</strong>
        </div>
        <div className="cc-tracker-meta-item">
          <span className="cc-meta-label">Assigned Staff</span>
          <strong className="cc-meta-val">👤 {complaint.assignedStaffName ?? 'Triage Cell pending'}</strong>
        </div>
        <div className="cc-tracker-meta-item">
          <span className="cc-meta-label">Lodged On</span>
          <strong className="cc-meta-val">{complaint.createdAt}</strong>
        </div>
        <div className="cc-tracker-meta-item">
          <span className="cc-meta-label">Resolution SLA Target</span>
          <strong className="cc-meta-val" style={{ color: '#0f766e' }}>
            ⏱️ {complaint.expectedResolutionTime ?? 'Within 48 hours'}
          </strong>
        </div>
      </div>

      {/* Timeline Audit Logs */}
      <div className="cc-tracker-timeline-section">
        <h4 style={{ margin: '0 0 0.85rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f2850' }}>
          Activity & Resolution Trail
        </h4>
        <div className="cc-tracker-timeline">
          {complaint.timeline.map((event) => (
            <div key={event.id} className="cc-timeline-item">
              <div className="cc-timeline-dot" />
              <div className="cc-timeline-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                  <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{event.title}</strong>
                  <time style={{ fontSize: '0.75rem', color: '#64748b' }}>{event.timestamp}</time>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569' }}>{event.description}</p>
                <span style={{ fontSize: '0.725rem', color: '#1e3a8a', fontWeight: 600, display: 'inline-block', marginTop: '0.25rem' }}>
                  By: {event.actor}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Staff Fast-Action Controls */}
      {allowStatusUpdate && (
        <div className="cc-tracker-actions-bar">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleStageSelect('under_review')}
              className={`cc-btn-pill ${currentStage === 'under_review' ? 'active' : ''}`}
            >
              Set Under Review
            </button>
            <button
              type="button"
              onClick={() => handleStageSelect('assigned_to_staff')}
              className={`cc-btn-pill ${currentStage === 'assigned_to_staff' ? 'active' : ''}`}
            >
              Assign to Officer
            </button>
            <button
              type="button"
              onClick={() => handleStageSelect('resolved')}
              className={`cc-btn-pill cc-btn-resolve ${currentStage === 'resolved' ? 'active' : ''}`}
            >
              ✓ Mark Resolved
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowUpdateModal(true)}
            className="cc-action-modal-trigger"
          >
            + Append Resolution Note
          </button>
        </div>
      )}

      {/* Append Note Modal */}
      {showUpdateModal && (
        <div className="cc-modal-backdrop" role="dialog" aria-modal="true">
          <div className="glass-popover cc-modal-dialog">
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: '#0f2850', fontWeight: 700 }}>
              Update Complaint Case #{complaint.reference}
            </h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Stage Progression
              </label>
              <select
                value={currentStage}
                onChange={(e) => setCurrentStage(e.target.value as ComplaintStage)}
                className="cc-gateway-search-input"
                style={{ width: '100%' }}
              >
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Assigned Staff Member
              </label>
              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="cc-gateway-search-input"
                style={{ width: '100%' }}
              >
                <option value="Prof. Rahul Mehta">Prof. Rahul Mehta (Exam Evaluator)</option>
                <option value="Er. Dilip Roy">Er. Dilip Roy (Estates & Maintenance)</option>
                <option value="Dr. Anita Bannerjee">Dr. Anita Bannerjee (Hostel Warden)</option>
                <option value="Dr. Suresh Kumar">Dr. Suresh Kumar (Registrar & Admin)</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Resolution / Investigation Note
              </label>
              <textarea
                rows={3}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Detail the steps taken, verification findings, or work order dispatched..."
                className="cc-gateway-search-input"
                style={{ width: '100%', minHeight: '80px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowUpdateModal(false)}
                className="cc-social-action-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyUpdate}
                className="cc-social-action-primary"
              >
                Save & Dispatch Update
              </button>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

export default ComplaintTracker;

