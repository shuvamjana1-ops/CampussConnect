import React, { memo, useContext, useMemo } from 'react';
import { SessionContext } from '../auth/session';

export type WallpaperRole = 'admin' | 'staff' | 'worker' | 'student' | 'default';

export interface LiquidGlassWallpaperProps {
  /** Explicit role override; if omitted, automatically deduced from SessionContext */
  readonly role?: WallpaperRole;
  /** Custom class name on the root fixed wallpaper container */
  readonly className?: string;
  /** Custom inline styles on the root wallpaper container */
  readonly style?: React.CSSProperties;
  /** Manually force dark or light theme variants; defaults to automatic theme detection */
  readonly theme?: 'light' | 'dark' | 'auto';
  /** Manually disable orb animations regardless of OS preference */
  readonly disableAnimation?: boolean;
}

interface OrbConfig {
  readonly id: string;
  readonly color: string;
  readonly size: number;
  readonly top?: string;
  readonly bottom?: string;
  readonly left?: string;
  readonly right?: string;
  readonly animationName: string;
  readonly duration: string;
  readonly delay: string;
  readonly opacityLight: number;
  readonly opacityDark: number;
}

interface RolePalette {
  readonly name: string;
  readonly accent: string;
  readonly accentGlow: string;
  readonly orbs: readonly OrbConfig[];
}

export const ROLE_ORB_PALETTES: Record<'admin' | 'staff' | 'student' | 'default', RolePalette> = {
  admin: {
    name: 'Admin Command',
    accent: '#6366f1',
    accentGlow: 'rgba(99, 102, 241, 0.4)',
    orbs: [
      {
        id: 'admin-orb-1',
        color: '#6366f1', // Indigo
        size: 640,
        top: '-10%',
        left: '-8%',
        animationName: 'orbFloat1',
        duration: '22s',
        delay: '0s',
        opacityLight: 0.32,
        opacityDark: 0.55,
      },
      {
        id: 'admin-orb-2',
        color: '#8b5cf6', // Purple / Violet
        size: 540,
        top: '-4%',
        right: '-6%',
        animationName: 'orbFloat2',
        duration: '26s',
        delay: '-4s',
        opacityLight: 0.28,
        opacityDark: 0.5,
      },
      {
        id: 'admin-orb-3',
        color: '#4338ca', // Deep Indigo
        size: 580,
        bottom: '-12%',
        left: '14%',
        animationName: 'orbFloat3',
        duration: '20s',
        delay: '-8s',
        opacityLight: 0.3,
        opacityDark: 0.52,
      },
      {
        id: 'admin-orb-4',
        color: '#312e81', // Midnight Indigo
        size: 680,
        bottom: '-15%',
        right: '4%',
        animationName: 'orbFloat4',
        duration: '30s',
        delay: '-12s',
        opacityLight: 0.24,
        opacityDark: 0.44,
      },
    ],
  },
  staff: {
    name: 'Staff Workspace',
    accent: '#0d9488',
    accentGlow: 'rgba(13, 148, 136, 0.4)',
    orbs: [
      {
        id: 'staff-orb-1',
        color: '#0d9488', // Teal 600
        size: 640,
        top: '-10%',
        left: '-8%',
        animationName: 'orbFloat1',
        duration: '22s',
        delay: '0s',
        opacityLight: 0.32,
        opacityDark: 0.55,
      },
      {
        id: 'staff-orb-2',
        color: '#10b981', // Emerald 500
        size: 540,
        top: '-4%',
        right: '-6%',
        animationName: 'orbFloat2',
        duration: '26s',
        delay: '-4s',
        opacityLight: 0.28,
        opacityDark: 0.5,
      },
      {
        id: 'staff-orb-3',
        color: '#059669', // Emerald 600
        size: 580,
        bottom: '-12%',
        left: '14%',
        animationName: 'orbFloat3',
        duration: '20s',
        delay: '-8s',
        opacityLight: 0.3,
        opacityDark: 0.52,
      },
      {
        id: 'staff-orb-4',
        color: '#047857', // Forest Emerald
        size: 680,
        bottom: '-15%',
        right: '4%',
        animationName: 'orbFloat4',
        duration: '30s',
        delay: '-12s',
        opacityLight: 0.24,
        opacityDark: 0.44,
      },
    ],
  },
  student: {
    name: 'Student Portal',
    accent: '#2563eb',
    accentGlow: 'rgba(37, 99, 235, 0.4)',
    orbs: [
      {
        id: 'student-orb-1',
        color: '#2563eb', // Sapphire Blue 600
        size: 640,
        top: '-10%',
        left: '-8%',
        animationName: 'orbFloat1',
        duration: '22s',
        delay: '0s',
        opacityLight: 0.32,
        opacityDark: 0.55,
      },
      {
        id: 'student-orb-2',
        color: '#f97316', // Sunset Orange 500
        size: 540,
        top: '-4%',
        right: '-6%',
        animationName: 'orbFloat2',
        duration: '26s',
        delay: '-4s',
        opacityLight: 0.26,
        opacityDark: 0.48,
      },
      {
        id: 'student-orb-3',
        color: '#ec4899', // Rose Pink 500
        size: 580,
        bottom: '-12%',
        left: '14%',
        animationName: 'orbFloat3',
        duration: '20s',
        delay: '-8s',
        opacityLight: 0.28,
        opacityDark: 0.5,
      },
      {
        id: 'student-orb-4',
        color: '#8b5cf6', // Electric Violet
        size: 680,
        bottom: '-15%',
        right: '4%',
        animationName: 'orbFloat4',
        duration: '30s',
        delay: '-12s',
        opacityLight: 0.24,
        opacityDark: 0.44,
      },
    ],
  },
  default: {
    name: 'CampusConnect Liquid Glass',
    accent: '#2563eb',
    accentGlow: 'rgba(37, 99, 235, 0.4)',
    orbs: [
      {
        id: 'default-orb-1',
        color: '#2563eb', // Sapphire Blue
        size: 640,
        top: '-10%',
        left: '-8%',
        animationName: 'orbFloat1',
        duration: '22s',
        delay: '0s',
        opacityLight: 0.32,
        opacityDark: 0.55,
      },
      {
        id: 'default-orb-2',
        color: '#8b5cf6', // Violet
        size: 540,
        top: '-4%',
        right: '-6%',
        animationName: 'orbFloat2',
        duration: '26s',
        delay: '-4s',
        opacityLight: 0.28,
        opacityDark: 0.5,
      },
      {
        id: 'default-orb-3',
        color: '#ec4899', // Rose Pink
        size: 580,
        bottom: '-12%',
        left: '14%',
        animationName: 'orbFloat3',
        duration: '20s',
        delay: '-8s',
        opacityLight: 0.28,
        opacityDark: 0.5,
      },
      {
        id: 'default-orb-4',
        color: '#0d9488', // Emerald Teal
        size: 680,
        bottom: '-15%',
        right: '4%',
        animationName: 'orbFloat4',
        duration: '30s',
        delay: '-12s',
        opacityLight: 0.24,
        opacityDark: 0.44,
      },
    ],
  },
};

export const LiquidGlassWallpaper = memo(function LiquidGlassWallpaper({
  role: propRole,
  className = '',
  style = {},
  theme = 'auto',
  disableAnimation = false,
}: LiquidGlassWallpaperProps) {
  // Safe context consumption: works seamlessly with or without SessionProvider
  const sessionCtx = useContext(SessionContext);
  const sessionRole = sessionCtx?.role ?? null;

  // Resolve normalized role (mapping 'worker' -> 'staff' and fallback to 'default')
  const resolvedRole = useMemo((): 'admin' | 'staff' | 'student' | 'default' => {
    const raw = propRole ?? sessionRole;
    if (!raw) return 'default';
    if (raw === 'admin') return 'admin';
    if (raw === 'staff' || raw === 'worker') return 'staff';
    if (raw === 'student') return 'student';
    return 'default';
  }, [propRole, sessionRole]);

  const palette = ROLE_ORB_PALETTES[resolvedRole];

  return (
    <div
      aria-hidden="true"
      data-testid="liquid-glass-wallpaper"
      data-role-palette={resolvedRole}
      data-theme-override={theme !== 'auto' ? theme : undefined}
      className={`liquid-glass-wallpaper ${className}`}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        pointerEvents: 'none',
        overflow: 'hidden',
        contain: 'strict',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Subtle Apple-style mesh grain/dither overlay to prevent gradient color banding */}
      <div className="liquid-glass-mesh-overlay" />

      {/* Floating Blurred Orbs */}
      {palette.orbs.map((orb) => (
        <div
          key={orb.id}
          className={`liquid-orb liquid-orb-${orb.id}`}
          style={{
            position: 'absolute',
            width: `${orb.size}px`,
            height: `${orb.size}px`,
            borderRadius: '50%',
            backgroundColor: orb.color,
            filter: 'blur(95px)',
            WebkitFilter: 'blur(95px)',
            willChange: 'transform',
            transform: 'translate3d(0, 0, 0)',
            top: orb.top,
            bottom: orb.bottom,
            left: orb.left,
            right: orb.right,
            animationName: disableAnimation ? 'none' : orb.animationName,
            animationDuration: orb.duration,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDirection: 'alternate',
            animationDelay: orb.delay,
            animationPlayState: disableAnimation ? 'paused' : 'running',
            opacity: 'var(--orb-opacity, var(--orb-opacity-light))',
            // Custom CSS properties for fine-tuning via themes
            ['--orb-color' as string]: orb.color,
            ['--orb-opacity-light' as string]: orb.opacityLight,
            ['--orb-opacity-dark' as string]: orb.opacityDark,
          }}
        />
      ))}
    </div>
  );
});

export default LiquidGlassWallpaper;
