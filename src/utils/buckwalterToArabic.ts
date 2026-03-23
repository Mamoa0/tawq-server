import { BUCKWALTER_MAP } from "../constants/buckwalter.map.js";

export function buckwalterToArabic(text: string) {
  return text
    ?.split("")
    .map((c) => BUCKWALTER_MAP[c] || c)
    .join("");
}