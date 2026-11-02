import { Badge, TextField, type TextFieldProps } from '@campusconnect/ui';
import { useId, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';

/** Shared building blocks for the administration, executive and operator route groups. */

export type FieldErrors = Readonly<Record<string, string>>;

/** Reads `errors: [{ path, message?, rule? }]` from a problem document into a map keyed by field path. */
export function problemFieldErrors(error: unknown, fallback: string): FieldErrors {
  if (!(error instanceof ApiError)) return {};
  const raw = error.problem?.['errors'];
  if (!Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { path, message } = item as { path?: unknown; message?: unknown };
    if (typeof path === 'string' && out[path] === undefined) {
      out[path] = typeof message === 'string' && message.length > 0 ? message : fallback;
    }
  }
  return out;
}

export function errorProps(errors: FieldErrors, key: string): { errorMessage?: string } {
  const message = errors[key];
  return message === undefined ? {} : { errorMessage: message };
}

export function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.problem?.detail ?? error.problem?.title ?? fallback;
  return fallback;
}

export function useFormatInstant(): (ms: number) => string {
  const { locale } = useI18n();
  return (ms) => new Date(ms).toLocaleString(locale, { timeZoneName: 'short' });
}

export function Field(props: TextFieldProps) {
  return <TextField {...props} />;
}

interface ControlProps {
  readonly label: string;
  readonly error?: string | undefined;
  readonly description?: string | undefined;
}

export function TextArea({
  label,
  error,
  description,
  value,
  onChange,
}: ControlProps & { readonly value: string; readonly onChange: (v: string) => void }) {
  const id = useId();
  const describedBy = [description ? `${id}-d` : '', error ? `${id}-e` : ''].join(' ').trim();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="cc-input"
        rows={4}
        value={value}
        aria-invalid={error !== undefined}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        onChange={(e) => onChange(e.target.value)}
      />
      {description !== undefined && (
        <p id={`${id}-d`} className="cc-field-description">
          {description}
        </p>
      )}
      {error !== undefined && (
        <p id={`${id}-e`} className="cc-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  error,
  value,
  onChange,
  options,
}: ControlProps & {
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="cc-input"
        value={value}
        aria-invalid={error !== undefined}
        {...(error ? { 'aria-describedby': `${id}-e` } : {})}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error !== undefined && (
        <p id={`${id}-e`} className="cc-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ErrorAlert({ children }: { readonly children: ReactNode }) {
  return (
    <p role="alert">
      <Badge tone="danger" icon="✕">
        {children}
      </Badge>
    </p>
  );
}

export function StatusNote({ children }: { readonly children: ReactNode }) {
  return (
    <p role="status">
      <Badge tone="success" icon="✓">
        {children}
      </Badge>
    </p>
  );
}

export function SectionNav({
  label,
  items,
}: {
  readonly label: string;
  readonly items: readonly { readonly to: string; readonly label: string }[];
}) {
  return (
    <nav aria-label={label}>
      <ul style={{ display: 'flex', gap: '1rem', listStyle: 'none', padding: 0, flexWrap: 'wrap' }}>
        {items.map((i) => (
          <li key={i.to}>
            <NavLink to={i.to}>{i.label}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Parses a whole-number string; returns undefined when it is not a base-10 integer. */
export function parseInteger(value: string): number | undefined {
  return /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : undefined;
}

export function splitList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
