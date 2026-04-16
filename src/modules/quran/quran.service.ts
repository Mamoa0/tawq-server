import { monogs } from "../../database/connection.js";

interface DefaultWordResponse {
  surah: number;
  ayah: number;
  word: number;
  arabic: string;
  transliteration?: string;
  translation?: string;
  tokens?: any[];
}

export async function getAllSurahs() {
  return await monogs.collection("surahs").find().sort({ number: 1 }).toArray();
}

export async function getSurahByNumber(number: number) {
  return await monogs.collection("surahs").findOne({ number });
}

export async function getVersesByPage(number: number, page: number) {
  return await monogs
    .collection("verses")
    .find({ surah: number, page })
    .sort({ ayah: 1 })
    .toArray();
}

export async function getAyahWithWords(surah: number, ayah: number) {
  const verse = await monogs.collection("verses").findOne({ surah, ayah });
  if (!verse) return null;

  const words = await monogs
    .collection("words")
    .find({ surah, ayah })
    .sort({ word: 1 })
    .toArray();

  return { verse, words };
}

export async function getWordDetails(
  surah: number,
  ayah: number,
  word: number,
) {
  const wordDetails = await monogs
    .collection("words")
    .findOne({ surah, ayah, word });

  if (!wordDetails) return null;

  const tokens = await monogs
    .collection("tokens")
    .find({ surah, ayah, word })
    .sort({ segment: 1 })
    .toArray();

  const rootKeys = [...new Set(tokens.filter((t: any) => t.ROOT).map((t: any) => t.ROOT))];
  const rootsByStr: Record<string, any> = {};

  if (rootKeys.length > 0) {
    const rootsData = await monogs.collection("roots").find(
      { root: { $in: rootKeys } },
      { projection: { _id: 1, root: 1, meaning: 1 } }
    ).toArray();
    
    rootsData.forEach((r: any) => {
      rootsByStr[r.root] = { ...r, rootMeanings: [] };
    });

    const meaningsData = await monogs.collection("rootmeanings").find(
      { root: { $in: rootKeys } },
      { projection: { _id: 1, root: 1, source: 1, content: 1, extracted: 1, verified: 1, confidence: 1 } }
    ).toArray();
    
    meaningsData.forEach((m: any) => {
      if (rootsByStr[m.root]) {
        const { root, ...meaningWithoutRootStr } = m;
        rootsByStr[m.root].rootMeanings.push(meaningWithoutRootStr);
      }
    });
  }

  const enrichedTokens = tokens.map((token: any) => {
    if (token.ROOT) {
      return {
        ...token,
        rootDetails: rootsByStr[token.ROOT] || null,
      };
    }
    return token;
  });

  return { ...(wordDetails as unknown as DefaultWordResponse), tokens: enrichedTokens };
}
