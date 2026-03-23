import { Verse } from "../database/models/index.js";
import { TOTAL_PAGES, DELAY_MS, sleep, fetchPageFromAPI } from "./helpers.js";

export async function seedVerses() {
  console.log("📖 Starting Verse seed...");

  const count = await Verse.countDocuments();
  if (count > 0) {
    console.log(`⚠️  Verses already seeded (${count} docs). Skipping.\n`);
    return;
  }

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    try {
      const verses = await fetchPageFromAPI(page);

      const docs = verses.map((v) => ({
        surah: Number(v.verse_key.split(":")[0]),
        ayah: Number(v.verse_key.split(":")[1]),
        page: v.page_number,
        arabic: v.text_uthmani,
        translation: v.translations?.[0]?.text || "",
      }));

      await Verse.insertMany(docs, { ordered: false });
      process.stdout.write(`\r✅ Verses - Page ${page}/${TOTAL_PAGES}`);
    } catch (err: any) {
      console.error(`\n❌ Verse failed on page ${page}:`, err.message);
    }

    await sleep(DELAY_MS);
  }

  console.log("\n🎉 Verse seed complete!\n");
}
