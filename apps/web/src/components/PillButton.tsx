import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'glass' | 'subtle' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  glow?: boolean;
  fullWidth?: boolean;
}

export function PillButton({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  glow = true,
  fullWidth = false,
  disabled,
  className = '',
  style,
  ...props
}: PillButtonProps) {
  const sizeStyles = {
    sm: { height: '32px', padding: '0 12px', fontSize: '0.785rem', radius: '9999px' },
    md: { height: '40px', padding: '0 18px', fontSize: '0.875rem', radius: '9999px' },
    lg: { height: '48px', padding: '0 24px', fontSize: '1rem', radius: '9999px' },
  }[size];

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          background: 'linear-gradient(135deg, var(--accent, #3b82f6), #1d4ed8)',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.35)',
          boxShadow: glow
            ? '0 4px 16px var(--accent-glow, rgba(59, 130, 246, 0.35)), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
            : '0 2px 6px rgba(0, 0, 0, 0.1)',
        };
      case 'secondary':
      case 'glass':
        return {
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          color: 'var(--text-main, #0f172a)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        };
      case 'subtle':
        return {
          background: 'rgba(255, 255, 255, 0.3)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: 'var(--text-main, #0f172a)',
          border: '1px solid rgba(255, 255, 255, 0.25)',
        };
      case 'danger':
        return {
          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        };
      case 'ghost':
        return {
          background: 'transparent',
          color: 'var(--text-main, #0f172a)',
          border: '1px solid transparent',
        };
      default:
        return {};
    }
  };

  return (
    <button
      disabled={disabled || loading}
      className={`campusconnect-pill-btn ${className}`}
      style={{
        width: fullWidth ? '100%' : 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        borderRadius: sizeStyles.radius,
        height: sizeStyles.height,
        padding: sizeStyles.padding,
        fontSize: sizeStyles.fontSize,
        outline: 'none',
        userSelect: 'none',
        transition:
          'transform 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 150ms ease, background-color 150ms ease',
        ...getVariantStyles(),
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <span
          style={{
            width: '16px',
            height: '16px',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderTopColor: '#ffffff',
            borderRadius: '50%',
            animation: 'cf-spin 600ms linear infinite',
          }}
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && <span style={{ display: 'inline-flex' }}>{icon}</span>}
          <span>{children}</span>
          {icon && iconPosition === 'right' && <span style={{ display: 'inline-flex' }}>{icon}</span>}
        </>
      )}
    </button>
  );
}

export default PillButton;
