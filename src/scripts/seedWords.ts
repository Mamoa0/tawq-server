import { Word } from "../database/models/index.js";
import { TOTAL_PAGES, DELAY_MS, sleep, fetchPageFromAPI } from "./helpers.js";

export async function seedWords() {
  console.log("🔤 Starting Word seed...");

  const count = await Word.countDocuments();
  if (count > 0) {
    console.log(`⚠️  Words already seeded (${count} docs). Skipping.\n`);
    return;
  }

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    try {
      const verses = await fetchPageFromAPI(page);
      const docs = [];

      for (const verse of verses) {
        const surah = Number(verse.verse_key.split(":")[0]);
        const ayah = Number(verse.verse_key.split(":")[1]);

        for (const w of verse.words || []) {
          // Skip non-word tokens (like sajda signs, end markers)
          if (w.char_type_name === "end") continue;

          docs.push({
            surah,
            ayah,
            word: w.position,
            arabic: w.text_uthmani || "",
            transliteration: w.transliteration?.text || "",
            translation: w.translation?.text || "",
          });
        }
      }

      if (docs.length > 0) {
        await Word.insertMany(docs, { ordered: false });
      }

      process.stdout.write(`\r✅ Words - Page ${page}/${TOTAL_PAGES}`);
    } catch (err: any) {
      console.error(`\n❌ Word failed on page ${page}:`, err.message);
    }

    await sleep(DELAY_MS);
  }

  console.log("\n🎉 Word seed complete!\n");
}
