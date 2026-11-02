import type { ReactNode } from 'react';

export type BadgeTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'ai';

export interface BadgeProps {
  readonly tone: BadgeTone;
  readonly icon?: string;
  readonly children: ReactNode;
}

/** Pill with an optional decorative icon and a text label, so meaning never relies on colour alone. */
export function Badge({ tone, icon, children }: BadgeProps) {
  return (
    <span className="cc-badge" data-tone={tone}>
      {icon ? <span aria-hidden="true">{icon} </span> : null}
      <span>{children}</span>
    </span>
  );
}
