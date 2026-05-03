/**
 * Canonicalize an HTTP method + path pair for parity comparison.
 *
 * Rules (contracts/openapi-parity.contract.md §4):
 * - Method lowercased
 * - Trailing slash stripped (except bare "/")
 * - Path params normalized to {name} format (:name → {name})
 * - Consecutive slashes collapsed
 * - Host/base URL removed (path-only input assumed)
 */
export function canonical(method: string, path: string): string {
  let p = path;
  p = p.replace(/\/\/+/g, "/");
  p = paramToOpenApi(p);
  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  return `${method.toLowerCase()} ${p}`;
}

/** Convert Fastify :param notation to OpenAPI {param} path syntax. */
export function paramToOpenApi(path: string): string {
  return path.replace(/:([^/{}?]+)/g, "{$1}");
}
