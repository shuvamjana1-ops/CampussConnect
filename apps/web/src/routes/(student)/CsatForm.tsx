import { Button } from '@campusconnect/ui';
import { useState, type FormEvent } from 'react';
import { useOnline } from '../../pwa/DraftStatus';
import { CSAT_COMMENT_MAX, describeError, fieldErrors, useT } from './api';

export interface CsatValues {
  readonly score: number;
  readonly comment: string;
}

const RATING_DESCRIPTIONS: Readonly<Record<number, string>> = {
  1: '1 - Poor (Issue unresolved or unsatisfactory)',
  2: '2 - Fair (Resolution was delayed or partial)',
  3: '3 - Satisfactory (Met expected standard)',
  4: '4 - Very Good (Prompt and clear resolution)',
  5: '5 - Excellent (Exceeded expectations)',
};

/**
 * CSAT form: integer score 1 to 5 and an optional comment up to 1,000 characters (20.8, 20.9).
 * Values stay in the form on any error, and offline the submit is blocked with a "needs connection" message (20.3).
 */
export function CsatForm({
  submitLabel,
  onSubmit,
}: {
  readonly submitLabel?: string;
  readonly onSubmit: (values: CsatValues) => Promise<void>;
}) {
  const t = useT();
  const [score, setScore] = useState<number | null>(null);
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const online = useOnline();

  const commentLength = Array.from(comment).length;
  const activeScore = hoverScore ?? score;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setSaved(false);
    const scoreProblem = score === null || !Number.isInteger(score) || score < 1 || score > 5;
    const commentProblem = commentLength > CSAT_COMMENT_MAX;
    setScoreError(scoreProblem ? t('csat.scoreInvalid') : null);
    setCommentError(commentProblem ? t('csat.commentInvalid') : null);
    if (scoreProblem || commentProblem) return;
    if (!online) {
      setFormError(t('needsConnection'));
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ score, comment });
      setSaved(true);
    } catch (error) {
      const fields = fieldErrors(error);
      setScoreError(fields.some((f) => f.path.endsWith('score')) ? t('csat.scoreInvalid') : null);
      setCommentError(fields.some((f) => f.path.endsWith('comment')) ? t('csat.commentInvalid') : null);
      setFormError(describeError(error, t));
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div
        role="status"
        style={{
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          padding: '1rem',
          borderRadius: '8px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '1.5rem', color: '#059669', marginBottom: '0.25rem' }}>✓</div>
        <strong style={{ fontSize: '0.95rem', color: '#065f46' }}>{t('csat.saved')}</strong>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.825rem', color: '#047857' }}>
          Your rating ({String(score)}/5 stars) and feedback have been cryptographically audited in institutional metrics.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        void submit(e);
      }}
      noValidate
      aria-labelledby="csat-title"
    >
      <h3 id="csat-title" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: '#0f172a' }}>
        {t('csat.title')}
      </h3>
      <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0 0 0.75rem' }}>
        Help improve department service standards. Your rating is shared with the University Quality Assurance Cell.
      </p>

      {/* Interactive 5-Star Rating Widget */}
      <fieldset
        style={{ border: 'none', padding: 0, margin: '0 0 1rem' }}
        aria-describedby={scoreError ? 'csat-score-error' : undefined}
      >
        <legend style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
          {t('csat.score')} *
        </legend>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onMouseEnter={() => {
                setHoverScore(star);
              }}
              onMouseLeave={() => {
                setHoverScore(null);
              }}
              onClick={() => {
                setScore(star);
                setScoreError(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.85rem',
                lineHeight: 1,
                padding: '0.2rem',
                color: activeScore !== null && star <= activeScore ? '#f59e0b' : '#cbd5e1',
                transition: 'transform 0.12s ease, color 0.12s ease',
                transform: activeScore !== null && star <= activeScore ? 'scale(1.15)' : 'scale(1)',
              }}
              aria-label={t('csat.star', { n: String(star) })}
            >
              ★
            </button>
          ))}
          {activeScore !== null && (
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#475569', marginLeft: '0.5rem' }}>
              {RATING_DESCRIPTIONS[activeScore]}
            </span>
          )}
        </div>
        {scoreError && (
          <p id="csat-score-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
            {scoreError}
          </p>
        )}
      </fieldset>

      {/* Feedback Comment Textarea with Real-Time Character Counter */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <label htmlFor="csat-comment" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            {t('csat.comment')}
          </label>
          <span
            style={{
              fontSize: '0.75rem',
              color: commentLength > 900 ? '#b91c1c' : '#64748b',
              fontWeight: commentLength > 900 ? 700 : 500,
            }}
          >
            {commentLength} / {CSAT_COMMENT_MAX}
          </span>
        </div>
        <textarea
          id="csat-comment"
          className="cc-input"
          value={comment}
          rows={4}
          aria-invalid={commentError !== null}
          aria-describedby={commentError ? 'csat-comment-error' : undefined}
          onChange={(e) => {
            setComment(e.target.value);
            if (commentError) setCommentError(null);
          }}
          placeholder="Share your experience with the department handling officer, response timeliness, or resolution quality..."
          style={{ width: '100%', resize: 'vertical' }}
        />
        {commentError && (
          <p id="csat-comment-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
            {commentError}
          </p>
        )}
      </div>

      {formError && (
        <div className="cc-alert cc-alert-danger" role="alert" style={{ marginBottom: '1rem' }}>
          <span>✖</span>
          <span>{formError}</span>
        </div>
      )}

      <Button type="submit" isDisabled={busy}>
        {busy ? 'Submitting…' : (submitLabel ?? t('csat.submit'))}
      </Button>
    </form>
  );
}
