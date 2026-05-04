import mongoose, { Schema, model } from "mongoose";

const tafsirIngestionStateSchema = new Schema(
  {
    sourceSlug: { type: String, required: true, unique: true },
    lastSurahCompleted: { type: Number, required: true, default: 0 },
    runningSince: { type: Date, default: null },
    runId: { type: String, default: null },
    updatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

tafsirIngestionStateSchema.index({ sourceSlug: 1 }, { unique: true });

export const TafsirIngestionState =
  mongoose.models.TafsirIngestionState ||
  model("tafsiringestionstate", tafsirIngestionStateSchema);