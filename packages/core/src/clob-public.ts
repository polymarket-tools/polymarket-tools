import type { ClobPublicConfig, OrderBook } from './types';
import { PolymarketError } from './types';
import { fetchJson, DEFAULT_CLOB_HOST } from './http';

function parsePrice(value: string, label: string, endpoint: string): number {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) {
    throw new PolymarketError(`Unexpected ${label} value: ${value}`, 0, endpoint);
  }
  return num;
}

// ── CLOB Public Client ──────────────────────────────────────────

export class ClobPublicClient {
  private host: string;

  constructor(config: ClobPublicConfig = {}) {
    this.host = config.host ?? DEFAULT_CLOB_HOST;
  }

  /**
   * Get the price for a token, optionally for a specific side (buy/sell).
   */
  async getPrice(tokenId: string, side: 'buy' | 'sell' = 'buy'): Promise<number> {
    const params = new URLSearchParams({ token_id: tokenId, side });

    const url = `${this.host}/price?${params.toString()}`;
    const data = await fetchJson<{ price: string }>(url, 'CLOB API');
    return parsePrice(data.price, 'price', url);
  }

  /**
   * Get the midpoint price for a token.
   */
  async getMidpoint(tokenId: string): Promise<number> {
    const url = `${this.host}/midpoint?token_id=${tokenId}`;
    const data = await fetchJson<{ mid: string }>(url, 'CLOB API');
    return parsePrice(data.mid, 'midpoint', url);
  }

  /**
   * Get the spread for a token. The API returns only { spread: string }.
   */
  async getSpread(tokenId: string): Promise<number> {
    const url = `${this.host}/spread?token_id=${tokenId}`;
    const data = await fetchJson<{ spread: string }>(url, 'CLOB API');
    return parsePrice(data.spread, 'spread', url);
  }

  /**
   * Get the full order book for a token.
   */
  async getOrderBook(tokenId: string): Promise<OrderBook> {
    const url = `${this.host}/book?token_id=${tokenId}`;
    const data = await fetchJson<OrderBook>(url, 'CLOB API');
    return { bids: data.bids, asks: data.asks };
  }

  /**
   * Get prices for multiple tokens in a single request.
   */
  async getPrices(tokenIds: string[]): Promise<Map<string, number>> {
    if (tokenIds.length === 0) return new Map();
    const url = `${this.host}/prices?token_ids=${tokenIds.join(',')}`;
    const data = await fetchJson<Record<string, string>>(url, 'CLOB API');

    const result = new Map<string, number>();
    const url2 = `${this.host}/prices`;
    for (const [id, price] of Object.entries(data)) {
      result.set(id, parsePrice(price, `price[${id}]`, url2));
    }
    return result;
  }

}
