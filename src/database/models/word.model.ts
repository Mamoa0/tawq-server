import mongoose, { Schema, model } from "mongoose";

const wordSchema = new Schema(
  {
    surah: { type: Number, required: true },
    ayah: { type: Number, required: true },
    word: { type: Number, required: true },
    arabic: { type: String, required: true },
    transliteration: { type: String, default: "" },
    translation: { type: String, default: "" },
  },
  { timestamps: true },
);

wordSchema.index({ surah: 1, ayah: 1, word: 1 }, { unique: true });
wordSchema.index({ surah: 1, ayah: 1 });

export const Word = mongoose.models.Word || model("Word", wordSchema);
