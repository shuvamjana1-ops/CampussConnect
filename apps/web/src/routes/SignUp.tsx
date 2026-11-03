import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSession, DEMO_USERS_MAP } from '../auth/session';
import { isSupabaseConfigured, supabase, type Profile } from '../lib/supabase';
import { useToast } from '../components/Toast';
import { GlassCard } from '../components/GlassCard';
import { LiquidGlassWallpaper } from '../components/LiquidGlassWallpaper';
import { PillButton } from '../components/PillButton';
import { SegmentedControl } from '../components/SegmentedControl';
import { BrandLogo } from '../branding/BrandLogo';

export default function SignUp() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [roleSelection, setRoleSelection] = useState<'student' | 'staff'>('student');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Form Validations
    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid institutional email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters in length.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify both fields.');
      return;
    }
    if (!agreedToTerms) {
      setErrorMessage('Please accept the institutional zero-trust security and ethics policy.');
      return;
    }

    setSubmitting(true);
    const cleanEmail = email.trim().toLowerCase();
    const effectiveRole = roleSelection === 'staff' ? 'worker' : 'student';

    try {
      if (isSupabaseConfigured) {
        // Live Supabase Authentication
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              role: effectiveRole,
              department: department.trim(),
              roll_number: rollNumber.trim() || undefined,
            },
          },
        });

        if (error) {
          setSubmitting(false);
          setErrorMessage(error.message);
          toast(error.message, 'error');
          return;
        }

        if (data?.user) {
          try {
            await supabase.from('profiles').upsert({
              id: data.user.id,
              email: cleanEmail,
              full_name: fullName.trim(),
              role: effectiveRole,
              department: department.trim(),
              roll_number: rollNumber.trim() || null,
              avatar_url: '/assets/profiles/default-avatar.svg',
            });
          } catch (profileErr) {
            console.warn('Profile sync note:', profileErr);
          }
        }

        toast('Account registered! Verifying session...', 'success');
        const loginRes = await signIn(cleanEmail, password);
        setSubmitting(false);

        if (loginRes.success) {
          navigate(effectiveRole === 'worker' ? '/worker' : '/student');
        } else {
          toast('Account created. Please sign in.', 'info');
          navigate('/login');
        }
      } else {
        // Fallback Demo Sandbox Registration
        const newMockId = `usr-mock-${Date.now()}`;
        const newMockProfile: Profile = {
          id: newMockId,
          email: cleanEmail,
          full_name: fullName.trim(),
          role: effectiveRole,
          department: department.trim(),
          roll_number:
            rollNumber.trim() ||
            (roleSelection === 'staff'
              ? `JISU-STAFF-${Math.floor(100 + Math.random() * 900)}`
              : `JISU/2026/${department.slice(0, 3).toUpperCase()}/${Math.floor(1000 + Math.random() * 9000)}`),
          avatar_url: '/assets/profiles/default-avatar.svg',
          bio: `${roleSelection === 'staff' ? 'Faculty / Staff Member' : 'Student'} registered via CampusConnect Portal.`,
        };

        DEMO_USERS_MAP[cleanEmail] = {
          profile: newMockProfile,
          pass: password,
        };

        localStorage.setItem('campusconnect:mock_session', JSON.stringify(newMockProfile));

        const loginRes = await signIn(cleanEmail, password);
        setSubmitting(false);

        if (loginRes.success) {
          toast('Welcome to CampusConnect! Account created successfully.', 'success');
          navigate(effectiveRole === 'worker' ? '/worker' : '/student');
        } else {
          toast('Account created. Please sign in.', 'info');
          navigate('/login');
        }
      }
    } catch (err: any) {
      setSubmitting(false);
      setErrorMessage(err?.message || 'An unexpected error occurred during registration.');
      toast('Registration error', 'error');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1.25rem',
        boxSizing: 'border-box',
        fontFamily: 'var(--font-system, -apple-system, "SF Pro Display", Inter, system-ui, sans-serif)',
        color: 'var(--text-main, #0f172a)',
      }}
    >
      {/* Background Animated Wallpaper */}
      <LiquidGlassWallpaper role={roleSelection} />

      {/* Centered macOS Window Card */}
      <GlassCard
        material="glass-strong"
        spotlight
        style={{
          width: '100%',
          maxWidth: '620px',
          padding: '2.5rem',
          borderRadius: '28px',
          boxShadow: 'var(--glass-strong-shadow)',
          boxSizing: 'border-box',
        }}
      >
        {/* macOS Window Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f56' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#27c93f' }} />
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', letterSpacing: '0.04em' }}>
            SECURE ENCLAVE REGISTRATION
          </span>
        </div>

        {/* Institution Brand Lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '1.5rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#0f2850',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(15, 40, 80, 0.25)',
              overflow: 'hidden',
            }}
          >
            <BrandLogo size={28} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text-main, #0f172a)' }}>
              CampusConnect
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f59e0b', letterSpacing: '0.04em' }}>
              JIS UNIVERSITY
            </div>
          </div>
        </div>

        <h1
          style={{
            fontSize: '1.85rem',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            margin: '0 0 0.5rem',
            color: 'var(--text-main, #0f172a)',
          }}
        >
          Create Institutional Account
        </h1>

        <p style={{ margin: '0 0 1.75rem', color: 'var(--text-muted, #64748b)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Join the zero-trust campus operating system. Choose your verified institutional role to begin.
        </p>

        {/* Role Segmented Selector */}
        <div style={{ marginBottom: '1.75rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Select Institutional Role
          </label>
          <SegmentedControl
            options={[
              { value: 'student', label: 'Student Scholar', icon: '🎓' },
              { value: 'staff', label: 'Staff / Faculty', icon: '👨‍🏫' },
            ]}
            value={roleSelection}
            onChange={(val) => setRoleSelection(val as 'student' | 'staff')}
            fullWidth
            size="md"
          />
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#dc2626',
              borderRadius: '12px',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
              Full Name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={roleSelection === 'staff' ? 'Prof. Anirban Roy' : 'Priya Mukherjee'}
              className="glass-input"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
              Institutional Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={roleSelection === 'staff' ? 'faculty.name@jisuniversity.ac.in' : 'student.name@jisuniversity.ac.in'}
              className="glass-input"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Department
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="glass-input"
                style={{ cursor: 'pointer' }}
              >
                <option value="Computer Science & Engineering">Computer Science &amp; Eng.</option>
                <option value="Electronics & Communication">Electronics &amp; Comm.</option>
                <option value="Information Technology">Information Technology</option>
                <option value="Mechanical Engineering">Mechanical Engineering</option>
                <option value="Examination & Records Cell">Examination Cell</option>
                <option value="Estates & Facilities">Estates &amp; Facilities</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                {roleSelection === 'staff' ? 'Employee Code' : 'Roll Number'}
              </label>
              <input
                type="text"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder={roleSelection === 'staff' ? 'JISU-STAFF-902' : 'JISU/2026/CSE/1024'}
                className="glass-input"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="glass-input"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Confirm Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="glass-input"
              />
            </div>
          </div>

          {/* Ethics / RLS Policy Agreement */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '0.25rem' }}>
            <input
              type="checkbox"
              id="terms"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              style={{ marginTop: '3px', cursor: 'pointer', accentColor: 'var(--accent, #2563eb)' }}
            />
            <label htmlFor="terms" style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #475569)', cursor: 'pointer', lineHeight: 1.4 }}>
              I agree to institutional zero-trust security policies, PostgreSQL Row-Level Security data governance, and JIS University campus conduct standards.
            </label>
          </div>

          <PillButton
            type="submit"
            disabled={submitting}
            loading={submitting}
            variant="primary"
            size="lg"
            fullWidth
            glow
            style={{ marginTop: '0.75rem' }}
          >
            {submitting ? 'Registering Account...' : 'Complete Registration & Enter →'}
          </PillButton>
        </form>

        {/* Existing Account Footer Link */}
        <div
          style={{
            marginTop: '1.75rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.85rem',
            color: 'var(--text-muted, #64748b)',
          }}
        >
          <span>
            Already have an account?{' '}
            <Link
              to="/login"
              style={{
                color: 'var(--accent, #2563eb)',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Sign In
            </Link>
          </span>
          <Link
            to="/"
            style={{
              color: 'var(--text-muted, #64748b)',
              textDecoration: 'none',
            }}
          >
            Return Home
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
