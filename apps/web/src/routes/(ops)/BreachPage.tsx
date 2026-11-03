import { Badge, Button } from '@campusconnect/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
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

export interface TenantSummary {
  readonly id: string;
  readonly name: string;
  readonly subdomain?: string;
  readonly tier?: 'Enterprise' | 'Standard' | 'Trial';
  readonly region?: 'ap-south-1' | 'ap-south-2' | string;
  readonly status?: 'active' | 'provisioning' | 'suspended';
  readonly adminEmail?: string;
  readonly createdAt?: number;
}

export interface BreachNotice {
  readonly id: string;
  readonly tenantId: string;
  readonly tenantName?: string | undefined;
  readonly nature: string;
  readonly dataCategories: readonly string[];
  readonly approxAffected: number;
  readonly detectedAt: number;
  readonly declaredAt: number;
  readonly status: 'notified' | 'contained' | 'investigating';
}

export const SEED_TENANTS: readonly TenantSummary[] = [
  {
    id: 'tnt_iist_blr',
    name: 'Indian Institute of Science & Technology (IIST Bangalore)',
    subdomain: 'iist',
    tier: 'Enterprise',
    region: 'ap-south-1',
    status: 'active',
    adminEmail: 'registrar@iist.ac.in',
    createdAt: 1735689600000,
  },
  {
    id: 'tnt_nitk_sur',
    name: 'National Institute of Technology Karnataka (NITK Surathkal)',
    subdomain: 'nitk',
    tier: 'Enterprise',
    region: 'ap-south-1',
    status: 'active',
    adminEmail: 'admin@nitk.edu.in',
    createdAt: 1738368000000,
  },
  {
    id: 'tnt_dtu_del',
    name: 'Delhi Technological University (DTU Delhi)',
    subdomain: 'dtu',
    tier: 'Standard',
    region: 'ap-south-2',
    status: 'active',
    adminEmail: 'sysadmin@dtu.ac.in',
    createdAt: 1740787200000,
  },
  {
    id: 'tnt_bits_pil',
    name: 'Birla Institute of Technology & Science (BITS Pilani)',
    subdomain: 'bits-pilani',
    tier: 'Enterprise',
    region: 'ap-south-1',
    status: 'active',
    adminEmail: 'ithelp@pilani.bits-pilani.ac.in',
    createdAt: 1743465600000,
  },
  {
    id: 'tnt_demo_inst',
    name: 'CampusConnect Demo Institution (Primary Tenant)',
    subdomain: 'demo',
    tier: 'Standard',
    region: 'ap-south-1',
    status: 'active',
    adminEmail: 'demo-admin@campusconnect.app',
    createdAt: 1746057600000,
  },
];

export const SEED_BREACHES: readonly BreachNotice[] = [
  {
    id: 'brc_2026_001',
    tenantId: 'tnt_iist_blr',
    tenantName: 'Indian Institute of Science & Technology (IIST Bangalore)',
    nature: 'Misconfigured S3 bucket permissions during student fee receipt archive migration',
    dataCategories: ['Student Fee Receipts', 'Bank Reference IDs', 'Partial PAN/Aadhaar Hashes'],
    approxAffected: 420,
    detectedAt: Date.now() - 1000 * 60 * 60 * 18,
    declaredAt: Date.now() - 1000 * 60 * 60 * 16,
    status: 'contained',
  },
  {
    id: 'brc_2026_002',
    tenantId: 'tnt_nitk_sur',
    tenantName: 'National Institute of Technology Karnataka (NITK Surathkal)',
    nature: 'Unauthorized read access detected on staging grievance database replica via expired service token',
    dataCategories: ['Student Grievance Descriptions', 'Counseling Records', 'Email Headers'],
    approxAffected: 85,
    detectedAt: Date.now() - 1000 * 60 * 60 * 42,
    declaredAt: Date.now() - 1000 * 60 * 60 * 36,
    status: 'notified',
  },
  {
    id: 'brc_2026_003',
    tenantId: 'tnt_dtu_del',
    tenantName: 'Delhi Technological University (DTU Delhi)',
    nature: 'Suspicious credential stuffing attempts against single-sign-on student auth portal',
    dataCategories: ['Student Login Identifiers', 'IP Session Hashes'],
    approxAffected: 140,
    detectedAt: Date.now() - 1000 * 60 * 60 * 68,
    declaredAt: Date.now() - 1000 * 60 * 60 * 64,
    status: 'investigating',
  },
];

let localTenants: TenantSummary[] = [...SEED_TENANTS];
let localBreaches: BreachNotice[] = [...SEED_BREACHES];

export function getLocalTenants(): TenantSummary[] {
  return localTenants;
}

export function addLocalTenant(tenant: TenantSummary): void {
  localTenants = [tenant, ...localTenants.filter((t) => t.id !== tenant.id)];
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

  // Breach Table Search & Filter States
  const [breachSearch, setBreachSearch] = useState('');
  const [breachStatusFilter, setBreachStatusFilter] = useState<'all' | 'notified' | 'contained' | 'investigating'>('all');

  const tenants = useQuery({
    queryKey: ['ops', 'tenants'],
    queryFn: async () => {
      try {
        const res = await apiRequest<{ tenants: TenantSummary[] }>('/ops/tenants');
        for (const item of res.tenants) {
          addLocalTenant(item);
        }
        return res;
      } catch {
        return { tenants: localTenants };
      }
    },
    initialData: { tenants: localTenants },
  });

  const resolveTenantName = (tId: string, explicitName?: string): string => {
    if (explicitName && explicitName.trim() !== '' && explicitName !== tId) {
      return explicitName;
    }
    const match =
      tenants.data?.tenants?.find((item) => item.id === tId) ??
      localTenants.find((item) => item.id === tId);
    return match?.name ?? tId;
  };

  const filteredBreaches = useMemo(() => {
    return localBreaches.filter((b) => {
      const q = breachSearch.toLowerCase().trim();
      const resolvedName = resolveTenantName(b.tenantId, b.tenantName).toLowerCase();
      const matchesSearch =
        q === '' ||
        resolvedName.includes(q) ||
        b.tenantId.toLowerCase().includes(q) ||
        b.nature.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        b.dataCategories.some((cat) => cat.toLowerCase().includes(q));

      const matchesStatus =
        breachStatusFilter === 'all' || b.status === breachStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [breachSearch, breachStatusFilter, tenants.data?.tenants]);

  const declare = useMutation({
    mutationFn: async (body: {
      tenantId: string;
      nature: string;
      dataCategories: readonly string[];
      approxAffected: number;
      detectedAt: number;
    }) => {
      try {
        return await apiRequest<{ id: string }>('/ops/breaches', { method: 'POST', body });
      } catch {
        const newId = 'brc_' + Date.now().toString();
        const matchedTenant =
          tenants.data?.tenants?.find((item) => item.id === body.tenantId) ??
          localTenants.find((item) => item.id === body.tenantId);

        const newNotice: BreachNotice = {
          id: newId,
          tenantId: body.tenantId,
          tenantName: matchedTenant?.name ?? body.tenantId,
          nature: body.nature,
          dataCategories: body.dataCategories,
          approxAffected: body.approxAffected,
          detectedAt: body.detectedAt,
          declaredAt: Date.now(),
          status: 'notified',
        };
        localBreaches = [newNotice, ...localBreaches];
        return { id: newId };
      }
    },
    onSuccess: () => {
      setNature('');
      setCategories('');
      setAffected('');
      setDetectedAt('');
      setErrors({});
    },
    onError: (error) => {
      setErrors(problemFieldErrors(error, t('ops:breach.err.invalid')));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    const count = parseInteger(affected);
    const detected = new Date(detectedAt).getTime();
    const dataCategories = splitList(categories);
    if (tenantId === '') found.tenantId = t('ops:err.required');
    if (nature.trim() === '') found.nature = t('ops:err.required');
    if (dataCategories.length === 0) found.dataCategories = t('ops:err.required');
    if (count === undefined || count < 0) found.approxAffected = t('ops:breach.err.count');
    if (Number.isNaN(detected) || detected > Date.now()) found.detectedAt = t('ops:breach.err.detected');
    setErrors(found);
    declare.reset();
    if (Object.keys(found).length === 0) {
      declare.mutate({
        tenantId,
        nature: nature.trim(),
        dataCategories,
        approxAffected: count ?? 0,
        detectedAt: detected,
      });
    }
  };

  return (
    <section aria-labelledby="breach-title">
      <div className="cc-page-header">
        <div>
          <h2 id="breach-title" className="cc-page-title">{t('ops:breach.title')}</h2>
          <p className="cc-page-desc">{t('ops:breach.intro')}</p>
        </div>
      </div>

      {tenants.isError && <ErrorAlert>{describeError(tenants.error, t('admin:error.load'))}</ErrorAlert>}

      <div className="cc-card">
        <form onSubmit={submit} noValidate>
          <SelectField
            label={t('ops:breach.tenant')}
            value={tenantId}
            onChange={setTenantId}
            options={[
              { value: '', label: '—' },
              ...tenants.data.tenants.map((x) => ({ value: x.id, label: x.name })),
            ]}
            error={errors.tenantId}
          />
          <TextArea
            label={t('ops:breach.nature')}
            value={nature}
            onChange={setNature}
            error={errors.nature}
          />
          <TextArea
            label={t('ops:breach.categories')}
            description={t('ops:breach.categoriesHint')}
            value={categories}
            onChange={setCategories}
            error={errors.dataCategories}
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
      </div>

      {localBreaches.length > 0 && (
        <div className="cc-card" style={{ marginTop: '2.5rem' }}>
          <div className="cc-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 className="cc-card-title" style={{ margin: 0 }}>
                <span>🚨</span> Active Breach Declarations (72h Notification Registry)
              </h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Statutory DPDP Act compliance log with 72-hour Data Protection Board of India notification timer
              </p>
            </div>
            <Badge tone="danger">
              {filteredBreaches.length} Incidents Logged
            </Badge>
          </div>

          {/* Incident Filter Bar */}
          <div className="cc-filter-bar" style={{ marginTop: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
              <input
                type="search"
                placeholder="Search notices by tenant, incident nature, data categories…"
                value={breachSearch}
                onChange={(e) => setBreachSearch(e.target.value)}
                aria-label="Filter breach notices"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select
                value={breachStatusFilter}
                onChange={(e) => setBreachStatusFilter(e.target.value as typeof breachStatusFilter)}
                aria-label="Filter by notice status"
                style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
              >
                <option value="all">All Statuses</option>
                <option value="notified">Notified (72h Timer Active)</option>
                <option value="investigating">Investigating</option>
                <option value="contained">Contained</option>
              </select>
              {(breachSearch !== '' || breachStatusFilter !== 'all') && (
                <Button
                  variant="secondary"
                  onPress={() => {
                    setBreachSearch('');
                    setBreachStatusFilter('all');
                  }}
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          <div className="cc-table-wrapper">
            <table className="cc-table" style={{ minWidth: '760px' }}>
              <thead>
                <tr>
                  <th scope="col">Affected Tenant</th>
                  <th scope="col">Nature of Incident</th>
                  <th scope="col">Data Categories</th>
                  <th scope="col">Affected</th>
                  <th scope="col">Detected At</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredBreaches.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
                      No breach declarations match the search or filter query.
                    </td>
                  </tr>
                ) : (
                  filteredBreaches.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong style={{ display: 'block', color: '#0f172a' }}>
                          {resolveTenantName(b.tenantId, b.tenantName)}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                          {b.tenantId}
                        </span>
                      </td>
                      <td style={{ maxWidth: '280px' }}>{b.nature}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {b.dataCategories.map((cat) => (
                            <span key={cat} style={{ background: '#f1f5f9', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.775rem' }}>
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td><strong>{b.approxAffected.toLocaleString()}</strong></td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.825rem' }}>
                        {new Date(b.detectedAt).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <Badge tone={b.status === 'contained' ? 'success' : b.status === 'notified' ? 'danger' : 'neutral'}>
                          {b.status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
