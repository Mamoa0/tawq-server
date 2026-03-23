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

  if (process.env.NODE_ENV !== "production") {
    console.error(`[Error] ${request.method} ${request.url}`);
    console.error(error.stack);
  } else {
    request.log.error(error.message);
  }

  const statusCode = error.statusCode || 500;

  const response = {
    statusCode,
    error:
      statusCode === 500
        ? "Internal Server Error"
        : error.code || "Bad Request",
    message: error.message || "An unexpected error occurred",
  };

  reply.status(statusCode).send(response);
};
