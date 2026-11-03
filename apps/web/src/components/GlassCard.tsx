import { type CSSProperties, type ReactNode } from 'react';

export interface GlassCardProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly interactive?: boolean;
  readonly onClick?: () => void;
  readonly role?: string;
  readonly ariaLabel?: string;
}

export function GlassCard({
  children,
  className = '',
  style = {},
  interactive = false,
  onClick,
  role,
  ariaLabel,
}: GlassCardProps) {
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`glass-panel cc-glass-card ${interactive ? 'cc-glass-card-interactive' : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export default GlassCard;
