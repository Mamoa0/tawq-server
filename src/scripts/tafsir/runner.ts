import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import { TafsirSource, TafsirIngestionState } from "../../database/models/index.js";

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
  if (state.sourceSlug === undefined) return 0;
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
      const task = concurrencyLimiter(async () => {
        const adapter = ADAPTER_MAP.get(sourceSlug);
        if (!adapter) {
          throw new Error(`No adapter registered for source: ${sourceSlug}`);
        }
        console.log(`📥 [${sourceSlug}] Processing surah ${surah}`);
      });
      await task;
      await updateResumeMarker(sourceSlug, surah, runId);
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
