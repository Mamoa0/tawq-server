import { createTafsirAppClient } from "./client.js";
import type { AdapterFn } from "./runner.js";

const client = createTafsirAppClient();

interface TadabburResponse {
  ayahs_start: number;
  count: number;
  text: string;
}

export async function normalizeTadabburWaAmal(
  surah: number,
  ayah: number,
): Promise<{
  sourceSlug: string;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  text: string;
} | null> {
  const raw = await client.fetchAyah("tadabbur-wa-amal", surah, ayah) as TadabburResponse | null;

  if (!raw || !raw.text || raw.text.trim().length === 0) {
    return null;
  }

  const ayahStart = typeof raw.ayahs_start === "number" ? raw.ayahs_start : ayah;
  const count = typeof raw.count === "number" ? raw.count : 1;
  const ayahEnd = ayahStart + count - 1;

  return {
    sourceSlug: "tadabbur-wa-amal",
    surah,
    ayahStart,
    ayahEnd,
    text: raw.text.trim(),
  };
}

export function createTadabburWaAmalAdapter(): AdapterFn {
  return normalizeTadabburWaAmal;
}