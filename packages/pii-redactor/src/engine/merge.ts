import { placeholderFor, typePriority, type RedactionSpan } from '../pii-types.ts';

function length(span: RedactionSpan): number {
  return span.end - span.start;
}

/** True when `a` decides the type of a merged span over `b`: the longer span wins, then type priority. */
function outranks(a: RedactionSpan, b: RedactionSpan): boolean {
  return length(a) > length(b) || (length(a) === length(b) && typePriority(a.type) < typePriority(b.type));
}

/**
 * Merges overlapping candidate spans. Each group of overlapping candidates becomes one span covering
 * their union, so no detected character is left unredacted; the group's type is that of its longest
 * candidate, ties broken by the fixed type priority. Touching spans stay separate. Returns spans sorted
 * by start with no overlaps.
 */
export function mergeSpans(candidates: readonly RedactionSpan[]): RedactionSpan[] {
  const sorted = candidates.filter((span) => span.end > span.start).sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: RedactionSpan[] = [];
  let group: { start: number; end: number; winner: RedactionSpan } | undefined;
  for (const candidate of sorted) {
    if (group !== undefined && candidate.start < group.end) {
      group.end = Math.max(group.end, candidate.end);
      if (outranks(candidate, group.winner)) {
        group.winner = candidate;
      }
      continue;
    }
    if (group !== undefined) {
      merged.push({ type: group.winner.type, start: group.start, end: group.end });
    }
    group = { start: candidate.start, end: candidate.end, winner: candidate };
  }
  if (group !== undefined) {
    merged.push({ type: group.winner.type, start: group.start, end: group.end });
  }
  return merged;
}

/**
 * Replaces each span with its `[PII:TYPE]` placeholder, working from the last span to the first so the
 * offsets of earlier spans stay valid. `spans` must be sorted by start and must not overlap.
 */
export function replaceSpans(text: string, spans: readonly RedactionSpan[]): string {
  const parts: string[] = [];
  let cursor = text.length;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i];
    if (span === undefined) {
      continue;
    }
    if (span.end > cursor || span.start < 0 || span.start >= span.end) {
      throw new RangeError('Spans must be sorted, within the text and must not overlap');
    }
    parts.push(text.slice(span.end, cursor), placeholderFor(span.type));
    cursor = span.start;
  }
  parts.push(text.slice(0, cursor));
  return parts.reverse().join('');
}
