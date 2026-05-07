import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeMukhtasar } from "../../../src/scripts/tafsir/mukhtasar.js";
import { createTafsirAppClient } from "../../../src/scripts/tafsir/client.js";

vi.mock("../../../src/scripts/tafsir/client.js", () => ({
  createTafsirAppClient: vi.fn(() => ({
    fetchAyah: vi.fn(),
  })),
}));

describe("mukhtasar adapter", () => {
  const mockClient = vi.mocked(createTafsirAppClient)();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeMukhtasar", () => {
    it("returns null when text is empty", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce({ text: "" });
      const result = await normalizeMukhtasar(1, 1);
      expect(result).toBeNull();
    });

    it("returns null when text is whitespace only", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce({ text: "   " });
      const result = await normalizeMukhtasar(1, 1);
      expect(result).toBeNull();
    });

    it("returns null when response is null", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce(null);
      const result = await normalizeMukhtasar(1, 1);
      expect(result).toBeNull();
    });

    it("returns correct shape for valid response", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce({
        text: "هذا تفسير مختصير",
      });
      const result = await normalizeMukhtasar(2, 20);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.sourceSlug).toBe("mukhtasar");
        expect(result.surah).toBe(2);
        expect(result.ayahStart).toBe(20);
        expect(result.ayahEnd).toBe(20);
        expect(typeof result.text).toBe("string");
      }
    });

    it("sets ayahStart equal to ayahEnd for single-ayah source", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce({
        text: "Test text",
      });
      const result = await normalizeMukhtasar(1, 1);
      if (result) {
        expect(result.ayahStart).toBe(result.ayahEnd);
      }
    });

    it("trims whitespace from text", async () => {
      vi.mocked(mockClient.fetchAyah).mockResolvedValueOnce({
        text: "  Test text  ",
      });
      const result = await normalizeMukhtasar(1, 1);
      if (result) {
        expect(result.text).toBe(result.text.trim());
        expect(result.text).toBe("Test text");
      }
    });
  });
});