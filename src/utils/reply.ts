import type { FastifyReply } from "fastify";

/**
 * Pagination metadata returned alongside list responses.
 */
export interface Meta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

/**
 * The single response envelope used by every endpoint.
 *
 *   { data }                                         — single resource / collection
 *   { data, meta: { page, limit, totalCount, totalPages } } — paginated collection
 *
 * Error responses use a different shape (see error.middleware.ts):
 *   { statusCode, error, message }
 */
export interface Envelope<T> {
  data: T;
  meta?: Meta;
}

/**
 * Compute pagination meta. `page` and `limit` are assumed to be already
 * normalized (positive integers).
 */
export function buildMeta(page: number, limit: number, totalCount: number): Meta {
  return {
    page,
    limit,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / limit)),
  };
}

/**
 * Send a successful response in the standard envelope. Use this instead
 * of `reply.send({ data })` so every endpoint emits the same shape.
 */
export function ok<T>(reply: FastifyReply, data: T, meta?: Meta): FastifyReply {
  return reply.send(meta ? { data, meta } : { data });
}

/**
 * Shape returned today by several services: flat `{ data, totalCount,
 * page, limit, totalPages }`. This helper lifts that into the standard
 * `{ data, meta }` envelope so controllers don't have to.
 */
export function okPaginated<T>(
  reply: FastifyReply,
  payload: {
    data: T;
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
  },
): FastifyReply {
  return reply.send({
    data: payload.data,
    meta: {
      page: payload.page,
      limit: payload.limit,
      totalCount: payload.totalCount,
      totalPages: payload.totalPages,
    },
  });
}
