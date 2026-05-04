import { TafsirSource } from "../../database/models/index.js";

const V1_SOURCES = [
  {
    slug: "muyassar",
    name: { ar: "التفسير الميسر" },
    author: "Ministry of Awqaf and Islamic Affairs, Kuwait",
    language: "ar",
    direction: "rtl" as const,
    format: "text" as const,
    grouping: "ayah" as const,
  },
  {
    slug: "mukhtasar",
    name: { ar: "المختصر في تفسير القرآن الكريم" },
    author: "Ibn Kathir",
    language: "ar",
    direction: "rtl" as const,
    format: "text" as const,
    grouping: "ayah" as const,
  },
  {
    slug: "tadabbur-wa-amal",
    name: { ar: "التدبر والتحليل" },
    author: "Various scholars",
    language: "ar",
    direction: "rtl" as const,
    format: "text" as const,
    grouping: "range" as const,
  },
];

export async function seedTafsirSources(slug?: string): Promise<void> {
  const sources = slug ? V1_SOURCES.filter((s) => s.slug === slug) : V1_SOURCES;

  for (const source of sources) {
    await TafsirSource.findOneAndUpdate(
      { slug: source.slug },
      { $set: source },
      { upsert: true },
    );
    console.log(`✅ Seeded tafsir source: ${source.slug}`);
  }
}

export interface IngestionOptions {
  fromSurah?: number;
  restart?: boolean;
}

export async function runTafsirIngestion(
  slug: string,
  options?: IngestionOptions,
): Promise<void> {
  console.log(`⏳ Starting ingestion for: ${slug}`);
  console.log("   (ingestion runner not yet implemented — stub)");
  console.log(`   Options: fromSurah=${options?.fromSurah ?? "auto"}, restart=${options?.restart ?? false}`);
}