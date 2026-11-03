import { useEffect, useMemo, useState } from 'react';
import { ComplaintTracker, type ComplaintData, type ComplaintStage } from '../../components/ComplaintTracker';
import { GlassCard } from '../../components/GlassCard';
import { UserProfileSection } from '../../components/UserProfileSection';
import { complaintStore } from '../../services/complaintStore';

type StaffRoleFilter = 'all' | 'warden' | 'maintenance' | 'faculty' | 'profile';

export default function StaffPortal() {
  const [complaints, setComplaints] = useState<readonly ComplaintData[]>(() => complaintStore.getComplaints());
  const [roleFilter, setRoleFilter] = useState<StaffRoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = complaintStore.subscribe(() => {
      setComplaints(complaintStore.getComplaints());
    });
    return unsubscribe;
  }, []);

  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (roleFilter === 'warden' && c.type !== 'Hostel') return false;
      if (roleFilter === 'maintenance' && c.type !== 'Infrastructure') return false;
      if (roleFilter === 'faculty' && c.type !== 'Academic') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchRef = c.reference.toLowerCase().includes(q);
        const matchTitle = c.title.toLowerCase().includes(q);
        const matchStudent = c.student.name.toLowerCase().includes(q);
        return matchRef || matchTitle || matchStudent;
      }
      return true;
    });
  }, [complaints, roleFilter, searchQuery]);

  const handleStatusChange = (complaintId: string, newStage: ComplaintStage, note: string) => {
    complaintStore.updateStatus(complaintId, newStage, note, 'Prof. Rahul Mehta');
    setActionSuccess(`Status updated for complaint. Resolution audit trail appended.`);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleAssignStaff = (complaintId: string, staffName: string) => {
    complaintStore.reassignStaff(complaintId, staffName);
    setActionSuccess(`Assigned to ${staffName}. Dispatch notification emitted.`);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const urgentCount = complaints.filter((c) => c.priority.includes('P0') && c.currentStage !== 'resolved').length;
  const resolvedCount = complaints.filter((c) => c.currentStage === 'resolved').length;

  return (
    <div className="cc-staff-portal" style={{ maxWidth: '1100px', margin: '0 auto', padding: '1rem 0 3rem' }}>
      {/* Top Banner */}
      <GlassCard style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#0f2850', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
              JIS UNIVERSITY · STAFF & FACULTY RESOLUTION INBOX
            </div>
            <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.75rem', fontWeight: 800, color: '#0f2850', letterSpacing: '-0.02em' }}>
              Staff Action Desk: Prof. Rahul Mehta
            </h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
              Assistant Professor & Examination Superintendent · Staff ID: JISU-STAFF-104
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ textAlign: 'center', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.5rem 1rem', borderRadius: '12px' }}>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>Urgent P0 SLA</span>
              <strong style={{ fontSize: '1.25rem', color: '#b91c1c', fontWeight: 800 }}>{urgentCount} Cases</strong>
            </div>
            <div style={{ textAlign: 'center', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.5rem 1rem', borderRadius: '12px' }}>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#065f46', fontWeight: 700, textTransform: 'uppercase' }}>Resolved</span>
              <strong style={{ fontSize: '1.25rem', color: '#059669', fontWeight: 800 }}>{resolvedCount}</strong>
            </div>
          </div>
        </div>

        {/* Role-Filtered Ticket Inbox Navigation */}
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderTop: '1px solid rgba(15, 40, 80, 0.08)', paddingTop: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(
              [
                { id: 'all', label: 'All Role Inboxes', count: complaints.length },
                { id: 'faculty', label: '🎓 Academic & Evaluator', count: complaints.filter((c) => c.type === 'Academic').length },
                { id: 'warden', label: '🏠 Hostel Warden', count: complaints.filter((c) => c.type === 'Hostel').length },
                { id: 'maintenance', label: '🛠️ Estates & Maintenance', count: complaints.filter((c) => c.type === 'Infrastructure').length },
                { id: 'profile', label: '👤 Staff Profile & Details', count: 1 },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRoleFilter(tab.id)}
                className={`cc-gateway-tab ${roleFilter === tab.id ? 'active' : ''}`}
              >
                {tab.label} <span className="cc-gateway-tab-count">({tab.count})</span>
              </button>
            ))}
          </div>

          <div style={{ minWidth: '240px' }}>
            <input
              type="search"
              placeholder="Filter by ref, student, or subject…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="cc-gateway-search-input"
            />
          </div>
        </div>

        {actionSuccess && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700 }}>
            ✓ {actionSuccess}
          </div>
        )}
      </GlassCard>

      {/* Role-Filtered Ticket List / Profile */}
      {roleFilter === 'profile' ? (
        <UserProfileSection />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {filteredComplaints.length === 0 ? (
            <GlassCard style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
              <p style={{ color: '#64748b', fontSize: '1rem', margin: 0 }}>
                No complaints in this role-filtered inbox matching your criteria.
              </p>
            </GlassCard>
          ) : (
            filteredComplaints.map((comp) => (
              <ComplaintTracker
                key={comp.id}
                complaint={comp}
                allowStatusUpdate={true}
                onStatusChange={(newStage, note) => handleStatusChange(comp.id, newStage, note)}
                onAssignStaff={(staffName) => handleAssignStaff(comp.id, staffName)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

