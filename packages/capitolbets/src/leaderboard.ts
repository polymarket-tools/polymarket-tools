import type {
  TradeQueries,
  LeaderboardCacheQueries,
  CopyLeaderEarningQueries,
  UserQueries,
} from './db-queries';
import type { Trade, LeaderboardCache } from './types';

// ---------------------------------------------------------------------------
// LeaderboardService
// ---------------------------------------------------------------------------

/**
 * Calculates trader leaderboard from local trade history and caches results.
 * Also handles copy-leader fee earnings.
 */
export class LeaderboardService {
  private tradeQueries: TradeQueries;
  private leaderboardQueries: LeaderboardCacheQueries;
  private leaderEarningQueries: CopyLeaderEarningQueries;
  private userQueries: UserQueries;

  constructor(deps: {
    tradeQueries: TradeQueries;
    leaderboardQueries: LeaderboardCacheQueries;
    leaderEarningQueries: CopyLeaderEarningQueries;
    userQueries: UserQueries;
  }) {
    this.tradeQueries = deps.tradeQueries;
    this.leaderboardQueries = deps.leaderboardQueries;
    this.leaderEarningQueries = deps.leaderEarningQueries;
    this.userQueries = deps.userQueries;
  }

  // -----------------------------------------------------------------------
  // Recalculation
  // -----------------------------------------------------------------------

  /**
   * Recalculate leaderboard for a given period by scanning all users' trades.
   * Should be run periodically (e.g. every hour).
   */
  recalculate(period: '7d' | '30d' | 'all'): void {
    const users = this.userQueries.listAll();
    const now = new Date();

    let startDate: string;
    if (period === '7d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString();
    } else if (period === '30d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString();
    } else {
      startDate = '1970-01-01T00:00:00.000Z';
    }

    const endDate = now.toISOString();

    for (const user of users) {
      const trades =
        period === 'all'
          ? this.tradeQueries.getByUser(user.telegram_id)
          : this.tradeQueries.getByUserAndPeriod(
              user.telegram_id,
              startDate,
              endDate,
            );

      if (trades.length === 0) continue;

      const stats = this.calculateStats(trades);

      this.leaderboardQueries.upsert({
        user_telegram_id: user.telegram_id,
        period,
        pnl: stats.pnl,
        win_rate: stats.winRate,
        trade_count: stats.tradeCount,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Leaderboard retrieval
  // -----------------------------------------------------------------------

  /**
   * Get the cached leaderboard for a period.
   */
  getTop(period: '7d' | '30d' | 'all', limit: number): LeaderboardCache[] {
    return this.leaderboardQueries.getTop(period, limit);
  }

  // -----------------------------------------------------------------------
  // Leader earnings
  // -----------------------------------------------------------------------

  /**
   * Record a copy-leader earning from a copy trade.
   */
  recordLeaderEarning(params: {
    leaderTelegramId: number;
    copierTelegramId: number;
    feeAmount: number;
    tradeId: number;
  }): void {
    this.leaderEarningQueries.insert({
      leader_telegram_id: params.leaderTelegramId,
      copier_telegram_id: params.copierTelegramId,
      fee_earned: params.feeAmount,
      trade_id: params.tradeId,
    });
  }

  /**
   * Get leader stats for /leader-stats command.
   */
  getLeaderStats(telegramId: number): {
    copierCount: number;
    weeklyEarnings: number;
    totalEarnings: number;
  } {
    return {
      copierCount: this.leaderEarningQueries.getCopierCount(telegramId),
      weeklyEarnings: this.leaderEarningQueries.getWeeklyByLeader(telegramId),
      totalEarnings: this.leaderEarningQueries.getTotalByLeader(telegramId),
    };
  }

  // -----------------------------------------------------------------------
  // Fee split calculation
  // -----------------------------------------------------------------------

  /**
   * Split a copy trade fee among CapitolBets, the copy leader, and the referrer.
   *
   * Split: 75% CapitolBets, 10% leader, 15% referrer.
   * If no referrer, their share goes to CapitolBets.
   * If leader is not a CapitolBets user, their share goes to CapitolBets.
   */
  calculateFeeSplit(
    totalFee: number,
    leaderTelegramId: number | null,
    referrerTelegramId: number | null,
  ): FeeSplit {
    const leaderShare = leaderTelegramId ? totalFee * 0.10 : 0;
    const referrerShare = referrerTelegramId ? totalFee * 0.15 : 0;
    const capitolBetsShare = totalFee - leaderShare - referrerShare;

    return {
      capitolBets: Math.round(capitolBetsShare * 100) / 100,
      leader: Math.round(leaderShare * 100) / 100,
      referrer: Math.round(referrerShare * 100) / 100,
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Calculate P&L, win rate, and trade count from a list of trades.
   *
   * P&L is approximated: buys are negative, sells are positive.
   * Win determination: a sell trade at higher price than average buy price
   * is a win. This is a simplified heuristic since we don't have resolution data.
   */
  private calculateStats(trades: Trade[]): {
    pnl: number;
    winRate: number;
    tradeCount: number;
  } {
    let pnl = 0;
    let wins = 0;
    let resolvedCount = 0;

    // Group buys/sells by market for P&L calculation
    const marketBuyAvg = new Map<string, { totalCost: number; totalSize: number }>();

    for (const trade of trades) {
      if (trade.side === 'BUY') {
        const existing = marketBuyAvg.get(trade.market_condition_id) ?? {
          totalCost: 0,
          totalSize: 0,
        };
        existing.totalCost += trade.price * trade.size;
        existing.totalSize += trade.size;
        marketBuyAvg.set(trade.market_condition_id, existing);
        pnl -= trade.price * trade.size;
      } else {
        pnl += trade.price * trade.size;
        resolvedCount++;
        const buyData = marketBuyAvg.get(trade.market_condition_id);
        if (buyData && buyData.totalSize > 0) {
          const avgBuyPrice = buyData.totalCost / buyData.totalSize;
          if (trade.price > avgBuyPrice) {
            wins++;
          }
        }
      }
    }

    pnl = Math.round(pnl * 100) / 100;
    const winRate = resolvedCount > 0 ? wins / resolvedCount : 0;

    return { pnl, winRate, tradeCount: trades.length };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeeSplit {
  capitolBets: number;
  leader: number;
  referrer: number;
}
