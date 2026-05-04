import { randomBytes } from "node:crypto";
import { ApiKey } from "../../database/models/api-key.model.js";
import { hmacKey } from "../../utils/hmac.js";

export interface IssuedKey {
  id: string;
  key: string;
  label: string;
  createdAt: string;
}

/**
 * Generate a new API key, hash it, persist to DB, and return the plaintext once.
 * The plaintext is never stored — callers must surface it immediately to the user.
 */
export const issueKey = async (label?: string, expiresAt?: Date | null): Promise<IssuedKey> => {
  const effectiveLabel = label ?? "self-service";
  const plaintext = randomBytes(32).toString("hex").slice(0, 64);
  const hashedKey = hmacKey(plaintext);

  const doc = await ApiKey.create({
    hashedKey,
    label: effectiveLabel,
    status: "active",
    expiresAt: expiresAt ?? null,
  });

  return {
    id: doc._id.toString(),
    key: plaintext,
    label: doc.label,
    createdAt: doc.createdAt.toISOString(),
  };
};
