import { describe, it, expect, beforeEach, vi } from "vitest";
import { runIngestion, ADAPTER_MAP } from "../../../src/scripts/tafsir/runner.js";
import { TafsirSource, Tafsir, TafsirIngestionState } from "../../../src/database/models/index.js";

vi.mock("../../../src/database/models/index.js", () => ({
  TafsirSource: {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
  },
  Tafsir: {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
  },
  TafsirIngestionState: {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
  },
}));

describe("runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("runIngestion", () => {
    it("throws error for unknown source slug", async () => {
      vi.mocked(TafsirSource.findOne).mockResolvedValueOnce(null);

      await expect(runIngestion("nonexistent")).rejects.toThrow(
        "Unknown tafsir source: nonexistent",
      );
    });

    it("clears stale lock when --unlock flag is set", async () => {
      vi.mocked(TafsirSource.findOne).mockResolvedValueOnce(null);
      vi.mocked(TafsirIngestionState.findOne).mockResolvedValueOnce({
        sourceSlug: "muyassar",
        runningSince: new Date(),
        runId: "stale-run",
        lastSurahCompleted: 50,
        updatedAt: new Date(),
      } as any);

      await runIngestion("muyassar", { unlock: true });

      expect(TafsirIngestionState.findOneAndUpdate).toHaveBeenCalled();
    });

    it("rejects concurrent ingestion when lock is already held", async () => {
      vi.mocked(TafsirSource.findOne).mockResolvedValueOnce({
        slug: "muyassar",
        name: { ar: "التفسير الميسر" },
        author: "Ministry",
        language: "ar",
        direction: "rtl" as const,
        format: "text" as const,
        grouping: "ayah" as const,
        generation: 1,
        ingestedAt: new Date(),
      } as any);

      vi.mocked(TafsirIngestionState.findOneAndUpdate).mockResolvedValueOnce({
        sourceSlug: "muyassar",
        runningSince: new Date(),
      } as any);

      await expect(runIngestion("muyassar")).rejects.toThrow(
        "Concurrent ingestion detected for source",
      );
    });

    it("skips and logs when adapter returns null", async () => {
      vi.mocked(TafsirSource.findOne).mockResolvedValueOnce({
        slug: "muyassar",
        name: { ar: "التفسير الميسر" },
        author: "Ministry",
        language: "ar",
        direction: "rtl" as const,
        format: "text" as const,
        grouping: "ayah" as const,
        generation: 1,
        ingestedAt: new Date(),
      } as any);

      vi.mocked(TafsirIngestionState.findOneAndUpdate).mockResolvedValueOnce(null);
      vi.mocked(TafsirIngestionState.findOne).mockResolvedValueOnce(null);
      vi.mocked(Tafsir.findOneAndUpdate).mockResolvedValueOnce(null);
      vi.mocked(TafsirSource.findOneAndUpdate).mockResolvedValueOnce(null);

      const nullAdapter = vi.fn().mockResolvedValue(null);
      ADAPTER_MAP.set("null-test-source", nullAdapter as any);

      await runIngestion("null-test-source", { restart: true });

      expect(nullAdapter).toHaveBeenCalled();
    });
  });

  describe("ADAPTER_MAP", () => {
    it("contains registered adapters for all v1 sources", () => {
      expect(ADAPTER_MAP.has("muyassar")).toBe(true);
      expect(ADAPTER_MAP.has("mukhtasar")).toBe(true);
      expect(ADAPTER_MAP.has("tadabbur-wa-amal")).toBe(true);
    });

    it("each adapter is a function", () => {
      const muyassar = ADAPTER_MAP.get("muyassar");
      const mukhtasar = ADAPTER_MAP.get("mukhtasar");
      const tadabbur = ADAPTER_MAP.get("tadabbur-wa-amal");

      expect(typeof muyassar).toBe("function");
      expect(typeof mukhtasar).toBe("function");
      expect(typeof tadabbur).toBe("function");
    });
  });
});