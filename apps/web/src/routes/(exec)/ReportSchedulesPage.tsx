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

interface ReportSchedule {
  readonly id: string;
  readonly frequency: (typeof FREQUENCIES)[number];
  readonly format: (typeof FORMATS)[number];
  readonly recipients: readonly string[];
  readonly nextRunAt?: number;
}

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
    queryFn: () => apiRequest<{ schedules: ReportSchedule[] }>('/reports/schedules'),
  });

  const reset = () => {
    setEditing(null);
    setFrequency('');
    setFormat('');
    setRecipients('');
    setErrors({});
  };

  const save = useMutation({
    mutationFn: (input: ScheduleInput) =>
      editing === null
        ? apiRequest<ReportSchedule>('/reports/schedules', { method: 'POST', body: input })
        : apiRequest<ReportSchedule>(`/reports/schedules/${encodeURIComponent(editing)}`, {
            method: 'PUT',
            body: input,
          }),
    onSuccess: async () => {
      setDone(t('exec:reports.saved'));
      reset();
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    // Keep what was typed; the server names the invalid field and changes nothing (15.2).
    onError: (error) => setErrors(problemFieldErrors(error, t('exec:reports.err.invalid'))),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/reports/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDone(t('exec:reports.deleted'));
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setDone(null);
    const found: Record<string, string> = {};
    const emails = splitList(recipients);
    if (!(FREQUENCIES as readonly string[]).includes(frequency)) {
      found['frequency'] = t('exec:reports.err.frequency');
    }
    if (!(FORMATS as readonly string[]).includes(format)) found['format'] = t('exec:reports.err.format');
    if (emails.length < 1 || emails.length > MAX_RECIPIENTS || emails.some((r) => !EMAIL.test(r))) {
      found['recipients'] = t('exec:reports.err.recipients');
    }
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate({ frequency, format, recipients: emails });
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
          error={errors['frequency']}
        />
        <SelectField
          label={t('exec:reports.format')}
          value={format}
          onChange={setFormat}
          options={[placeholder, ...FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }))]}
          error={errors['format']}
        />
        <TextArea
          label={t('exec:reports.recipients')}
          description={t('exec:reports.recipientsHint')}
          value={recipients}
          onChange={setRecipients}
          error={errors['recipients']}
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

      {list.isPending && <p role="status">{t('loading')}</p>}
      {list.isError && <ErrorAlert>{describeError(list.error, t('admin:error.load'))}</ErrorAlert>}
      {list.isSuccess &&
        (list.data.schedules.length === 0 ? (
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
                  <td>{s.nextRunAt === undefined ? '—' : new Date(s.nextRunAt).toLocaleString(locale)}</td>
                  <td>
                    <Button variant="secondary" onPress={() => edit(s)}>
                      {t('exec:reports.edit')}
                    </Button>
                    <Button variant="danger" isDisabled={remove.isPending} onPress={() => remove.mutate(s.id)}>
                      {t('exec:reports.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  );
}
