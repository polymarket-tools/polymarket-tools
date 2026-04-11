import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DataApiClient,
  normalizeLeaderboardEntry,
  normalizeWalletPosition,
  normalizeWalletTrade,
  normalizeMarketHolder,
  normalizeMarketPosition,
  DEFAULT_DATA_API_HOST,
} from '../data-api';
import { PolymarketError } from '../types';

// ── Real API response fixtures ──────────────────────────────────

import leaderboardFixture from './fixtures/data-api-leaderboard.json';
import positionsFixture from './fixtures/data-api-positions.json';
import tradesFixture from './fixtures/data-api-trades.json';
import holdersFixture from './fixtures/data-api-holders.json';
import valueFixture from './fixtures/data-api-value.json';
import marketPositionsFixture from './fixtures/data-api-market-positions.json';

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
    headers: new Map(),
  });
}

function mockErrorResponse(status: number, body = '', headers?: Map<string, string>) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
    headers: headers ?? new Map(),
  });
}

// ── Normalizer unit tests ────────────────────────────────────────

describe('normalizeLeaderboardEntry', () => {
  it('maps raw API fields to clean interface', () => {
    const raw = leaderboardFixture[0];
    const result = normalizeLeaderboardEntry(raw);

    expect(result).toEqual({
      rank: 1,
      proxyWallet: '0xc2e7800b5af46e6093872b177b7a5e7f0563be51',
      userName: 'beachboy4',
      volume: 1083701.7177539999,
      pnl: 546854.3603540838,
    });
  });

  it('parses rank string to number', () => {
    const raw = { ...leaderboardFixture[1] };
    const result = normalizeLeaderboardEntry(raw);
    expect(result.rank).toBe(2);
    expect(typeof result.rank).toBe('number');
  });

  it('maps vol to volume', () => {
    const raw = leaderboardFixture[0];
    const result = normalizeLeaderboardEntry(raw);
    expect(result.volume).toBe(raw.vol);
  });
});

describe('normalizeWalletPosition', () => {
  it('maps raw API fields to clean interface', () => {
    const raw = positionsFixture[0];
    const result = normalizeWalletPosition(raw);

    expect(result).toEqual({
      market: '0x895e01dbf3e6a33cd9a44ca0f8cdb5df1bd2b0b6ebed5300d28f8da7145145e4',
      outcome: 'Yes',
      size: 248651.2632,
      avgPrice: 0.0402,
      currentValue: 4600.0483,
      cashPnl: -5414.6299,
      percentPnl: -54.0669,
    });
  });

  it('uses conditionId as market', () => {
    const raw = positionsFixture[0];
    const result = normalizeWalletPosition(raw);
    expect(result.market).toBe(raw.conditionId);
  });
});

describe('normalizeWalletTrade', () => {
  it('maps raw API fields to clean interface', () => {
    const raw = tradesFixture[0];
    const result = normalizeWalletTrade(raw);

    expect(result).toEqual({
      market: '0xbf1471a2a118e4467cb7aec2e3c2f448f2a74d746d6090ff24117c7bb3fecfa6',
      tokenId: '1223361296250432334047063463948140187131246046550340235272673736367197930139',
      side: 'BUY',
      price: 0.5007103393843725,
      size: 6240.11,
      timestamp: new Date(1775613755 * 1000).toISOString(),
      transactionHash: '0x1e20e470f258d3a6559664793540dbb802170d7dab56b4c00dd114cabe69c915',
    });
  });

  it('converts unix timestamp to ISO string', () => {
    const raw = tradesFixture[0];
    const result = normalizeWalletTrade(raw);
    // Should be a valid ISO date string
    expect(new Date(result.timestamp).getTime()).toBe(1775613755 * 1000);
  });
});

describe('normalizeMarketHolder', () => {
  it('maps raw API fields to clean interface', () => {
    const raw = holdersFixture[0].holders[0];
    const result = normalizeMarketHolder(raw);

    expect(result).toEqual({
      wallet: '0x89b5cdaaa4866c1e738406712012a630b4078beb',
      size: 3792.136359,
    });
  });

  it('uses proxyWallet as wallet', () => {
    const raw = holdersFixture[0].holders[0];
    const result = normalizeMarketHolder(raw);
    expect(result.wallet).toBe(raw.proxyWallet);
  });

  it('uses amount as size', () => {
    const raw = holdersFixture[0].holders[1];
    const result = normalizeMarketHolder(raw);
    expect(result.size).toBe(3192.605202);
  });
});

describe('normalizeMarketPosition', () => {
  it('maps raw API fields to clean interface', () => {
    const raw = marketPositionsFixture[0].positions[0];
    const result = normalizeMarketPosition(raw);

    expect(result).toEqual({
      proxyWallet: '0xb27bc932bf8110d8f78e55da7d5f0497a18b5b82',
      outcome: 'Up',
      size: 133.203,
      avgPrice: 0.0607,
      currentValue: 4.6621,
      cashPnl: -3.4305,
      realizedPnl: 604.9582,
      totalPnl: 601.5277,
    });
  });
});

// ── DataApiClient tests ──────────────────────────────────────────

describe('DataApiClient', () => {
  describe('constructor', () => {
    it('uses default host when no config provided', () => {
      const client = new DataApiClient();
      // Verify by making a request and checking the URL
      mockJsonResponse([]);
      client.getLeaderboard();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(DEFAULT_DATA_API_HOST),
      );
    });

    it('uses custom host when provided', () => {
      const client = new DataApiClient({ host: 'https://custom.example.com' });
      mockJsonResponse([]);
      client.getLeaderboard();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://custom.example.com'),
      );
    });
  });

  describe('getLeaderboard', () => {
    it('returns normalized leaderboard entries', async () => {
      const client = new DataApiClient();
      mockJsonResponse(leaderboardFixture);

      const result = await client.getLeaderboard({ limit: 2 });

      expect(result).toHaveLength(2);
      expect(result[0].rank).toBe(1);
      expect(result[0].userName).toBe('beachboy4');
      expect(result[0].volume).toBe(1083701.7177539999);
      expect(result[1].rank).toBe(2);
    });

    it('calls /v1/leaderboard with query params', async () => {
      const client = new DataApiClient();
      mockJsonResponse([]);

      await client.getLeaderboard({ timePeriod: '7d', limit: 10, offset: 5 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/v1/leaderboard?');
      expect(calledUrl).toContain('timePeriod=7d');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=5');
    });

    it('calls /v1/leaderboard without query string when no params', async () => {
      const client = new DataApiClient();
      mockJsonResponse([]);

      await client.getLeaderboard();

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe(`${DEFAULT_DATA_API_HOST}/v1/leaderboard`);
    });

    it('propagates API errors', async () => {
      const client = new DataApiClient();
      mockErrorResponse(500, 'Internal Server Error');

      await expect(client.getLeaderboard()).rejects.toThrow(PolymarketError);
    });
  });

  describe('getWalletPositions', () => {
    it('returns normalized positions', async () => {
      const client = new DataApiClient();
      mockJsonResponse(positionsFixture);

      const result = await client.getWalletPositions('0xc2e7800b5af46e6093872b177b7a5e7f0563be51');

      expect(result).toHaveLength(1);
      expect(result[0].market).toBe('0x895e01dbf3e6a33cd9a44ca0f8cdb5df1bd2b0b6ebed5300d28f8da7145145e4');
      expect(result[0].outcome).toBe('Yes');
      expect(result[0].size).toBe(248651.2632);
      expect(result[0].avgPrice).toBe(0.0402);
      expect(result[0].cashPnl).toBe(-5414.6299);
    });

    it('passes wallet as user param', async () => {
      const client = new DataApiClient();
      mockJsonResponse([]);

      await client.getWalletPositions('0xabc123');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/positions?');
      expect(calledUrl).toContain('user=0xabc123');
    });

    it('passes optional params', async () => {
      const client = new DataApiClient();
      mockJsonResponse([]);

      await client.getWalletPositions('0xabc', {
        market: '0xdef',
        sizeThreshold: 100,
        limit: 5,
        offset: 10,
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('market=0xdef');
      expect(calledUrl).toContain('sizeThreshold=100');
      expect(calledUrl).toContain('limit=5');
      expect(calledUrl).toContain('offset=10');
    });

    it('returns empty array for wallets with no positions', async () => {
      const client = new DataApiClient();
      mockJsonResponse([]);

      const result = await client.getWalletPositions('0xempty');
      expect(result).toEqual([]);
    });
  });

  describe('getWalletTrades', () => {
    it('returns normalized trades', async () => {
      const client = new DataApiClient();
      mockJsonResponse(tradesFixture);

      const result = await client.getWalletTrades('0xc2e7800b5af46e6093872b177b7a5e7f0563be51');

      expect(result).toHaveLength(1);
      expect(result[0].market).toBe('0xbf1471a2a118e4467cb7aec2e3c2f448f2a74d746d6090ff24117c7bb3fecfa6');
      expect(result[0].side).toBe('BUY');
      expect(result[0].price).toBe(0.5007103393843725);
      expect(result[0].size).toBe(6240.11);
      expect(result[0].transactionHash).toBe('0x1e20e470f258d3a6559664793540dbb802170d7dab56b4c00dd114cabe69c915');
    });

    it('converts timestamp to ISO string', async () => {
      const client = new DataApiClient();
      mockJsonResponse(tradesFixture);

      const result = await client.getWalletTrades('0xabc');
      expect(new Date(result[0].timestamp).getTime()).toBe(1775613755 * 1000);
    });

    it('passes wallet and optional params', async () => {
      const client = new DataApiClient();
      mockJsonResponse([]);

      await client.getWalletTrades('0xabc', { market: '0xdef', limit: 5 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/trades?');
      expect(calledUrl).toContain('user=0xabc');
      expect(calledUrl).toContain('market=0xdef');
      expect(calledUrl).toContain('limit=5');
    });
  });

  describe('getMarketHolders', () => {
    it('returns flattened, normalized holders from token groups', async () => {
      const client = new DataApiClient();
      mockJsonResponse(holdersFixture);

      const result = await client.getMarketHolders('0x9d7bc8bf5e371ca8112aef52674c4a7f54660916e36b154108b3ae6eaa461b28');

      // The fixture has 1 token group with 2 holders
      expect(result).toHaveLength(2);
      expect(result[0].wallet).toBe('0x89b5cdaaa4866c1e738406712012a630b4078beb');
      expect(result[0].size).toBe(3792.136359);
      expect(result[1].wallet).toBe('0xee65685de42f8de9a03b4c53ee77d56a20d2cfc9');
      expect(result[1].size).toBe(3192.605202);
    });

    it('passes conditionId as market param', async () => {
      const client = new DataApiClient();
      mockJsonResponse([]);

      await client.getMarketHolders('0xcondition123', { limit: 10 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/holders?');
      expect(calledUrl).toContain('market=0xcondition123');
      expect(calledUrl).toContain('limit=10');
    });

    it('returns empty array when no token groups', async () => {
      const client = new DataApiClient();
      mockJsonResponse([]);

      const result = await client.getMarketHolders('0xempty');
      expect(result).toEqual([]);
    });
  });

  describe('getWalletValue', () => {
    it('returns portfolio value from first array element', async () => {
      const client = new DataApiClient();
      mockJsonResponse(valueFixture);

      const result = await client.getWalletValue('0xc2e7800b5af46e6093872b177b7a5e7f0563be51');

      expect(result).toEqual({ value: 4671.6847 });
    });

    it('passes wallet as user param', async () => {
      const client = new DataApiClient();
      mockJsonResponse(valueFixture);

      await client.getWalletValue('0xabc');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/value?user=0xabc');
    });

    it('returns zero value when API returns empty array', async () => {
      const client = new DataApiClient();
      mockJsonResponse([]);

      const result = await client.getWalletValue('0xempty');
      expect(result).toEqual({ value: 0 });
    });
  });

  describe('getMarketPositions', () => {
    it('returns flattened, normalized positions from token groups', async () => {
      const client = new DataApiClient();
      mockJsonResponse(marketPositionsFixture);

      const result = await client.getMarketPositions('0x9d7bc8bf5e371ca8112aef52674c4a7f54660916e36b154108b3ae6eaa461b28');

      // The fixture has 1 token group with 1 position
      expect(result).toHaveLength(1);
      expect(result[0].proxyWallet).toBe('0xb27bc932bf8110d8f78e55da7d5f0497a18b5b82');
      expect(result[0].outcome).toBe('Up');
      expect(result[0].size).toBe(133.203);
      expect(result[0].avgPrice).toBe(0.0607);
      expect(result[0].currentValue).toBe(4.6621);
      expect(result[0].totalPnl).toBe(601.5277);
    });

    it('passes conditionId and limit params', async () => {
      const client = new DataApiClient();
      mockJsonResponse([]);

      await client.getMarketPositions('0xcondition', { limit: 25 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/v1/market-positions?');
      expect(calledUrl).toContain('market=0xcondition');
      expect(calledUrl).toContain('limit=25');
    });

    it('returns empty array when no token groups', async () => {
      const client = new DataApiClient();
      mockJsonResponse([]);

      const result = await client.getMarketPositions('0xempty');
      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('throws PolymarketError on 429 rate limit', async () => {
      const client = new DataApiClient();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Map([['retry-after', '5']]),
        text: () => Promise.resolve(''),
      });

      await expect(client.getLeaderboard()).rejects.toThrow(PolymarketError);
    });

    it('throws PolymarketError on network errors', async () => {
      const client = new DataApiClient();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getLeaderboard()).rejects.toThrow(PolymarketError);
    });

    it('throws PolymarketError on 500 errors', async () => {
      const client = new DataApiClient();
      mockErrorResponse(500, 'Internal Server Error');

      await expect(client.getWalletPositions('0xabc')).rejects.toThrow(PolymarketError);
    });
  });
});
