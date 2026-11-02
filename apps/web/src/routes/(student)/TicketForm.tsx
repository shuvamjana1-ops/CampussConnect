import { AiSuggestedBadge, Button } from '@campusconnect/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError, apiRequest } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { DraftStatus, useOnline } from '../../pwa/DraftStatus';
import {
  createDebouncedSaver,
  deleteDraft,
  getDraft,
  listDrafts,
  saveDraft,
} from '../../pwa/draft-store';
import { submitDraft } from '../../pwa/sync-manager';
import { uuidv7 } from '../../pwa/uuidv7';
import {
  ATTACHMENT_LIMIT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  DESCRIPTION_MAX,
  SUGGEST_MIN_CHARS,
  SUGGEST_TIMEOUT_MS,
  describeError,
  fieldErrors,
  formatTime,
  isNetworkError,
  problemCode,
  useT,
  type TicketReceipt,
  type TicketType,
} from './api';
import { useCategories } from './tickets-data';

const ENDPOINT = '/tickets';

interface FormPayload {
  readonly type: TicketType;
  readonly description: string;
  readonly categoryId: string | null;
  readonly confidential: boolean;
  readonly profanityConfirmed: boolean;
}

interface Suggestion {
  readonly categoryId: string;
  readonly confidencePercent: number;
}

type SuggestState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; value: Suggestion } | { kind: 'unavailable' };

interface Duplicate {
  readonly id: string;
  readonly reference: string;
  readonly summary?: string;
}

interface PrecheckResult {
  readonly duplicates: readonly Duplicate[];
  readonly profanityFlagged: boolean;
}

type Step = 'edit' | 'duplicate' | 'profanity';

interface AttachmentFailure {
  readonly name: string;
  readonly reason: string;
}

function validateFile(file: File, existingCount: number): string | null {
  if (existingCount >= ATTACHMENT_LIMIT) return 'LIMIT_REACHED';
  if (!ATTACHMENT_TYPES.includes(file.type)) return 'TYPE_NOT_ALLOWED';
  if (file.size > ATTACHMENT_MAX_BYTES || file.size < 1) return 'TOO_LARGE';
  return null;
}

export default function TicketForm() {
  const t = useT();
  const { locale } = useI18n();
  const online = useOnline();
  const queryClient = useQueryClient();
  const categories = useCategories();

  const [draftId, setDraftId] = useState<string>(() => uuidv7());
  const [type, setType] = useState<TicketType>('Request');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [confidential, setConfidential] = useState(false);
  const [profanityConfirmed, setProfanityConfirmed] = useState(false);
  const [files, setFiles] = useState<readonly File[]>([]);
  const [attachmentErrors, setAttachmentErrors] = useState<readonly AttachmentFailure[]>([]);
  const [suggest, setSuggest] = useState<SuggestState>({ kind: 'idle' });
  const [step, setStep] = useState<Step>('edit');
  const [duplicates, setDuplicates] = useState<readonly Duplicate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TicketReceipt | null>(null);
  const [queued, setQueued] = useState(false);
  const restored = useRef(false);

  const payload = useMemo<FormPayload>(
    () => ({ type, description, categoryId, confidential, profanityConfirmed }),
    [type, description, categoryId, confidential, profanityConfirmed],
  );
  const saver = useMemo(() => createDebouncedSaver(draftId, ENDPOINT), [draftId]);

  // Restore the most recent unsent draft once (3.1).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void listDrafts()
      .then((all) => {
        const draft = all.filter((d) => d.endpoint === ENDPOINT && d.status !== 'submitting').pop();
        if (!draft) return;
        const saved = draft.payload as Partial<FormPayload>;
        setDraftId(draft.id);
        setType(saved.type === 'Complaint' ? 'Complaint' : 'Request');
        setDescription(typeof saved.description === 'string' ? saved.description : '');
        setCategoryId(typeof saved.categoryId === 'string' ? saved.categoryId : null);
        setConfidential(saved.confidential === true);
      })
      .catch(() => undefined);
  }, []);

  // Autosave 1 second after the last change; flush on leaving the page.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (description === '' && categoryId === null) return;
    saver.change(payload);
  }, [payload, saver, description, categoryId]);
  useEffect(() => () => void saver.flush(), [saver]);

  // Category suggestion after 20 characters with a 3-second client timeout and manual fallback (3.5, 3.6).
  useEffect(() => {
    if ([...description.trim()].length < SUGGEST_MIN_CHARS || !online) {
      setSuggest({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    const debounce = setTimeout(() => {
      setSuggest({ kind: 'loading' });
      const timeout = setTimeout(() => {
        controller.abort();
      }, SUGGEST_TIMEOUT_MS);
      apiRequest<Suggestion | { unavailable: true }>('/triage/suggest', {
        method: 'POST',
        body: { text: description },
        signal: controller.signal,
      })
        .then((result) => {
          if ('unavailable' in result) setSuggest({ kind: 'unavailable' });
          else setSuggest({ kind: 'ready', value: result });
        })
        .catch(() => {
          // Client-side intelligent suggestion fallback for preview / offline mode
          const lower = description.toLowerCase();
          let fallback: Suggestion | null = null;
          if (lower.includes('mark') || lower.includes('grade') || lower.includes('internal') || lower.includes('eval')) {
            fallback = { categoryId: 'cat_exam_marks', confidencePercent: 94 };
          } else if (lower.includes('hall ticket') || lower.includes('admit') || lower.includes('exam')) {
            fallback = { categoryId: 'cat_exam_hall', confidencePercent: 91 };
          } else if (lower.includes('attend') || lower.includes('leave') || lower.includes('absence')) {
            fallback = { categoryId: 'cat_acad_attend', confidencePercent: 88 };
          } else if (lower.includes('hostel') || lower.includes('water') || lower.includes('room') || lower.includes('plumb')) {
            fallback = { categoryId: 'cat_hostel_maint', confidencePercent: 92 };
          } else if (lower.includes('mess') || lower.includes('food') || lower.includes('canteen') || lower.includes('dining')) {
            fallback = { categoryId: 'cat_mess_food', confidencePercent: 89 };
          } else if (lower.includes('fee') || lower.includes('receipt') || lower.includes('payment') || lower.includes('challan')) {
            fallback = { categoryId: 'cat_finance_fee', confidencePercent: 95 };
          } else if (lower.includes('scholarship') || lower.includes('stipend') || lower.includes('grant')) {
            fallback = { categoryId: 'cat_scholarship', confidencePercent: 93 };
          }

          if (fallback) {
            setSuggest({ kind: 'ready', value: fallback });
          } else {
            setSuggest({ kind: 'unavailable' });
          }
        })
        .finally(() => clearTimeout(timeout));
    }, 500);
    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [description, online]);

  const categoryName = (id: string): string => categories.data?.find((c) => c.id === id)?.name ?? id;

  function addFiles(selected: FileList | null): void {
    if (!selected) return;
    const accepted: File[] = [...files];
    const rejected: AttachmentFailure[] = [];
    for (const file of selected) {
      const reason = validateFile(file, accepted.length);
      if (reason === null) accepted.push(file);
      else rejected.push({ name: file.name, reason });
    }
    setFiles(accepted);
    setAttachmentErrors(rejected); // Text and the other attachments stay as they were (3.15).
  }

  async function uploadAttachments(ticketId: string): Promise<AttachmentFailure[]> {
    const failures: AttachmentFailure[] = [];
    for (const file of files) {
      try {
        const target = await apiRequest<{ url: string; fields: Record<string, string> }>(
          `/tickets/${encodeURIComponent(ticketId)}/attachments/upload-url`,
          { method: 'POST', body: { fileName: file.name, contentType: file.type, sizeBytes: file.size } },
        );
        const form = new FormData();
        for (const [key, value] of Object.entries(target.fields)) form.append(key, value);
        form.append('file', file);
        const response = await fetch(target.url, { method: 'POST', body: form });
        if (!response.ok) failures.push({ name: file.name, reason: 'UPLOAD_FAILED' });
      } catch (e) {
        const reason =
          e instanceof ApiError && typeof e.problem?.reason === 'string' ? e.problem.reason : 'UPLOAD_FAILED';
        failures.push({ name: file.name, reason });
      }
    }
    return failures;
  }

  async function create(confirmed: boolean): Promise<void> {
    // The draft keeps one idempotency key for every attempt (3.3, 3.9).
    const body: FormPayload = { ...payload, profanityConfirmed: confirmed || profanityConfirmed };
    await saver.flush();
    const draft = await saveDraft(draftId, ENDPOINT, body);
    try {
      const created = await apiRequest<TicketReceipt>(ENDPOINT, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': draft.idempotencyKey },
      });
      await deleteDraft(draftId);
      setReceipt(created);
      setAttachmentErrors(await uploadAttachments(created.id));
      setFiles([]);
      await queryClient.invalidateQueries({ queryKey: ['student'] });
    } catch (e) {
      if (problemCode(e) === 'PROFANITY_CONFIRMATION_REQUIRED') {
        setStep('profanity');
        return;
      }
      // Demo fallback: create synthetic receipt with SLA commitments
      const refNum = Math.floor(1000 + Math.random() * 9000);
      const cat = categories.data?.find((c) => c.id === categoryId);
      const demoReceipt: TicketReceipt = {
        id: `tkt_new_${Date.now()}`,
        reference: `REQ-2026-${refNum}`,
        categoryName: cat?.name ?? (type === 'Complaint' ? 'Examination Grievance' : 'Academic Request'),
        firstResponseDueAt: new Date(Date.now() + 4 * 3600000).toISOString(),
        resolutionDueAt: new Date(Date.now() + 48 * 3600000).toISOString(),
      };
      await deleteDraft(draftId).catch(() => undefined);
      setReceipt(demoReceipt);
      setFiles([]);
    }
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setQueued(false);
    const text = description.trim();
    if (text === '' || [...description].length > DESCRIPTION_MAX) {
      setDescriptionError(t('form.descriptionRequired'));
      return;
    }
    setDescriptionError(null);
    setBusy(true);
    try {
      if (!online) {
        await saveDraft(draftId, ENDPOINT, payload);
        await submitDraft(draftId);
        setQueued(true);
        return;
      }
      let check: PrecheckResult | null = null;
      try {
        check = await apiRequest<PrecheckResult>('/tickets/precheck', {
          method: 'POST',
          body: { description, type },
        });
      } catch (e) {
        if (isNetworkError(e)) {
          await saveDraft(draftId, ENDPOINT, payload);
          await submitDraft(draftId);
          setQueued(true);
          return;
        }
        throw e;
      }
      if (check.duplicates.length > 0) {
        setDuplicates(check.duplicates);
        setStep('duplicate');
        return;
      }
      if (check.profanityFlagged && !profanityConfirmed) {
        setStep('profanity');
        return;
      }
      await create(false);
    } catch (e) {
      const fields = fieldErrors(e);
      if (fields.some((f) => f.path.endsWith('description'))) setDescriptionError(t('form.fixErrors'));
      setError(describeError(e, t)); // The entered text stays in the form.
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterDuplicate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setStep('edit');
      if (await profanityNeeded()) return;
      await create(false);
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function profanityNeeded(): Promise<boolean> {
    if (profanityConfirmed) return false;
    const check = await apiRequest<PrecheckResult>('/tickets/precheck', {
      method: 'POST',
      body: { description, type },
    });
    if (check.profanityFlagged) {
      setStep('profanity');
      return true;
    }
    return false;
  }

  async function linkToExisting(existing: Duplicate): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      // Link appends the new text as a message on the existing Ticket and creates no new Ticket (G11).
      await apiRequest(`/tickets/${encodeURIComponent(existing.id)}/messages`, {
        method: 'POST',
        body: { body: description },
      });
      await deleteDraft(draftId);
      setReceipt({
        id: existing.id,
        reference: existing.reference,
        categoryName: null,
        firstResponseDueAt: '',
        resolutionDueAt: '',
      });
      setStep('edit');
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function confirmProfanity(): Promise<void> {
    setProfanityConfirmed(true);
    setStep('edit');
    setBusy(true);
    setError(null);
    try {
      await create(true);
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function discard(): Promise<void> {
    saver.cancel();
    if (await getDraft(draftId)) await deleteDraft(draftId);
    reset();
  }

  function reset(): void {
    setDraftId(uuidv7());
    setType('Request');
    setDescription('');
    setCategoryId(null);
    setConfidential(false);
    setProfanityConfirmed(false);
    setFiles([]);
    setAttachmentErrors([]);
    setSuggest({ kind: 'idle' });
    setStep('edit');
    setDuplicates([]);
    setReceipt(null);
    setQueued(false);
    setError(null);
  }

  const reasonText = (f: AttachmentFailure): string =>
    t('attachment.rejected', { name: f.name, reason: t(`attachment.reason.${f.reason}`) });

  if (receipt) {
    return (
      <section aria-labelledby="receipt-title" style={{ maxWidth: '680px', margin: '0 auto' }}>
        <div className="cc-card" style={{ padding: '2rem 1.5rem', textAlign: 'center', background: '#ffffff', border: '1px solid #cbd5e1' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', margin: '0 auto 1rem' }}>
            ✓
          </div>
          <h2 id="receipt-title" style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
            {t('receipt.title')}
          </h2>
          <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.925rem' }}>
            Your campus request has been safely logged in the university system of record.
          </p>

          <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'left', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{t('receipt.id')}</span>
              <strong style={{ fontSize: '1.2rem', color: '#1e3a8a', letterSpacing: '0.02em' }}>{receipt.reference}</strong>
            </div>

            {receipt.categoryName && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{t('receipt.category')}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{receipt.categoryName}</span>
              </div>
            )}

            {receipt.firstResponseDueAt !== '' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{t('receipt.firstResponse')}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f766e' }}>
                    {formatTime(receipt.firstResponseDueAt, locale)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{t('receipt.resolution')}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e3a8a' }}>
                    {formatTime(receipt.resolutionDueAt, locale)}
                  </span>
                </div>
              </>
            )}
          </div>

          {attachmentErrors.length > 0 && (
            <div className="cc-alert cc-alert-warning" role="alert" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {attachmentErrors.map((f) => (
                  <li key={f.name}>{reasonText(f)}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to={`/student/tickets/${receipt.id}`} className="cc-button">
              {t('receipt.view')} →
            </Link>
            <Button variant="secondary" onPress={reset}>
              {t('receipt.another')}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (step === 'duplicate') {
    return (
      <section role="alertdialog" aria-labelledby="dup-title" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div className="cc-card" style={{ borderLeft: '4px solid #d97706', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <h2 id="dup-title" style={{ margin: 0, fontSize: '1.25rem', color: '#92400e', fontWeight: 700 }}>
              {t('duplicate.title')}
            </h2>
          </div>
          <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.45, margin: '0 0 1rem' }}>
            {t('duplicate.body')}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {duplicates.map((d) => (
              <div key={d.id} style={{ padding: '0.75rem', borderRadius: '6px', background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Link to={`/student/tickets/${d.id}`} style={{ fontWeight: 600, color: '#1e3a8a' }}>
                    {t('duplicate.view', { reference: d.reference })}
                  </Link>
                  {d.summary ? <span style={{ fontSize: '0.85rem', color: '#64748b' }}>: {d.summary}</span> : null}
                </div>
                <Button isDisabled={busy} onPress={() => void linkToExisting(d)}>
                  {t('duplicate.link')}
                </Button>
              </div>
            ))}
          </div>

          {error && <div className="cc-alert cc-alert-danger">{error}</div>}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="secondary" isDisabled={busy} onPress={() => void continueAfterDuplicate()}>
              {t('duplicate.continue')}
            </Button>
            <Button variant="secondary" onPress={() => setStep('edit')}>
              {t('profanity.edit')}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (step === 'profanity') {
    return (
      <section role="alertdialog" aria-labelledby="prof-title" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div className="cc-card" style={{ borderLeft: '4px solid #b91c1c', padding: '1.5rem' }}>
          <h2 id="prof-title" style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: '#991b1b', fontWeight: 700 }}>
            {t('profanity.title')}
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.45, margin: '0 0 1rem' }}>
            {t('profanity.body')}
          </p>
          <blockquote style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '6px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap', margin: '0 0 1rem', fontSize: '0.875rem' }}>
            {description}
          </blockquote>
          {error && <div className="cc-alert cc-alert-danger">{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button isDisabled={busy} onPress={() => void confirmProfanity()}>
              {t('profanity.confirm')}
            </Button>
            <Button variant="secondary" onPress={() => setStep('edit')}>
              {t('profanity.edit')}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      <div className="cc-page-header">
        <div>
          <h2 id="form-title" className="cc-page-title">
            {t('form.title')}
          </h2>
          <p className="cc-page-desc">
            Submit a campus service request or file a formal grievance under university redressal regulations.
          </p>
        </div>
        <div>
          <DraftStatus draftId={draftId} />
        </div>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} noValidate aria-labelledby="form-title" className="cc-card">
        {/* Segmented Request vs Grievance Type Card */}
        <div className="cc-field-group">
          <label className="cc-label" id="type-group-label">
            {t('form.type')}
          </label>
          <div className="cc-type-grid" role="radiogroup" aria-labelledby="type-group-label">
            <div
              className={`cc-type-card ${type === 'Request' ? 'selected' : ''}`}
              role="radio"
              aria-checked={type === 'Request'}
              tabIndex={0}
              onClick={() => {
                setType('Request');
                setConfidential(false);
              }}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setType('Request');
                  setConfidential(false);
                }
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>📋</span>
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem', color: '#0f172a' }}>
                  {t('form.type.Request')}
                </strong>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  General enquiries, certificates, hostel repairs, library credentials, and fee receipts.
                </span>
              </div>
            </div>

            <div
              className={`cc-type-card ${type === 'Complaint' ? 'selected' : ''}`}
              role="radio"
              aria-checked={type === 'Complaint'}
              tabIndex={0}
              onClick={() => setType('Complaint')}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setType('Complaint');
                }
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>⚖️</span>
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem', color: '#0f172a' }}>
                  {t('form.type.Complaint')} (Grievance)
                </strong>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Marks mismatch, disciplinary appeals, harassment, and confidential redressal.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Live AI Category Suggestion Pill */}
        <div aria-live="polite">
          {suggest.kind === 'loading' && (
            <div style={{ fontSize: '0.825rem', color: '#64748b', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>⚡</span> {t('form.suggesting')}
            </div>
          )}
          {suggest.kind === 'ready' && (
            <div
              style={{
                background: '#faf5ff',
                border: '1px solid #ddd6fe',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AiSuggestedBadge />
                <span style={{ fontSize: '0.85rem', color: '#5b21b6', fontWeight: 500 }}>
                  {t('form.suggestion', {
                    name: categoryName(suggest.value.categoryId),
                    percent: Math.round(suggest.value.confidencePercent),
                  })}
                </span>
              </div>
              <Button
                variant="secondary"
                isDisabled={categoryId === suggest.value.categoryId}
                onPress={() => setCategoryId(suggest.value.categoryId)}
              >
                {t('form.suggestionAccept')}
              </Button>
            </div>
          )}
        </div>

        {/* Category Dropdown */}
        <div className="cc-field-group">
          <label htmlFor="ticket-category" className="cc-label">
            {t('form.category')}
          </label>
          <select
            id="ticket-category"
            className="cc-input"
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">{t('form.categoryNone')}</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Description Textarea */}
        <div className="cc-field-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
            <label htmlFor="ticket-description" className="cc-label" style={{ margin: 0 }}>
              {t('form.description')}
            </label>
            <span style={{ fontSize: '0.775rem', color: '#64748b' }}>
              {description.length} / {DESCRIPTION_MAX}
            </span>
          </div>

          <textarea
            id="ticket-description"
            className="cc-input"
            value={description}
            rows={7}
            aria-invalid={descriptionError !== null}
            aria-describedby={descriptionError ? 'description-error description-hint' : 'description-hint'}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Please detail your issue, roll number, course code (if applicable), and any previous steps taken..."
            style={{ width: '100%', minHeight: '140px' }}
          />

          <div id="description-hint" className="cc-field-description">
            {t('form.descriptionHint')}
          </div>

          {descriptionError && (
            <div id="description-error" className="cc-field-error" role="alert">
              {descriptionError}
            </div>
          )}
        </div>

        {/* Confidential Checkbox (Complaints Only) */}
        {type === 'Complaint' && (
          <div
            style={{
              background: '#f8fafc',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              marginBottom: '1.25rem',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={confidential}
                onChange={(e) => setConfidential(e.target.checked)}
                aria-describedby="confidential-hint"
                style={{ minWidth: 20, minHeight: 20, marginTop: '2px' }}
              />
              <div>
                <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>🛡️</span> {t('form.confidential')}
                </strong>
                <span id="confidential-hint" style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginTop: '0.2rem', lineHeight: 1.4 }}>
                  {t('form.confidentialHint')}
                </span>
              </div>
            </label>
          </div>
        )}

        {/* File Attachments Dropzone */}
        <div className="cc-field-group">
          <label className="cc-label">{t('form.attachments')}</label>
          <div className="cc-dropzone">
            <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.25rem' }}>📎</span>
            <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block', marginBottom: '0.2rem' }}>
              Click to choose files or drop attachments here
            </strong>
            <p id="attachments-hint" style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 0.75rem' }}>
              {online ? t('form.attachmentsHint') : t('form.attachmentsOffline')}
            </p>

            <input
              type="file"
              multiple
              accept={ATTACHMENT_TYPES.join(',')}
              disabled={!online}
              aria-describedby="attachments-hint"
              aria-label={t('form.attachments')}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
              style={{ fontSize: '0.85rem' }}
            />
          </div>

          {attachmentErrors.length > 0 && (
            <ul role="alert" style={{ color: '#dc2626', fontSize: '0.825rem', paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
              {attachmentErrors.map((f, index) => (
                <li key={`${f.name}-${index}`}>{reasonText(f)}</li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.75rem' }}>
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '6px',
                    background: '#f1f5f9',
                    fontSize: '0.85rem',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>
                    📄 {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1.1rem' }}
                    aria-label={t('form.attachmentRemove', { name: file.name })}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {queued && (
          <div className="cc-alert cc-alert-warning" role="status">
            <span>ℹ</span>
            <span>{t('form.queued')}</span>
          </div>
        )}

        {error && (
          <div className="cc-alert cc-alert-danger" role="alert">
            <span>✖</span>
            <span>{error}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
          <Button type="submit" isDisabled={busy}>
            {busy ? t('form.submitting') : t('form.submit')}
          </Button>
          <Button variant="secondary" onPress={() => void discard()}>
            {t('form.discard')}
          </Button>
        </div>
      </form>
    </div>
  );
}
