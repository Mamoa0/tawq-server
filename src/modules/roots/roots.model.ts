export interface RootDocument {
  _id: string;
  root: string; // Buckwalter
  meaning: {
    short: string;
    description: string;
    arabic_short: string;
    arabic_description: string;
  };
  synonyms: string[];
  related_phonetic: string[];
  related_meaning: string[];
  order: number;
  count: number;
  lemmas_count: number;
  words_count: number;
  surahs_count: number;
  createdAt: Date;
  updatedAt: Date;
}
