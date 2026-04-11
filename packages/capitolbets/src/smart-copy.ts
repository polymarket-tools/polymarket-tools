import type { DataApiClient, GammaClient, WalletTrade, WalletPosition, Market } from '@polymarket-tools/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TradeScore {
  confidence: number;          // 0-100
  category: string;            // e.g. "Politics", "Crypto"
  walletWinRate: number;       // 0-1, win rate in this category
  walletTradeCount: number;    // number of trades in this category
  recommendation: 'COPY' | 'SKIP';
  reason: string;
}

export interface CategoryStats {
  category: string;
  tradeCount: number;
  winRate: number;
  totalPnl: number;
}

// ---------------------------------------------------------------------------
// SmartCopyScorer
// ---------------------------------------------------------------------------

/**
 * Scores copy trades based on the target wallet's historical performance
 * per market category. Uses trade history + position P&L from the Data API
 * and market category tags from the Gamma API.
 */
export class SmartCopyScorer {
  private dataApi: DataApiClient;
  private gamma: GammaClient;

  /** Cache market conditionId -> category to avoid redundant Gamma lookups */
  private marketCategoryCache = new Map<string, string>();

  /** Cache wallet -> category stats (refreshed per poll cycle) */
  private walletStatsCache = new Map<string, { stats: CategoryStats[]; fetchedAt: number }>();

  /** Stats cache TTL: 10 minutes */
  private static readonly STATS_CACHE_TTL_MS = 10 * 60 * 1000;

  constructor(dataApi: DataApiClient, gamma: GammaClient) {
    this.dataApi = dataApi;
    this.gamma = gamma;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Score a trade based on the wallet's historical performance in the
   * market's category.
   */
  async scoreTrade(params: {
    walletAddress: string;
    conditionId: string;
    side: string;
  }): Promise<TradeScore> {
    const { walletAddress, conditionId } = params;

    // 1. Get market category
    const category = await this.getMarketCategory(conditionId);

    // 2. Get wallet's per-category stats
    const allStats = await this.getWalletCategoryStats(walletAddress);
    const catStats = allStats.find(
      (s) => s.category.toLowerCase() === category.toLowerCase(),
    );

    if (!catStats || catStats.tradeCount === 0) {
      return {
        confidence: 0,
        category,
        walletWinRate: 0,
        walletTradeCount: 0,
        recommendation: 'SKIP',
        reason: `No trade history in "${category}" category`,
      };
    }

    // 3. Calculate confidence score
    let confidence = catStats.winRate * 100;

    // Bonus for experience
    if (catStats.tradeCount > 20) {
      confidence += 5;
    }

    // Penalty for thin history
    if (catStats.tradeCount < 5) {
      confidence -= 20;
    }

    // Clamp to 0-100
    confidence = Math.max(0, Math.min(100, Math.round(confidence)));

    const recommendation = confidence >= 50 ? 'COPY' : 'SKIP';
    const winPct = Math.round(catStats.winRate * 100);
    const reason =
      `${winPct}% win rate on ${category} markets (${catStats.tradeCount} trades)`;

    return {
      confidence,
      category,
      walletWinRate: catStats.winRate,
      walletTradeCount: catStats.tradeCount,
      recommendation,
      reason,
    };
  }

  /**
   * Build per-category stats for a wallet from trade history + positions.
   */
  async getWalletCategoryStats(walletAddress: string): Promise<CategoryStats[]> {
    const key = walletAddress.toLowerCase();
    const cached = this.walletStatsCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < SmartCopyScorer.STATS_CACHE_TTL_MS) {
      return cached.stats;
    }

    // Fetch trade history and positions
    const [trades, positions] = await Promise.all([
      this.dataApi.getWalletTrades(walletAddress, { limit: 200 }),
      this.dataApi.getWalletPositions(walletAddress),
    ]);

    // Build a P&L lookup from positions (conditionId -> cashPnl)
    const pnlByMarket = new Map<string, number>();
    for (const pos of positions) {
      const existing = pnlByMarket.get(pos.market) ?? 0;
      pnlByMarket.set(pos.market, existing + pos.cashPnl);
    }

    // Group trades by category
    const categoryMap = new Map<string, { wins: number; total: number; pnl: number }>();

    for (const trade of trades) {
      const category = await this.getMarketCategory(trade.market);
      const entry = categoryMap.get(category) ?? { wins: 0, total: 0, pnl: 0 };

      entry.total++;
      const marketPnl = pnlByMarket.get(trade.market) ?? 0;
      if (marketPnl > 0) {
        entry.wins++;
      }
      entry.pnl += marketPnl;
      categoryMap.set(category, entry);
    }

    const stats: CategoryStats[] = [];
    for (const [category, data] of categoryMap) {
      stats.push({
        category,
        tradeCount: data.total,
        winRate: data.total > 0 ? data.wins / data.total : 0,
        totalPnl: data.pnl,
      });
    }

    this.walletStatsCache.set(key, { stats, fetchedAt: Date.now() });
    return stats;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Look up a market's primary category via the Gamma API.
   * Results are cached indefinitely (market categories don't change).
   */
  private async getMarketCategory(conditionId: string): Promise<string> {
    const cached = this.marketCategoryCache.get(conditionId);
    if (cached) return cached;

    try {
      const market: Market = await this.gamma.getMarket(conditionId);
      const category = market.tags?.[0] ?? 'Unknown';
      this.marketCategoryCache.set(conditionId, category);
      return category;
    } catch {
      const fallback = 'Unknown';
      this.marketCategoryCache.set(conditionId, fallback);
      return fallback;
    }
  }

  /**
   * Clear all caches. Useful for testing.
   */
  clearCaches(): void {
    this.marketCategoryCache.clear();
    this.walletStatsCache.clear();
  }
}
