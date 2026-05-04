import mongoose, { Schema, model } from "mongoose";

const tafsirSourceSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      match: /^[a-z0-9](-?[a-z0-9])*$/,
    },
    name: {
      ar: { type: String },
      en: { type: String },
    },
    author: { type: String, required: true },
    language: { type: String, required: true, default: "ar" },
    direction: {
      type: String,
      enum: ["rtl", "ltr"],
      required: true,
      default: "rtl",
    },
    format: {
      type: String,
      enum: ["text", "html"],
      required: true,
      default: "text",
    },
    grouping: {
      type: String,
      enum: ["ayah", "range"],
      required: true,
      default: "ayah",
    },
    homepage: { type: String },
    license: { type: String },
    ingestedAt: { type: Date },
    generation: { type: Number, default: 0 },
  },
  { timestamps: true },
);

tafsirSourceSchema.index({ language: 1 });

export const TafsirSource =
  mongoose.models.TafsirSource || model("tafsirsource", tafsirSourceSchema);