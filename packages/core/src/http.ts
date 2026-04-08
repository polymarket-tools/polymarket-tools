import { sanitizeError } from './errors';

export const DEFAULT_CLOB_HOST = 'https://clob.polymarket.com';
export const DEFAULT_GAMMA_HOST = 'https://gamma-api.polymarket.com';

/**
 * Shared JSON fetch utility with error handling and auth sanitization.
 * Handles 429 rate limits with actionable error messages.
 */
export async function fetchJson<T>(url: string, apiName: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw sanitizeError(error, 0, url);
  }

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const message = retryAfter
        ? `Rate limited. Retry after ${retryAfter} seconds.`
        : 'Rate limited.';
      throw sanitizeError(new Error(message), 429, url);
    }

    const body = await response.text().catch(() => '');
    throw sanitizeError(
      new Error(`${apiName} error: ${response.status} ${response.statusText} - ${body}`),
      response.status,
      url,
    );
  }

  return response.json() as Promise<T>;
}
