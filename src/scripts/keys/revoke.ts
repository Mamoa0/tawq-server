import { argv } from "node:process";
import mongoose from "mongoose";
import { ApiKey } from "../../database/models/api-key.model.js";
import { env } from "../../config/env.js";

/**
 * CLI script to revoke an API key.
 * Usage: npx tsx src/scripts/keys/revoke.ts --id "507f1f77bcf86cd799439011"
 * Idempotent: revoking an already-revoked key is a no-op.
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

  if (!args.id) {
    console.error("Error: --id is required");
    process.exit(1);
  }

  // Connect to MongoDB
  await mongoose.connect(env.MONGO_URI);

  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(args.id)) {
      console.error("Error: Invalid ObjectId format");
      process.exit(1);
    }

    // Find and update only if not already revoked (true idempotency)
    const key = await ApiKey.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(args.id), status: { $ne: "revoked" } },
      { $set: { status: "revoked", revokedAt: new Date() } },
      { new: true },
    );

    if (!key) {
      // Either not found OR already revoked — look up to distinguish
      const existing = await ApiKey.findById(args.id).lean();
      if (!existing) {
        console.error("Error: API key not found");
        process.exit(1);
      }
      // Already revoked — idempotent success, print current state
      console.log(JSON.stringify({
        id: existing._id.toString(),
        label: existing.label,
        status: existing.status,
        revokedAt: existing.revokedAt?.toISOString() || null,
        note: "already revoked (no-op)",
      }, null, 2));
      process.exit(0);
    }

    console.log(JSON.stringify({
      id: key._id.toString(),
      label: key.label,
      status: key.status,
      revokedAt: key.revokedAt?.toISOString() || null,
    }, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Error revoking API key:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

run();
