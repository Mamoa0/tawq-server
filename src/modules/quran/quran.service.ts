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

export async function getVersesByPage(page: number) {
  return await monogs
    .collection("verses")
    .find({ page })
    .sort({ surah: 1, ayah: 1 })
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

  return { ...(wordDetails as unknown as DefaultWordResponse), tokens };
}
