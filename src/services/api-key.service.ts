import { ApiKey } from "../database/models/api-key.model.js";
import { hmacKey } from "../utils/hmac.js";

export type ValidationReason = "unknown" | "revoked" | "expired" | "empty" | "malformed";

export interface ValidationResult {
  valid: boolean;
  reason?: ValidationReason;
  keyId?: string; // ObjectId of the valid key, if valid
}

/**
 * Simple LRU cache for API key validation results.
 * TTL: 60 seconds, max 10,000 entries.
 */
class KeyValidationCache {
  private cache = new Map<string, { result: ValidationResult; expiresAt: number }>();
  private readonly maxSize = 10_000;
  private readonly ttlMs = 60_000;

  get(hashedKey: string): ValidationResult | null {
    const entry = this.cache.get(hashedKey);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(hashedKey);
      return null;
    }

    return entry.result;
  }

  set(hashedKey: string, result: ValidationResult): void {
    if (this.cache.size >= this.maxSize) {
      // Simple eviction: clear the oldest 10% of entries
      const entriesToDelete = Math.ceil(this.maxSize * 0.1);
      let deleted = 0;
      for (const [key] of this.cache) {
        if (deleted >= entriesToDelete) break;
        this.cache.delete(key);
        deleted++;
      }
    }

    this.cache.set(hashedKey, {
      result,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(hashedKey: string): void {
    this.cache.delete(hashedKey);
  }
}

const cache = new KeyValidationCache();

/**
 * Validates a plaintext API key against the database.
 * Returns {valid: true} if the key is active and not expired.
 * Otherwise returns {valid: false, reason: <enum>}.
 *
 * Uses O(1) indexed lookup + 60s in-process LRU cache.
 * Per contracts/auth.contract.md §6.
 */
export const validateKey = async (plaintext: string): Promise<ValidationResult> => {
  // Check for empty/malformed input first (no DB lookup needed)
  if (!plaintext || plaintext.trim() === "") {
    return { valid: false, reason: "empty" };
  }

  if (plaintext.length > 128) {
    return { valid: false, reason: "malformed" };
  }

  // Check for non-ASCII characters
  if (!/^[\x20-\x7E]+$/.test(plaintext)) {
    return { valid: false, reason: "malformed" };
  }

  // Hash the key for DB lookup
  const hashedKey = hmacKey(plaintext);

  // Check cache first
  const cached = cache.get(hashedKey);
  if (cached) {
    return cached;
  }

  // Look up in database
  const dbKey = await ApiKey.findOne({ hashedKey }).lean<any>();

  if (!dbKey) {
    const result: ValidationResult = { valid: false, reason: "unknown" };
    cache.set(hashedKey, result);
    return result;
  }

  // Check status
  if (dbKey.status === "revoked") {
    const result: ValidationResult = { valid: false, reason: "revoked" };
    cache.set(hashedKey, result);
    return result;
  }

  // Check expiration
  if (dbKey.expiresAt && new Date(dbKey.expiresAt) <= new Date()) {
    const result: ValidationResult = { valid: false, reason: "expired" };
    cache.set(hashedKey, result);
    return result;
  }

  // Key is valid
  const result: ValidationResult = {
    valid: true,
    keyId: (dbKey._id as any).toString(),
  };
  cache.set(hashedKey, result);
  return result;
};

/**
 * Invalidate the cache entry for a key (called when revoking).
 */
export const invalidateCacheEntry = (plaintext: string): void => {
  const hashedKey = hmacKey(plaintext);
  cache.invalidate(hashedKey);
};
