import { BUCKWALTER_MAP } from "../constants/buckwalter.map.js";

const cache = new Map<string, string>();

export function buckwalterToArabic(text: string): string {
  if (!text) return text;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const result = text.split("").map((c) => BUCKWALTER_MAP[c] || c).join("");
  cache.set(text, result);
  return result;
}