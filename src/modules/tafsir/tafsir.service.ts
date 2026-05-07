import { createHash } from "node:crypto";
import { TafsirSource, Tafsir } from "../../database/models/index.js";

export interface SourceListItem {
  slug: string;
  name: { ar?: string; en?: string };
  author: string;
  language: string;
  direction: "rtl" | "ltr";
  format: "text" | "html";
  grouping: "ayah" | "range";
  homepage?: string;
  license?: string;
}

export async function listSources(language?: string): Promise<SourceListItem[]> {
  const query = language ? { language } : {};
  const sources = await TafsirSource.find(query).lean().sort({ slug: 1 });
  return sources.map((s) => ({
    slug: s.slug,
    name: s.name,
    author: s.author,
    language: s.language,
    direction: s.direction,
    format: s.format,
    grouping: s.grouping,
    homepage: s.homepage,
    license: s.license,
  }));
}

export interface TafsirResult {
  source: {
    slug: string;
    name: { ar?: string; en?: string };
    language: string;
    direction: "rtl" | "ltr";
    format: "text" | "html";
  };
  ayahStart: number;
  ayahEnd: number;
  text: string;
}

export interface FetchBundleResult {
  results: TafsirResult[];
  missing: string[];
}

const TAFSIR_DB_LOOKUP_BUDGET_MS = parseInt(
  process.env.TAFSIR_DB_LOOKUP_BUDGET_MS || "800",
  10,
);

interface CachedEntry {
  data: TafsirResult | null;
  generation: number;
}

const CACHE_MAX_ENTRIES = 50_000;
const tafsirCache = new Map<string, CachedEntry>();
let cacheOrder: string[] = [];

let sourceCache: Array<{ slug: string; generation: number }> | null = null;
let sourceCacheTs = 0;
const SOURCE_CACHE_TTL_MS = 60_000;

function getCacheKey(slug: string, surah: number, ayah: number): string {
  return `${slug}|${surah}|${ayah}`;
}

function setCache(key: string, entry: CachedEntry, generation: number): void {
  if (tafsirCache.size >= CACHE_MAX_ENTRIES && !tafsirCache.has(key)) {
    const oldest = cacheOrder.shift();
    if (oldest) tafsirCache.delete(oldest);
  }
  tafsirCache.set(key, { ...entry, generation });
  if (!cacheOrder.includes(key)) cacheOrder.push(key);
}

function getCache(key: string, currentGeneration: number): TafsirResult | null | "miss" {
  const entry = tafsirCache.get(key);
  if (!entry) return "miss";
  if (entry.generation !== currentGeneration) {
    tafsirCache.delete(key);
    cacheOrder = cacheOrder.filter((k) => k !== key);
    return "miss";
  }
  return entry.data;
}

export function createETag(
  respondingSlugs: Array<{ slug: string; generation: number }>,
  missingSlugs: string[],
): string {
  const sourceParts = respondingSlugs
    .map((s) => `${s.slug}:${s.generation}`)
    .sort()
    .join("|");
  const missingPart = [...missingSlugs].sort().join("|");
  const content = `${sourceParts}#${missingPart}`;
  const hash = createHash("sha1").update(content).digest("hex").slice(0, 16);
  return `W/"${hash}"`;
}

export async function fetchBundle(
  surah: number,
  ayah: number,
  requestedSlugs?: string[],
): Promise<{ results: TafsirResult[]; missing: string[]; respondingSlugs: Array<{ slug: string; generation: number }> }> {
  const sources = await TafsirSource.find().lean();
  const registeredSlugSet = new Set(sources.map((s) => s.slug));

  const allRequestedSlugs = requestedSlugs ?? [];
  const unknownSlugs = requestedSlugs
    ? allRequestedSlugs.filter((slug) => !registeredSlugSet.has(slug))
    : [];

  const slugsToQuery = allRequestedSlugs.length
    ? sources.filter((s) => allRequestedSlugs.includes(s.slug)).map((s) => s.slug)
    : sources.map((s) => s.slug);

  const results: TafsirResult[] = [];
  const missing: string[] = [];
  const respondingSlugs: Array<{ slug: string; generation: number }> = [];

  await Promise.all(
    slugsToQuery.map(async (slug) => {
      const sourceDoc = sources.find((src) => src.slug === slug)!;
      const generation = sourceDoc.generation;
      const cacheKey = getCacheKey(slug, surah, ayah);

      const cached = getCache(cacheKey, generation);
      if (cached !== "miss") {
        if (cached === null) {
          missing.push(slug);
        } else {
          results.push(cached);
          respondingSlugs.push({ slug, generation });
        }
        return;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TAFSIR_DB_LOOKUP_BUDGET_MS);

        const entry = await Tafsir.findOne({
          sourceSlug: slug,
          surah,
          ayahStart: { $lte: ayah },
          ayahEnd: { $gte: ayah },
        })
          .lean()
          .then((doc) => {
            clearTimeout(timeout);
            return doc;
          })
          .catch((err) => {
            clearTimeout(timeout);
            if (err.name === "AbortError") {
              const timeoutErr = new Error(`DB lookup timed out after ${TAFSIR_DB_LOOKUP_BUDGET_MS}ms`);
              timeoutErr.name = "TimeoutError";
              throw timeoutErr;
            }
            throw err;
          });

        if (entry) {
          const tafsirEntry = entry as unknown as { ayahStart: number; ayahEnd: number; text: string };
          const result: TafsirResult = {
            source: {
              slug: sourceDoc.slug,
              name: sourceDoc.name,
              language: sourceDoc.language,
              direction: sourceDoc.direction,
              format: sourceDoc.format,
            },
            ayahStart: tafsirEntry.ayahStart,
            ayahEnd: tafsirEntry.ayahEnd,
            text: tafsirEntry.text,
          };
          results.push(result);
          respondingSlugs.push({ slug, generation });
          setCache(cacheKey, { data: result, generation }, generation);
        } else {
          missing.push(slug);
          setCache(cacheKey, { data: null, generation }, generation);
        }
      } catch {
        missing.push(slug);
      }
    }),
  );

  for (const unknownSlug of unknownSlugs) {
    if (!missing.includes(unknownSlug)) {
      missing.push(unknownSlug);
    }
  }

  return { results, missing, respondingSlugs };
}

async function getSources(): Promise<Array<{ slug: string; generation: number }>> {
  const now = Date.now();
  if (sourceCache && now - sourceCacheTs < SOURCE_CACHE_TTL_MS) {
    return sourceCache;
  }
  const sources = await TafsirSource.find().select("slug generation").lean();
  sourceCache = sources.map((s) => ({ slug: s.slug, generation: s.generation }));
  sourceCacheTs = now;
  return sourceCache;
}

// Global coverage map — built once on first request, invalidated when any source's generation changes.
// Bounded by total corpus: 114 surahs x ~6236 ayahs x N sources (~18k Set entries, ~1–2 MB at 3 sources).
let coverageMap: Map<number, Map<number, Set<string>>> | null = null;
let coverageMapGeneration = -1;
let coverageBuildPromise: Promise<Map<number, Map<number, Set<string>>>> | null = null;

export async function getCoverageMap(): Promise<Map<number, Map<number, Set<string>>>> {
  const sources = await getSources();
  const maxGeneration = sources.reduce((max, s) => Math.max(max, s.generation), 0);

  if (coverageMap !== null && coverageMapGeneration === maxGeneration) {
    return coverageMap;
  }

  if (coverageBuildPromise) {
    return coverageBuildPromise;
  }

  coverageBuildPromise = buildCoverageMap(sources, maxGeneration).finally(() => {
    coverageBuildPromise = null;
  });

  return coverageBuildPromise;
}

async function buildCoverageMap(sources: Array<{ slug: string; generation: number }>, maxGeneration: number): Promise<Map<number, Map<number, Set<string>>>> {
  const coverage = new Map<number, Map<number, Set<string>>>();

  const ALL_SURAHS = Array.from({ length: 114 }, (_, i) => i + 1);
  const entries = await Tafsir.find({
    surah: { $in: ALL_SURAHS },
  })
    .select("sourceSlug surah ayahStart ayahEnd")
    .lean();

  for (const entry of entries) {
    if (!coverage.has(entry.surah)) {
      coverage.set(entry.surah, new Map());
    }
    const surahMap = coverage.get(entry.surah)!;
    for (let a = entry.ayahStart; a <= entry.ayahEnd; a++) {
      if (!surahMap.has(a)) {
        surahMap.set(a, new Set());
      }
      surahMap.get(a)!.add(entry.sourceSlug);
    }
  }

  coverageMap = coverage;
  coverageMapGeneration = maxGeneration;
  return coverage;
}

export function getTafsirSourcesForAyah(
  coverageMap: Map<number, Map<number, Set<string>>>,
  surah: number,
  ayah: number,
): string[] {
  const surahMap = coverageMap.get(surah);
  if (!surahMap) return [];
  const sources = surahMap.get(ayah);
  if (!sources) return [];
  return Array.from(sources).sort((a, b) => a.localeCompare(b));
}

const AYAH_COUNTS: Record<number, number> = {
  1: 7, 2: 286, 3: 200, 4: 176, 5: 120, 6: 165, 7: 206, 8: 75, 9: 129, 10: 109,
  11: 123, 12: 111, 13: 43, 14: 52, 15: 99, 16: 128, 17: 111, 18: 110, 19: 98, 20: 135,
  21: 112, 22: 78, 23: 118, 24: 64, 25: 77, 26: 227, 27: 93, 28: 88, 29: 69, 30: 60,
  31: 34, 32: 30, 33: 73, 34: 54, 35: 45, 36: 83, 37: 182, 38: 88, 39: 75, 40: 85,
  41: 54, 42: 53, 43: 89, 44: 59, 45: 37, 46: 35, 47: 38, 48: 29, 49: 18, 50: 45,
  51: 60, 52: 49, 53: 62, 54: 55, 55: 78, 56: 96, 57: 29, 58: 22, 59: 24, 60: 13,
  61: 14, 62: 11, 63: 11, 64: 18, 65: 12, 66: 12, 67: 30, 68: 52, 69: 52, 70: 44,
  71: 28, 72: 28, 73: 20, 74: 56, 75: 40, 76: 31, 77: 50, 78: 40, 79: 46, 80: 42,
  81: 29, 82: 19, 83: 36, 84: 25, 85: 22, 86: 17, 87: 19, 88: 26, 89: 30, 90: 20,
  91: 15, 92: 21, 93: 11, 94: 8, 95: 8, 96: 19, 97: 5, 98: 8, 99: 8, 100: 11,
  101: 11, 102: 8, 103: 3, 104: 9, 105: 5, 106: 4, 107: 7, 108: 3, 109: 6, 110: 3,
  111: 5, 112: 4, 113: 5, 114: 6,
};

export function clearTafsirCache(): void {
  tafsirCache.clear();
  cacheOrder = [];
  coverageMap = null;
  coverageMapGeneration = -1;
  sourceCache = null;
  sourceCacheTs = 0;
}

export function validateSurahAyah(surah: number, ayah: number): string | null {
  const maxAyah = AYAH_COUNTS[surah];
  if (!maxAyah) return `Surah ${surah} does not exist`;
  if (ayah < 1 || ayah > maxAyah) return `Ayah ${ayah} does not exist in Surah ${surah} (max: ${maxAyah})`;
  return null;
}