import mongoose, { Schema, model, Document } from "mongoose";

export interface IRootMeaning extends Document {
  root: string; // Buckwalter key
  source: {
    id: string;
    name: string;
    author: string;
    type: "api" | "pdf" | "manual";
  };
  content: string; // raw text from source
  extracted: {
    arabic_short: string;
    synonyms: string[];
    related_roots: string[];
  };
  verified: boolean;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

const rootMeaningSchema = new Schema<IRootMeaning>(
  {
    root: { type: String, required: true },

    source: {
      id: { type: String, required: true },
      name: { type: String },
      author: { type: String },
      type: { type: String, enum: ["api", "pdf", "manual"], default: "api" },
    },

    content: { type: String, default: "" },

    extracted: {
      arabic_short: { type: String, default: "" },
      synonyms: [{ type: String }],
      related_roots: [{ type: String }],
    },

    verified: { type: Boolean, default: false },
    confidence: { type: Number, default: 1.0 },
  },
  { timestamps: true }
);

// Unique per root + source
rootMeaningSchema.index({ root: 1, "source.id": 1 }, { unique: true });
rootMeaningSchema.index({ root: 1 });
rootMeaningSchema.index({ "source.id": 1 });

export const RootMeaning = mongoose.models.RootMeaning || model<IRootMeaning>("RootMeaning", rootMeaningSchema);
