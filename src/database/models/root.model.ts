import mongoose, { Schema, model } from "mongoose";

const rootSchema = new Schema(
  {
    root: { type: String, required: true, unique: true },

    meaning: {
      short: { type: String, default: "" },
      description: { type: String, default: "" },
      arabic_short: { type: String, default: "" },
      arabic_description: { type: String, default: "" },
    },

    synonyms: [{ type: String }],
    related_phonetic: [{ type: String }],
    related_meaning: [{ type: String }],
    semantic_processed: { type: Boolean, default: false },

    co_occurring: [
      {
        root: String,
        count: Number, 
      },
    ],
    co_occurrence_processed: { type: Boolean, default: false },

    order: { type: Number, index: true },
    phonetic_group: { type: String, default: "other", index: true },
    count: { type: Number, default: 0 },
    lemmas_count: { type: Number, default: 0 },
    words_count: { type: Number, default: 0 },
    surahs_count: { type: Number, default: 0 },
  },
  { timestamps: true },
);

rootSchema.index({ count: -1 });

export const Root = mongoose.models.Root || model("Root", rootSchema);
