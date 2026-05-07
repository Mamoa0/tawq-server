import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import { TafsirSource, Tafsir, TafsirIngestionState } from "../../database/models/index.js";
import { normalizeMuyassar } from "./muyassar.js";
import { normalizeMukhtasar } from "./mukhtasar.js";
import { normalizeTadabburWaAmal } from "./tadabbur-wa-amal.js";

export interface AdapterFn {
  (surah: number, ayah: number): Promise<{
    sourceSlug: string;
    surah: number;
    ayahStart: number;
    ayahEnd: number;
    text: string;
  } | null>;
}

export interface IngestionOptions {
  fromSurah?: number;
  restart?: boolean;
  unlock?: boolean;
}

const TAFSIR_DB_LOOKUP_BUDGET_MS = parseInt(
  process.env.TAFSIR_DB_LOOKUP_BUDGET_MS || "800",
  10,
);

const TAFSIR_LOCK_STALE_MS = parseInt(
  process.env.TAFSIR_LOCK_STALE_MS || "21600000",
  10,
);

export const ADAPTER_MAP = new Map<string, AdapterFn>();

ADAPTER_MAP.set("muyassar", normalizeMuyassar);
ADAPTER_MAP.set("mukhtasar", normalizeMukhtasar);
ADAPTER_MAP.set("tadabbur-wa-amal", normalizeTadabburWaAmal);

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return promise
    .then((v) => {
      clearTimeout(timeout);
      return v;
    })
    .catch((err) => {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        const timeoutError = new Error(`Operation timed out after ${ms}ms`);
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      }
      throw err;
    });
}

async function claimLock(sourceSlug: string, runId: string): Promise<boolean> {
  const result = await TafsirIngestionState.findOneAndUpdate(
    { sourceSlug, runningSince: null },
    { $set: { runningSince: new Date(), runId, updatedAt: new Date() } },
    { upsert: true },
  );
  return result === null;
}

async function releaseLock(sourceSlug: string, runId: string): Promise<void> {
  await TafsirIngestionState.findOneAndUpdate(
    { sourceSlug, runId },
    { $set: { runningSince: null, runId: null, updatedAt: new Date() } },
  );
}

async function getResumeMarker(sourceSlug: string): Promise<number> {
  const state = await TafsirIngestionState.findOne({ sourceSlug }).lean();
  if (!state) return 0;
  return (state as any).lastSurahCompleted ?? 0;
}

async function updateResumeMarker(
  sourceSlug: string,
  lastSurah: number,
  runId: string,
): Promise<void> {
  await TafsirIngestionState.findOneAndUpdate(
    { sourceSlug, runId },
    { $set: { lastSurahCompleted: lastSurah, updatedAt: new Date() } },
  );
}

async function clearStaleLock(sourceSlug: string): Promise<void> {
  const stale = await TafsirIngestionState.findOne({ sourceSlug }).lean();
  if (!stale) return;
  if ((stale as any).runningSince) {
    await TafsirIngestionState.findOneAndUpdate(
      { sourceSlug },
      { $set: { runningSince: null, runId: null, updatedAt: new Date() } },
    );
  }
}

async function executeWithSignal<T>(
  fn: () => Promise<T>,
  budgetMs: number,
): Promise<T> {
  return withTimeout(fn(), budgetMs);
}

function getAyahCount(surah: number): number {
  return AYAH_COUNTS[surah] ?? 0;
}

export async function runIngestion(
  sourceSlug: string,
  options?: IngestionOptions,
): Promise<void> {
  const runId = randomUUID();
  const concurrencyLimiter = pLimit(6);

  const source = await TafsirSource.findOne({ slug: sourceSlug }).lean();
  if (!source) {
    throw new Error(`Unknown tafsir source: ${sourceSlug}`);
  }

  if (options?.unlock) {
    await clearStaleLock(sourceSlug);
    console.log(`🔓 Unlocked stale lock for source: ${sourceSlug}`);
    return;
  }

  const claimed = await claimLock(sourceSlug, runId);
  if (!claimed) {
    throw new Error(
      `Concurrent ingestion detected for source "${sourceSlug}". ` +
        `Another run is already in progress. Use --unlock to force-clear the lock.`,
    );
  }

  try {
    const startFrom = options?.restart ? 1 : await getResumeMarker(sourceSlug);
    const lastSurah = options?.restart ? 0 : startFrom;

    console.log(
      `⏳ Starting ingestion for: ${sourceSlug} (resume from surah ${lastSurah + 1})`,
    );

    for (let surah = lastSurah + 1; surah <= 114; surah++) {
      const adapter = ADAPTER_MAP.get(sourceSlug);
      if (!adapter) {
        throw new Error(`No adapter registered for source: ${sourceSlug}`);
      }

      const ayahCount = getAyahCount(surah);
      if (ayahCount === 0) {
        console.log(`⚠️  Unknown surah ${surah}, skipping`);
        continue;
      }

      console.log(`📥 [${sourceSlug}] Processing surah ${surah} (${ayahCount} ayahs)`);

      const tasks: Array<() => Promise<void>> = [];

      for (let ayah = 1; ayah <= ayahCount; ayah++) {
        const task = () => concurrencyLimiter(async () => {
          try {
            const entry = await executeWithSignal(
              () => adapter(surah, ayah),
              TAFSIR_DB_LOOKUP_BUDGET_MS,
            );

            if (entry === null) {
              console.log(`  ⏭️  [${sourceSlug}] Surah ${surah}:${ayah} — no content, skipping`);
              return;
            }

            const sourceDoc = await TafsirSource.findOne({ slug: sourceSlug }).lean();
            if (!sourceDoc) return;

            if ((sourceDoc as any).format === "html") {
              throw new Error(
                `HTML format is not yet supported for source "${sourceSlug}". ` +
                  `Sanitization pipeline (sanitize-html) is not implemented. ` +
                  `See FR-019 deferral.`,
              );
            }

            await Tafsir.findOneAndUpdate(
              {
                sourceSlug: entry.sourceSlug,
                surah: entry.surah,
                ayahStart: entry.ayahStart,
                ayahEnd: entry.ayahEnd,
              },
              {
                $set: {
                  text: entry.text,
                  ingestedAt: new Date(),
                },
              },
              { upsert: true },
            );

            console.log(`  ✅ [${sourceSlug}] Surah ${surah}:${ayah} — stored`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`  ❌ [${sourceSlug}] Surah ${surah}:${ayah} — ${msg}`);
          }
        });

        tasks.push(task);
      }

      await Promise.all(tasks);
      await updateResumeMarker(sourceSlug, surah, runId);
      console.log(`  📦 [${sourceSlug}] Completed surah ${surah}`);
    }

    await TafsirSource.findOneAndUpdate(
      { slug: sourceSlug },
      {
        $inc: { generation: 1 },
        $set: { ingestedAt: new Date() },
      },
    );

    console.log(`🎉 Ingestion complete for: ${sourceSlug}`);
  } finally {
    await releaseLock(sourceSlug, runId);
  }
}