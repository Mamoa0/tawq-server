import mongoose, { Schema, model } from "mongoose";

const tokenSchema = new Schema(
  {
    surah: Number,
    ayah: Number,
    word: Number,
    segment: Number,
    form: String,
    tag: String,
    STEM: Boolean,
    POS: String,
    LEM: String,
    ROOT: String,
    MS: Boolean,
    MP: Boolean,
    GEN: Boolean,
    NOM: Boolean,
    ACC: Boolean,
    ACT: Boolean,
    PASS: Boolean,
    PCPL: Boolean,
    IMPF: Boolean,
    PERF: Boolean,
    IMPV: Boolean,
    SUB: Boolean,
    INC: Boolean,
    RES: Boolean,
    CIRC: Boolean,
    REM: Boolean,
    SUP: Boolean,
  },
  { timestamps: true },
);

tokenSchema.index({ surah: 1, ayah: 1 });
tokenSchema.index({ surah: 1, ayah: 1, word: 1 });
tokenSchema.index({ ROOT: 1 });
tokenSchema.index({ LEM: 1 });
tokenSchema.index({ POS: 1 });

export const Token = mongoose.models.Token || model("Token", tokenSchema);
