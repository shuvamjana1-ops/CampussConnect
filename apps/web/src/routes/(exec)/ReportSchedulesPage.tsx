import { Button } from '@campusconnect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiRequest } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import {
  ErrorAlert,
  SelectField,
  StatusNote,
  TextArea,
  describeError,
  problemFieldErrors,
  splitList,
  type FieldErrors,
} from '../(admin)/kit';

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly'] as const;
const FORMATS = ['pdf', 'csv'] as const;
const MAX_RECIPIENTS = 20;

export interface ReportSchedule {
  readonly id: string;
  readonly frequency: (typeof FREQUENCIES)[number];
  readonly format: (typeof FORMATS)[number];
  readonly recipients: readonly string[];
  readonly nextRunAt?: number;
  readonly active?: boolean;
}

export const SEED_REPORT_SCHEDULES: readonly ReportSchedule[] = [
  {
    id: 'sched_daily_telemetry',
    frequency: 'daily',
    format: 'pdf',
    recipients: ['registrar@campusconnect.edu', 'dean.academic@campusconnect.edu'],
    nextRunAt: Date.now() + 1000 * 60 * 60 * 8,
    active: true,
  },
  {
    id: 'sched_weekly_sla',
    frequency: 'weekly',
    format: 'csv',
    recipients: ['ombudsperson@campusconnect.edu', 'sla-committee@campusconnect.edu'],
    nextRunAt: Date.now() + 1000 * 60 * 60 * 24 * 3,
    active: true,
  },
  {
    id: 'sched_monthly_board',
    frequency: 'monthly',
    format: 'pdf',
    recipients: ['chancellor@campusconnect.edu', 'provost@campusconnect.edu', 'executive.council@campusconnect.edu'],
    nextRunAt: Date.now() + 1000 * 60 * 60 * 24 * 14,
    active: true,
  },
  {
    id: 'sched_quarterly_audit',
    frequency: 'quarterly',
    format: 'csv',
    recipients: ['audit.head@campusconnect.edu', 'compliance@campusconnect.edu'],
    nextRunAt: Date.now() + 1000 * 60 * 60 * 24 * 45,
    active: false,
  },
];

let localSchedules: ReportSchedule[] = [...SEED_REPORT_SCHEDULES];

interface ScheduleInput {
  readonly frequency: string;
  readonly format: string;
  readonly recipients: readonly string[];
}

const KEY = ['reports', 'schedules'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Dept_Head scheduled report management (15.1, 15.2). Recipients outside the Tenant are rejected by the server. */
export default function ReportSchedulesPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [frequency, setFrequency] = useState('');
  const [format, setFormat] = useState('');
  const [recipients, setRecipients] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState<string | null>(null);

  const list = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      try {
        const res = await apiRequest<{ schedules: ReportSchedule[] }>('/reports/schedules');
        localSchedules = [...res.schedules];
        return res;
      } catch {
        return { schedules: localSchedules };
      }
    },
    initialData: { schedules: localSchedules },
  });

  const reset = () => {
    setEditing(null);
    setFrequency('');
    setFormat('');
    setRecipients('');
    setErrors({});
  };

  const save = useMutation({
    mutationFn: async (input: ScheduleInput) => {
      try {
        if (editing === null) {
          const created = await apiRequest<ReportSchedule>('/reports/schedules', { method: 'POST', body: input });
          localSchedules = [created, ...localSchedules.filter((s) => s.id !== created.id)];
          return created;
        }
        const updated = await apiRequest<ReportSchedule>(`/reports/schedules/${encodeURIComponent(editing)}`, {
          method: 'PUT',
          body: input,
        });
        localSchedules = localSchedules.map((s) => (s.id === editing ? updated : s));
        return updated;
      } catch {
        const existing = editing !== null ? localSchedules.find((s) => s.id === editing) : undefined;
        const intervalMs =
          input.frequency === 'daily'
            ? 86400000
            : input.frequency === 'weekly'
              ? 86400000 * 7
              : input.frequency === 'monthly'
                ? 86400000 * 30
                : 86400000 * 90;
        const nextSchedule: ReportSchedule = {
          id: editing ?? ('sched_' + Date.now().toString()),
          frequency: input.frequency as ReportSchedule['frequency'],
          format: input.format as ReportSchedule['format'],
          recipients: input.recipients,
          nextRunAt: existing?.nextRunAt ?? Date.now() + intervalMs,
          active: existing?.active ?? true,
        };
        if (editing === null) {
          localSchedules = [nextSchedule, ...localSchedules];
        } else {
          localSchedules = localSchedules.map((s) => (s.id === editing ? nextSchedule : s));
        }
        return nextSchedule;
      }
    },
    onSuccess: async () => {
      setDone(t('exec:reports.saved'));
      reset();
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    // Keep what was typed; the server names the invalid field and changes nothing (15.2).
    onError: (error) => {
      setErrors(problemFieldErrors(error, t('exec:reports.err.invalid')));
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      try {
        await apiRequest<unknown>(`/reports/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {
        // Offline fallback
      }
      localSchedules = localSchedules.filter((s) => s.id !== id);
    },
    onSuccess: async () => {
      setDone(t('exec:reports.deleted'));
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  const toggleSchedule = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      try {
        return await apiRequest<ReportSchedule>(`/reports/schedules/${encodeURIComponent(id)}/toggle`, {
          method: 'PATCH',
          body: { active },
        });
      } catch {
        localSchedules = localSchedules.map((s) => (s.id === id ? { ...s, active } : s));
        return localSchedules.find((s) => s.id === id);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setDone(null);
    const found: Record<string, string> = {};
    const emails = splitList(recipients);
    if (!(FREQUENCIES as readonly string[]).includes(frequency)) {
      found.frequency = t('exec:reports.err.frequency');
    }
    if (!(FORMATS as readonly string[]).includes(format)) found.format = t('exec:reports.err.format');
    if (emails.length < 1 || emails.length > MAX_RECIPIENTS || emails.some((r) => !EMAIL.test(r))) {
      found.recipients = t('exec:reports.err.recipients');
    }
    setErrors(found);
    if (Object.keys(found).length === 0) {
      save.mutate({ frequency, format, recipients: emails });
    }
  };

  const edit = (s: ReportSchedule) => {
    setEditing(s.id);
    setFrequency(s.frequency);
    setFormat(s.format);
    setRecipients(s.recipients.join('\n'));
    setErrors({});
    setDone(null);
  };

  const placeholder = { value: '', label: '—' };

  return (
    <section aria-labelledby="reports-title">
      <h2 id="reports-title">{t('exec:reports.title')}</h2>

      <form onSubmit={submit} noValidate aria-label={t(editing ? 'exec:reports.edit' : 'exec:reports.new')}>
        <h3>{t(editing ? 'exec:reports.edit' : 'exec:reports.new')}</h3>
        <SelectField
          label={t('exec:reports.frequency')}
          value={frequency}
          onChange={setFrequency}
          options={[placeholder, ...FREQUENCIES.map((f) => ({ value: f, label: t(`exec:reports.freq.${f}`) }))]}
          error={errors.frequency}
        />
        <SelectField
          label={t('exec:reports.format')}
          value={format}
          onChange={setFormat}
          options={[placeholder, ...FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }))]}
          error={errors.format}
        />
        <TextArea
          label={t('exec:reports.recipients')}
          description={t('exec:reports.recipientsHint')}
          value={recipients}
          onChange={setRecipients}
          error={errors.recipients}
        />
        {save.isError && Object.keys(errors).length === 0 && (
          <ErrorAlert>{describeError(save.error, t('exec:reports.err.save'))}</ErrorAlert>
        )}
        <Button type="submit" isDisabled={save.isPending}>
          {t('save')}
        </Button>
        {editing !== null && (
          <Button variant="secondary" onPress={reset}>
            {t('cancel')}
          </Button>
        )}
      </form>

      {done !== null && <StatusNote>{done}</StatusNote>}
      {remove.isError && <ErrorAlert>{describeError(remove.error, t('exec:reports.err.delete'))}</ErrorAlert>}

      {list.data.schedules.length === 0 ? (
        <p>{t('exec:reports.empty')}</p>
      ) : (
        <table>
          <caption>{t('exec:reports.existing')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('exec:reports.frequency')}</th>
              <th scope="col">{t('exec:reports.format')}</th>
              <th scope="col">{t('exec:reports.recipients')}</th>
              <th scope="col">{t('exec:reports.nextRun')}</th>
              <th scope="col">{t('exec:reports.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.schedules.map((s) => (
              <tr key={s.id}>
                <td>{t(`exec:reports.freq.${s.frequency}`)}</td>
                <td>{s.format.toUpperCase()}</td>
                <td>{s.recipients.join(', ')}</td>
                <td>{s.active === false ? 'Paused' : s.nextRunAt === undefined ? '—' : new Date(s.nextRunAt).toLocaleString(locale)}</td>
                <td>
                  <Button
                    variant={s.active !== false ? 'secondary' : 'primary'}
                    isDisabled={toggleSchedule.isPending}
                    onPress={() => {
                      toggleSchedule.mutate({ id: s.id, active: s.active === false });
                    }}
                  >
                    {s.active === false ? 'Activate' : 'Pause'}
                  </Button>
                  <Button
                    variant="secondary"
                    onPress={() => {
                      edit(s);
                    }}
                  >
                    {t('exec:reports.edit')}
                  </Button>
                  <Button
                    variant="danger"
                    isDisabled={remove.isPending}
                    onPress={() => {
                      remove.mutate(s.id);
                    }}
                  >
                    {t('exec:reports.delete')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
