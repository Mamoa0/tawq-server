import { createHash, createHmac } from "node:crypto";
import { env } from "../config/env.js";

/**
 * HMAC-SHA-256 hash of a plaintext API key using the API_KEY_PEPPER secret.
 * Returns a 64-char lowercase-hex string suitable for storage in the hashedKey field.
 *
 * Pure function; deterministic given the same plaintext and pepper.
 */
export const hmacKey = (plaintext: string): string => {
  return createHmac("sha256", env.API_KEY_PEPPER).update(plaintext).digest("hex");
};

/**
 * Return the first 8 characters of the SHA-256 hex digest of a plaintext key.
 * Used as keyPrefix in log records per contracts/auth.contract.md §8.
 */
export const keyPrefix = (plaintext: string): string =>
  createHash("sha256").update(plaintext).digest("hex").slice(0, 8);
