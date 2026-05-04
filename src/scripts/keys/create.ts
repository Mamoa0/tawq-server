import { argv } from "node:process";
import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { issueKey } from "../../modules/keys/keys.service.js";

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

  let expiresAt: Date | null = null;
  if (args.expires) {
    expiresAt = new Date(args.expires);
    if (isNaN(expiresAt.getTime())) {
      console.error("Error: Invalid --expires date format");
      process.exit(1);
    }
  }

  await mongoose.connect(env.MONGO_URI);

  try {
    const issued = await issueKey(args.label, expiresAt);

    console.log(JSON.stringify({
      id: issued.id,
      plaintext: issued.key,
      label: issued.label,
      createdAt: issued.createdAt,
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
