import React from 'react';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  className = '',
  size = 'md',
}: ToggleSwitchProps) {
  const switchId = id || (label ? `switch-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  const dimensions = {
    sm: { trackW: 38, trackH: 22, thumbSize: 18, travel: 16 },
    md: { trackW: 48, trackH: 28, thumbSize: 22, travel: 20 },
    lg: { trackW: 56, trackH: 32, thumbSize: 26, travel: 24 },
  }[size];

  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <label
      htmlFor={switchId}
      className={`campusconnect-toggle-wrapper ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        userSelect: 'none',
      }}
    >
      <div
        id={switchId}
        role="switch"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        style={{
          position: 'relative',
          width: `${dimensions.trackW}px`,
          height: `${dimensions.trackH}px`,
          borderRadius: '9999px',
          background: checked
            ? 'linear-gradient(135deg, var(--accent, #3b82f6), #1d4ed8)'
            : 'rgba(148, 163, 184, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: checked
            ? '0 0 14px var(--accent-glow, rgba(59, 130, 246, 0.4)), inset 0 1px 2px rgba(0, 0, 0, 0.1)'
            : 'inset 0 1px 3px rgba(0, 0, 0, 0.12)',
          transition: 'background-color 250ms ease, box-shadow 250ms ease',
          outline: 'none',
          flexShrink: 0,
        }}
      >
        {/* Sliding Thumb */}
        <div
          style={{
            position: 'absolute',
            top: `${(dimensions.trackH - dimensions.thumbSize) / 2}px`,
            left: `${(dimensions.trackH - dimensions.thumbSize) / 2}px`,
            width: `${dimensions.thumbSize}px`,
            height: `${dimensions.thumbSize}px`,
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
            transform: checked ? `translateX(${dimensions.travel}px)` : 'translateX(0)',
            transition: 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        />
      </div>

      {(label || description) && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {label && (
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
              {label}
            </span>
          )}
          {description && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
              {description}
            </span>
          )}
        </div>
      )}
    </label>
  );
}

export default ToggleSwitch;
