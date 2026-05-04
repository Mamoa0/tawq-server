import mongoose, { Schema, model } from "mongoose";

const tafsirSchema = new Schema(
  {
    sourceSlug: { type: String, required: true },
    surah: { type: Number, required: true, min: 1, max: 114 },
    ayahStart: { type: Number, required: true, min: 1 },
    ayahEnd: { type: Number, required: true, min: 1 },
    text: { type: String, required: true, minLength: 1 },
    ingestedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

tafsirSchema.index(
  { sourceSlug: 1, surah: 1, ayahStart: 1, ayahEnd: 1 },
  { unique: true },
);

export const Tafsir = mongoose.models.Tafsir || model("tafsir", tafsirSchema);