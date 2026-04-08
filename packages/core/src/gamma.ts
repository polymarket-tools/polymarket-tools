import type {
  GammaClientConfig,
  SearchMarketsParams,
  Market,
  MarketToken,
  RawMarket,
  Tag,
} from './types';
import { PolymarketError } from './types';
import { fetchJson, DEFAULT_GAMMA_HOST } from './http';

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Safely parse a JSON-encoded string array from the API.
 * Returns an empty array if the input is falsy or not valid JSON.
 */
function parseJsonArray(value: string | undefined | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Normalizers ──────────────────────────────────────────────────

/**
 * Build MarketToken[] from the three JSON-encoded string arrays
 * the Gamma API returns: outcomes, outcomePrices, clobTokenIds.
 */
export function buildTokens(raw: RawMarket): MarketToken[] {
  const outcomes = parseJsonArray(raw.outcomes);
  const prices = parseJsonArray(raw.outcomePrices);
  const tokenIds = parseJsonArray(raw.clobTokenIds);

  const length = Math.min(outcomes.length, prices.length, tokenIds.length);
  const tokens: MarketToken[] = [];

  for (let i = 0; i < length; i++) {
    tokens.push({
      tokenId: tokenIds[i],
      outcome: outcomes[i],
      price: parseFloat(prices[i]) || 0,
    });
  }

  return tokens;
}

export function normalizeMarket(raw: RawMarket): Market {
  return {
    conditionId: raw.conditionId,
    question: raw.question,
    slug: raw.slug,
    description: raw.description,
    active: raw.active,
    closed: raw.closed,
    volume: parseFloat(raw.volume) || 0,
    liquidity: parseFloat(raw.liquidity) || 0,
    startDate: raw.startDate,
    endDate: raw.endDate,
    tokens: buildTokens(raw),
    tags: (raw.tags ?? []).map((t: Tag) => t.label),
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
    const data = await fetchJson<RawMarket[]>(url, 'Gamma API');
    return data.map(normalizeMarket);
  }

  /**
   * Get a single market by its condition ID.
   */
  async getMarket(conditionId: string): Promise<Market> {
    const url = `${this.host}/markets/${conditionId}`;
    const data = await fetchJson<RawMarket>(url, 'Gamma API');
    return normalizeMarket(data);
  }

  /**
   * Get a market by its URL slug. Returns the first match.
   */
  async getMarketBySlug(slug: string): Promise<Market> {
    const searchParams = new URLSearchParams();
    searchParams.set('slug', slug);

    const url = `${this.host}/markets?${searchParams.toString()}`;
    const data = await fetchJson<RawMarket[]>(url, 'Gamma API');

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
    const data = await fetchJson<RawMarket[]>(url, 'Gamma API');
    return data.map(normalizeMarket);
  }

  /**
   * Get all available market tags.
   */
  async getTags(): Promise<Tag[]> {
    const url = `${this.host}/tags`;
    return fetchJson<Tag[]>(url, 'Gamma API');
  }

}
