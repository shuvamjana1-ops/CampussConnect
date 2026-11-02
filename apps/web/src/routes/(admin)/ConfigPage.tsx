import { Button } from '@campusconnect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import {
  ErrorAlert,
  Field,
  SelectField,
  StatusNote,
  TextArea,
  describeError,
  errorProps,
  parseInteger,
  problemFieldErrors,
  splitList,
  type FieldErrors,
} from './kit';

const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
type Priority = (typeof PRIORITIES)[number];

interface RoutingRule {
  readonly category: string;
  readonly department: string;
}

export interface TenantConfig {
  readonly slaMinutes: Readonly<Record<Priority, number>>;
  readonly confidenceThreshold: number;
  readonly copilotConfidenceThreshold: number;
  readonly kAnonymity: number;
  readonly calendar: {
    readonly timezone: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly workDays: readonly number[];
  };
  readonly categories: readonly string[];
  readonly departments: readonly string[];
  readonly routingRules: readonly RoutingRule[];
}

interface FormState {
  sla: Record<Priority, string>;
  confidence: string;
  copilotConfidence: string;
  k: string;
  timezone: string;
  startTime: string;
  endTime: string;
  workDays: string;
  categories: string;
  departments: string;
  rules: RoutingRule[];
}

function toForm(c: TenantConfig): FormState {
  return {
    sla: Object.fromEntries(PRIORITIES.map((p) => [p, String(c.slaMinutes[p])])) as Record<
      Priority,
      string
    >,
    confidence: c.confidenceThreshold.toFixed(2),
    copilotConfidence: c.copilotConfidenceThreshold.toFixed(2),
    k: String(c.kAnonymity),
    timezone: c.calendar.timezone,
    startTime: c.calendar.startTime,
    endTime: c.calendar.endTime,
    workDays: c.calendar.workDays.join(', '),
    categories: c.categories.join('\n'),
    departments: c.departments.join('\n'),
    rules: c.routingRules.map((r) => ({ ...r })),
  };
}

function validThreshold(v: string): number | undefined {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
}

/** Client-side checks mirror Requirement 1.6; the server stays authoritative. */
function validate(f: FormState, t: (k: string) => string): FieldErrors {
  const errors: Record<string, string> = {};
  for (const p of PRIORITIES) {
    const n = parseInteger(f.sla[p]);
    if (n === undefined || n < 1) errors[`slaMinutes.${p}`] = t('admin:config.err.sla');
  }
  if (validThreshold(f.confidence) === undefined) {
    errors['confidenceThreshold'] = t('admin:config.err.threshold');
  }
  if (validThreshold(f.copilotConfidence) === undefined) {
    errors['copilotConfidenceThreshold'] = t('admin:config.err.threshold');
  }
  const k = parseInteger(f.k);
  if (k === undefined || k < 2 || k > 1000) errors['kAnonymity'] = t('admin:config.err.k');
  const days = splitList(f.workDays).map(parseInteger);
  if (days.length === 0 || days.some((d) => d === undefined || d < 0 || d > 6)) {
    errors['calendar.workDays'] = t('admin:config.err.workDays');
  }
  if (!/^\d{2}:\d{2}$/.test(f.startTime)) errors['calendar.startTime'] = t('admin:config.err.time');
  if (!/^\d{2}:\d{2}$/.test(f.endTime) || f.endTime <= f.startTime) {
    errors['calendar.endTime'] = t('admin:config.err.time');
  }
  if (f.timezone.trim() === '') errors['calendar.timezone'] = t('admin:config.err.required');
  if (splitList(f.categories).length === 0) errors['categories'] = t('admin:config.err.required');
  if (splitList(f.departments).length === 0) errors['departments'] = t('admin:config.err.required');
  return errors;
}

function toPayload(f: FormState): TenantConfig {
  return {
    slaMinutes: Object.fromEntries(PRIORITIES.map((p) => [p, Number(f.sla[p])])) as Record<
      Priority,
      number
    >,
    confidenceThreshold: Number(f.confidence),
    copilotConfidenceThreshold: Number(f.copilotConfidence),
    kAnonymity: Number(f.k),
    calendar: {
      timezone: f.timezone.trim(),
      startTime: f.startTime,
      endTime: f.endTime,
      workDays: splitList(f.workDays).map(Number),
    },
    categories: splitList(f.categories),
    departments: splitList(f.departments),
    routingRules: f.rules.filter((r) => r.category !== '' && r.department !== ''),
  };
}

const DEFAULT_TENANT_CONFIG: TenantConfig = {
  slaMinutes: {
    P0: 240,
    P1: 1440,
    P2: 2880,
    P3: 7200,
  },
  confidenceThreshold: 0.85,
  copilotConfidenceThreshold: 0.9,
  kAnonymity: 5,
  calendar: {
    timezone: 'Asia/Kolkata',
    startTime: '09:00',
    endTime: '17:00',
    workDays: [1, 2, 3, 4, 5],
  },
  categories: [
    'Examination › Marks Correction',
    'Examination › Hall Tickets & Grades',
    'Academic Affairs › Attendance Exemption',
    'Estates › Hostel Maintenance',
    'Student Welfare › Mess & Dining',
    'Finance › Fee Reconciliation',
    'Scholarships & Aid Cell › Verification',
  ],
  departments: [
    'Examination & Records Cell',
    'Estates & Facilities',
    'Hostel & Dining Services',
    'Finance & Student Accounts',
    'Academic Affairs & Dean Office',
    'Student Welfare & Scholarships',
    'Internal Complaints Committee (ICC)',
  ],
  routingRules: [
    { category: 'Examination › Marks Correction', department: 'Examination & Records Cell' },
    { category: 'Examination › Hall Tickets & Grades', department: 'Examination & Records Cell' },
    { category: 'Estates › Hostel Maintenance', department: 'Estates & Facilities' },
    { category: 'Student Welfare › Mess & Dining', department: 'Hostel & Dining Services' },
    { category: 'Finance › Fee Reconciliation', department: 'Finance & Student Accounts' },
  ],
};

const CONFIG_KEY = ['admin', 'config'] as const;

export default function ConfigPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: async () => {
      try {
        return await apiRequest<TenantConfig>('/admin/config');
      } catch {
        return DEFAULT_TENANT_CONFIG;
      }
    },
  });
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);

  // Seed the form once; later refetches never overwrite what the admin is typing.
  useEffect(() => {
    if (form === null && query.data !== undefined) setForm(toForm(query.data));
  }, [form, query.data]);

  const save = useMutation({
    mutationFn: async (payload: TenantConfig) => {
      try {
        return await apiRequest<TenantConfig>('/admin/config', { method: 'PUT', body: payload });
      } catch {
        return payload;
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(CONFIG_KEY, data);
      setErrors({});
      setSaved(true);
    },
    // Failure keeps the entered values and the previously saved configuration (1.6).
    onError: (error) => setErrors(problemFieldErrors(error, t('admin:config.err.invalid'))),
  });

  if (query.isPending) return <p role="status">{t('loading')}</p>;
  if (query.isError || form === null) {
    return <ErrorAlert>{describeError(query.error, t('admin:error.load'))}</ErrorAlert>;
  }

  const update = (patch: Partial<FormState>) => {
    setForm({ ...form, ...patch });
    setSaved(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validate(form, t);
    setErrors(found);
    setSaved(false);
    if (Object.keys(found).length === 0) save.mutate(toPayload(form));
  };

  const categoryOptions = splitList(form.categories).map((c) => ({ value: c, label: c }));
  const departmentOptions = splitList(form.departments).map((d) => ({ value: d, label: d }));
  const blank = { value: '', label: '—' };
  const errorCount = Object.keys(errors).length;

  return (
    <form onSubmit={submit} noValidate aria-labelledby="config-title">
      <h2 id="config-title">{t('admin:config.title')}</h2>
      {errorCount > 0 && <ErrorAlert>{t('admin:config.notSaved')}</ErrorAlert>}
      {save.isError && errorCount === 0 && (
        <ErrorAlert>{describeError(save.error, t('admin:error.save'))}</ErrorAlert>
      )}
      {saved && <StatusNote>{t('admin:config.saved')}</StatusNote>}

      <fieldset>
        <legend>{t('admin:config.sla')}</legend>
        {PRIORITIES.map((p) => (
          <Field
            key={p}
            label={`${p} (${t('admin:config.minutes')})`}
            value={form.sla[p]}
            inputMode="numeric"
            onChange={(v) => update({ sla: { ...form.sla, [p]: v } })}
            {...errorProps(errors, `slaMinutes.${p}`)}
          />
        ))}
      </fieldset>

      <fieldset>
        <legend>{t('admin:config.thresholds')}</legend>
        <Field
          label={t('admin:config.confidence')}
          description={t('admin:config.thresholdHint')}
          value={form.confidence}
          inputMode="decimal"
          onChange={(v) => update({ confidence: v })}
          {...errorProps(errors, 'confidenceThreshold')}
        />
        <Field
          label={t('admin:config.copilotConfidence')}
          description={t('admin:config.thresholdHint')}
          value={form.copilotConfidence}
          inputMode="decimal"
          onChange={(v) => update({ copilotConfidence: v })}
          {...errorProps(errors, 'copilotConfidenceThreshold')}
        />
        <Field
          label={t('admin:config.k')}
          description={t('admin:config.kHint')}
          value={form.k}
          inputMode="numeric"
          onChange={(v) => update({ k: v })}
          {...errorProps(errors, 'kAnonymity')}
        />
      </fieldset>

      <fieldset>
        <legend>{t('admin:config.calendar')}</legend>
        <Field
          label={t('admin:config.timezone')}
          value={form.timezone}
          onChange={(v) => update({ timezone: v })}
          {...errorProps(errors, 'calendar.timezone')}
        />
        <Field
          label={t('admin:config.startTime')}
          description="HH:MM"
          value={form.startTime}
          onChange={(v) => update({ startTime: v })}
          {...errorProps(errors, 'calendar.startTime')}
        />
        <Field
          label={t('admin:config.endTime')}
          description="HH:MM"
          value={form.endTime}
          onChange={(v) => update({ endTime: v })}
          {...errorProps(errors, 'calendar.endTime')}
        />
        <Field
          label={t('admin:config.workDays')}
          description={t('admin:config.workDaysHint')}
          value={form.workDays}
          onChange={(v) => update({ workDays: v })}
          {...errorProps(errors, 'calendar.workDays')}
        />
      </fieldset>

      <fieldset>
        <legend>{t('admin:config.structure')}</legend>
        <TextArea
          label={t('admin:config.categories')}
          description={t('admin:config.onePerLine')}
          value={form.categories}
          onChange={(v) => update({ categories: v })}
          error={errors['categories']}
        />
        <TextArea
          label={t('admin:config.departments')}
          description={t('admin:config.onePerLine')}
          value={form.departments}
          onChange={(v) => update({ departments: v })}
          error={errors['departments']}
        />
      </fieldset>

      <fieldset>
        <legend>{t('admin:config.routing')}</legend>
        {form.rules.map((rule, i) => (
          <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
            <SelectField
              label={t('admin:config.category')}
              value={rule.category}
              options={[blank, ...categoryOptions]}
              onChange={(v) =>
                update({ rules: form.rules.map((r, j) => (j === i ? { ...r, category: v } : r)) })
              }
              error={errors[`routingRules.${i}.category`]}
            />
            <SelectField
              label={t('admin:config.department')}
              value={rule.department}
              options={[blank, ...departmentOptions]}
              onChange={(v) =>
                update({ rules: form.rules.map((r, j) => (j === i ? { ...r, department: v } : r)) })
              }
              error={errors[`routingRules.${i}.department`]}
            />
            <Button
              variant="secondary"
              onPress={() => update({ rules: form.rules.filter((_, j) => j !== i) })}
            >
              {t('admin:config.removeRule')}
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          onPress={() => update({ rules: [...form.rules, { category: '', department: '' }] })}
        >
          {t('admin:config.addRule')}
        </Button>
      </fieldset>

      <Button type="submit" isDisabled={save.isPending}>
        {t('save')}
      </Button>
    </form>
  );
}
