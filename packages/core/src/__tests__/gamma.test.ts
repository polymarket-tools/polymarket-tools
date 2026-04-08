import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GammaClient, normalizeMarket, buildTokens } from '../gamma';
import { PolymarketError } from '../types';
import type { RawMarket, Tag } from '../types';

// ── Test fixtures (matching real Gamma API response shape) ──────

const RAW_MARKET: RawMarket = {
  conditionId: '0x9c1a39e24e40d3e1f8859cba5b9c540268a131bed064ede7588337a7e2645f18',
  question: 'Russia-Ukraine Ceasefire before GTA VI?',
  slug: 'russia-ukraine-ceasefire-before-gta-vi-554',
  description: 'This market will resolve to "Yes" if a ceasefire is reached before GTA VI launches.',
  active: true,
  closed: false,
  volume: '1435224.264825003',
  liquidity: '61001.0135',
  startDate: '2025-05-02T15:48:00.174Z',
  endDate: '2026-07-31T12:00:00Z',
  outcomes: '["Yes", "No"]',
  outcomePrices: '["0.535", "0.465"]',
  clobTokenIds: '["85014348937654458413290737197591860504988605752925289827623068964690820517937", "25274365426654480055813702738775030297759498889998780242039714689784041375532"]',
  tags: [
    { id: '101259', label: 'Geopolitics', slug: 'geopolitics' },
    { id: '101842', label: 'Gaming', slug: 'gaming' },
  ],
  image: 'https://polymarket-upload.s3.us-east-2.amazonaws.com/russia-ukraine-ceasefire.png',
  icon: 'https://polymarket-upload.s3.us-east-2.amazonaws.com/russia-ukraine-ceasefire-icon.png',
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
    headers: { get: () => null },
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
  });
}

// ── buildTokens tests ───────────────────────────────────────────

describe('buildTokens', () => {
  it('constructs MarketToken[] from JSON-encoded string arrays', () => {
    const tokens = buildTokens(RAW_MARKET);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toEqual({
      tokenId: '85014348937654458413290737197591860504988605752925289827623068964690820517937',
      outcome: 'Yes',
      price: 0.535,
    });
    expect(tokens[1]).toEqual({
      tokenId: '25274365426654480055813702738775030297759498889998780242039714689784041375532',
      outcome: 'No',
      price: 0.465,
    });
  });

  it('returns empty array when outcomes/prices/tokenIds are missing', () => {
    const raw = makeRawMarket({
      outcomes: undefined as unknown as string,
      outcomePrices: undefined as unknown as string,
      clobTokenIds: undefined as unknown as string,
    });
    expect(buildTokens(raw)).toEqual([]);
  });

  it('returns empty array when JSON strings are invalid', () => {
    const raw = makeRawMarket({
      outcomes: 'not valid json',
      outcomePrices: '{bad}',
      clobTokenIds: '',
    });
    expect(buildTokens(raw)).toEqual([]);
  });

  it('handles mismatched array lengths by using shortest', () => {
    const raw = makeRawMarket({
      outcomes: '["Yes", "No", "Maybe"]',
      outcomePrices: '["0.5", "0.3"]',
      clobTokenIds: '["tok1", "tok2"]',
    });
    const tokens = buildTokens(raw);
    expect(tokens).toHaveLength(2);
  });
});

// ── normalizeMarket tests ───────────────────────────────────────

describe('normalizeMarket', () => {
  it('normalizes a full raw market response', () => {
    const result = normalizeMarket(RAW_MARKET);

    expect(result.conditionId).toBe('0x9c1a39e24e40d3e1f8859cba5b9c540268a131bed064ede7588337a7e2645f18');
    expect(result.question).toBe('Russia-Ukraine Ceasefire before GTA VI?');
    expect(result.slug).toBe('russia-ukraine-ceasefire-before-gta-vi-554');
    expect(result.active).toBe(true);
    expect(result.closed).toBe(false);
    expect(result.startDate).toBe('2025-05-02T15:48:00.174Z');
    expect(result.endDate).toBe('2026-07-31T12:00:00Z');
  });

  it('parses string volume and liquidity to numbers', () => {
    const result = normalizeMarket(RAW_MARKET);
    expect(result.volume).toBeCloseTo(1435224.264825003, 5);
    expect(result.liquidity).toBeCloseTo(61001.0135, 4);
  });

  it('builds tokens from JSON-encoded string arrays', () => {
    const result = normalizeMarket(RAW_MARKET);
    expect(result.tokens).toHaveLength(2);
    expect(result.tokens[0].tokenId).toBe('85014348937654458413290737197591860504988605752925289827623068964690820517937');
    expect(result.tokens[0].outcome).toBe('Yes');
    expect(result.tokens[0].price).toBe(0.535);
  });

  it('extracts tag labels as string array', () => {
    const result = normalizeMarket(RAW_MARKET);
    expect(result.tags).toEqual(['Geopolitics', 'Gaming']);
  });

  it('handles missing tags gracefully', () => {
    const raw = makeRawMarket({ tags: undefined as unknown as Tag[] });
    const result = normalizeMarket(raw);
    expect(result.tags).toEqual([]);
  });

  it('handles missing token-related fields gracefully', () => {
    const raw = makeRawMarket({
      outcomes: undefined as unknown as string,
      outcomePrices: undefined as unknown as string,
      clobTokenIds: undefined as unknown as string,
    });
    const result = normalizeMarket(raw);
    expect(result.tokens).toEqual([]);
  });

  it('handles zero/NaN volume and liquidity', () => {
    const raw = makeRawMarket({
      volume: '' as unknown as string,
      liquidity: 'not-a-number' as unknown as string,
    });
    const result = normalizeMarket(raw);
    expect(result.volume).toBe(0);
    expect(result.liquidity).toBe(0);
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

      const results = await client.searchMarkets({ query: 'ceasefire' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('_q=ceasefire');
      expect(results).toHaveLength(1);
      expect(results[0].conditionId).toBe('0x9c1a39e24e40d3e1f8859cba5b9c540268a131bed064ede7588337a7e2645f18');
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
        makeRawMarket({ conditionId: '0xc1', question: 'Q1' }),
        makeRawMarket({ conditionId: '0xc2', question: 'Q2' }),
      ]);

      const results = await client.searchMarkets({ query: 'test' });
      expect(results).toHaveLength(2);
      expect(results[0].conditionId).toBe('0xc1');
      expect(results[1].conditionId).toBe('0xc2');
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

      const result = await client.getMarket('0x9c1a');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/markets/0x9c1a');
      expect(result.conditionId).toBe('0x9c1a39e24e40d3e1f8859cba5b9c540268a131bed064ede7588337a7e2645f18');
      expect(result.question).toBe('Russia-Ukraine Ceasefire before GTA VI?');
    });

    it('normalizes the raw response dates', async () => {
      mockJsonResponse(makeRawMarket({
        startDate: '2026-05-01T00:00:00Z',
        endDate: '2026-05-31T00:00:00Z',
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

      const result = await client.getMarketBySlug('russia-ukraine-ceasefire-before-gta-vi-554');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('slug=russia-ukraine-ceasefire-before-gta-vi-554');
      expect(result.conditionId).toBe('0x9c1a39e24e40d3e1f8859cba5b9c540268a131bed064ede7588337a7e2645f18');
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
        makeRawMarket({ conditionId: '0xfirst' }),
        makeRawMarket({ conditionId: '0xsecond' }),
      ]);

      const result = await client.getMarketBySlug('some-slug');
      expect(result.conditionId).toBe('0xfirst');
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
    it('fetches available tags as Tag objects', async () => {
      const rawTags = [
        { id: '101259', label: 'Health and Human Services', slug: 'health-and-human-services' },
        { id: '101842', label: 'Sweeden', slug: 'sweeden' },
      ];
      mockJsonResponse(rawTags);

      const tags = await client.getTags();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/tags');
      expect(tags).toHaveLength(2);
      expect(tags[0].id).toBe('101259');
      expect(tags[0].label).toBe('Health and Human Services');
      expect(tags[0].slug).toBe('health-and-human-services');
      expect(tags[1].label).toBe('Sweeden');
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
