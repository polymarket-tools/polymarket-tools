import type {
  DataApiConfig,
  LeaderboardEntry,
  WalletPosition,
  WalletTrade,
  MarketHolder,
  MarketPosition,
  RawLeaderboardEntry,
  RawWalletPosition,
  RawWalletTrade,
  RawHoldersResponse,
  RawValueResponse,
  RawMarketPositionsResponse,
} from './types';
import { fetchJson } from './http';

export const DEFAULT_DATA_API_HOST = 'https://data-api.polymarket.com';

// ── Normalizers ──────────────────────────────────────────────────

export function normalizeLeaderboardEntry(raw: RawLeaderboardEntry): LeaderboardEntry {
  return {
    rank: parseInt(raw.rank, 10) || 0,
    proxyWallet: raw.proxyWallet,
    userName: raw.userName,
    volume: raw.vol,
    pnl: raw.pnl,
  };
}

export function normalizeWalletPosition(raw: RawWalletPosition): WalletPosition {
  return {
    market: raw.conditionId,
    outcome: raw.outcome,
    size: raw.size,
    avgPrice: raw.avgPrice,
    currentValue: raw.currentValue,
    cashPnl: raw.cashPnl,
    percentPnl: raw.percentPnl,
  };
}

export function normalizeWalletTrade(raw: RawWalletTrade): WalletTrade {
  return {
    market: raw.conditionId,
    side: raw.side,
    price: raw.price,
    size: raw.size,
    timestamp: new Date(raw.timestamp * 1000).toISOString(),
    transactionHash: raw.transactionHash,
  };
}

export function normalizeMarketHolder(raw: { proxyWallet: string; amount: number }): MarketHolder {
  // The holders API does not return avgPrice — it's not in the real response
  return {
    wallet: raw.proxyWallet,
    size: raw.amount,
    avgPrice: 0,
  };
}

export function normalizeMarketPosition(raw: {
  proxyWallet: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  realizedPnl: number;
  totalPnl: number;
}): MarketPosition {
  return {
    proxyWallet: raw.proxyWallet,
    outcome: raw.outcome,
    size: raw.size,
    avgPrice: raw.avgPrice,
    currentValue: raw.currentValue,
    cashPnl: raw.cashPnl,
    realizedPnl: raw.realizedPnl,
    totalPnl: raw.totalPnl,
  };
}

// ── Data API Client ─────────────────────────────────────────────

export class DataApiClient {
  private host: string;

  constructor(config: DataApiConfig = {}) {
    this.host = config.host ?? DEFAULT_DATA_API_HOST;
  }

  /**
   * Get the leaderboard rankings.
   */
  async getLeaderboard(params: {
    timePeriod?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<LeaderboardEntry[]> {
    const searchParams = new URLSearchParams();
    if (params.timePeriod !== undefined) searchParams.set('timePeriod', params.timePeriod);
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset));

    const qs = searchParams.toString();
    const url = qs ? `${this.host}/v1/leaderboard?${qs}` : `${this.host}/v1/leaderboard`;
    const data = await fetchJson<RawLeaderboardEntry[]>(url, 'Data API');
    return data.map(normalizeLeaderboardEntry);
  }

  /**
   * Get positions for a wallet address.
   */
  async getWalletPositions(
    wallet: string,
    params: {
      market?: string;
      sizeThreshold?: number;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<WalletPosition[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('user', wallet);
    if (params.market !== undefined) searchParams.set('market', params.market);
    if (params.sizeThreshold !== undefined) searchParams.set('sizeThreshold', String(params.sizeThreshold));
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset));

    const url = `${this.host}/positions?${searchParams.toString()}`;
    const data = await fetchJson<RawWalletPosition[]>(url, 'Data API');
    return data.map(normalizeWalletPosition);
  }

  /**
   * Get trades for a wallet address.
   */
  async getWalletTrades(
    wallet: string,
    params: {
      market?: string;
      limit?: number;
    } = {},
  ): Promise<WalletTrade[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('user', wallet);
    if (params.market !== undefined) searchParams.set('market', params.market);
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    const url = `${this.host}/trades?${searchParams.toString()}`;
    const data = await fetchJson<RawWalletTrade[]>(url, 'Data API');
    return data.map(normalizeWalletTrade);
  }

  /**
   * Get holders for a market by condition ID.
   * The API returns an array of token groups, each with a holders array.
   * We flatten all holders across all tokens.
   */
  async getMarketHolders(
    conditionId: string,
    params: {
      limit?: number;
    } = {},
  ): Promise<MarketHolder[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('market', conditionId);
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    const url = `${this.host}/holders?${searchParams.toString()}`;
    const data = await fetchJson<RawHoldersResponse[]>(url, 'Data API');

    const holders: MarketHolder[] = [];
    for (const tokenGroup of data) {
      for (const holder of tokenGroup.holders) {
        holders.push(normalizeMarketHolder(holder));
      }
    }
    return holders;
  }

  /**
   * Get total portfolio value for a wallet (in USDC).
   * The API returns an array with a single entry.
   */
  async getWalletValue(wallet: string): Promise<{ value: number }> {
    const url = `${this.host}/value?user=${wallet}`;
    const data = await fetchJson<RawValueResponse[]>(url, 'Data API');

    if (!data || data.length === 0) {
      return { value: 0 };
    }
    return { value: data[0].value };
  }

  /**
   * Get all positions in a market with per-holder P&L.
   * The API returns an array of token groups, each with a positions array.
   * We flatten all positions across all tokens.
   */
  async getMarketPositions(
    conditionId: string,
    params: {
      limit?: number;
    } = {},
  ): Promise<MarketPosition[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('market', conditionId);
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    const url = `${this.host}/v1/market-positions?${searchParams.toString()}`;
    const data = await fetchJson<RawMarketPositionsResponse[]>(url, 'Data API');

    const positions: MarketPosition[] = [];
    for (const tokenGroup of data) {
      for (const pos of tokenGroup.positions) {
        positions.push(normalizeMarketPosition(pos));
      }
    }
    return positions;
  }
}
