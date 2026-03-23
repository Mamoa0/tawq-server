import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getRoots, getRoot } from "./roots.service.js";

export const getRootsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const result = await getRoots();
  reply.send({ data: result });
};

export const getRootHandler = async (
  request: FastifyRequest<{ Params: { root: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { root } = request.params;
  const result = await getRoot(root);
  if (!result) {
    reply.status(404).send({ error: "Not Found", message: "Root not found" });
    return;
  }
  reply.send({ data: result });
};

/**
 * Roots routes plugin.
 * Register with: app.register(rootsRoutes, { prefix: "/api/roots" })
 */
export async function rootsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", getRootsHandler);
  app.get("/:root", getRootHandler);
}
