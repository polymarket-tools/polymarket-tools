import type { DataApiClient, WalletPosition, WalletTrade } from '@polymarket-tools/core';
import type { UserQueries, TradeQueries, CopyConfigQueries } from './db-queries';
import type { User, Trade } from './types';
import { formatUsd, formatWallet } from './format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DigestNotifyFn = (
  telegramId: number,
  message: string,
) => Promise<void>;

export interface DigestSchedulerDeps {
  userQueries: UserQueries;
  tradeQueries: TradeQueries;
  copyConfigQueries: CopyConfigQueries;
  dataApi: DataApiClient;
  notify: DigestNotifyFn;
}

// ---------------------------------------------------------------------------
// DigestScheduler
// ---------------------------------------------------------------------------

/**
 * Sends a daily P&L digest to all users with digest_enabled=true.
 * Scheduled to run at 9am ET. Uses setInterval with timezone-aware timing.
 */
export class DigestScheduler {
  private userQueries: UserQueries;
  private tradeQueries: TradeQueries;
  private copyConfigQueries: CopyConfigQueries;
  private dataApi: DataApiClient;
  private notify: DigestNotifyFn;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isSending = false;

  constructor(deps: DigestSchedulerDeps) {
    this.userQueries = deps.userQueries;
    this.tradeQueries = deps.tradeQueries;
    this.copyConfigQueries = deps.copyConfigQueries;
    this.dataApi = deps.dataApi;
    this.notify = deps.notify;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start the daily scheduler. Checks every 15 minutes if it's 9am ET.
   */
  start(): void {
    if (this.intervalId) return;

    // Check every 15 minutes
    this.intervalId = setInterval(() => {
      if (this.isDigestTime() && !this.isSending) {
        this.isSending = true;
        this.sendAllDigests()
          .catch((err) => {
            console.error('[DigestScheduler] Error sending digests:', err);
          })
          .finally(() => {
            this.isSending = false;
          });
      }
    }, 15 * 60 * 1000);

    console.log('[DigestScheduler] Started. Will send digests at 9am ET.');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // -----------------------------------------------------------------------
  // Digest generation
  // -----------------------------------------------------------------------

  /**
   * Generate and send digest to all eligible users.
   */
  async sendAllDigests(): Promise<number> {
    const users = this.userQueries.listDigestEnabled();
    let sent = 0;

    for (const user of users) {
      try {
        const digest = await this.generateDigest(user);
        await this.notify(user.telegram_id, digest);
        sent++;
      } catch (err) {
        console.error(
          `[DigestScheduler] Failed to send digest to user ${user.telegram_id}:`,
          err,
        );
      }
    }

    console.log(`[DigestScheduler] Sent ${sent}/${users.length} digests.`);
    return sent;
  }

  /**
   * Generate digest content for a single user.
   */
  async generateDigest(user: User): Promise<string> {
    const now = new Date();

    // Yesterday's boundaries
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // This week boundaries (7 days back)
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    // Fetch data
    const [yesterdayTrades, weekTrades, positions, copiedWalletData] =
      await Promise.all([
        Promise.resolve(
          this.tradeQueries.getByUserAndPeriod(
            user.telegram_id,
            yesterdayStart.toISOString(),
            yesterdayEnd.toISOString(),
          ),
        ),
        Promise.resolve(
          this.tradeQueries.getByUserAndPeriod(
            user.telegram_id,
            weekStart.toISOString(),
            now.toISOString(),
          ),
        ),
        this.safeGetPositions(user.safe_address),
        this.getCopiedWalletPerformance(user.telegram_id),
      ]);

    // Calculate P&L
    const yesterdayPnl = this.calculateTradePnl(yesterdayTrades);
    const weekPnl = this.calculateTradePnl(weekTrades);

    // Build digest
    const lines: string[] = ['Good morning. Your CapitolBets portfolio:', ''];

    // P&L summary
    lines.push(`Yesterday: ${formatUsd(yesterdayPnl)}`);
    lines.push(`This week: ${formatUsd(weekPnl)}`);
    lines.push(`Open positions: ${positions.length}`);

    // Best/worst trade
    if (yesterdayTrades.length > 0) {
      const { best, worst } = this.findBestWorst(yesterdayTrades);
      lines.push('');
      if (best) {
        lines.push(
          `Best trade: "${best.market_condition_id.slice(0, 20)}..." ${formatUsd(best.price * best.size)} (${best.side})`,
        );
      }
      if (worst) {
        lines.push(
          `Worst trade: "${worst.market_condition_id.slice(0, 20)}..." ${formatUsd(-worst.price * worst.size)} (${worst.side})`,
        );
      }
    }

    // Copied whale performance
    if (copiedWalletData.length > 0) {
      lines.push('');
      lines.push('Whales you\'re copying:');
      for (const whale of copiedWalletData) {
        const walletShort = formatWallet(whale.wallet);
        lines.push(`  ${walletShort}: ${formatUsd(whale.pnl)} yesterday`);
      }
    }

    lines.push('');
    lines.push('Type /portfolio for full details.');

    return lines.join('\n');
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Check if now is approximately 9am ET (between 9:00 and 9:14).
   */
  private isDigestTime(): boolean {
    const now = new Date();
    // Get ET hour using Intl
    const etHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hour12: false,
      }).format(now),
      10,
    );
    const etMinute = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        minute: 'numeric',
      }).format(now),
      10,
    );

    return etHour === 9 && etMinute < 15;
  }

  private calculateTradePnl(trades: Trade[]): number {
    let pnl = 0;
    for (const trade of trades) {
      if (trade.side === 'BUY') {
        pnl -= trade.price * trade.size;
      } else {
        pnl += trade.price * trade.size;
      }
    }
    return Math.round(pnl * 100) / 100;
  }

  private findBestWorst(trades: Trade[]): {
    best: Trade | null;
    worst: Trade | null;
  } {
    if (trades.length === 0) return { best: null, worst: null };

    // Approximate: sells are "profits", buys are "costs"
    const sellTrades = trades.filter((t) => t.side === 'SELL');
    const buyTrades = trades.filter((t) => t.side === 'BUY');

    const best =
      sellTrades.length > 0
        ? sellTrades.reduce((a, b) =>
            a.price * a.size > b.price * b.size ? a : b,
          )
        : null;
    const worst =
      buyTrades.length > 0
        ? buyTrades.reduce((a, b) =>
            a.price * a.size > b.price * b.size ? a : b,
          )
        : null;

    return { best, worst };
  }

  private async safeGetPositions(
    safeAddress: string,
  ): Promise<WalletPosition[]> {
    try {
      return await this.dataApi.getWalletPositions(safeAddress);
    } catch {
      return [];
    }
  }

  private async getCopiedWalletPerformance(
    telegramId: number,
  ): Promise<Array<{ wallet: string; pnl: number }>> {
    const configs = this.copyConfigQueries.getActiveByUser(telegramId);
    if (configs.length === 0) return [];

    const results: Array<{ wallet: string; pnl: number }> = [];

    for (const config of configs.slice(0, 3)) {
      // Limit to 3 whales
      try {
        const trades = await this.dataApi.getWalletTrades(
          config.target_wallet,
          { limit: 20 },
        );
        const pnl = this.calculateWhalePnl(trades);
        results.push({ wallet: config.target_wallet, pnl });
      } catch {
        // Skip if API fails
      }
    }

    return results;
  }

  private calculateWhalePnl(trades: WalletTrade[]): number {
    // Simple approximation from recent trades
    let pnl = 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    for (const trade of trades) {
      if (new Date(trade.timestamp) < yesterday) continue;
      if (trade.side.toUpperCase() === 'SELL') {
        pnl += trade.price * trade.size;
      } else {
        pnl -= trade.price * trade.size;
      }
    }
    return Math.round(pnl * 100) / 100;
  }
}
