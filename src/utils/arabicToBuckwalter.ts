import { BUCKWALTER_MAP } from "../constants/buckwalter.map.js";

// Reverse map: Arabic → Buckwalter
const ARABIC_TO_BW: Record<string, string> = Object.fromEntries(
  Object.entries(BUCKWALTER_MAP).map(([bw, ar]) => [ar, bw]),
);

export function arabicToBuckwalter(text: string): string {
  return text
    .split("")
    .map((c) => ARABIC_TO_BW[c] || c)
    .join("");
}
