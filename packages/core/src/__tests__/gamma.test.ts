import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GammaClient, normalizeMarket, normalizeToken } from '../gamma';
import { PolymarketError } from '../types';
import type { RawMarket, RawMarketToken } from '../types';

// ── Test fixtures ────────────────────────────────────────────────

const RAW_TOKEN: RawMarketToken = {
  token_id: 'tok_abc123',
  outcome: 'Yes',
  price: 0.65,
};

const RAW_MARKET: RawMarket = {
  condition_id: 'cond_xyz789',
  question: 'Will it rain tomorrow?',
  slug: 'will-it-rain-tomorrow',
  description: 'Resolves Yes if it rains.',
  active: true,
  closed: false,
  volume: 50000,
  liquidity: 12000,
  start_date_iso: '2026-04-01T00:00:00Z',
  end_date_iso: '2026-04-30T00:00:00Z',
  tokens: [RAW_TOKEN],
  tags: ['weather', 'daily'],
  image: 'https://example.com/rain.png',
  icon: 'https://example.com/rain-icon.png',
};

function makeRawMarket(overrides: Partial<RawMarket> = {}): RawMarket {
  return { ...RAW_MARKET, ...overrides };
}

// ── Mock fetch ───────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockJsonResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function mockErrorResponse(status: number, body = '') {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
  });
}

// ── Normalizer tests ─────────────────────────────────────────────

describe('normalizeToken', () => {
  it('converts snake_case to camelCase', () => {
    const result = normalizeToken(RAW_TOKEN);
    expect(result).toEqual({
      tokenId: 'tok_abc123',
      outcome: 'Yes',
      price: 0.65,
    });
  });
});

describe('normalizeMarket', () => {
  it('converts a full raw market to camelCase', () => {
    const result = normalizeMarket(RAW_MARKET);

    expect(result.conditionId).toBe('cond_xyz789');
    expect(result.question).toBe('Will it rain tomorrow?');
    expect(result.slug).toBe('will-it-rain-tomorrow');
    expect(result.active).toBe(true);
    expect(result.closed).toBe(false);
    expect(result.volume).toBe(50000);
    expect(result.liquidity).toBe(12000);
    expect(result.startDate).toBe('2026-04-01T00:00:00Z');
    expect(result.endDate).toBe('2026-04-30T00:00:00Z');
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].tokenId).toBe('tok_abc123');
    expect(result.tags).toEqual(['weather', 'daily']);
  });

  it('handles missing tokens and tags gracefully', () => {
    const raw = {
      ...RAW_MARKET,
      tokens: undefined as unknown as RawMarketToken[],
      tags: undefined as unknown as string[],
    };
    const result = normalizeMarket(raw);
    expect(result.tokens).toEqual([]);
    expect(result.tags).toEqual([]);
  });
});

// ── GammaClient tests ────────────────────────────────────────────

describe('GammaClient', () => {
  let client: GammaClient;

  beforeEach(() => {
    client = new GammaClient();
  });

  describe('searchMarkets', () => {
    it('sends query as _q param', async () => {
      mockJsonResponse([RAW_MARKET]);

      const results = await client.searchMarkets({ query: 'rain' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('_q=rain');
      expect(results).toHaveLength(1);
      expect(results[0].conditionId).toBe('cond_xyz789');
    });

    it('includes filter params when provided', async () => {
      mockJsonResponse([]);

      await client.searchMarkets({
        query: 'election',
        active: true,
        closed: false,
        limit: 10,
        offset: 5,
        order: 'volume',
        ascending: false,
        tag: 'politics',
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('active=true');
      expect(url).toContain('closed=false');
      expect(url).toContain('_limit=10');
      expect(url).toContain('_offset=5');
      expect(url).toContain('_order=volume');
      expect(url).toContain('_ascending=false');
      expect(url).toContain('tag=politics');
    });

    it('returns empty array for no results', async () => {
      mockJsonResponse([]);

      const results = await client.searchMarkets({ query: 'nonexistent' });
      expect(results).toEqual([]);
    });

    it('normalizes raw market data', async () => {
      mockJsonResponse([
        makeRawMarket({ condition_id: 'c1', question: 'Q1' }),
        makeRawMarket({ condition_id: 'c2', question: 'Q2' }),
      ]);

      const results = await client.searchMarkets({ query: 'test' });
      expect(results).toHaveLength(2);
      expect(results[0].conditionId).toBe('c1');
      expect(results[1].conditionId).toBe('c2');
    });

    it('throws PolymarketError on API error', async () => {
      mockErrorResponse(500, 'Internal Server Error');

      await expect(client.searchMarkets({ query: 'fail' }))
        .rejects
        .toThrow(PolymarketError);
    });

    it('includes status code in error', async () => {
      mockErrorResponse(429, 'Rate limited');

      try {
        await client.searchMarkets({ query: 'fail' });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(PolymarketError);
        expect((e as PolymarketError).statusCode).toBe(429);
      }
    });
  });

  describe('getMarket', () => {
    it('fetches a market by conditionId', async () => {
      mockJsonResponse(RAW_MARKET);

      const result = await client.getMarket('cond_xyz789');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/markets/cond_xyz789');
      expect(result.conditionId).toBe('cond_xyz789');
      expect(result.question).toBe('Will it rain tomorrow?');
    });

    it('normalizes the raw response', async () => {
      mockJsonResponse(makeRawMarket({
        start_date_iso: '2026-05-01T00:00:00Z',
        end_date_iso: '2026-05-31T00:00:00Z',
      }));

      const result = await client.getMarket('some-id');
      expect(result.startDate).toBe('2026-05-01T00:00:00Z');
      expect(result.endDate).toBe('2026-05-31T00:00:00Z');
    });

    it('throws PolymarketError on 404', async () => {
      mockErrorResponse(404, 'Not Found');

      await expect(client.getMarket('nonexistent'))
        .rejects
        .toThrow(PolymarketError);
    });
  });

  describe('getMarketBySlug', () => {
    it('fetches a market by slug', async () => {
      mockJsonResponse([RAW_MARKET]);

      const result = await client.getMarketBySlug('will-it-rain-tomorrow');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('slug=will-it-rain-tomorrow');
      expect(result.conditionId).toBe('cond_xyz789');
    });

    it('throws PolymarketError when no market found', async () => {
      mockJsonResponse([]);

      await expect(client.getMarketBySlug('nonexistent-slug'))
        .rejects
        .toThrow(PolymarketError);

      try {
        mockJsonResponse([]);
        await client.getMarketBySlug('nonexistent-slug');
      } catch (e) {
        expect((e as PolymarketError).statusCode).toBe(404);
      }
    });

    it('returns first market when multiple match', async () => {
      mockJsonResponse([
        makeRawMarket({ condition_id: 'first' }),
        makeRawMarket({ condition_id: 'second' }),
      ]);

      const result = await client.getMarketBySlug('some-slug');
      expect(result.conditionId).toBe('first');
    });
  });

  describe('getMarkets', () => {
    it('fetches markets with no filters', async () => {
      mockJsonResponse([RAW_MARKET]);

      const results = await client.getMarkets();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toMatch(/\/markets$/);
      expect(results).toHaveLength(1);
    });

    it('includes filter params', async () => {
      mockJsonResponse([]);

      await client.getMarkets({ active: true, tag: 'crypto', limit: 5, offset: 10 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('active=true');
      expect(url).toContain('tag=crypto');
      expect(url).toContain('_limit=5');
      expect(url).toContain('_offset=10');
    });
  });

  describe('getTags', () => {
    it('fetches available tags', async () => {
      mockJsonResponse(['politics', 'crypto', 'sports']);

      const tags = await client.getTags();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/tags');
      expect(tags).toEqual(['politics', 'crypto', 'sports']);
    });
  });

  describe('custom host', () => {
    it('uses custom host when provided', async () => {
      const customClient = new GammaClient({ host: 'https://custom.api.com' });
      mockJsonResponse([]);

      await customClient.searchMarkets({ query: 'test' });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url.startsWith('https://custom.api.com/')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('wraps network errors in PolymarketError', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(client.searchMarkets({ query: 'fail' }))
        .rejects
        .toThrow(PolymarketError);
    });

    it('strips sensitive data from errors', async () => {
      mockFetch.mockRejectedValueOnce(
        new Error('Request failed: apiKey=secret123 apiSecret=supersecret'),
      );

      try {
        await client.searchMarkets({ query: 'fail' });
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as PolymarketError;
        expect(error.message).not.toContain('secret123');
        expect(error.message).not.toContain('supersecret');
        expect(error.message).toContain('[REDACTED]');
      }
    });
  });
});
