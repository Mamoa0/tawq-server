import { MongoMemoryServer } from "mongodb-memory-server";
import { config } from "dotenv";
import { resolve } from "path";

let mongoServer: MongoMemoryServer;

export const setup = async () => {
  // Load environment variables from .env file
  config({ path: resolve(process.cwd(), ".env") });

  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI_TEST = mongoServer.getUri();
};

export const teardown = async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
};
