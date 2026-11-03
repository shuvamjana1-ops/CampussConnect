export interface DelayTaskProps {
  readonly active: boolean;
  readonly message: string;
  readonly subtext?: string;
  readonly progressPercent?: number;
}

export function TaskDelayPreloader({
  active,
  message,
  subtext,
  progressPercent,
}: DelayTaskProps) {
  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        zIndex: 9998,
        maxWidth: '420px',
        background: '#ffffff',
        border: '2px solid #f59e0b',
        borderRadius: '12px',
        padding: '1rem 1.25rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        animation: 'cc-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* 3D Spinner */}
      <div style={{ position: 'relative', width: '36px', height: '36px', flexShrink: 0 }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            border: '3px solid #e2e8f0',
            borderTopColor: '#f59e0b',
            borderRadius: '50%',
            animation: 'cc-spin 0.75s linear infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
          }}
        >
          ⚡
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', fontSize: '0.925rem', color: '#0f172a', marginBottom: '0.15rem' }}>
          {message}
        </strong>
        {subtext && (
          <span style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.35 }}>
            {subtext}
          </span>
        )}
        {typeof progressPercent === 'number' && (
          <div
            style={{
              width: '100%',
              height: '4px',
              background: '#e2e8f0',
              borderRadius: '999px',
              marginTop: '0.45rem',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${String(progressPercent)}%`,
                height: '100%',
                background: '#f59e0b',
                transition: 'width 0.2s ease',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
