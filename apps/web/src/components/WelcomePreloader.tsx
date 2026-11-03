import { useEffect, useState } from 'react';
import { BrandLogo } from '../branding/BrandLogo';

interface Props {
  readonly onFinish?: () => void;
  readonly message?: string;
  readonly autoDismissMs?: number;
  readonly force?: boolean;
}

export function WelcomePreloader({
  onFinish,
  message = 'Initializing CampusConnect Higher Education Portal…',
  autoDismissMs = 1100,
  force = false,
}: Props) {
  const [progress, setProgress] = useState(20);
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Don't display in automated unit tests
    if ((window as unknown as { __VITEST__?: boolean }).__VITEST__) return false;
    if (force) return true;
    return sessionStorage.getItem('cc_welcomed') !== 'true';
  });

  useEffect(() => {
    if (!visible) return;

    sessionStorage.setItem('cc_welcomed', 'true');

    const timer1 = setTimeout(() => {
      setProgress(68);
    }, 320);

    const timer2 = setTimeout(() => {
      setProgress(100);
    }, 750);

    const timer3 = setTimeout(() => {
      setVisible(false);
      onFinish?.();
    }, autoDismissMs);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [visible, autoDismissMs, onFinish]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'linear-gradient(135deg, #0a192f 0%, #1e40af 50%, #0f172a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        transition: 'opacity 0.4s ease-out',
        padding: '1.5rem',
      }}
    >
      {/* 3D Spinning Emblem */}
      <div
        style={{
          position: 'relative',
          width: '90px',
          height: '90px',
          marginBottom: '1.75rem',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '3px dashed #f59e0b',
            animation: 'cc-spin 8s linear infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '6px',
            borderRadius: '50%',
            background: 'linear-gradient(145deg, #1e40af, #0a192f)',
            border: '2px solid #facc15',
            boxShadow: '0 0 25px rgba(245, 158, 11, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            padding: '12px',
          }}
        >
          <BrandLogo size={48} />
        </div>
      </div>

      <h1
        style={{
          margin: '0 0 0.5rem',
          fontSize: '2.2rem',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          background: 'linear-gradient(to right, #ffffff, #fef08a, #ffffff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textAlign: 'center',
        }}
      >
        CampusConnect
      </h1>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: '#cbd5e1',
          fontSize: '0.95rem',
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}
      >
        <span style={{ color: '#f59e0b' }}>★</span>
        <span style={{ color: '#f8fafc', fontWeight: 600 }}>JIS UNIVERSITY CAMPUS REDRESSAL & SERVICES</span>
        <span style={{ color: '#f59e0b' }}>★</span>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          maxWidth: '320px',
          height: '7px',
          background: 'rgba(255, 255, 255, 0.15)',
          borderRadius: '999px',
          overflow: 'hidden',
          marginBottom: '1rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div
          style={{
            width: `${String(progress)}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #3b82f6, #f59e0b, #facc15)',
            borderRadius: '999px',
            transition: 'width 0.35s ease',
          }}
        />
      </div>

      <p
        style={{
          margin: '0 0 1.25rem',
          fontSize: '0.85rem',
          color: '#94a3b8',
          letterSpacing: '0.02em',
        }}
      >
        {message}
      </p>

      <button
        type="button"
        onClick={() => {
          setVisible(false);
          onFinish?.();
        }}
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: '#cbd5e1',
          padding: '0.35rem 0.85rem',
          borderRadius: '6px',
          fontSize: '0.75rem',
          cursor: 'pointer',
        }}
      >
        Enter Directly →
      </button>
    </div>
  );
}
