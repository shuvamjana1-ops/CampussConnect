import { Button, TextField } from '@campusconnect/ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { useStudentProfile, useUpdateStudentProfile } from './profile-data';

export default function Profile() {
  const profileQuery = useStudentProfile();
  const updateProfile = useUpdateStudentProfile();

  const profile = profileQuery.data;

  const [careerGoal, setCareerGoal] = useState(profile?.careerGoal ?? 'Higher Studies & Research');
  const [newSkill, setNewSkill] = useState('');
  const [skills, setSkills] = useState<string[]>(profile?.skills ? [...profile.skills] : []);
  const [incomeBracket, setIncomeBracket] = useState(profile?.incomeBracket ?? 'bracket_2_5_to_6');
  const [dpdpConsent, setDpdpConsent] = useState(profile?.dpdpConsentGranted ?? true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!profile) return <p role="status">Loading profile…</p>;

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()]);
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setSkills(skills.filter((s) => s !== skill));
  };

  const handleSave = () => {
    updateProfile.mutate(
      {
        careerGoal,
        skills,
        incomeBracket,
        dpdpConsentGranted: dpdpConsent,
      },
      {
        onSuccess: () => {
          setSavedSuccess(true);
          setTimeout(() => setSavedSuccess(false), 3000);
        },
      },
    );
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <div className="cc-page-header">
        <div>
          <h2 className="cc-page-title">Student Profile & Preferences</h2>
          <p className="cc-page-desc">
            Verified academic data prefilled via University ERP, plus preferences powering your opportunity match engine.
          </p>
        </div>
        <div>
          <Link to="/student/privacy" className="cc-button cc-button-secondary">
            <span>🛡️</span> Data Privacy & DPDP Rights
          </Link>
        </div>
      </div>

      {savedSuccess && (
        <div className="cc-alert cc-alert-success" role="status">
          <span>✓</span>
          <span>Your profile preferences and consent settings were saved successfully.</span>
        </div>
      )}

      {/* Completeness Banner */}
      <div
        className="cc-card"
        style={{
          background: 'linear-gradient(135deg, #1e3a8a, #0d9488)',
          color: '#ffffff',
          marginBottom: '1.5rem',
          padding: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.825rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#93c5fd', fontWeight: 600 }}>
              Profile Health Score
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, margin: '0.2rem 0' }}>
              {profile.completenessPercent}% Complete
            </div>
            <div style={{ fontSize: '0.9rem', color: '#e0f2fe' }}>
              High completeness improves AI scholarship and research fellowship match accuracy.
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '0.75rem 1.25rem', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Next recommended step:</div>
            <strong style={{ fontSize: '0.9rem' }}>Upload Faculty Recommendation to Locker</strong>
          </div>
        </div>
      </div>

      {/* 2-Column Layout */}
      <div className="cc-grid-2">
        {/* Academic Records (Read-Only ERP) */}
        <div className="cc-card">
          <div className="cc-card-header">
            <h3 className="cc-card-title">
              <span>🏛️</span> Academic Record (ERP Synchronized)
            </h3>
            <span className="cc-badge" data-tone="success">
              ✓ Verified
            </span>
          </div>

          <p style={{ fontSize: '0.825rem', color: '#64748b', marginTop: 0 }}>
            Official registrar records synchronized daily. To request a correction, submit an Examination Cell request.
          </p>

          <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', margin: 0 }}>
            <div>
              <dt style={{ fontSize: '0.775rem', color: '#64748b', textTransform: 'uppercase' }}>Roll Number</dt>
              <dd style={{ margin: '0.2rem 0 0', fontWeight: 600, color: '#0f172a' }}>{profile.academic.rollNumber}</dd>
            </div>
            <div>
              <dt style={{ fontSize: '0.775rem', color: '#64748b', textTransform: 'uppercase' }}>Department</dt>
              <dd style={{ margin: '0.2rem 0 0', fontWeight: 600, color: '#0f172a' }}>{profile.academic.department}</dd>
            </div>
            <div>
              <dt style={{ fontSize: '0.775rem', color: '#64748b', textTransform: 'uppercase' }}>Degree Programme</dt>
              <dd style={{ margin: '0.2rem 0 0', fontWeight: 600, color: '#0f172a' }}>{profile.academic.degree}</dd>
            </div>
            <div>
              <dt style={{ fontSize: '0.775rem', color: '#64748b', textTransform: 'uppercase' }}>Current Semester</dt>
              <dd style={{ margin: '0.2rem 0 0', fontWeight: 600, color: '#0f172a' }}>Semester {profile.academic.currentSemester} (Batch {profile.academic.batch})</dd>
            </div>
            <div>
              <dt style={{ fontSize: '0.775rem', color: '#64748b', textTransform: 'uppercase' }}>Cumulative GPA (CGPA)</dt>
              <dd style={{ margin: '0.2rem 0 0', fontWeight: 700, color: '#0f766e', fontSize: '1.1rem' }}>
                {profile.academic.cgpa} / 10.0
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: '0.775rem', color: '#64748b', textTransform: 'uppercase' }}>Credits Completed</dt>
              <dd style={{ margin: '0.2rem 0 0', fontWeight: 600, color: '#0f172a' }}>{profile.academic.creditsCompleted} Credits</dd>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <dt style={{ fontSize: '0.775rem', color: '#64748b', textTransform: 'uppercase' }}>Campus Residence</dt>
              <dd style={{ margin: '0.2rem 0 0', fontWeight: 600, color: '#0f172a' }}>
                {profile.academic.hostelBlock}, Room {profile.academic.roomNumber}
              </dd>
            </div>
          </dl>
        </div>

        {/* Opportunity Match Preferences */}
        <div className="cc-card">
          <div className="cc-card-header">
            <h3 className="cc-card-title">
              <span>🎯</span> Match Preferences & Skills
            </h3>
          </div>

          <div className="cc-field-group">
            <TextField
              label="Primary Career Objective"
              value={careerGoal}
              onChange={setCareerGoal}
            />
          </div>

          <div className="cc-field-group">
            <label className="cc-label">Technical Skills & Areas of Interest</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
              {skills.map((skill) => (
                <span key={skill} className="cc-badge" data-tone="neutral" style={{ padding: '0.25rem 0.5rem' }}>
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '4px', color: '#64748b' }}
                    aria-label={`Remove ${skill}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <form onSubmit={handleAddSkill} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="cc-input"
                placeholder="Add skill (e.g. Kotlin, Machine Learning)..."
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
              />
              <Button type="submit" variant="secondary">
                Add
              </Button>
            </form>
          </div>

          {/* Income Tier Declaration */}
          <div className="cc-field-group">
            <label htmlFor="income-select" className="cc-label">Family Annual Income Bracket (For Aid Matching)</label>
            <select
              id="income-select"
              value={incomeBracket}
              onChange={(e) => setIncomeBracket(e.target.value)}
              className="cc-input"
            >
              <option value="bracket_below_2_5">Below ₹2.5 Lakhs / annum (EWS / BPL Eligible)</option>
              <option value="bracket_2_5_to_6">₹2.5 Lakhs - ₹6.0 Lakhs / annum</option>
              <option value="bracket_6_to_8">₹6.0 Lakhs - ₹8.0 Lakhs / annum (Creamy Layer Limit)</option>
              <option value="bracket_above_8">Above ₹8.0 Lakhs / annum</option>
            </select>
            <div className="cc-field-description">
              Used strictly for matching income-based scholarships. Your income tier is kept confidential under DPDP regulations.
            </div>
          </div>

          {/* DPDP Consent Checkbox */}
          <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={dpdpConsent}
                onChange={(e) => setDpdpConsent(e.target.checked)}
                style={{ marginTop: '0.2rem', minWidth: '18px', minHeight: '18px' }}
              />
              <span>
                I consent to CampusConnect matching my verified student profile and income tier against institutional and government scholarship guidelines.
              </span>
            </label>
          </div>

          <Button
            onPress={handleSave}
            isDisabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? 'Saving Preferences…' : 'Save Profile Preferences'}
          </Button>
        </div>
      </div>
    </div>
  );
}

