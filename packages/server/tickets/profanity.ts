// English, Hindi and Hinglish profanity detection with normalisation (3.11, 3.12). Runs locally, no AI dependency.
// Normalisation folds case, common character substitutions, separators between letters and repeated letters,
// so "F.u.c.k", "fuuuck" and "sh1t" are all flagged.

/** Romanised words (English and Hinglish), already in normalised form (lower case, no repeated letters). */
const ROMAN_WORDS: readonly string[] = [
  // English
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cunt', 'slut', 'whore', 'piss', 'crap', 'motherfucker',
  // Hinglish
  'madarchod', 'behenchod', 'bhenchod', 'chutiya', 'chutiye', 'gandu', 'gaandu', 'harami', 'haramkhor', 'haramzada',
  'randi', 'bhosdike', 'bhosadike', 'lund', 'loda', 'lavda', 'kamina', 'kamine', 'saala', 'kutta', 'kutti', 'bhadwa',
  'bhadwe', 'maderchod', 'betichod', 'chod', 'gaand', 'jhatu', 'tatti', 'launda',
].map((word) => collapseRepeats(word));

/** Devanagari words (Hindi). Matched as substrings of the Devanagari-only text. */
const DEVANAGARI_WORDS: readonly string[] = [
  'मादरचोद', 'बहनचोद', 'चूतिया', 'चुतिया', 'गांडू', 'हरामी', 'हरामखोर', 'हरामज़ादा', 'रंडी', 'भोसड़ी', 'लौड़ा', 'कमीना',
  'कुत्ता', 'कुतिया', 'भड़वा', 'साला', 'बेटीचोद',
];

const SUBSTITUTIONS: Readonly<Record<string, string>> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't', '¡': 'i', '€': 'e',
};

/** Words that are only flagged as whole tokens, because they occur inside ordinary words. */
const WHOLE_TOKEN_ONLY = new Set(['dick', 'piss', 'crap', 'chod', 'lund', 'loda', 'saala', 'tatti', 'gaand', 'randi'].map(collapseRepeats));

function collapseRepeats(text: string): string {
  return text.replace(/(.)\1+/gu, '$1');
}

function fold(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFKD').toLowerCase()) {
    if (/\p{M}/u.test(ch) && !/[\u0900-\u097F]/u.test(ch)) continue; // strip Latin accents, keep Devanagari marks
    out += SUBSTITUTIONS[ch] ?? ch;
  }
  return out;
}

/** The normalised form used for matching: folded, then repeated letters collapsed. */
export function normaliseForProfanity(text: string): string {
  return collapseRepeats(fold(text));
}

/** Returns the distinct flagged words found in the text (normalised form). Empty when the text is clean. */
export function findProfanity(text: string): string[] {
  const found = new Set<string>();
  const folded = fold(text.normalize('NFC'));

  // Devanagari: substring match on the original script (Hindi has no case or letter substitutions).
  const devanagari = text.normalize('NFC');
  for (const word of DEVANAGARI_WORDS) {
    if (devanagari.includes(word)) found.add(word);
  }

  // Whole-token match.
  const tokens = folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(collapseRepeats);
  const tokenSet = new Set(tokens);
  for (const word of ROMAN_WORDS) {
    if (tokenSet.has(word)) found.add(word);
  }

  // Obfuscation: separators inside a word ("f.u.c.k", "f u c k") and words embedded in a longer token.
  const squashed = collapseRepeats(folded.replace(/[^\p{L}]+/gu, ''));
  const spaced = collapseRepeats(
    folded.replace(/(?<=\p{L})[\s._*\-]+(?=\p{L})/gu, (m) => (m.length === 1 && m === ' ' ? ' ' : '')),
  );
  for (const word of ROMAN_WORDS) {
    if (found.has(word) || WHOLE_TOKEN_ONLY.has(word)) continue;
    if (tokens.some((token) => token.includes(word)) || (word.length >= 5 && squashed.includes(word))) {
      found.add(word);
    }
  }
  // Single-letter-separated spelling ("f u c k") for whole-token-only words as well.
  for (const word of ROMAN_WORDS) {
    if (found.has(word)) continue;
    if (new RegExp(`(^|[^\\p{L}])${word.split('').join('[\\s._*\\-]*')}([^\\p{L}]|$)`, 'u').test(spaced)) found.add(word);
  }
  return [...found];
}

export function containsProfanity(text: string): boolean {
  return findProfanity(text).length > 0;
}
