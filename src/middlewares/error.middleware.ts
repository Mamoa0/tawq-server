import { FastifyError, FastifyRequest, FastifyReply } from "fastify";

/**
 * Global Error Handler for Fastify.
 * Catches unhandled exceptions and validation errors thrown by Fastify's built-in schema validator.
 *
 * @param error The thrown Error object
 * @param request The Fastify request
 * @param reply The Fastify reply
 */
export const errorHandler = (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void => {
  const statusCode = error.statusCode || 500;
  const isDev = process.env.NODE_ENV !== "production";

  // Log with the Fastify (Pino) logger so the error is correlated with
  // the request via req.id, not dumped to console with no structure.
  request.log.error({ err: error, statusCode }, "request failed");

  const response = {
    statusCode,
    error:
      statusCode === 500
        ? "Internal Server Error"
        : error.code || "Bad Request",
    message:
      statusCode === 500 && !isDev
        ? "An unexpected error occurred"
        : error.message || "An unexpected error occurred",
  };

  reply.status(statusCode).send(response);
};
