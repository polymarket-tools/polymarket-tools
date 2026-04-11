import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopyEngine, type CopyNotifyFn, type CopyEngineDeps } from '../src/copy-engine';
import type { CopyConfig, User } from '../src/types';
import type { WalletTrade } from '@polymarket-tools/core';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockTrade(overrides: Partial<WalletTrade> = {}): WalletTrade {
  return {
    market: '0xcondition123',
    tokenId: 'token-yes-456',
    side: 'BUY',
    price: 0.65,
    size: 100,
    timestamp: '2024-01-01T00:00:00.000Z',
    transactionHash: '0xtx1',
    ...overrides,
  };
}

function createMockCopyConfig(overrides: Partial<CopyConfig> = {}): CopyConfig {
  return {
    id: 1,
    user_telegram_id: 12345,
    target_wallet: '0xwhale',
    sizing_mode: 'fixed',
    sizing_value: 50,
    direction: 'all',
    max_per_trade: null,
    active: true,
    last_seen_trade_id: null,
    smart_copy_enabled: false,
    smart_copy_min_confidence: 0.7,
    smart_copy_categories: null,
    ...overrides,
  };
}

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    telegram_id: 12345,
    privy_user_id: 'privy-user-123',
    privy_wallet_id: 'wallet-abc',
    signer_address: '0xsigner',
    safe_address: '0xsafe',
    deposit_address: '0xsafe',
    created_at: '2024-01-01T00:00:00Z',
    alert_preferences: {
      whales: true,
      politics: true,
      movers: true,
      new_markets: true,
      risk_reward: true,
      smart_money: true,
    },
    referred_by: null,
    fee_rate: 0.005,
    fee_rate_expires: null,
    digest_enabled: true,
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<CopyEngineDeps> = {}): CopyEngineDeps {
  return {
    dataApi: {
      getWalletTrades: vi.fn().mockResolvedValue([]),
    } as any,
    tradingEngine: {
      executeTrade: vi.fn().mockResolvedValue({
        success: true,
        orderId: 'order-123',
        price: 0.65,
        size: 76.92,
        feeAmount: 0.25,
        txHash: '0xtxhash',
      }),
    } as any,
    copyConfigQueries: {
      listAllActive: vi.fn().mockReturnValue([]),
      updateLastSeenTrade: vi.fn(),
    } as any,
    userQueries: {
      getByTelegramId: vi.fn().mockReturnValue(createMockUser()),
    } as any,
    notify: vi.fn<CopyNotifyFn>().mockResolvedValue(undefined),
    getBalance: vi.fn().mockResolvedValue(500),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CopyEngine', () => {
  let engine: CopyEngine;
  let deps: CopyEngineDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    engine = new CopyEngine(deps);
  });

  afterEach(() => {
    engine.stop();
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('starts and stops without error', () => {
      engine.start();
      engine.stop();
      // Double stop should be safe
      engine.stop();
    });

    it('does not start twice', () => {
      engine.start();
      engine.start(); // should be no-op
      engine.stop();
    });
  });

  // -----------------------------------------------------------------------
  // poll()
  // -----------------------------------------------------------------------

  describe('poll', () => {
    it('does nothing when no active configs', async () => {
      await engine.poll();
      expect(deps.dataApi.getWalletTrades).not.toHaveBeenCalled();
    });

    it('fetches trades for each unique target wallet', async () => {
      const configs = [
        createMockCopyConfig({ id: 1, target_wallet: '0xwalletA', last_seen_trade_id: '0xprev' }),
        createMockCopyConfig({ id: 2, target_wallet: '0xwalletB', last_seen_trade_id: '0xprev' }),
      ];
      (deps.copyConfigQueries.listAllActive as any).mockReturnValue(configs);
      (deps.dataApi.getWalletTrades as any).mockResolvedValue([]);

      await engine.poll();

      expect(deps.dataApi.getWalletTrades).toHaveBeenCalledTimes(2);
    });

    it('groups configs by target_wallet to avoid duplicate API calls', async () => {
      const configs = [
        createMockCopyConfig({ id: 1, user_telegram_id: 111, target_wallet: '0xSameWallet' }),
        createMockCopyConfig({ id: 2, user_telegram_id: 222, target_wallet: '0xsamewallet' }), // same wallet, different case
      ];
      (deps.copyConfigQueries.listAllActive as any).mockReturnValue(configs);
      (deps.dataApi.getWalletTrades as any).mockResolvedValue([]);

      await engine.poll();

      // Only one API call for the same wallet (case-insensitive)
      expect(deps.dataApi.getWalletTrades).toHaveBeenCalledTimes(1);
    });

    it('executes mirror trade when new trade detected', async () => {
      const trade = createMockTrade({ transactionHash: '0xnew' });
      const config = createMockCopyConfig({
        last_seen_trade_id: '0xold',
        sizing_mode: 'fixed',
        sizing_value: 50,
      });

      (deps.copyConfigQueries.listAllActive as any).mockReturnValue([config]);
      (deps.dataApi.getWalletTrades as any).mockResolvedValue([
        trade,
        createMockTrade({ transactionHash: '0xold' }),
      ]);

      await engine.poll();

      expect(deps.tradingEngine.executeTrade).toHaveBeenCalledTimes(1);
      expect(deps.tradingEngine.executeTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50,
          side: 'BUY',
        }),
      );
    });

    it('updates last_seen_trade_id after processing', async () => {
      const config = createMockCopyConfig({ last_seen_trade_id: null });
      const trades = [
        createMockTrade({ transactionHash: '0xnewest' }),
        createMockTrade({ transactionHash: '0xolder' }),
      ];

      (deps.copyConfigQueries.listAllActive as any).mockReturnValue([config]);
      (deps.dataApi.getWalletTrades as any).mockResolvedValue(trades);

      await engine.poll();

      // Should update to the newest trade's hash (trades are reversed for processing,
      // but the latest in chrono order is the original newest)
      expect(deps.copyConfigQueries.updateLastSeenTrade).toHaveBeenCalledWith(
        1,
        '0xnewest',
      );
    });

    it('notifies user on successful copy', async () => {
      const config = createMockCopyConfig({
        target_wallet: '0xca3aAbC123456789dEf0',
        last_seen_trade_id: '0xold',
      });
      const trade = createMockTrade({ transactionHash: '0xnew', side: 'BUY', price: 0.65 });

      (deps.copyConfigQueries.listAllActive as any).mockReturnValue([config]);
      (deps.dataApi.getWalletTrades as any).mockResolvedValue([
        trade,
        createMockTrade({ transactionHash: '0xold' }),
      ]);

      await engine.poll();

      expect(deps.notify).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Copied:'),
      );
    });

    it('notifies user on failed copy trade', async () => {
      const config = createMockCopyConfig({ last_seen_trade_id: '0xold' });
      (deps.tradingEngine.executeTrade as any).mockResolvedValue({
        success: false,
        error: 'Insufficient allowance',
        price: 0.65,
        size: 0,
        feeAmount: 0,
      });

      (deps.copyConfigQueries.listAllActive as any).mockReturnValue([config]);
      (deps.dataApi.getWalletTrades as any).mockResolvedValue([
        createMockTrade({ transactionHash: '0xnew' }),
        createMockTrade({ transactionHash: '0xold' }),
      ]);

      await engine.poll();

      expect(deps.notify).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Copy trade failed'),
      );
    });

    it('skips trade when balance is insufficient', async () => {
      (deps.getBalance as any).mockResolvedValue(10); // only $10
      const config = createMockCopyConfig({
        last_seen_trade_id: '0xold',
        sizing_mode: 'fixed',
        sizing_value: 50, // needs $50
      });

      (deps.copyConfigQueries.listAllActive as any).mockReturnValue([config]);
      (deps.dataApi.getWalletTrades as any).mockResolvedValue([
        createMockTrade({ transactionHash: '0xnew' }),
        createMockTrade({ transactionHash: '0xold' }),
      ]);

      await engine.poll();

      expect(deps.tradingEngine.executeTrade).not.toHaveBeenCalled();
      expect(deps.notify).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('insufficient balance'),
      );
    });

    it('notifies when balance check fails', async () => {
      (deps.getBalance as any).mockRejectedValue(new Error('RPC error'));
      const config = createMockCopyConfig({ last_seen_trade_id: '0xold' });

      (deps.copyConfigQueries.listAllActive as any).mockReturnValue([config]);
      (deps.dataApi.getWalletTrades as any).mockResolvedValue([
        createMockTrade({ transactionHash: '0xnew' }),
        createMockTrade({ transactionHash: '0xold' }),
      ]);

      await engine.poll();

      expect(deps.tradingEngine.executeTrade).not.toHaveBeenCalled();
      expect(deps.notify).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('could not check your balance'),
      );
    });

    it('skips when user not found', async () => {
      (deps.userQueries.getByTelegramId as any).mockReturnValue(undefined);
      const config = createMockCopyConfig({ last_seen_trade_id: '0xold' });

      (deps.copyConfigQueries.listAllActive as any).mockReturnValue([config]);
      (deps.dataApi.getWalletTrades as any).mockResolvedValue([
        createMockTrade({ transactionHash: '0xnew' }),
        createMockTrade({ transactionHash: '0xold' }),
      ]);

      await engine.poll();

      expect(deps.tradingEngine.executeTrade).not.toHaveBeenCalled();
    });

    it('handles API error for a wallet gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (deps.dataApi.getWalletTrades as any).mockRejectedValue(new Error('API down'));
      const config = createMockCopyConfig({ last_seen_trade_id: '0xold' });

      (deps.copyConfigQueries.listAllActive as any).mockReturnValue([config]);

      // Should not throw
      await engine.poll();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // findNewTrades
  // -----------------------------------------------------------------------

  describe('findNewTrades', () => {
    it('returns all trades when last_seen_trade_id is null', () => {
      const trades = [
        createMockTrade({ transactionHash: '0xc' }),
        createMockTrade({ transactionHash: '0xb' }),
        createMockTrade({ transactionHash: '0xa' }),
      ];

      const result = engine.findNewTrades(trades, null);

      // Reversed to chronological order
      expect(result).toHaveLength(3);
      expect(result[0].transactionHash).toBe('0xa');
      expect(result[2].transactionHash).toBe('0xc');
    });

    it('returns empty array when no new trades', () => {
      const trades = [
        createMockTrade({ transactionHash: '0xlatest' }),
      ];

      const result = engine.findNewTrades(trades, '0xlatest');
      expect(result).toHaveLength(0);
    });

    it('returns trades newer than last_seen_trade_id', () => {
      const trades = [
        createMockTrade({ transactionHash: '0xnew2' }),
        createMockTrade({ transactionHash: '0xnew1' }),
        createMockTrade({ transactionHash: '0xold' }),
      ];

      const result = engine.findNewTrades(trades, '0xold');

      expect(result).toHaveLength(2);
      // Chronological order (oldest first)
      expect(result[0].transactionHash).toBe('0xnew1');
      expect(result[1].transactionHash).toBe('0xnew2');
    });

    it('returns all trades when last_seen_trade_id not found in batch', () => {
      const trades = [
        createMockTrade({ transactionHash: '0xc' }),
        createMockTrade({ transactionHash: '0xb' }),
      ];

      const result = engine.findNewTrades(trades, '0xnotfound');

      expect(result).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // shouldCopyTrade
  // -----------------------------------------------------------------------

  describe('shouldCopyTrade', () => {
    it('returns true for "all" direction regardless of side', () => {
      expect(engine.shouldCopyTrade(createMockTrade({ side: 'BUY' }), 'all')).toBe(true);
      expect(engine.shouldCopyTrade(createMockTrade({ side: 'SELL' }), 'all')).toBe(true);
    });

    it('returns true for buys_only when trade is BUY', () => {
      expect(engine.shouldCopyTrade(createMockTrade({ side: 'BUY' }), 'buys_only')).toBe(true);
    });

    it('returns false for buys_only when trade is SELL', () => {
      expect(engine.shouldCopyTrade(createMockTrade({ side: 'SELL' }), 'buys_only')).toBe(false);
    });

    it('returns true for sells_only when trade is SELL', () => {
      expect(engine.shouldCopyTrade(createMockTrade({ side: 'SELL' }), 'sells_only')).toBe(true);
    });

    it('returns false for sells_only when trade is BUY', () => {
      expect(engine.shouldCopyTrade(createMockTrade({ side: 'BUY' }), 'sells_only')).toBe(false);
    });

    it('handles lowercase side from API', () => {
      expect(engine.shouldCopyTrade(createMockTrade({ side: 'buy' }), 'buys_only')).toBe(true);
      expect(engine.shouldCopyTrade(createMockTrade({ side: 'sell' }), 'sells_only')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // calculateMirrorSize
  // -----------------------------------------------------------------------

  describe('calculateMirrorSize', () => {
    it('calculates percent sizing based on balance', () => {
      const trade = createMockTrade();
      const config = createMockCopyConfig({
        sizing_mode: 'percent',
        sizing_value: 25,
      });

      const size = engine.calculateMirrorSize(trade, config, 200);
      expect(size).toBe(50); // 25% of 200
    });

    it('calculates fixed sizing', () => {
      const trade = createMockTrade();
      const config = createMockCopyConfig({
        sizing_mode: 'fixed',
        sizing_value: 75,
      });

      const size = engine.calculateMirrorSize(trade, config, 200);
      expect(size).toBe(75);
    });

    it('calculates mirror sizing (exact dollar amount)', () => {
      const trade = createMockTrade({ size: 100, price: 0.65 });
      const config = createMockCopyConfig({
        sizing_mode: 'mirror',
        sizing_value: 0, // not used in mirror mode
      });

      const size = engine.calculateMirrorSize(trade, config, 200);
      expect(size).toBe(65); // 100 shares * $0.65
    });

    it('applies max_per_trade cap', () => {
      const trade = createMockTrade();
      const config = createMockCopyConfig({
        sizing_mode: 'fixed',
        sizing_value: 200,
        max_per_trade: 100,
      });

      const size = engine.calculateMirrorSize(trade, config, 500);
      expect(size).toBe(100); // capped at max_per_trade
    });

    it('does not cap when max_per_trade is null', () => {
      const trade = createMockTrade();
      const config = createMockCopyConfig({
        sizing_mode: 'fixed',
        sizing_value: 200,
        max_per_trade: null,
      });

      const size = engine.calculateMirrorSize(trade, config, 500);
      expect(size).toBe(200);
    });

    it('returns null for zero-balance percent sizing', () => {
      const trade = createMockTrade();
      const config = createMockCopyConfig({
        sizing_mode: 'percent',
        sizing_value: 25,
      });

      const size = engine.calculateMirrorSize(trade, config, 0);
      expect(size).toBeNull();
    });

    it('rounds to cents', () => {
      const trade = createMockTrade();
      const config = createMockCopyConfig({
        sizing_mode: 'percent',
        sizing_value: 33,
      });

      const size = engine.calculateMirrorSize(trade, config, 100.33);
      // 33% of 100.33 = 33.1089 -> 33.11
      expect(size).toBe(33.11);
    });
  });

  // -----------------------------------------------------------------------
  // Direction filtering with poll integration
  // -----------------------------------------------------------------------

  describe('direction filtering in poll', () => {
    it('skips sell trades when direction is buys_only', async () => {
      const config = createMockCopyConfig({
        last_seen_trade_id: '0xold',
        direction: 'buys_only',
      });
      (deps.copyConfigQueries.listAllActive as any).mockReturnValue([config]);
      (deps.dataApi.getWalletTrades as any).mockResolvedValue([
        createMockTrade({ transactionHash: '0xnew', side: 'SELL' }),
        createMockTrade({ transactionHash: '0xold' }),
      ]);

      await engine.poll();

      expect(deps.tradingEngine.executeTrade).not.toHaveBeenCalled();
    });

    it('copies buy trades when direction is buys_only', async () => {
      const config = createMockCopyConfig({
        last_seen_trade_id: '0xold',
        direction: 'buys_only',
      });
      (deps.copyConfigQueries.listAllActive as any).mockReturnValue([config]);
      (deps.dataApi.getWalletTrades as any).mockResolvedValue([
        createMockTrade({ transactionHash: '0xnew', side: 'BUY' }),
        createMockTrade({ transactionHash: '0xold' }),
      ]);

      await engine.poll();

      expect(deps.tradingEngine.executeTrade).toHaveBeenCalledTimes(1);
    });
  });
});
