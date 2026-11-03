import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export interface StatTileProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  subtitle?: string;
  className?: string;
  onClick?: () => void;
}

export function StatTile({
  label,
  value,
  icon,
  trend,
  subtitle,
  className = '',
  onClick,
}: StatTileProps) {
  return (
    <div
      onClick={onClick}
      className={`glass ${className}`}
      style={{
        borderRadius: '20px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top Lockup */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        {icon && (
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'var(--accent-glow, rgba(59, 130, 246, 0.15))',
              color: 'var(--accent, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.4)',
            }}
          >
            {icon}
          </div>
        )}

        {trend && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '9999px',
              background: trend.isPositive
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(239, 68, 68, 0.15)',
              color: trend.isPositive ? '#059669' : '#dc2626',
              border: `1px solid ${trend.isPositive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
            }}
          >
            {trend.isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            <span>{trend.value}</span>
          </span>
        )}
      </div>

      {/* Metric Counter & Label */}
      <div>
        <div
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--text-main, #0f172a)',
            lineHeight: 1.1,
            marginBottom: '4px',
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>
          {label}
        </div>
        {subtitle && (
          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)', marginTop: '4px', opacity: 0.8 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

export default StatTile;
