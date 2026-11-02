import { Badge } from './Badge.js';

export interface AiSuggestedBadgeProps {
  /** Localised text; defaults to the required English label. */
  readonly label?: string;
}

/** Marks every AI-generated category, band, route or summary (Requirement 5.15). */
export function AiSuggestedBadge({ label = 'AI-suggested' }: AiSuggestedBadgeProps) {
  return (
    <Badge tone="ai" icon="✨">
      {label}
    </Badge>
  );
}
