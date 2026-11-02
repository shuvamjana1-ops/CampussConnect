// Local safety lexicon matcher (Requirement 5.6). Pure, no I/O.

export type SafetyCategory = 'harassment' | 'self_harm' | 'physical_danger';

export interface SafetySignal {
  readonly matched: true;
  readonly categories: readonly SafetyCategory[];
}

const CHAR_SUBSTITUTIONS: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
};

const LEXICON: Readonly<Record<SafetyCategory, readonly string[]>> = {
  self_harm: [
    'kill myself',
    'end my life',
    'end it all',
    'want to die',
    'wanna die',
    'commit suicide',
    'suicide',
    'suicidal',
    'hurt myself',
    'harm myself',
    'self harm',
    'cut myself',
    'no reason to live',
    'jaan dena chahta',
    'jaan dena chahti',
    'jaan de dunga',
    'jaan de dungi',
    'mar jana chahta',
    'mar jana chahti',
    'marna chahta',
    'marna chahti',
    'khudkushi',
    'aatmahatya',
    'suicide karna',
    'khud ko khatam',
    'zindagi khatam',
    'जान देना चाहता',
    'जान देना चाहती',
    'मरना चाहता',
    'मरना चाहती',
    'आत्महत्या',
    'खुदकुशी',
    'खुद को खत्म',
    'ज़िंदगी खत्म',
    'जिंदगी खत्म',
  ],
  harassment: [
    'harass',
    'harassed',
    'harassing',
    'harassment',
    'sexually assaulted',
    'sexual assault',
    'molest',
    'molested',
    'stalking me',
    'stalked',
    'being stalked',
    'ragging',
    'ragged',
    'bullying',
    'bullied',
    'blackmail',
    'blackmailing',
    'threatening me',
    'threatened me',
    'touched me inappropriately',
    'inappropriate touching',
    'eve teasing',
    'tang kar raha',
    'tang kar rahi',
    'pareshan kar raha',
    'pareshan kar rahi',
    'dhamki de raha',
    'dhamki de rahi',
    'chedkhani',
    'blackmail kar',
    'परेशान कर रहा',
    'परेशान कर रही',
    'छेड़छाड़',
    'छेड़खानी',
    'उत्पीड़न',
    'धमकी दे रहा',
    'धमकी दे रही',
    'रैगिंग',
  ],
  physical_danger: [
    'fire in',
    'on fire',
    'caught fire',
    'gas leak',
    'electric shock',
    'electrocuted',
    'unsafe',
    'in danger',
    'life threatening',
    'life in danger',
    'being attacked',
    'attacked me',
    'beat me',
    'beating me',
    'has a weapon',
    'has a knife',
    'has a gun',
    'bleeding',
    'unconscious',
    'building collapse',
    'ceiling collapse',
    'medical emergency',
    'need ambulance',
    'aag lag',
    'aag lagi',
    'khatre mein',
    'jaan ko khatra',
    'jaan khatre',
    'maar raha',
    'maar rahe',
    'marpeet',
    'hathiyar',
    'bijli ka jhatka',
    'behosh',
    'khoon beh',
    'आग लग',
    'खतरे में',
    'जान को खतरा',
    'मार रहा',
    'मार रहे',
    'मारपीट',
    'हथियार',
    'बिजली का झटका',
    'बेहोश',
    'खून बह',
  ],
};

/** Lowercase, apply NFKC, map look-alike characters, strip punctuation and collapse whitespace. */
export function normaliseForSafety(text: string): string {
  const lowered = text.normalize('NFKC').toLowerCase();
  let out = '';
  for (const ch of lowered) {
    out += CHAR_SUBSTITUTIONS[ch] ?? ch;
  }
  return out
    .replace(/(.)\1{2,}/gu, '$1$1') // "suiciiide" style stretching
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

// Normalise phrases the same way as the input; pad with spaces so phrases match on word boundaries
// (Devanagari phrases may be stems, so they match as prefixes of words via the leading boundary only).
const COMPILED: ReadonlyArray<readonly [SafetyCategory, readonly string[]]> = (
  Object.keys(LEXICON) as SafetyCategory[]
).map((category) => [
  category,
  LEXICON[category].map((p) => ` ${normaliseForSafety(p)}`),
]);

/**
 * Returns the matched safety categories for the text, or null when nothing matches.
 * Case, spacing, punctuation and common character substitutions (e.g. "su1c1de") are normalised.
 */
export function safetySignal(text: string): SafetySignal | null {
  const haystack = ` ${normaliseForSafety(text)} `;
  const compact = ` ${normaliseForSafety(text).replace(/ /gu, '')} `;
  const categories: SafetyCategory[] = [];
  for (const [category, phrases] of COMPILED) {
    const hit = phrases.some((phrase) => {
      if (haystack.includes(phrase)) return true;
      // Catch spaced-out letters such as "s u i c i d e" by comparing without spaces.
      const squeezed = phrase.replace(/ /gu, '');
      return squeezed.length >= 7 && compact.includes(squeezed);
    });
    if (hit) categories.push(category);
  }
  return categories.length > 0 ? { matched: true, categories } : null;
}
