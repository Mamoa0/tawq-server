import { MongoMemoryServer } from "mongodb-memory-server";

let mongoServer: MongoMemoryServer;

export const setup = async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI_TEST = mongoServer.getUri();
};

export const teardown = async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
};
