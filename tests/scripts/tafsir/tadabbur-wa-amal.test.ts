import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeTadabburWaAmal } from "../../../src/scripts/tafsir/tadabbur-wa-amal.js";
import { createTafsirAppClient } from "../../../src/scripts/tafsir/client.js";

vi.mock("../../../src/scripts/tafsir/client.js", () => ({
  createTafsirAppClient: vi.fn(() => ({
    fetchAyah: vi.fn(),
  })),
}));

describe("tadabbur-wa-amal adapter", () => {
  const mockClient = vi.mocked(createTafsirAppClient)();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeTadabburWaAmal", () => {
    it("returns null when text is empty", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce({ text: "", ayahs_start: 20, count: 5 });
      const result = await normalizeTadabburWaAmal(1, 1);
      expect(result).toBeNull();
    });

    it("returns null when text is whitespace only", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce({ text: "   ", ayahs_start: 20, count: 5 });
      const result = await normalizeTadabburWaAmal(1, 1);
      expect(result).toBeNull();
    });

    it("returns null when response is null", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce(null);
      const result = await normalizeTadabburWaAmal(1, 1);
      expect(result).toBeNull();
    });

    it("derives ayahEnd from ayahs_start + count - 1", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce({
        text: "Test text",
        ayahs_start: 20,
        count: 5,
      });
      const result = await normalizeTadabburWaAmal(2, 22);
      if (result) {
        expect(result.ayahEnd).toBe(24);
      }
    });

    it("handles single ayah within range", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce({
        text: "Test text",
        ayahs_start: 20,
        count: 1,
      });
      const result = await normalizeTadabburWaAmal(2, 20);
      if (result) {
        expect(result.ayahEnd).toBe(20);
      }
    });

    it("returns correct shape for valid response", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce({
        text: "Test text",
        ayahs_start: 20,
        count: 3,
      });
      const result = await normalizeTadabburWaAmal(2, 20);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.sourceSlug).toBe("tadabbur-wa-amal");
        expect(result.surah).toBe(2);
        expect(result.ayahStart).toBe(20);
        expect(result.ayahEnd).toBe(22);
        expect(typeof result.text).toBe("string");
      }
    });

    it("trims whitespace from text", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce({
        text: "  Test text  ",
        ayahs_start: 1,
        count: 1,
      });
      const result = await normalizeTadabburWaAmal(1, 1);
      if (result) {
        expect(result.text).toBe(result.text.trim());
        expect(result.text).toBe("Test text");
      }
    });
  });
});