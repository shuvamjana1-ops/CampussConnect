import React, { useEffect, useRef, useState } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[] | SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth = false,
  className = '',
  ariaLabel = 'Segmented Options',
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number }>({
    left: 4,
    width: 0,
  });

  const activeIndex = options.findIndex((o) => o.value === value);

  useEffect(() => {
    const activeBtn = buttonRefs.current[activeIndex];
    const container = containerRef.current;
    if (activeBtn && container) {
      const containerRect = container.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      setIndicatorStyle({
        left: btnRect.left - containerRect.left,
        width: btnRect.width,
      });
    }
  }, [activeIndex, options]);

  const sizeStyles = {
    sm: { padding: '2px', btnPadding: '4px 10px', fontSize: '0.75rem', radius: '8px' },
    md: { padding: '4px', btnPadding: '6px 14px', fontSize: '0.85rem', radius: '10px' },
    lg: { padding: '5px', btnPadding: '8px 18px', fontSize: '0.95rem', radius: '12px' },
  }[size];

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`glass-subtle ${className}`}
      style={{
        position: 'relative',
        display: fullWidth ? 'flex' : 'inline-flex',
        alignItems: 'center',
        padding: sizeStyles.padding,
        borderRadius: '9999px',
        background: 'rgba(255, 255, 255, 0.5)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.06)',
        userSelect: 'none',
      }}
    >
      {/* Sliding Glass Indicator */}
      <div
        style={{
          position: 'absolute',
          top: sizeStyles.padding,
          bottom: sizeStyles.padding,
          left: `${indicatorStyle.left}px`,
          width: `${indicatorStyle.width}px`,
          borderRadius: '9999px',
          background: 'rgba(255, 255, 255, 0.9)',
          boxShadow:
            '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
          transition: 'all 280ms cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {options.map((opt, idx) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(opt.value)}
            style={{
              position: 'relative',
              zIndex: 2,
              flex: fullWidth ? 1 : 'initial',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: sizeStyles.btnPadding,
              border: 'none',
              background: 'transparent',
              color: isSelected ? 'var(--text-main, #0f172a)' : 'var(--text-muted, #64748b)',
              fontWeight: isSelected ? 700 : 500,
              fontSize: sizeStyles.fontSize,
              cursor: 'pointer',
              outline: 'none',
              borderRadius: '9999px',
              transition: 'color 200ms ease',
            }}
          >
            {opt.icon && <span style={{ display: 'inline-flex' }}>{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.badge !== undefined && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '9999px',
                  background: isSelected ? 'var(--accent, #3b82f6)' : 'rgba(0, 0, 0, 0.08)',
                  color: isSelected ? '#ffffff' : 'var(--text-muted, #64748b)',
                  marginLeft: '2px',
                }}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
