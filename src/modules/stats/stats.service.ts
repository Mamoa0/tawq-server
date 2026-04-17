import { monogs } from "../../database/connection.js";
import { buckwalterToArabic } from "../../utils/buckwalterToArabic.js";

interface StatsResponse {
  total_verses: number;
  total_words: number;
  total_tokens: number;
  total_roots: number;
  total_lemmas: number;
  avg_tokens_per_word: number;
  top_10_roots: Array<{ root: string; count: number }>;
  pos_distribution: Record<string, number>;
  verb_tenses: Record<string, number>;
}

let cachedStats: StatsResponse | null = null;
let statsTimeout: NodeJS.Timeout | null = null;

function clearStatsCache() {
  cachedStats = null;
  if (statsTimeout) clearTimeout(statsTimeout);
  statsTimeout = null;
}

function setStatsCacheExpiry() {
  if (statsTimeout) clearTimeout(statsTimeout);
  // Cache for 1 hour
  statsTimeout = setTimeout(clearStatsCache, 60 * 60 * 1000);
}

export async function getGlobalStats(): Promise<StatsResponse> {
  if (cachedStats) {
    return cachedStats;
  }

  const pipeline: any[] = [
    {
      $facet: {
        verseCount: [{ $count: "count" }],
        tokenCount: [{ $count: "count" }],
        posDist: [
          { $match: { POS: { $exists: true, $ne: null } } },
          { $group: { _id: "$POS", count: { $sum: 1 } } },
        ],
        verbTenses: [
          { $match: { tense: { $exists: true, $ne: null } } },
          { $group: { _id: "$tense", count: { $sum: 1 } } },
        ],
        topRoots: [
          { $match: { ROOT: { $exists: true, $ne: null } } },
          { $group: { _id: "$ROOT", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        lemmaCount: [
          { $match: { LEM: { $exists: true, $ne: null } } },
          { $group: { _id: "$LEM" } },
          { $count: "count" },
        ],
        wordCount: [
          { $group: { _id: { surah: "$surah", ayah: "$ayah", word: "$word" } } },
          { $count: "count" },
        ],
      },
    },
  ];

  const [result] = await monogs
    .collection("tokens")
    .aggregate(pipeline)
    .toArray();

  const verseCount = result.verseCount[0]?.count || 0;
  const tokenCount = result.tokenCount[0]?.count || 0;
  const wordCount = result.wordCount[0]?.count || 0;
  const lemmaCount = result.lemmaCount[0]?.count || 0;
  const totalRoots = result.topRoots.length;

  const posDist: Record<string, number> = {};
  result.posDist.forEach((item: any) => {
    posDist[item._id] = item.count;
  });

  const verbTenses: Record<string, number> = {};
  result.verbTenses.forEach((item: any) => {
    verbTenses[item._id] = item.count;
  });

  const topRoots = result.topRoots.map((item: any) => ({
    root: buckwalterToArabic(item._id),
    count: item.count,
  }));

  cachedStats = {
    total_verses: verseCount,
    total_words: wordCount,
    total_tokens: tokenCount,
    total_roots: totalRoots,
    total_lemmas: lemmaCount,
    avg_tokens_per_word: tokenCount / wordCount || 0,
    top_10_roots: topRoots,
    pos_distribution: posDist,
    verb_tenses: verbTenses,
  };

  setStatsCacheExpiry();
  return cachedStats;
}
