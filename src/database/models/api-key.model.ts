import mongoose, { Schema, model, Document } from "mongoose";

export type ApiKeyStatus = "active" | "revoked" | "expired";

export interface IApiKey extends Document {
  _id: mongoose.Types.ObjectId;
  hashedKey: string; // 64-char lowercase hex HMAC-SHA-256
  label: string; // Human-readable owner identifier
  status: ApiKeyStatus; // active, revoked, or expired
  createdAt: Date;
  revokedAt?: Date | null; // Set when status transitions to revoked
  expiresAt?: Date | null; // Optional expiry date
  lastUsedAt?: Date | null; // Updated at most once per 60s, best-effort
}

const apiKeySchema = new Schema<IApiKey>(
  {
    hashedKey: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v: string) => /^[0-9a-f]{64}$/.test(v),
        message: "hashedKey must be a 64-char lowercase hex string",
      },
    },
    label: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => v.trim().length > 0,
        message: "label must be non-empty",
      },
    },
    status: {
      type: String,
      enum: ["active", "revoked", "expired"] as const,
      default: "active",
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
      // No expiresAt > createdAt validator: tests and ops both legitimately insert past expiry to mark a key dead. An already-expired key is rejected at validation time anyway.
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Compound index for efficient listing/scanning
apiKeySchema.index({ status: 1, expiresAt: 1 });

// Static method for input validation as documented in T017
apiKeySchema.statics.validateInput = function(
  input: { hashedKey: string; label: string }
): void {
  if (!/^[0-9a-f]{64}$/.test(input.hashedKey)) {
    throw new Error("hashedKey must be a 64-char lowercase hex string");
  }
  if (!input.label || input.label.trim().length === 0) {
    throw new Error("label must be non-empty");
  }
};

export const ApiKey = mongoose.models.ApiKey || model<IApiKey>("ApiKey", apiKeySchema);
