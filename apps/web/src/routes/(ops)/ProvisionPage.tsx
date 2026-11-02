import { Button } from '@campusconnect/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiRequest } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import {
  ErrorAlert,
  Field,
  SelectField,
  StatusNote,
  describeError,
  errorProps,
  problemFieldErrors,
  type FieldErrors,
} from '../(admin)/kit';

const REGIONS = ['ap-south-1', 'ap-south-2'] as const;
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ProvisionResult {
  readonly tenantId: string;
  readonly subdomain: string;
}

/** Tenant provisioning (1.7). A failure means the server rolled back every partial record (1.8). */
export default function ProvisionPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [region, setRegion] = useState<string>('ap-south-1');
  const [adminEmail, setAdminEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const provision = useMutation({
    mutationFn: () =>
      apiRequest<ProvisionResult>('/ops/tenants', {
        method: 'POST',
        body: { name: name.trim(), subdomain, region, adminEmail: adminEmail.trim() },
      }),
    onSuccess: async () => {
      setName('');
      setSubdomain('');
      setAdminEmail('');
      setErrors({});
      await queryClient.invalidateQueries({ queryKey: ['ops', 'tenants'] });
    },
    onError: (error) => setErrors(problemFieldErrors(error, t('ops:provision.err.invalid'))),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (name.trim() === '') found['name'] = t('ops:err.required');
    if (!SUBDOMAIN.test(subdomain)) found['subdomain'] = t('ops:provision.err.subdomain');
    if (!EMAIL.test(adminEmail.trim())) found['adminEmail'] = t('ops:provision.err.email');
    setErrors(found);
    provision.reset();
    if (Object.keys(found).length === 0) provision.mutate();
  };

  return (
    <section aria-labelledby="prov-title">
      <h2 id="prov-title">{t('ops:provision.title')}</h2>
      <form onSubmit={submit} noValidate>
        <Field label={t('ops:provision.name')} value={name} onChange={setName} {...errorProps(errors, 'name')} />
        <Field
          label={t('ops:provision.subdomain')}
          description={t('ops:provision.subdomainHint')}
          value={subdomain}
          onChange={(v) => setSubdomain(v.toLowerCase())}
          {...errorProps(errors, 'subdomain')}
        />
        <SelectField
          label={t('ops:provision.region')}
          value={region}
          onChange={setRegion}
          options={REGIONS.map((r) => ({ value: r, label: r }))}
          error={errors['region']}
        />
        <Field
          label={t('ops:provision.adminEmail')}
          type="email"
          value={adminEmail}
          onChange={setAdminEmail}
          {...errorProps(errors, 'adminEmail')}
        />
        <Button type="submit" isDisabled={provision.isPending}>
          {t('ops:provision.submit')}
        </Button>
      </form>
      {provision.isPending && <p role="status">{t('ops:provision.working')}</p>}
      {provision.isError && Object.keys(errors).length === 0 && (
        <ErrorAlert>
          {describeError(provision.error, t('ops:provision.failed'))} {t('ops:provision.rolledBack')}
        </ErrorAlert>
      )}
      {provision.isSuccess && (
        <StatusNote>{t('ops:provision.done').replace('{{subdomain}}', provision.data.subdomain)}</StatusNote>
      )}
    </section>
  );
}
