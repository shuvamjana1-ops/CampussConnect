import { Button } from '@campusconnect/ui';
import { useState, type FormEvent } from 'react';
import { useOnline } from '../../pwa/DraftStatus';
import { CSAT_COMMENT_MAX, describeError, fieldErrors, useT } from './api';

export interface CsatValues {
  readonly score: number;
  readonly comment: string;
}

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
  const online = useOnline();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setSaved(false);
    const scoreProblem = score === null || !Number.isInteger(score) || score < 1 || score > 5;
    const commentProblem = [...comment].length > CSAT_COMMENT_MAX;
    setScoreError(scoreProblem ? t('csat.scoreInvalid') : null);
    setCommentError(commentProblem ? t('csat.commentInvalid') : null);
    if (scoreProblem || commentProblem || score === null) return;
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

  if (saved) return <p role="status">{t('csat.saved')}</p>;

  return (
    <form onSubmit={(e) => void submit(e)} noValidate aria-labelledby="csat-title">
      <h3 id="csat-title">{t('csat.title')}</h3>
      <fieldset aria-describedby={scoreError ? 'csat-score-error' : undefined}>
        <legend>{t('csat.score')}</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} style={{ marginInlineEnd: '1rem' }}>
            <input
              type="radio"
              name="csat-score"
              value={n}
              checked={score === n}
              aria-invalid={scoreError !== null}
              onChange={() => setScore(n)}
              style={{ minWidth: 24, minHeight: 24 }}
            />{' '}
            <span aria-label={t('csat.star', { n })}>{n}</span>
          </label>
        ))}
        {scoreError && (
          <p id="csat-score-error" role="alert">
            {scoreError}
          </p>
        )}
      </fieldset>
      <p>
        <label htmlFor="csat-comment">{t('csat.comment')}</label>
        <br />
        <textarea
          id="csat-comment"
          value={comment}
          rows={4}
          aria-invalid={commentError !== null}
          aria-describedby={commentError ? 'csat-comment-error' : undefined}
          onChange={(e) => setComment(e.target.value)}
          style={{ width: '100%', maxWidth: 480 }}
        />
      </p>
      {commentError && (
        <p id="csat-comment-error" role="alert">
          {commentError}
        </p>
      )}
      {formError && <p role="alert">{formError}</p>}
      <Button type="submit" isDisabled={busy}>
        {submitLabel ?? t('csat.submit')}
      </Button>
    </form>
  );
}
