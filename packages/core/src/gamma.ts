import type {
  GammaClientConfig,
  SearchMarketsParams,
  Market,
  MarketToken,
  RawMarket,
  RawMarketToken,
} from './types';
import { PolymarketError } from './types';
import { sanitizeError } from './errors';

const DEFAULT_GAMMA_HOST = 'https://gamma-api.polymarket.com';

// ── Normalizers ──────────────────────────────────────────────────

export function normalizeToken(raw: RawMarketToken): MarketToken {
  return {
    tokenId: raw.token_id,
    outcome: raw.outcome,
    price: raw.price,
  };
}

export function normalizeMarket(raw: RawMarket): Market {
  return {
    conditionId: raw.condition_id,
    question: raw.question,
    slug: raw.slug,
    description: raw.description,
    active: raw.active,
    closed: raw.closed,
    volume: raw.volume,
    liquidity: raw.liquidity,
    startDate: raw.start_date_iso,
    endDate: raw.end_date_iso,
    tokens: (raw.tokens ?? []).map(normalizeToken),
    tags: raw.tags ?? [],
    image: raw.image,
    icon: raw.icon,
  };
}

// ── Gamma Client ─────────────────────────────────────────────────

export class GammaClient {
  private host: string;

  constructor(config: GammaClientConfig = {}) {
    this.host = config.host ?? DEFAULT_GAMMA_HOST;
  }

  /**
   * Search markets by text query with optional filters.
   */
  async searchMarkets(params: SearchMarketsParams): Promise<Market[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('_q', params.query);

    if (params.active !== undefined) searchParams.set('active', String(params.active));
    if (params.closed !== undefined) searchParams.set('closed', String(params.closed));
    if (params.limit !== undefined) searchParams.set('_limit', String(params.limit));
    if (params.offset !== undefined) searchParams.set('_offset', String(params.offset));
    if (params.order !== undefined) searchParams.set('_order', params.order);
    if (params.ascending !== undefined) searchParams.set('_ascending', String(params.ascending));
    if (params.tag !== undefined) searchParams.set('tag', params.tag);

    const url = `${this.host}/markets?${searchParams.toString()}`;
    const data = await this.fetchJson<RawMarket[]>(url);
    return data.map(normalizeMarket);
  }

  /**
   * Get a single market by its condition ID.
   */
  async getMarket(conditionId: string): Promise<Market> {
    const url = `${this.host}/markets/${conditionId}`;
    const data = await this.fetchJson<RawMarket>(url);
    return normalizeMarket(data);
  }

  /**
   * Get a market by its URL slug. Returns the first match.
   */
  async getMarketBySlug(slug: string): Promise<Market> {
    const searchParams = new URLSearchParams();
    searchParams.set('slug', slug);

    const url = `${this.host}/markets?${searchParams.toString()}`;
    const data = await this.fetchJson<RawMarket[]>(url);

    if (!data || data.length === 0) {
      throw new PolymarketError(
        `No market found with slug: ${slug}`,
        404,
        `/markets?slug=${slug}`,
      );
    }

    return normalizeMarket(data[0]);
  }

  /**
   * List markets with optional filters.
   */
  async getMarkets(params: {
    active?: boolean;
    tag?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Market[]> {
    const searchParams = new URLSearchParams();
    if (params.active !== undefined) searchParams.set('active', String(params.active));
    if (params.tag !== undefined) searchParams.set('tag', params.tag);
    if (params.limit !== undefined) searchParams.set('_limit', String(params.limit));
    if (params.offset !== undefined) searchParams.set('_offset', String(params.offset));

    const qs = searchParams.toString();
    const url = qs ? `${this.host}/markets?${qs}` : `${this.host}/markets`;
    const data = await this.fetchJson<RawMarket[]>(url);
    return data.map(normalizeMarket);
  }

  /**
   * Get all available market tags.
   */
  async getTags(): Promise<string[]> {
    const url = `${this.host}/tags`;
    return this.fetchJson<string[]>(url);
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
      const body = await response.text().catch(() => '');
      throw sanitizeError(
        new Error(`Gamma API error: ${response.status} ${response.statusText} - ${body}`),
        response.status,
        url,
      );
    }

    return response.json() as Promise<T>;
  }
}
