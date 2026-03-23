import mongoose from "mongoose";

/**
 * Establishes a connection to MongoDB using Mongoose.
 * Reads the connection URI from the MONGO_URI environment variable.
 * Logs success or exits the process on failure.
 */
export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGO_URI;

    // Ensure the environment variable is set
    if (!mongoURI) {
      throw new Error("MONGO_URI is not defined in environment variables.");
    }

    const conn = await mongoose.connect(mongoURI);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${(error as Error).message}`);
    process.exit(1);
  }
};

/**
 * The underlying Mongoose connection instance.
 * Use `monogs.collection("collectionName")` for direct collection access.
 */
export const monogs = mongoose.connection;
