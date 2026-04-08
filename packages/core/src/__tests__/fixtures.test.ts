/**
 * Fixture-based tests: feed real API JSON through our normalizers
 * and verify the output matches expected types and values.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeMarket, buildTokens, GammaClient } from '../gamma';
import { ClobPublicClient } from '../clob-public';
import type { RawMarket, Tag } from '../types';

// Import JSON fixtures
import gammaMarketFixture from './fixtures/gamma-market.json';
import gammaTagsFixture from './fixtures/gamma-tags.json';
import clobPriceFixture from './fixtures/clob-price.json';
import clobMidpointFixture from './fixtures/clob-midpoint.json';
import clobSpreadFixture from './fixtures/clob-spread.json';
import clobBookFixture from './fixtures/clob-book.json';

// ── Mock fetch ───────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockJsonResponse(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Map(),
  });
}

// ── Gamma Market Fixture Tests ──────────────────────────────────

describe('Gamma market fixture through normalizeMarket', () => {
  const raw = gammaMarketFixture as unknown as RawMarket;

  it('normalizes conditionId (already camelCase from API)', () => {
    const market = normalizeMarket(raw);
    expect(market.conditionId).toBe('0x9c1a39e24e40d3e1f8859cba5b9c540268a131bed064ede7588337a7e2645f18');
  });

  it('parses volume from string to number', () => {
    const market = normalizeMarket(raw);
    expect(typeof market.volume).toBe('number');
    expect(market.volume).toBeCloseTo(1435224.264825003, 5);
  });

  it('parses liquidity from string to number', () => {
    const market = normalizeMarket(raw);
    expect(typeof market.liquidity).toBe('number');
    expect(market.liquidity).toBeCloseTo(61001.0135, 4);
  });

  it('builds tokens from JSON-encoded outcomes, outcomePrices, clobTokenIds', () => {
    const market = normalizeMarket(raw);
    expect(market.tokens).toHaveLength(2);

    expect(market.tokens[0].outcome).toBe('Yes');
    expect(market.tokens[0].price).toBe(0.535);
    expect(market.tokens[0].tokenId).toBe('85014348937654458413290737197591860504988605752925289827623068964690820517937');

    expect(market.tokens[1].outcome).toBe('No');
    expect(market.tokens[1].price).toBe(0.465);
    expect(market.tokens[1].tokenId).toBe('25274365426654480055813702738775030297759498889998780242039714689784041375532');
  });

  it('extracts tag labels from tag objects', () => {
    const market = normalizeMarket(raw);
    expect(market.tags).toEqual(['Geopolitics', 'Gaming']);
  });

  it('maps startDate and endDate from camelCase fields', () => {
    const market = normalizeMarket(raw);
    expect(market.startDate).toBe('2025-05-02T15:48:00.174Z');
    expect(market.endDate).toBe('2026-07-31T12:00:00Z');
  });

  it('preserves image and icon URLs', () => {
    const market = normalizeMarket(raw);
    expect(market.image).toContain('https://');
    expect(market.icon).toContain('https://');
  });
});

describe('Gamma market fixture through GammaClient.searchMarkets', () => {
  it('returns normalized market from search', async () => {
    mockJsonResponse([gammaMarketFixture]);

    const client = new GammaClient();
    const results = await client.searchMarkets({ query: 'ceasefire' });

    expect(results).toHaveLength(1);
    expect(results[0].conditionId).toBe('0x9c1a39e24e40d3e1f8859cba5b9c540268a131bed064ede7588337a7e2645f18');
    expect(results[0].tokens).toHaveLength(2);
    expect(typeof results[0].volume).toBe('number');
    expect(typeof results[0].liquidity).toBe('number');
  });
});

// ── Gamma Tags Fixture Tests ────────────────────────────────────

describe('Gamma tags fixture through GammaClient.getTags', () => {
  it('returns Tag objects with id, label, slug', async () => {
    mockJsonResponse(gammaTagsFixture);

    const client = new GammaClient();
    const tags = await client.getTags();

    expect(tags).toHaveLength(4);
    expect(tags[0]).toEqual({
      id: '101259',
      label: 'Health and Human Services',
      slug: 'health-and-human-services',
    });
    expect(tags[1].label).toBe('Sweeden');
    expect(tags[2].label).toBe('Crypto');
    expect(tags[3].slug).toBe('politics');
  });
});

// ── CLOB Price Fixture Tests ────────────────────────────────────

describe('CLOB price fixture through ClobPublicClient.getPrice', () => {
  it('parses string price to number', async () => {
    mockJsonResponse(clobPriceFixture);

    const client = new ClobPublicClient();
    const price = await client.getPrice('some-token-id');

    expect(price).toBe(0.53);
  });
});

// ── CLOB Midpoint Fixture Tests ─────────────────────────────────

describe('CLOB midpoint fixture through ClobPublicClient.getMidpoint', () => {
  it('parses string mid to number', async () => {
    mockJsonResponse(clobMidpointFixture);

    const client = new ClobPublicClient();
    const mid = await client.getMidpoint('some-token-id');

    expect(mid).toBe(0.535);
  });
});

// ── CLOB Spread Fixture Tests ───────────────────────────────────

describe('CLOB spread fixture through ClobPublicClient.getSpread', () => {
  it('returns spread as a number (no bid/ask)', async () => {
    mockJsonResponse(clobSpreadFixture);

    const client = new ClobPublicClient();
    const spread = await client.getSpread('some-token-id');

    expect(typeof spread).toBe('number');
    expect(spread).toBe(0.01);
  });
});

// ── CLOB Order Book Fixture Tests ───────────────────────────────

describe('CLOB book fixture through ClobPublicClient.getOrderBook', () => {
  it('extracts bids and asks from full book response', async () => {
    mockJsonResponse(clobBookFixture);

    const client = new ClobPublicClient();
    const book = await client.getOrderBook('some-token-id');

    expect(book.bids).toHaveLength(2);
    expect(book.asks).toHaveLength(2);
    expect(book.bids[0]).toEqual({ price: '0.01', size: '1042617.93' });
    expect(book.asks[1]).toEqual({ price: '0.99', size: '530318.9' });
  });
});
