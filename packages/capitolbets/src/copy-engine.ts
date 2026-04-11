import type { DataApiClient, WalletTrade } from '@polymarket-tools/core';
import type { TradingEngine } from './trading';
import type { CopyConfigQueries, UserQueries } from './db-queries';
import type { CopyConfig, User } from './types';
import type { SmartCopyScorer } from './smart-copy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback to send a notification to a Telegram user. Keeps bot dependency decoupled. */
export type CopyNotifyFn = (
  telegramId: number,
  message: string,
) => Promise<void>;

export interface CopyEngineDeps {
  dataApi: DataApiClient;
  tradingEngine: TradingEngine;
  copyConfigQueries: CopyConfigQueries;
  userQueries: UserQueries;
  notify: CopyNotifyFn;
  /** Get user's USDC balance in human-readable units (e.g. 150.25 means $150.25) */
  getBalance: (safeAddress: string) => Promise<number>;
  /** Optional SmartCopyScorer for AI-based trade filtering */
  smartCopyScorer?: SmartCopyScorer | null;
}

// ---------------------------------------------------------------------------
// CopyEngine
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 30_000; // 30 seconds

export class CopyEngine {
  private dataApi: DataApiClient;
  private tradingEngine: TradingEngine;
  private copyConfigQueries: CopyConfigQueries;
  private userQueries: UserQueries;
  private notify: CopyNotifyFn;
  private getBalance: (safeAddress: string) => Promise<number>;
  private smartCopyScorer: SmartCopyScorer | null;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;

  constructor(deps: CopyEngineDeps, pollIntervalMs?: number) {
    this.dataApi = deps.dataApi;
    this.tradingEngine = deps.tradingEngine;
    this.copyConfigQueries = deps.copyConfigQueries;
    this.userQueries = deps.userQueries;
    this.notify = deps.notify;
    this.getBalance = deps.getBalance;
    this.smartCopyScorer = deps.smartCopyScorer ?? null;
    this.pollIntervalMs = pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.poll().catch((err) => {
        console.error('[CopyEngine] Poll error:', err);
      });
    }, this.pollIntervalMs);
    console.log(
      `[CopyEngine] Started. Polling every ${this.pollIntervalMs / 1000}s.`,
    );
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // -----------------------------------------------------------------------
  // Core poll cycle
  // -----------------------------------------------------------------------

  /**
   * Single poll cycle: fetch all active copy configs, group by target wallet,
   * poll each wallet once, and process new trades for each config.
   */
  async poll(): Promise<void> {
    const configs = this.copyConfigQueries.listAllActive();
    if (configs.length === 0) return;

    // Group configs by target_wallet to avoid N+1 API calls
    const grouped = this.groupByWallet(configs);

    for (const [targetWallet, walletConfigs] of grouped) {
      try {
        const trades = await this.dataApi.getWalletTrades(targetWallet, {
          limit: 10,
        });

        for (const config of walletConfigs) {
          await this.processConfig(config, trades);
        }
      } catch (err) {
        console.error(
          `[CopyEngine] Failed to fetch trades for wallet ${targetWallet}:`,
          err,
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Process a single config against fetched trades
  // -----------------------------------------------------------------------

  private async processConfig(
    config: CopyConfig,
    trades: WalletTrade[],
  ): Promise<void> {
    // Find new trades: those after last_seen_trade_id
    const newTrades = this.findNewTrades(trades, config.last_seen_trade_id);
    if (newTrades.length === 0) return;

    const user = this.userQueries.getByTelegramId(config.user_telegram_id);
    if (!user) return;

    let balance: number;
    try {
      balance = await this.getBalance(user.safe_address);
    } catch {
      await this.notify(
        config.user_telegram_id,
        'Copy trade skipped: could not check your balance.',
      );
      return;
    }

    let lastProcessedTrade: WalletTrade | null = null;

    for (const trade of newTrades) {
      // Direction filter (permanent skip -- advance cursor past these)
      if (!this.shouldCopyTrade(trade, config.direction)) {
        lastProcessedTrade = trade;
        continue;
      }

      // Smart Copy AI filter
      if (config.smart_copy_enabled && this.smartCopyScorer) {
        try {
          const score = await this.smartCopyScorer.scoreTrade({
            walletAddress: config.target_wallet,
            conditionId: trade.market,
            side: trade.side,
          });

          // Category filter
          if (
            config.smart_copy_categories &&
            config.smart_copy_categories.length > 0 &&
            !config.smart_copy_categories.includes(score.category)
          ) {
            await this.notify(
              config.user_telegram_id,
              `Smart Copy skipped: "${score.category}" category not in your filter.`,
            );
            lastProcessedTrade = trade;
            continue;
          }

          // Confidence threshold check
          if (score.confidence < config.smart_copy_min_confidence * 100) {
            await this.notify(
              config.user_telegram_id,
              `Smart Copy skipped: ${score.reason}. Score: ${score.confidence}% (min: ${Math.round(config.smart_copy_min_confidence * 100)}%)`,
            );
            lastProcessedTrade = trade;
            continue;
          }
        } catch (err) {
          console.error(
            `[CopyEngine] Smart copy scoring failed for wallet ${config.target_wallet}:`,
            err,
          );
          // On scorer failure, proceed with the trade (fail-open)
        }
      }

      // Calculate mirror size
      const mirrorSize = this.calculateMirrorSize(trade, config, balance);
      if (mirrorSize === null || mirrorSize <= 0) {
        lastProcessedTrade = trade;
        continue;
      }

      // Check sufficient balance -- do NOT advance cursor so we can retry
      if (mirrorSize > balance) {
        await this.notify(
          config.user_telegram_id,
          `Copy trade skipped: insufficient balance ($${balance.toFixed(2)} < $${mirrorSize.toFixed(2)} needed).`,
        );
        break;
      }

      // Execute mirror trade
      try {
        const side = trade.side.toUpperCase() as 'BUY' | 'SELL';
        const result = await this.tradingEngine.executeTrade({
          user,
          tokenId: trade.tokenId,
          conditionId: trade.market,
          side,
          amount: mirrorSize,
          price: trade.price,
        });

        if (result.success) {
          balance -= mirrorSize; // Update local balance tracker
          lastProcessedTrade = trade;
          const walletShort = `${config.target_wallet.slice(0, 6)}...${config.target_wallet.slice(-4)}`;
          await this.notify(
            config.user_telegram_id,
            `Copied: ${walletShort} ${side.toLowerCase()} at $${trade.price.toFixed(2)}. Your position: $${mirrorSize.toFixed(2)}`,
          );
        } else {
          await this.notify(
            config.user_telegram_id,
            `Copy trade failed: ${result.error ?? 'Unknown error'}`,
          );
          lastProcessedTrade = trade;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(
          `[CopyEngine] Trade execution failed for user ${config.user_telegram_id}:`,
          err,
        );
        await this.notify(
          config.user_telegram_id,
          `Copy trade error: ${msg}`,
        );
        lastProcessedTrade = trade;
      }
    }

    // Only advance cursor past trades that were actually processed
    if (lastProcessedTrade) {
      this.copyConfigQueries.updateLastSeenTrade(
        config.id,
        lastProcessedTrade.transactionHash,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Trade filtering
  // -----------------------------------------------------------------------

  /**
   * Find trades that are newer than last_seen_trade_id.
   * Uses transactionHash as the trade identifier.
   * Returns trades in chronological order (oldest first).
   */
  findNewTrades(
    trades: WalletTrade[],
    lastSeenTradeId: string | null,
  ): WalletTrade[] {
    if (!lastSeenTradeId) {
      // First poll: return all trades (oldest first)
      return [...trades].reverse();
    }

    // Trades come from the API newest-first. Find the index of the last seen trade.
    const lastSeenIndex = trades.findIndex(
      (t) => t.transactionHash === lastSeenTradeId,
    );

    if (lastSeenIndex === -1) {
      // Last seen trade not found in batch -- return all (could be a gap)
      return [...trades].reverse();
    }

    if (lastSeenIndex === 0) {
      // No new trades
      return [];
    }

    // Return trades before the last seen one (newest-first), then reverse for chrono order
    return trades.slice(0, lastSeenIndex).reverse();
  }

  /**
   * Check if a trade's direction matches the config filter.
   */
  shouldCopyTrade(
    trade: WalletTrade,
    direction: CopyConfig['direction'],
  ): boolean {
    if (direction === 'all') return true;
    const side = trade.side.toUpperCase();
    if (direction === 'buys_only') return side === 'BUY';
    if (direction === 'sells_only') return side === 'SELL';
    return true;
  }

  // -----------------------------------------------------------------------
  // Sizing
  // -----------------------------------------------------------------------

  /**
   * Calculate mirror trade size based on copy config.
   * Returns null to skip the trade.
   */
  calculateMirrorSize(
    originalTrade: WalletTrade,
    config: CopyConfig,
    userBalance: number,
  ): number | null {
    let size: number;

    switch (config.sizing_mode) {
      case 'percent':
        size = (config.sizing_value / 100) * userBalance;
        break;
      case 'fixed':
        size = config.sizing_value;
        break;
      case 'mirror':
        size = originalTrade.size * originalTrade.price; // dollar amount
        break;
      default:
        return null;
    }

    // Apply max_per_trade cap
    if (config.max_per_trade !== null && size > config.max_per_trade) {
      size = config.max_per_trade;
    }

    // Round to cents
    size = Math.round(size * 100) / 100;

    return size > 0 ? size : null;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private groupByWallet(configs: CopyConfig[]): Map<string, CopyConfig[]> {
    const map = new Map<string, CopyConfig[]>();
    for (const config of configs) {
      const wallet = config.target_wallet.toLowerCase();
      const existing = map.get(wallet) ?? [];
      existing.push(config);
      map.set(wallet, existing);
    }
    return map;
  }
}
