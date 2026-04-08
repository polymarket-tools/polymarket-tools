import type { ClobPublicConfig, OrderBook } from './types';
import { sanitizeError } from './errors';

const DEFAULT_CLOB_HOST = 'https://clob.polymarket.com';

// ── CLOB Public Client ──────────────────────────────────────────

export class ClobPublicClient {
  private host: string;

  constructor(config: ClobPublicConfig = {}) {
    this.host = config.host ?? DEFAULT_CLOB_HOST;
  }

  /**
   * Get the price for a token, optionally for a specific side (buy/sell).
   */
  async getPrice(tokenId: string, side?: 'buy' | 'sell'): Promise<number> {
    const params = new URLSearchParams({ token_id: tokenId });
    if (side) params.set('side', side);

    const url = `${this.host}/price?${params.toString()}`;
    const data = await this.fetchJson<{ price: string }>(url);
    return parseFloat(data.price);
  }

  /**
   * Get the midpoint price for a token.
   */
  async getMidpoint(tokenId: string): Promise<number> {
    const url = `${this.host}/midpoint?token_id=${tokenId}`;
    const data = await this.fetchJson<{ mid: string }>(url);
    return parseFloat(data.mid);
  }

  /**
   * Get the bid/ask spread for a token. Computes spread = ask - bid.
   */
  async getSpread(tokenId: string): Promise<{ bid: number; ask: number; spread: number }> {
    const url = `${this.host}/spread?token_id=${tokenId}`;
    const data = await this.fetchJson<{ bid: string; ask: string }>(url);
    const bid = parseFloat(data.bid);
    const ask = parseFloat(data.ask);
    return { bid, ask, spread: ask - bid };
  }

  /**
   * Get the full order book for a token.
   */
  async getOrderBook(tokenId: string): Promise<OrderBook> {
    const url = `${this.host}/book?token_id=${tokenId}`;
    const data = await this.fetchJson<OrderBook>(url);
    return { bids: data.bids, asks: data.asks };
  }

  /**
   * Get prices for multiple tokens in a single request.
   */
  async getPrices(tokenIds: string[]): Promise<Map<string, number>> {
    const url = `${this.host}/prices?token_ids=${tokenIds.join(',')}`;
    const data = await this.fetchJson<Record<string, string>>(url);

    const result = new Map<string, number>();
    for (const [id, price] of Object.entries(data)) {
      result.set(id, parseFloat(price));
    }
    return result;
  }

  // ── Internal ─────────────────────────────────────────────────

  private async fetchJson<T>(url: string): Promise<T> {
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
        new Error(`CLOB API error: ${response.status} ${response.statusText} - ${body}`),
        response.status,
        url,
      );
    }

    return response.json() as Promise<T>;
  }
}
