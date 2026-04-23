/**
 * Sajda (prostration) verses in the Qur'an.
 *
 * There are 14 commonly recognized places of prostration when reciting
 * the Qur'an. Classification into "obligatory" (wajib) and "recommended"
 * (mustahabb) varies by madhhab — the split used here follows a common
 * classification in printed Madani Mushafs. Clients that care about a
 * specific school should apply their own classification on top.
 *
 * Reference: standard Mushaf of Madinah sajda markers.
 */
export type SajdaType = "recommended" | "obligatory";

export interface SajdaLocation {
  surah: number;
  ayah: number;
  type: SajdaType;
}

export const SAJDA_LOCATIONS: readonly SajdaLocation[] = [
  { surah: 7, ayah: 206, type: "recommended" },
  { surah: 13, ayah: 15, type: "recommended" },
  { surah: 16, ayah: 49, type: "recommended" },
  { surah: 17, ayah: 107, type: "recommended" },
  { surah: 19, ayah: 58, type: "recommended" },
  { surah: 22, ayah: 18, type: "recommended" },
  { surah: 25, ayah: 60, type: "recommended" },
  { surah: 27, ayah: 25, type: "recommended" },
  { surah: 32, ayah: 15, type: "obligatory" },
  { surah: 38, ayah: 24, type: "recommended" },
  { surah: 41, ayah: 37, type: "obligatory" },
  { surah: 53, ayah: 62, type: "obligatory" },
  { surah: 84, ayah: 21, type: "recommended" },
  { surah: 96, ayah: 19, type: "obligatory" },
] as const;

// Pre-built lookup for O(1) annotation of verse responses.
const _sajdaKey = (s: number, a: number): string => `${s}:${a}`;
const _sajdaIndex: Map<string, SajdaType> = new Map(
  SAJDA_LOCATIONS.map((l) => [_sajdaKey(l.surah, l.ayah), l.type]),
);

/**
 * Returns the sajda type for a given (surah, ayah), or null if that
 * verse is not a sajda position.
 */
export function sajdaTypeFor(surah: number, ayah: number): SajdaType | null {
  return _sajdaIndex.get(_sajdaKey(surah, ayah)) ?? null;
}
