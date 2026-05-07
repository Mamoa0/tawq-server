import { createTafsirAppClient } from "./client.js";
import type { AdapterFn } from "./runner.js";

const client = createTafsirAppClient();

interface MuyassarResponse {
  text: string;
}

export async function normalizeMuyassar(
  surah: number,
  ayah: number,
): Promise<{
  sourceSlug: string;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  text: string;
} | null> {
  const raw = await client.fetchAyah("muyassar", surah, ayah) as MuyassarResponse | null;

  if (!raw || !raw.text || raw.text.trim().length === 0) {
    return null;
  }

  return {
    sourceSlug: "muyassar",
    surah,
    ayahStart: ayah,
    ayahEnd: ayah,
    text: raw.text.trim(),
  };
}

export function createMuyassarAdapter(): AdapterFn {
  return normalizeMuyassar;
}