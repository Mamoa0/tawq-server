import { BUCKWALTER_MAP } from "../constants/buckwalter.map.js";

const ARABIC_TO_BW: Record<string, string> = Object.fromEntries(
  Object.entries(BUCKWALTER_MAP).map(([bw, ar]) => [ar, bw]),
);

const cache = new Map<string, string>();

export function arabicToBuckwalter(text: string): string {
  if (!text) return text;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const result = text.split("").map((c) => ARABIC_TO_BW[c] || c).join("");
  cache.set(text, result);
  return result;
}
