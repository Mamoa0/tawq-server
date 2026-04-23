import { BUCKWALTER_MAP } from "../constants/buckwalter.map.js";

// Bounded cache: keeps recent conversions hot without leaking memory on
// long-running servers. FIFO eviction is fine — conversions are cheap.
const CACHE_MAX = 5_000;
const cache = new Map<string, string>();

export function buckwalterToArabic(text: string): string {
  if (!text) return text;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const result = text.split("").map((c) => BUCKWALTER_MAP[c] || c).join("");
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(text, result);
  return result;
}