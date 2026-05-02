import { randomBytes } from "node:crypto";
import { argv } from "node:process";
import mongoose from "mongoose";
import { ApiKey } from "../../database/models/api-key.model.js";
import { hmacKey } from "../../utils/hmac.js";
import { env } from "../../config/env.js";

/**
 * CLI script to create a new API key.
 * Usage: npx tsx src/scripts/keys/create.ts --label "my-key" [--expires "2026-12-31"]
 */

const parseArgs = () => {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        args[key] = value;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
};

const run = async () => {
  const args = parseArgs();

  if (!args.label) {
    console.error("Error: --label is required");
    process.exit(1);
  }

  // Connect to MongoDB
  await mongoose.connect(env.MONGO_URI);

  try {
    // Generate a random plaintext key (32 bytes = 64 chars in base64url)
    const plaintext = randomBytes(32).toString("hex").slice(0, 64);
    const hashedKey = hmacKey(plaintext);

    // Parse expiry date if provided
    let expiresAt: Date | null = null;
    if (args.expires) {
      expiresAt = new Date(args.expires);
      if (isNaN(expiresAt.getTime())) {
        console.error("Error: Invalid --expires date format");
        process.exit(1);
      }
    }

    // Create the API key document
    const key = await ApiKey.create({
      hashedKey,
      label: args.label,
      status: "active",
      expiresAt,
    });

    // Output the plaintext key and ID (only printed once, never stored)
    console.log(JSON.stringify({
      id: key._id.toString(),
      plaintext,
      label: key.label,
      createdAt: key.createdAt.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    }, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Error creating API key:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

run();
