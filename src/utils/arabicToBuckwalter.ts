import { BUCKWALTER_MAP } from "../constants/buckwalter.map.js";

const ARABIC_TO_BW: Record<string, string> = Object.fromEntries(
  Object.entries(BUCKWALTER_MAP).map(([bw, ar]) => [ar, bw]),
);

// Bounded cache: keeps recent conversions hot without leaking memory on
// long-running servers. FIFO eviction is fine — conversions are cheap.
const CACHE_MAX = 5_000;
const cache = new Map<string, string>();

export function arabicToBuckwalter(text: string): string {
  if (!text) return text;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const result = text.split("").map((c) => ARABIC_TO_BW[c] || c).join("");
  if (cache.size >= CACHE_MAX) {
    // Drop the oldest entry (Map preserves insertion order).
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(text, result);
  return result;
}
