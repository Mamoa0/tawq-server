import { Surah as SurahModel } from "../../database/models/surah.model.js";
import { Root as RootModel } from "../../database/models/root.model.js";
import { Token as TokenModel } from "../../database/models/token.model.js";
import { arabicToBuckwalter } from "../../utils/arabicToBuckwalter.js";
import { buckwalterToArabic } from "../../utils/buckwalterToArabic.js";

export async function getSurahStats(surahNumber: number) {
  const surah = await SurahModel.findOne({ number: surahNumber }).lean();
  if (!surah) return null;

  const tokens = await TokenModel.find({ surah: surahNumber }).lean();

  const rootsMap = new Map<string, number>();
  const posMap = new Map<string, number>();
  const verbTenseMap = { PERF: 0, IMPF: 0, IMPV: 0 };
  let uniqueWords = new Set<string>();
  
  tokens.forEach((t: any) => {
    if (t.ROOT) {
      rootsMap.set(t.ROOT, (rootsMap.get(t.ROOT) || 0) + 1);
    }
    if (t.POS) {
      posMap.set(t.POS, (posMap.get(t.POS) || 0) + 1);
    }
    if (t.PERF) verbTenseMap.PERF++;
    if (t.IMPF) verbTenseMap.IMPF++;
    if (t.IMPV) verbTenseMap.IMPV++;
    
    // Grouping words by word number
    uniqueWords.add(`${t.surah}:${t.ayah}:${t.word}`);
  });

  const rootsArray = Array.from(rootsMap.entries())
    .map(([root, count]) => ({ root: buckwalterToArabic(root), count }))
    .sort((a, b) => b.count - a.count);

  const totalRoots = rootsArray.length;
  const top10Roots = rootsArray.slice(0, 10);
  
  const totalPos = Array.from(posMap.values()).reduce((a, b) => a + b, 0);
  const posDist: Record<string, string> = {};
  for (const [pos, count] of posMap.entries()) {
    posDist[pos] = ((count / totalPos) * 100).toFixed(2) + "%";
  }

  const totalVerbs = verbTenseMap.PERF + verbTenseMap.IMPF + verbTenseMap.IMPV;
  const verbTenses = {
    PERF: totalVerbs ? ((verbTenseMap.PERF / totalVerbs) * 100).toFixed(2) + "%" : "0%",
    IMPF: totalVerbs ? ((verbTenseMap.IMPF / totalVerbs) * 100).toFixed(2) + "%" : "0%",
    IMPV: totalVerbs ? ((verbTenseMap.IMPV / totalVerbs) * 100).toFixed(2) + "%" : "0%",
  };

  const totalWords = uniqueWords.size;
  const s = surah as any;
  const avgWordsPerAyah = totalWords / (s.verses_count as number);

  // Quick repetition rate heuristic: (total tokens - unique segments) / total tokens
  const uniqueSegments = new Set(tokens.map((t: any) => t.form)).size;
  const repetitionRate = ((tokens.length - uniqueSegments) / tokens.length);

  return {
    general: {
      ...surah,
      page_count: (s.pages?.end || 0) - (s.pages?.start || 0) + 1,
    },
    deepInfo: {
      rootsArray,
      top10Roots,
      totalRoots,
      posDist,
      verbTenses,
      totalWords,
      avgWordsPerAyah,
      repetitionRate,
      coreTheme: rootsArray[0] || { root: "", count: 0 },
    },
  };
}

export async function getRootStats(rootStr: string) {
  const rootBw = arabicToBuckwalter(rootStr);
  const root = await RootModel.findOne({ root: rootBw }).lean();
  if (!root) return null;

  const tokens = await TokenModel.find({ ROOT: rootBw }).lean();

  const surahs = new Set<number>();
  const posSet = new Set<string>();
  const lemmasMap = new Map<string, number>();

  tokens.forEach((t: any) => {
    if (t.surah) surahs.add(t.surah);
    if (t.POS) posSet.add(t.POS);
    if (t.LEM) {
      lemmasMap.set(t.LEM, (lemmasMap.get(t.LEM) || 0) + 1);
    }
  });

  return {
    general: root as any,
    surahBw: rootBw,
    deepInfo: {
      surahs: Array.from(surahs),
      posSet: Array.from(posSet),
      lemmas: Array.from(lemmasMap.keys()).map(l => buckwalterToArabic(l)),
      tokens,
    },
  };
}
