export const QURAN_API = "https://api.quran.com/api/v4";
export const TOTAL_PAGES = 604;
export const DELAY_MS = 300;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Phonetic Group Mapping (Buckwalter first letter → group) ---
const phoneticGroupMap = {
  // Labials
  b: "labial",
  f: "labial",
  m: "labial",
  w: "labial",
  // Dentals
  t: "dental",
  d: "dental",
  s: "dental",
  z: "dental",
  n: "dental",
  r: "dental",
  l: "dental",
  v: "dental",
  // Emphatics
  T: "emphatic",
  D: "emphatic",
  S: "emphatic",
  Z: "emphatic",
  // Palatals
  j: "palatal",
  y: "palatal",
  $: "palatal",
  // Velars/Uvulars
  k: "velar",
  q: "velar",
  g: "velar",
  x: "velar",
  // Pharyngeals
  H: "pharyngeal",
  E: "pharyngeal",
  // Glottals
  h: "glottal",
  "'": "glottal",
  ">": "glottal",
  A: "glottal",
};

export function getPhoneticGroup(root: string) {
  if (!root || root.length === 0) return "other";
  return (phoneticGroupMap as any)[root[0]] || "other";
}

export async function fetchPageFromAPI(pageNumber: number) {
  let allVerses: any[] = [];
  let currentPage = 1;

  while (true) {
    const url = `${QURAN_API}/verses/by_page/${pageNumber}?words=true&translations=131&fields=text_uthmani,page_number&per_page=50&page=${currentPage}&word_fields=text_uthmani,transliteration,translation`;
    const res = await fetch(url);
    if (!res.ok)
      throw new Error(`API error on page ${pageNumber}: ${res.status}`);
    const data: any = await res.json();

    allVerses = allVerses.concat(data.verses);

    if (data.verses.length < 50 || !data.pagination?.next_page) break;
    currentPage++;
  }

  return allVerses;
}
