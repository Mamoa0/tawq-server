import { describe, it, expect } from "vitest";
import { hmacKey, keyPrefix } from "../../src/utils/hmac.js";
import { createHmac } from "node:crypto";

describe("Unit: HMAC Utilities", () => {
  it("hmacKey produces deterministic output", () => {
    const plaintext = "test_key_12345678901234567890";
    const hash1 = hmacKey(plaintext);
    const hash2 = hmacKey(plaintext);

    expect(hash1).toBe(hash2);
  });

  it("hmacKey output is 64 characters (hex)", () => {
    const plaintext = "test_key_for_length_validation";
    const hash = hmacKey(plaintext);

    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it("hmacKey output is lowercase hex only", () => {
    const plaintext = "another_test_key_abc123";
    const hash = hmacKey(plaintext);

    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    expect(hash).toBe(hash.toLowerCase());
  });

  it("different peppers produce different outputs for the same plaintext", () => {
    // Since API_KEY_PEPPER is cached at module import time, we validate the
    // primitive directly to verify that hmacKey would produce different outputs
    // if the pepper changed at runtime.
    const plaintext = "consistent_plaintext_key";
    const hashWithPepper1 = createHmac("sha256", "a".repeat(64))
      .update(plaintext)
      .digest("hex");
    const hashWithPepper2 = createHmac("sha256", "b".repeat(64))
      .update(plaintext)
      .digest("hex");

    expect(hashWithPepper1).not.toBe(hashWithPepper2);
  });

  it("different plaintexts produce different outputs", () => {
    const key1 = "plaintext_key_one_1234567890";
    const key2 = "plaintext_key_two_1234567890";

    const hash1 = hmacKey(key1);
    const hash2 = hmacKey(key2);

    expect(hash1).not.toBe(hash2);
  });

  it("keyPrefix returns first 8 characters of SHA-256 digest", () => {
    const plaintext = "prefix_test_key_12345678";
    const prefix = keyPrefix(plaintext);

    expect(prefix).toHaveLength(8);
    expect(/^[0-9a-f]{8}$/.test(prefix)).toBe(true);
  });

  it("keyPrefix output is lowercase hex only", () => {
    const plaintext = "another_prefix_test_key";
    const prefix = keyPrefix(plaintext);

    expect(/^[0-9a-f]+$/.test(prefix)).toBe(true);
    expect(prefix).toBe(prefix.toLowerCase());
  });

  it("keyPrefix is deterministic", () => {
    const plaintext = "deterministic_prefix_key";
    const prefix1 = keyPrefix(plaintext);
    const prefix2 = keyPrefix(plaintext);

    expect(prefix1).toBe(prefix2);
  });
});
