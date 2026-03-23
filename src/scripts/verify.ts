import { Surah, Verse, Word, Token, Root } from "../database/models/index.js";

export async function verify() {
  const surahs = await Surah.countDocuments();
  const verses = await Verse.countDocuments();
  const words = await Word.countDocuments();
  const tokens = await Token.countDocuments();
  const roots = await Root.countDocuments();

  console.log("📊 Collection counts:");
  console.log(`   surahs : ${surahs}  (expected ~114)`);
  console.log(`   verses : ${verses}  (expected ~6236)`);
  console.log(`   words  : ${words}  (expected ~77,430)`);
  console.log(`   tokens : ${tokens}  (expected ~128,219)`);
  console.log(`   roots  : ${roots}`);
}
