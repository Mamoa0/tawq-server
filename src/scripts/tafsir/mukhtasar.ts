import { createTafsirAppClient } from "./client.js";
import type { AdapterFn } from "./runner.js";

const client = createTafsirAppClient();

interface MukhtasarResponse {
  text: string;
}

export async function normalizeMukhtasar(
  surah: number,
  ayah: number,
): Promise<{
  sourceSlug: string;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  text: string;
} | null> {
  const raw = await client.fetchAyah("mukhtasar", surah, ayah) as MukhtasarResponse | null;

  if (!raw || !raw.text || raw.text.trim().length === 0) {
    return null;
  }

  return {
    sourceSlug: "mukhtasar",
    surah,
    ayahStart: ayah,
    ayahEnd: ayah,
    text: raw.text.trim(),
  };
}

export function createMukhtasarAdapter(): AdapterFn {
  return normalizeMukhtasar;
}