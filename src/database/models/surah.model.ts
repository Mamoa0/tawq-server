import mongoose, { Schema, model } from "mongoose";

const surahSchema = new Schema(
  {
    number: { type: Number, required: true, unique: true }, 
    name_arabic: { type: String, required: true },
    name_simple: { type: String, required: true }, 
    name_complex: { type: String, required: true }, 
    name_translated: { type: String, required: true }, 
    revelation_place: { type: String, enum: ["makkah", "madinah"] },
    revelation_order: { type: Number },
    bismillah_pre: { type: Boolean, default: true },
    verses_count: { type: Number, required: true }, 
    pages: {
      start: { type: Number }, 
      end: { type: Number }, 
    },
    words_count: { type: Number },
    roots_count: { type: Number },
    top_roots: [
      {
        root: { type: String },
        count: { type: Number },
      },
    ],
  },
  { timestamps: true },
);

export const Surah = mongoose.models.Surah || model("Surah", surahSchema);
