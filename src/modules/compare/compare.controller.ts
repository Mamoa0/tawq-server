import { FastifyRequest, FastifyReply } from "fastify";
import {
  surahCompareSchema,
  rootCompareSchema,
  SurahCompareParams,
  RootCompareParams,
} from "../../validators/compare.validator.js";
import { getSurahStats, getRootStats } from "./compare.service.js";
import { buckwalterToArabic } from "../../utils/buckwalterToArabic.js";

export const compareSurahsHandler = async (
  request: FastifyRequest<{ Querystring: SurahCompareParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = surahCompareSchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: parsed.error.issues,
    });
    return;
  }

  const { a, b } = parsed.data;

  const [statsA, statsB] = await Promise.all([getSurahStats(a), getSurahStats(b)]);

  if (!statsA || !statsB) {
    reply.status(404).send({
      statusCode: 404,
      error: "Not Found",
      message: "One or both Surahs not found",
    });
    return;
  }

  // Root aggregations
  const rootsA = new Set(statsA.deepInfo.rootsArray.map((r) => r.root));
  const rootsB = new Set(statsB.deepInfo.rootsArray.map((r) => r.root));
  const sharedRoots = Array.from(rootsA).filter(r => rootsB.has(r));
  const uniqueToA = Array.from(rootsA).filter(r => !rootsB.has(r));
  const uniqueToB = Array.from(rootsB).filter(r => !rootsA.has(r));

  const gA = statsA.general as any;
  const gB = statsB.general as any;

  reply.send({
    general: {
      surahA: gA,
      surahB: gB,
      diff: {
        longer: (gA.verses_count as number) > (gB.verses_count as number) ? "A" : "B",
        revealed_first: (gA.revelation_order as number) < (gB.revelation_order as number) ? "A" : "B",
        same_revelation_place: gA.revelation_place === gB.revelation_place,
        verses_diff: Math.abs((gA.verses_count as number) - (gB.verses_count as number)),
      },
    },
    deep: {
      roots: {
        total_a: statsA.deepInfo.totalRoots,
        total_b: statsB.deepInfo.totalRoots,
        shared: sharedRoots,
        shared_count: sharedRoots.length,
        unique_to_a: uniqueToA,
        unique_to_b: uniqueToB,
        top10_a: statsA.deepInfo.top10Roots,
        top10_b: statsB.deepInfo.top10Roots,
        diversity_ratio_a: statsA.deepInfo.totalRoots / statsA.deepInfo.totalWords,
        diversity_ratio_b: statsB.deepInfo.totalRoots / statsB.deepInfo.totalWords,
      },
      pos_distribution: {
        a: statsA.deepInfo.posDist,
        b: statsB.deepInfo.posDist,
      },
      verb_tenses: {
        a: statsA.deepInfo.verbTenses,
        b: statsB.deepInfo.verbTenses,
      },
      linguistic: {
        total_words_a: statsA.deepInfo.totalWords,
        total_words_b: statsB.deepInfo.totalWords,
        unique_words_a: statsA.deepInfo.totalWords * (1 - statsA.deepInfo.repetitionRate),
        unique_words_b: statsB.deepInfo.totalWords * (1 - statsB.deepInfo.repetitionRate),
        avg_words_per_ayah_a: statsA.deepInfo.avgWordsPerAyah,
        avg_words_per_ayah_b: statsB.deepInfo.avgWordsPerAyah,
        repetition_rate_a: statsA.deepInfo.repetitionRate,
        repetition_rate_b: statsB.deepInfo.repetitionRate,
      },
      core_theme: {
        a: statsA.deepInfo.coreTheme,
        b: statsB.deepInfo.coreTheme,
      },
    },
  });
};

export const compareRootsHandler = async (
  request: FastifyRequest<{ Querystring: RootCompareParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = rootCompareSchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: parsed.error.issues,
    });
    return;
  }

  const { a, b } = parsed.data;

  const [statsA, statsB] = await Promise.all([getRootStats(a), getRootStats(b)]);

  if (!statsA || !statsB) {
    reply.status(404).send({
      statusCode: 404,
      error: "Not Found",
      message: "One or both Roots not found",
    });
    return;
  }

  // Root diffs
  const sharedSurahs = statsA.deepInfo.surahs.filter(s => statsB.deepInfo.surahs.includes(s));
  const uniqueSurahsA = statsA.deepInfo.surahs.filter(s => !statsB.deepInfo.surahs.includes(s));
  const uniqueSurahsB = statsB.deepInfo.surahs.filter(s => !statsA.deepInfo.surahs.includes(s));

  const sharedPos = statsA.deepInfo.posSet.filter(p => statsB.deepInfo.posSet.includes(p));
  const uniquePosA = statsA.deepInfo.posSet.filter(p => !statsB.deepInfo.posSet.includes(p));
  const uniquePosB = statsB.deepInfo.posSet.filter(p => !statsA.deepInfo.posSet.includes(p));

  const sharedLemmas = statsA.deepInfo.lemmas.filter(l => statsB.deepInfo.lemmas.includes(l));

  const tokensA = statsA.deepInfo.tokens;
  const tokensB = statsB.deepInfo.tokens;
  
  const versesA = new Set(tokensA.map((t: any) => `${t.surah}:${t.ayah}`));
  const versesB = new Set(tokensB.map((t: any) => `${t.surah}:${t.ayah}`));
  const versesTogetherStr = Array.from(versesA).filter(v => versesB.has(v));
  const versesTogether = versesTogetherStr.map(v => {
    const [surah, ayah] = v.split(':');
    return { surah: Number(surah), ayah: Number(ayah) };
  });

  const gA = statsA.general;
  const gB = statsB.general;

  reply.send({
    general: {
      rootA: {
        ...gA,
        root: buckwalterToArabic(gA.root),
      },
      rootB: {
        ...gB,
        root: buckwalterToArabic(gB.root),
      },
      diff: {
        more_frequent: (gA.count as number) > (gB.count as number) ? "A" : "B",
        frequency_diff: Math.abs((gA.count as number) - (gB.count as number)),
        same_phonetic_group: gA.phonetic_group === gB.phonetic_group,
        are_related:
          (gA.related_phonetic && gA.related_phonetic.includes(statsB.surahBw)) ||
          (gB.related_phonetic && gB.related_phonetic.includes(statsA.surahBw)) ||
          false,
      },
    },
    deep: {
      surahs: {
        shared: sharedSurahs,
        shared_count: sharedSurahs.length,
        unique_to_a: uniqueSurahsA,
        unique_to_b: uniqueSurahsB,
      },
      pos_overlap: {
        shared_pos: sharedPos,
        unique_to_a: uniquePosA,
        unique_to_b: uniquePosB,
      },
      co_occurrence: {
        appear_together_count: versesTogether.length,
        verses_together: versesTogether,
      },
      lemmas: {
        a: statsA.deepInfo.lemmas,
        b: statsB.deepInfo.lemmas,
        shared: sharedLemmas,
      },
    },
  });
};
