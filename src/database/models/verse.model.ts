import mongoose, { Schema, model } from "mongoose";

const verseSchema = new Schema(
  {
    surah: { type: Number, required: true },
    ayah: { type: Number, required: true },
    page: { type: Number, required: true },
    arabic: { type: String, required: true },
    translation: { type: String, default: "" },
  },
  { timestamps: true },
);

verseSchema.index({ surah: 1, ayah: 1 }, { unique: true });
verseSchema.index({ page: 1 });

export const Verse = mongoose.models.Verse || model("Verse", verseSchema);
