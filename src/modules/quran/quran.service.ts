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
  const tokensPipeline: any[] = [
    { $match: { surah, ayah, word } },
    { $sort: { segment: 1 } },
    {
      $lookup: {
        from: "roots",
        localField: "ROOT",
        foreignField: "root",
        pipeline: [
          { $project: { _id: 1, root: 1, meaning: 1 } },
          {
            $lookup: {
              from: "rootmeanings",
              localField: "root",
              foreignField: "root",
              pipeline: [
                { $project: { _id: 1, source: 1, content: 1, extracted: 1, verified: 1, confidence: 1 } },
              ],
              as: "rootMeanings",
            },
          },
        ],
        as: "rootDetailsArr",
      },
    },
    {
      $addFields: {
        rootDetails: { $arrayElemAt: ["$rootDetailsArr", 0] },
      },
    },
    { $project: { rootDetailsArr: 0 } },
  ];

  const [wordDetails, tokens] = await Promise.all([
    monogs.collection("words").findOne({ surah, ayah, word }),
    monogs.collection("tokens").aggregate(tokensPipeline).toArray(),
  ]);

  if (!wordDetails) return null;

  return { ...(wordDetails as unknown as DefaultWordResponse), tokens };
}
