import mongoose, { Schema, model } from "mongoose";

const verseSchema = new Schema(
  {
    surah: { type: Number, required: true },
    ayah: { type: Number, required: true },
    page: { type: Number, required: true },
    arabic: { type: String, required: true },
    translation: { type: String, default: "" },
    juz: { type: Number },
    hizb: { type: Number },
    rub: { type: Number },
    manzil: { type: Number },
    sajda: { type: Boolean, default: false },
    next: {
      surah: { type: Number },
      ayah: { type: Number },
    },
    prev: {
      surah: { type: Number },
      ayah: { type: Number },
    },
  },
  { timestamps: true },
);

verseSchema.index({ surah: 1, ayah: 1 }, { unique: true });
verseSchema.index({ page: 1 });

export const Verse = mongoose.models.Verse || model("Verse", verseSchema);
