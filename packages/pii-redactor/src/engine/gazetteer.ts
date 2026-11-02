import RE2 from 're2';
import type { RedactionSpan } from '../pii-types.ts';
import type { GazetteerName } from '../providers.ts';
import { findAll } from './scan.ts';

/** A word: letters and combining marks (Latin, Devanagari and other scripts), plus ZWNJ and ZWJ. */
const TOKEN = new RE2('[\\p{L}\\p{M}\u200C\u200D]+', 'g');
/** Characters allowed between two words of one name: spaces, dots, hyphens and apostrophes. */
const NAME_GAP_CHARS = ' \t.-\'’';
const MAX_NAME_GAP = 3;

interface Token {
  readonly key: string;
  readonly start: number;
  readonly end: number;
}

interface TrieNode {
  readonly next: Map<string, TrieNode>;
  terminal: boolean;
}

export interface GazetteerMatcher {
  find(view: string): RedactionSpan[];
}

/**
 * Comparison key of one word: NFC, lower case, nukta and joiners removed, chandrabindu folded into
 * anusvara, so common Devanagari spelling variants ("गाँधी" and "गांधी") match.
 */
export function tokenKey(word: string): string {
  return word
    .normalize('NFC')
    .toLowerCase()
    .replaceAll('\u093C', '')
    .replaceAll('\u200C', '')
    .replaceAll('\u200D', '')
    .replaceAll('\u0901', '\u0902');
}

function tokenize(text: string): Token[] {
  return findAll(TOKEN, text).map(({ start, end }) => ({ key: tokenKey(text.slice(start, end)), start, end }));
}

function insert(root: TrieNode, keys: readonly string[]): void {
  let node = root;
  for (const key of keys) {
    let child = node.next.get(key);
    if (child === undefined) {
      child = { next: new Map(), terminal: false };
      node.next.set(key, child);
    }
    node = child;
  }
  node.terminal = true;
}

function isNameGap(view: string, from: number, to: number): boolean {
  if (to - from < 1 || to - from > MAX_NAME_GAP) {
    return false;
  }
  for (let i = from; i < to; i += 1) {
    if (!NAME_GAP_CHARS.includes(view.charAt(i))) {
      return false;
    }
  }
  return true;
}

/**
 * Builds a word trie from the directory names. Each Latin and Devanagari form is added as written, and
 * a form with three or more words is also added as first and last word ("Rahul Kumar Sharma" also
 * matches "Rahul Sharma"). Matching is case-insensitive and needs every word of a form.
 */
export function buildGazetteerMatcher(names: readonly GazetteerName[]): GazetteerMatcher {
  const root: TrieNode = { next: new Map(), terminal: false };
  const addForm = (form: string | undefined): void => {
    if (form === undefined) {
      return;
    }
    const keys = tokenize(form).map((token) => token.key);
    const first = keys[0];
    const last = keys.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }
    insert(root, keys);
    if (keys.length >= 3) {
      insert(root, [first, last]);
    }
  };
  for (const name of names) {
    addForm(name.latin);
    addForm(name.devanagari);
  }
  return { find: (view) => findNames(root, view) };
}

function findNames(root: TrieNode, view: string): RedactionSpan[] {
  const tokens = tokenize(view);
  const spans: RedactionSpan[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const first = tokens[i];
    if (first === undefined) {
      continue;
    }
    let node = root.next.get(first.key);
    let current = first;
    let matchEnd = -1;
    for (let j = i + 1; node !== undefined; j += 1) {
      if (node.terminal) {
        matchEnd = current.end;
      }
      const following = tokens[j];
      if (following === undefined || !isNameGap(view, current.end, following.start)) {
        break;
      }
      node = node.next.get(following.key);
      current = following;
    }
    if (matchEnd > first.start) {
      spans.push({ type: 'NAME', start: first.start, end: matchEnd });
    }
  }
  return spans;
}
