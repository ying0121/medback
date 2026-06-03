import type { ElevenLabsVoice } from "@/lib/api";

export type VoiceFilterKey = "language" | "gender" | "age" | "accent" | "category";

export type VoiceFilters = Record<VoiceFilterKey, string>;

export const VOICE_FILTER_ALL = "all";

export const EMPTY_VOICE_FILTERS: VoiceFilters = {
  language: VOICE_FILTER_ALL,
  gender: VOICE_FILTER_ALL,
  age: VOICE_FILTER_ALL,
  accent: VOICE_FILTER_ALL,
  category: VOICE_FILTER_ALL,
};

/** Common languages for quick filter (also supplemented by voices in the account). */
export const VOICE_LANGUAGE_PRESETS: { value: string; label: string }[] = [
  { value: "english", label: "English" },
  { value: "spanish", label: "Spanish" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "italian", label: "Italian" },
  { value: "portuguese", label: "Portuguese" },
  { value: "japanese", label: "Japanese" },
  { value: "chinese", label: "Chinese" },
  { value: "korean", label: "Korean" },
  { value: "arabic", label: "Arabic" },
  { value: "hindi", label: "Hindi" },
  { value: "dutch", label: "Dutch" },
  { value: "polish", label: "Polish" },
  { value: "turkish", label: "Turkish" },
  { value: "russian", label: "Russian" },
];

const LANGUAGE_ALIASES: Record<string, string[]> = {
  english: ["en", "english", "en-us", "en-gb", "en-au", "en-in"],
  spanish: ["es", "spanish", "es-es", "es-mx", "es-419"],
  french: ["fr", "french", "fr-fr", "fr-ca"],
  german: ["de", "german", "de-de"],
  italian: ["it", "italian", "it-it"],
  portuguese: ["pt", "portuguese", "pt-br", "pt-pt"],
  japanese: ["ja", "japanese", "ja-jp"],
  chinese: ["zh", "chinese", "zh-cn", "zh-tw", "mandarin", "cantonese"],
  korean: ["ko", "korean", "ko-kr"],
  arabic: ["ar", "arabic", "ar-sa"],
  hindi: ["hi", "hindi", "hi-in"],
  dutch: ["nl", "dutch", "nl-nl"],
  polish: ["pl", "polish", "pl-pl"],
  turkish: ["tr", "turkish", "tr-tr"],
  russian: ["ru", "russian", "ru-ru"],
};

function normalizeToken(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Collect searchable language-related tokens from a voice. */
export function getVoiceLanguageTokens(v: ElevenLabsVoice): string[] {
  const tokens = new Set<string>();
  const add = (raw?: string | null) => {
    const t = normalizeToken(raw || "");
    if (t) tokens.add(t);
  };

  add(v.language);
  add(v.labels?.language);
  if (Array.isArray(v.verified_languages)) {
    for (const entry of v.verified_languages) {
      add(entry.language);
      add(entry.locale);
      add(entry.accent);
    }
  }

  return [...tokens];
}

export function voiceMatchesLanguage(v: ElevenLabsVoice, filterLanguage: string): boolean {
  if (!filterLanguage || filterLanguage === VOICE_FILTER_ALL) return true;
  const needle = normalizeToken(filterLanguage);
  const tokens = getVoiceLanguageTokens(v);
  const aliases = LANGUAGE_ALIASES[needle] || [needle];

  return tokens.some((token) =>
    aliases.some(
      (alias) =>
        token === alias ||
        token.includes(alias) ||
        alias.includes(token)
    )
  );
}

function labelValue(v: ElevenLabsVoice, key: string): string {
  return normalizeToken(v.labels?.[key] || "");
}

export function voiceMatchesGender(v: ElevenLabsVoice, filterGender: string): boolean {
  if (!filterGender || filterGender === VOICE_FILTER_ALL) return true;
  const g = labelValue(v, "gender");
  return g === normalizeToken(filterGender) || g.includes(normalizeToken(filterGender));
}

export function voiceMatchesAge(v: ElevenLabsVoice, filterAge: string): boolean {
  if (!filterAge || filterAge === VOICE_FILTER_ALL) return true;
  const age = labelValue(v, "age");
  const needle = normalizeToken(filterAge);
  return age === needle || age.includes(needle) || needle.includes(age);
}

export function voiceMatchesAccent(v: ElevenLabsVoice, filterAccent: string): boolean {
  if (!filterAccent || filterAccent === VOICE_FILTER_ALL) return true;
  const needle = normalizeToken(filterAccent);
  const accents = [
    labelValue(v, "accent"),
    ...(v.verified_languages || []).map((e) => normalizeToken(e.accent)),
  ].filter(Boolean);
  return accents.some((a) => a === needle || a.includes(needle) || needle.includes(a));
}

export function voiceMatchesCategory(v: ElevenLabsVoice, filterCategory: string): boolean {
  if (!filterCategory || filterCategory === VOICE_FILTER_ALL) return true;
  const cat = normalizeToken(v.category);
  const needle = normalizeToken(filterCategory);
  return cat === needle || cat.includes(needle);
}

export function voiceMatchesSearch(v: ElevenLabsVoice, query: string): boolean {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;

  const parts = [
    v.name,
    v.category,
    v.description,
    v.language,
    ...Object.values(v.labels || {}),
    ...getVoiceLanguageTokens(v),
  ];

  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(q);
}

export function filterVoices(
  voices: ElevenLabsVoice[],
  search: string,
  filters: VoiceFilters
): ElevenLabsVoice[] {
  return voices.filter(
    (v) =>
      voiceMatchesSearch(v, search) &&
      voiceMatchesLanguage(v, filters.language) &&
      voiceMatchesGender(v, filters.gender) &&
      voiceMatchesAge(v, filters.age) &&
      voiceMatchesAccent(v, filters.accent) &&
      voiceMatchesCategory(v, filters.category)
  );
}

function uniqueSorted(values: string[]): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const raw of values) {
    const value = normalizeToken(raw);
    if (!value || value === VOICE_FILTER_ALL || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label: titleCase(value) });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function buildVoiceFilterOptions(voices: ElevenLabsVoice[]) {
  const genders: string[] = [];
  const ages: string[] = [];
  const accents: string[] = [];
  const categories: string[] = [];
  const languagesFromVoices: string[] = [];

  for (const v of voices) {
    if (v.labels?.gender) genders.push(v.labels.gender);
    if (v.labels?.age) ages.push(v.labels.age);
    if (v.labels?.accent) accents.push(v.labels.accent);
    if (v.category) categories.push(v.category);
    languagesFromVoices.push(...getVoiceLanguageTokens(v));
  }

  const languageMap = new Map<string, string>();
  for (const preset of VOICE_LANGUAGE_PRESETS) {
    languageMap.set(preset.value, preset.label);
  }
  for (const { value, label } of uniqueSorted(languagesFromVoices)) {
    if (!languageMap.has(value)) languageMap.set(value, label);
  }

  const languages = [...languageMap.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    languages,
    genders: uniqueSorted(genders),
    ages: uniqueSorted(ages),
    accents: uniqueSorted(accents),
    categories: uniqueSorted(categories),
  };
}

const VOICES_PAGE_SIZE = 24;

/** Query params for paginated ElevenLabs voice library API. */
export function buildVoiceListQueryParams(
  page: number,
  filters: VoiceFilters,
  search: string
): Record<string, string> {
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(VOICES_PAGE_SIZE),
  };

  const q = String(search || "").trim();
  if (q) params.search = q;

  if (filters.language && filters.language !== VOICE_FILTER_ALL) {
    params.language = filters.language;
  }
  if (filters.gender && filters.gender !== VOICE_FILTER_ALL) {
    params.gender = filters.gender;
  }
  if (filters.age && filters.age !== VOICE_FILTER_ALL) {
    params.age = filters.age;
  }
  if (filters.accent && filters.accent !== VOICE_FILTER_ALL) {
    params.accent = filters.accent;
  }
  if (filters.category && filters.category !== VOICE_FILTER_ALL) {
    params.category = filters.category;
  }

  return params;
}

export { VOICES_PAGE_SIZE };

export function countActiveVoiceFilters(filters: VoiceFilters): number {
  return (Object.keys(filters) as VoiceFilterKey[]).filter(
    (k) => filters[k] && filters[k] !== VOICE_FILTER_ALL
  ).length;
}

export function formatVoiceMeta(v: ElevenLabsVoice): string[] {
  const bits: string[] = [];
  if (v.language) bits.push(titleCase(v.language));
  if (v.labels?.gender) bits.push(titleCase(v.labels.gender));
  if (v.labels?.age) bits.push(titleCase(v.labels.age.replace(/_/g, " ")));
  if (v.labels?.accent) bits.push(titleCase(v.labels.accent));
  if (v.category) bits.push(titleCase(v.category));
  return bits;
}
