import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClobPublicClient } from '../clob-public';
import { PolymarketError } from '../types';

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

// ── ClobPublicClient tests ──────────────────────────────────────

describe('ClobPublicClient', () => {
  let client: ClobPublicClient;

  beforeEach(() => {
    client = new ClobPublicClient();
  });

  describe('getPrice', () => {
    it('constructs correct URL with token_id', async () => {
      mockJsonResponse({ price: '0.65' });

      const price = await client.getPrice('tok_abc123');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://clob.polymarket.com/price?token_id=tok_abc123&side=buy');
      expect(price).toBe(0.65);
    });

    it('includes side param when provided', async () => {
      mockJsonResponse({ price: '0.70' });

      const price = await client.getPrice('tok_abc123', 'buy');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://clob.polymarket.com/price?token_id=tok_abc123&side=buy');
      expect(price).toBe(0.70);
    });

    it('parses string price to float', async () => {
      mockJsonResponse({ price: '0.123456' });

      const price = await client.getPrice('tok_abc123');
      expect(price).toBe(0.123456);
    });
  });

  describe('getMidpoint', () => {
    it('constructs correct URL and parses response', async () => {
      mockJsonResponse({ mid: '0.62' });

      const mid = await client.getMidpoint('tok_abc123');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://clob.polymarket.com/midpoint?token_id=tok_abc123');
      expect(mid).toBe(0.62);
    });
  });

  describe('getSpread', () => {
    it('constructs correct URL and parses spread value', async () => {
      mockJsonResponse({ spread: '0.01' });

      const spread = await client.getSpread('tok_abc123');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://clob.polymarket.com/spread?token_id=tok_abc123');
      expect(spread).toBe(0.01);
    });

    it('handles zero spread', async () => {
      mockJsonResponse({ spread: '0' });

      const spread = await client.getSpread('tok_abc123');
      expect(spread).toBe(0);
    });

    it('handles decimal spread values', async () => {
      mockJsonResponse({ spread: '0.05' });

      const spread = await client.getSpread('tok_abc123');
      expect(spread).toBeCloseTo(0.05, 10);
    });
  });

  describe('getOrderBook', () => {
    it('constructs correct URL and returns order book', async () => {
      const bookData = {
        bids: [{ price: '0.60', size: '100' }, { price: '0.59', size: '200' }],
        asks: [{ price: '0.65', size: '150' }, { price: '0.66', size: '250' }],
        hash: 'abc123',
        timestamp: '1234567890',
      };
      mockJsonResponse(bookData);

      const book = await client.getOrderBook('tok_abc123');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://clob.polymarket.com/book?token_id=tok_abc123');
      expect(book.bids).toHaveLength(2);
      expect(book.asks).toHaveLength(2);
      expect(book.bids[0]).toEqual({ price: '0.60', size: '100' });
      expect(book.asks[1]).toEqual({ price: '0.66', size: '250' });
    });
  });

  describe('getPrices', () => {
    it('constructs correct URL with comma-separated token IDs', async () => {
      mockJsonResponse({ tok_1: '0.65', tok_2: '0.35' });

      const prices = await client.getPrices(['tok_1', 'tok_2']);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://clob.polymarket.com/prices?token_ids=tok_1,tok_2');
      expect(prices).toBeInstanceOf(Map);
      expect(prices.get('tok_1')).toBe(0.65);
      expect(prices.get('tok_2')).toBe(0.35);
    });

    it('handles single token ID', async () => {
      mockJsonResponse({ tok_1: '0.99' });

      const prices = await client.getPrices(['tok_1']);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://clob.polymarket.com/prices?token_ids=tok_1');
      expect(prices.get('tok_1')).toBe(0.99);
    });
  });

  describe('rate limit error (429)', () => {
    it('includes Retry-After in error message when header present', async () => {
      const headers = new Map([['retry-after', '30']]);
      mockErrorResponse(429, 'Too Many Requests', headers);

      try {
        await client.getPrice('tok_abc123');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(PolymarketError);
        const error = e as PolymarketError;
        expect(error.message).toContain('Rate limited');
        expect(error.message).toContain('Retry after 30 seconds');
        expect(error.statusCode).toBe(429);
      }
    });

    it('handles 429 without Retry-After header', async () => {
      mockErrorResponse(429, 'Too Many Requests');

      try {
        await client.getPrice('tok_abc123');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(PolymarketError);
        const error = e as PolymarketError;
        expect(error.message).toContain('Rate limited');
        expect(error.statusCode).toBe(429);
      }
    });
  });

  describe('generic error handling', () => {
    it('wraps API errors in PolymarketError', async () => {
      mockErrorResponse(500, 'Internal Server Error');

      await expect(client.getPrice('tok_abc123'))
        .rejects
        .toThrow(PolymarketError);
    });

    it('wraps network errors in PolymarketError', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(client.getPrice('tok_abc123'))
        .rejects
        .toThrow(PolymarketError);
    });

    it('includes endpoint in error', async () => {
      mockErrorResponse(404, 'Not Found');

      try {
        await client.getPrice('tok_abc123');
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as PolymarketError;
        expect(error.endpoint).toContain('/price');
      }
    });
  });

  describe('parsePrice guard (via public methods)', () => {
    it('throws on NaN price from getPrice', async () => {
      mockJsonResponse({ price: 'not-a-number' });

      try {
        await client.getPrice('tok_abc123');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(PolymarketError);
        const error = e as PolymarketError;
        expect(error.message).toContain('Unexpected price value');
      }
    });

    it('throws on empty string price from getPrice', async () => {
      mockJsonResponse({ price: '' });

      await expect(client.getPrice('tok_abc123')).rejects.toThrow(PolymarketError);
    });

    it('throws on undefined midpoint from getMidpoint', async () => {
      mockJsonResponse({ mid: undefined });

      try {
        await client.getMidpoint('tok_abc123');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(PolymarketError);
        const error = e as PolymarketError;
        expect(error.message).toContain('Unexpected midpoint value');
      }
    });

    it('throws on NaN spread from getSpread', async () => {
      mockJsonResponse({ spread: 'NaN' });

      await expect(client.getSpread('tok_abc123')).rejects.toThrow(PolymarketError);
    });
  });

  describe('getPrices edge cases', () => {
    it('returns empty Map for empty array without fetching', async () => {
      const prices = await client.getPrices([]);

      expect(prices).toBeInstanceOf(Map);
      expect(prices.size).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('custom host', () => {
    it('uses custom host when provided', async () => {
      const customClient = new ClobPublicClient({ host: 'https://custom.clob.com' });
      mockJsonResponse({ price: '0.50' });

      await customClient.getPrice('tok_abc123');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url.startsWith('https://custom.clob.com/')).toBe(true);
    });
  });
});
