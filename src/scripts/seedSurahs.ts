import { Surah } from "../database/models/index.js";

export async function seedSurahs() {
  console.log("📚 Starting Surah seed...");

  const count = await Surah.countDocuments();
  if (count > 0) {
    console.log(`⚠️  Surahs already seeded (${count} docs). Skipping.\n`);
    return;
  }

  const url = `https://api.quran.com/api/v4/chapters?language=en`;
  const res = await fetch(url);
  const data: any = await res.json();
  const chapters = data.chapters || [];

  const docs = chapters.map((c: any) => ({
    number: c.id,
    name_arabic: c.name_arabic,
    name_simple: c.name_simple,
    name_complex: c.name_complex,
    name_translated: c.translated_name.name,
    revelation_place: c.revelation_place,
    revelation_order: c.revelation_order,
    bismillah_pre: c.bismillah_pre,
    verses_count: c.verses_count,
    pages: {
      start: c.pages[0],
      end: c.pages[1],
    },
  }));

  await Surah.insertMany(docs);
  console.log(`✅ ${docs.length} surahs saved!\n`);
}
