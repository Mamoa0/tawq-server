import mongoose from "mongoose";
import "dotenv/config";
import { seedSurahs } from "./seedSurahs.js";
import { seedVerses } from "./seedVerses.js";
import { seedWords } from "./seedWords.js";
import { seedTokens } from "./seedTokens.js";
import { seedRoots } from "./seedRoots.js";
import { runSemanticRoots } from "./semanticRoots.js";
import { runCoOccurrence } from "./coOccurrence.js";
import { verify } from "./verify.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/quran_db";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("\nUsage: node src/scripts/index.js [option]");
    console.log("  --surahs        : Seed surahs collection");
    console.log("  --verses        : Seed verses collection");
    console.log("  --words         : Seed words collection");
    console.log("  --tokens        : Seed tokens collection from local .txt file");
    console.log("  --roots         : Seed roots collection (requires tokens)");
    console.log("  --coOccurrence  : Find roots that appear together in the same verse");
    console.log("  --semanticRoots : Fetch semantic connections using Gemini");
    console.log("  --all           : Seed all 5 base collections");
    console.log("  --verify        : Check collection counts\n");
    process.exit(0);
  }

  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected\n");

    if (args.includes("--verses") || args.includes("--all")) {
      await seedVerses();
    }

    if (args.includes("--words") || args.includes("--all")) {
      await seedWords();
    }

    if (args.includes("--tokens") || args.includes("--all")) {
      // Assuming txt file is at project root
      await seedTokens("./quranic-corpus-morphology-0.4.txt");
    }

    if (args.includes("--surahs") || args.includes("--all")) {
      await seedSurahs();
    }

    if (args.includes("--roots") || args.includes("--all")) {
      await seedRoots();
    }

    if (args.includes("--coOccurrence")) {
      await runCoOccurrence();
    }

    if (args.includes("--semanticRoots")) {
      await runSemanticRoots();
    }

    if (args.includes("--verify") || args.includes("--all")) {
      await verify();
    }
  } catch (error) {
    console.error("❌ Fatal Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB.");
    process.exit(0);
  }
}

main();
