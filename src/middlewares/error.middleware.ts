import { FastifyError, FastifyRequest, FastifyReply } from "fastify";

/**
 * Global Error Handler for Fastify.
 * Catches unhandled exceptions and validation errors thrown by Fastify's built-in schema validator.
 * Ensures 401 responses carry the stable body shape required by contracts/auth.contract.md §4.
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

  request.log.error({ err: error, statusCode }, "request failed");

  // 401 Unauthorized: use stable error body shape per contracts/auth.contract.md §4
  if (statusCode === 401) {
    reply.header("WWW-Authenticate", 'ApiKey realm="quran-api"');
    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.status(401).send({
      error: "InvalidApiKey",
      message: "The supplied API key is invalid.",
      requestId: request.id,
    });
    return;
  }

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
