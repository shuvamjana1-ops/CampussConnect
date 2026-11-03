import React, {
  forwardRef,
  useCallback,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';

export type GlassMaterial = 'glass' | 'glass-strong' | 'glass-subtle';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly interactive?: boolean;
  readonly onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  readonly role?: string;
  readonly ariaLabel?: string;
  /**
   * Material tier from Apple Liquid Glass design language:
   * - 'glass' (default): Standard card elevation, blur 20-25px, saturate 180%
   * - 'glass-strong': Elevated modal/popover, blur 35-40px, saturate 180%
   * - 'glass-subtle': Subdued nested state or input track, blur 14-16px, saturate 150%
   */
  readonly material?: GlassMaterial;
  /**
   * Variant alias for material:
   * 'standard' -> 'glass', 'strong' -> 'glass-strong', 'subtle' -> 'glass-subtle'
   */
  readonly variant?: 'standard' | 'strong' | 'subtle';
  /**
   * Disables cursor specular highlight spotlight effect if false
   */
  readonly spotlight?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  {
    children,
    className = '',
    style = {},
    interactive = false,
    onClick,
    role,
    ariaLabel,
    material,
    variant,
    spotlight = true,
    onMouseMove,
    onMouseEnter,
    onMouseLeave,
    onKeyDown,
    tabIndex,
    ...restProps
  },
  forwardedRef,
) {
  const internalRef = useRef<HTMLDivElement | null>(null);

  // Synchronize internalRef with forwardedRef
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      internalRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef !== null && typeof forwardedRef === 'object') {
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [forwardedRef],
  );

  // Mouse Move: Track relative coordinates for cursor-following specular spotlight
  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (spotlight && internalRef.current) {
        const rect = internalRef.current.getBoundingClientRect();
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);

        internalRef.current.style.setProperty('--mouse-x', `${x}px`);
        internalRef.current.style.setProperty('--mouse-y', `${y}px`);
        internalRef.current.style.setProperty('--spotlight-opacity', '1');
      }
      onMouseMove?.(e);
    },
    [spotlight, onMouseMove],
  );

  // Mouse Enter: Activate specular highlight spotlight
  const handleMouseEnter = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (spotlight && internalRef.current) {
        const rect = internalRef.current.getBoundingClientRect();
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);

        internalRef.current.style.setProperty('--mouse-x', `${x}px`);
        internalRef.current.style.setProperty('--mouse-y', `${y}px`);
        internalRef.current.style.setProperty('--spotlight-opacity', '1');
      }
      onMouseEnter?.(e);
    },
    [spotlight, onMouseEnter],
  );

  // Mouse Leave: Smooth fade out of specular spotlight
  const handleMouseLeave = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (spotlight && internalRef.current) {
        internalRef.current.style.setProperty('--spotlight-opacity', '0');
      }
      onMouseLeave?.(e);
    },
    [spotlight, onMouseLeave],
  );

  // Keyboard accessibility for interactive cards
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (interactive && onClick && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onClick(e as unknown as MouseEvent<HTMLDivElement>);
      }
      onKeyDown?.(e);
    },
    [interactive, onClick, onKeyDown],
  );

  // Determine material class name
  const effectiveMaterial: GlassMaterial =
    material ?? (variant === 'strong' ? 'glass-strong' : variant === 'subtle' ? 'glass-subtle' : 'glass');

  // Compute composite class names ensuring 100% test & legacy compatibility:
  // - 'glass-panel': legacy surface marker
  // - 'cc-glass-card': required by test assertion expect(html).toContain('cc-glass-card')
  // - 'cc-glass-card-interactive': required by test assertion expect(html).toContain('cc-glass-card-interactive')
  // - effectiveMaterial: .glass, .glass-strong, or .glass-subtle
  const computedClassName = [
    'glass-panel',
    'cc-glass-card',
    effectiveMaterial,
    interactive ? 'cc-glass-card-interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const computedRole = role ?? (interactive ? 'button' : undefined);
  const computedTabIndex = tabIndex ?? (interactive ? 0 : undefined);

  return (
    <div
      ref={setRefs}
      role={computedRole}
      aria-label={ariaLabel}
      tabIndex={computedTabIndex}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      className={computedClassName}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      {...restProps}
    >
      {/* Specular Border Spotlight Overlay (Masked 1px edge ring) */}
      {spotlight && <div className="cc-glass-border-spotlight" aria-hidden="true" />}

      {/* Specular Surface Spotlight Radial Gradient */}
      {spotlight && <div className="cc-glass-spotlight" aria-hidden="true" />}

      {/* Card Content Layer */}
      <div className="cc-glass-content" style={{ position: 'relative', zIndex: 3 }}>
        {children}
      </div>
    </div>
  );
});

export default GlassCard;
