import { Button } from '@campusconnect/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
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
} from '../(admin)/kit';

interface TenantSummary {
  readonly id: string;
  readonly name: string;
}

/** Declares a personal data breach so the Tenant_Admin is notified within 72 hours of detection (19.7). */
export default function BreachPage() {
  const { t } = useI18n();
  const [tenantId, setTenantId] = useState('');
  const [nature, setNature] = useState('');
  const [categories, setCategories] = useState('');
  const [affected, setAffected] = useState('');
  const [detectedAt, setDetectedAt] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const tenants = useQuery({
    queryKey: ['ops', 'tenants'],
    queryFn: () => apiRequest<{ tenants: TenantSummary[] }>('/ops/tenants'),
  });

  const declare = useMutation({
    mutationFn: (body: unknown) => apiRequest<{ id: string }>('/ops/breaches', { method: 'POST', body }),
    onSuccess: () => {
      setNature('');
      setCategories('');
      setAffected('');
      setDetectedAt('');
      setErrors({});
    },
    onError: (error) => setErrors(problemFieldErrors(error, t('ops:breach.err.invalid'))),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    const count = parseInteger(affected);
    const detected = new Date(detectedAt).getTime();
    const dataCategories = splitList(categories);
    if (tenantId === '') found['tenantId'] = t('ops:err.required');
    if (nature.trim() === '') found['nature'] = t('ops:err.required');
    if (dataCategories.length === 0) found['dataCategories'] = t('ops:err.required');
    if (count === undefined || count < 0) found['approxAffected'] = t('ops:breach.err.count');
    if (Number.isNaN(detected) || detected > Date.now()) found['detectedAt'] = t('ops:breach.err.detected');
    setErrors(found);
    declare.reset();
    if (Object.keys(found).length === 0) {
      declare.mutate({
        tenantId,
        nature: nature.trim(),
        dataCategories,
        approxAffected: count,
        detectedAt: detected,
      });
    }
  };

  return (
    <section aria-labelledby="breach-title">
      <h2 id="breach-title">{t('ops:breach.title')}</h2>
      <p>{t('ops:breach.intro')}</p>
      {tenants.isError && <ErrorAlert>{describeError(tenants.error, t('admin:error.load'))}</ErrorAlert>}
      <form onSubmit={submit} noValidate>
        <SelectField
          label={t('ops:breach.tenant')}
          value={tenantId}
          onChange={setTenantId}
          options={[
            { value: '', label: '—' },
            ...(tenants.data?.tenants ?? []).map((x) => ({ value: x.id, label: x.name })),
          ]}
          error={errors['tenantId']}
        />
        <TextArea
          label={t('ops:breach.nature')}
          value={nature}
          onChange={setNature}
          error={errors['nature']}
        />
        <TextArea
          label={t('ops:breach.categories')}
          description={t('ops:breach.categoriesHint')}
          value={categories}
          onChange={setCategories}
          error={errors['dataCategories']}
        />
        <Field
          label={t('ops:breach.affected')}
          inputMode="numeric"
          value={affected}
          onChange={setAffected}
          {...errorProps(errors, 'approxAffected')}
        />
        <Field
          label={t('ops:breach.detectedAt')}
          type="datetime-local"
          value={detectedAt}
          onChange={setDetectedAt}
          {...errorProps(errors, 'detectedAt')}
        />
        <Button type="submit" variant="danger" isDisabled={declare.isPending}>
          {t('ops:breach.submit')}
        </Button>
      </form>
      {declare.isError && Object.keys(errors).length === 0 && (
        <ErrorAlert>{describeError(declare.error, t('ops:breach.failed'))}</ErrorAlert>
      )}
      {declare.isSuccess && <StatusNote>{t('ops:breach.done')}</StatusNote>}
    </section>
  );
}
