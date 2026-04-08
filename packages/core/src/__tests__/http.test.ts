import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJson } from '../http';
import { PolymarketError } from '../types';

// ── Mock fetch ───────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── fetchJson tests ─────────────────────────────────────────────

describe('fetchJson', () => {
  it('returns parsed JSON on successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ price: '0.65' }),
    });

    const result = await fetchJson<{ price: string }>('https://clob.polymarket.com/price?token_id=tok1', 'CLOB API');
    expect(result).toEqual({ price: '0.65' });
  });

  it('throws PolymarketError with retry info on 429 with Retry-After header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Map([['retry-after', '12']]),
    });

    try {
      await fetchJson('https://clob.polymarket.com/price', 'CLOB API');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PolymarketError);
      const error = e as PolymarketError;
      expect(error.statusCode).toBe(429);
      expect(error.message).toContain('Retry after 12 seconds');
    }
  });

  it('throws PolymarketError without retry info on 429 without Retry-After header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Map(),
    });

    try {
      await fetchJson('https://clob.polymarket.com/price', 'CLOB API');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PolymarketError);
      const error = e as PolymarketError;
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Rate limited.');
    }
  });

  it('throws PolymarketError with apiName on non-OK status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Map(),
      text: () => Promise.resolve('server broke'),
    });

    try {
      await fetchJson('https://clob.polymarket.com/price', 'CLOB API');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PolymarketError);
      const error = e as PolymarketError;
      expect(error.statusCode).toBe(500);
      expect(error.message).toContain('CLOB API');
    }
  });

  it('wraps network errors in PolymarketError', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    try {
      await fetchJson('https://clob.polymarket.com/price', 'CLOB API');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PolymarketError);
      const error = e as PolymarketError;
      expect(error.message).toContain('fetch failed');
    }
  });

  it('includes apiName in error message for server errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: new Map(),
      text: () => Promise.resolve('upstream timeout'),
    });

    try {
      await fetchJson('https://gamma-api.polymarket.com/markets', 'Gamma API');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PolymarketError);
      const error = e as PolymarketError;
      expect(error.message).toContain('Gamma API error');
    }
  });
});
