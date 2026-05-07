export interface TafsirAppClient {
  fetchAyah(slug: string, surah: number, ayah: number): Promise<unknown>;
}

export interface ClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  spacingMs?: number;
  fetchFn?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://tafsir.app";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_SPACING_MS = 250;

interface TokenBucket {
  lastRequest: number;
}

export function createTafsirAppClient(options: ClientOptions = {}): TafsirAppClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const spacingMs = options.spacingMs ?? DEFAULT_SPACING_MS;
  const fetchFn = options.fetchFn ?? globalThis.fetch;

  const buckets = new Map<string, TokenBucket>();

  function getBucket(host: string): TokenBucket {
    if (!buckets.has(host)) {
      buckets.set(host, { lastRequest: 0 });
    }
    return buckets.get(host)!;
  }

  async function spacedFetch(url: string, timeout: number): Promise<Response> {
    const urlObj = new URL(url);
    const host = urlObj.host;
    const bucket = getBucket(host);

    const now = Date.now();
    const elapsed = now - bucket.lastRequest;
    if (elapsed < spacingMs) {
      await new Promise((resolve) => setTimeout(resolve, spacingMs - elapsed));
    }
    bucket.lastRequest = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetchFn(url, { signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function fetchWithRetry(
    url: string,
    retries: number,
    timeout: number,
  ): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await spacedFetch(url, timeout);

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} from ${url}`,
          );
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error(
            `Unexpected content-type: ${contentType} from ${url}`,
          );
        }

        const json = await response.json() as unknown;
        return json;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (err instanceof TypeError && err.message.includes("abort")) {
          throw new Error(`Request timed out after ${timeout}ms`);
        }

        if (attempt < retries && retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
      }
    }

    throw lastError ?? new Error("Fetch failed");
  }

  return {
    async fetchAyah(slug: string, surah: number, ayah: number): Promise<unknown> {
      const url = `${baseUrl}/get.php?src=${encodeURIComponent(slug)}&s=${surah}&a=${ayah}&ver=1`;
      return fetchWithRetry(url, maxRetries, timeoutMs);
    },
  };
}