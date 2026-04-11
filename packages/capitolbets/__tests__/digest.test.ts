import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DigestScheduler, type DigestNotifyFn } from '../src/digest';
import type { User, Trade, CopyConfig } from '../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    telegram_id: 12345,
    privy_user_id: 'privy-1',
    privy_wallet_id: 'wallet-1',
    signer_address: '0xsigner',
    safe_address: '0xsafe',
    deposit_address: '0xsafe',
    created_at: '2024-01-01T00:00:00Z',
    alert_preferences: {
      whales: true, politics: true, movers: true,
      new_markets: true, risk_reward: true, smart_money: true,
    },
    referred_by: null,
    fee_rate: 0.005,
    fee_rate_expires: null,
    digest_enabled: true,
    ...overrides,
  };
}

function createMockTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    user_telegram_id: 12345,
    market_condition_id: '0xmarket1',
    token_id: 'token-1',
    side: 'BUY',
    price: 0.5,
    size: 100,
    fee_amount: 0.25,
    source: 'manual',
    tx_hash: '0xtx1',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DigestScheduler', () => {
  let scheduler: DigestScheduler;
  let mockNotify: ReturnType<typeof vi.fn<DigestNotifyFn>>;
  let mockUserQueries: any;
  let mockTradeQueries: any;
  let mockCopyConfigQueries: any;
  let mockDataApi: any;

  beforeEach(() => {
    mockNotify = vi.fn<DigestNotifyFn>().mockResolvedValue(undefined);
    mockUserQueries = {
      listDigestEnabled: vi.fn().mockReturnValue([]),
      listAll: vi.fn().mockReturnValue([]),
    };
    mockTradeQueries = {
      getByUserAndPeriod: vi.fn().mockReturnValue([]),
      getByUser: vi.fn().mockReturnValue([]),
    };
    mockCopyConfigQueries = {
      getActiveByUser: vi.fn().mockReturnValue([]),
    };
    mockDataApi = {
      getWalletPositions: vi.fn().mockResolvedValue([]),
      getWalletTrades: vi.fn().mockResolvedValue([]),
    };

    scheduler = new DigestScheduler({
      userQueries: mockUserQueries,
      tradeQueries: mockTradeQueries,
      copyConfigQueries: mockCopyConfigQueries,
      dataApi: mockDataApi,
      notify: mockNotify,
    });
  });

  afterEach(() => {
    scheduler.stop();
  });

  // -----------------------------------------------------------------------
  // sendAllDigests
  // -----------------------------------------------------------------------

  describe('sendAllDigests', () => {
    it('sends digest to all users with digest_enabled', async () => {
      const users = [
        createMockUser({ telegram_id: 1 }),
        createMockUser({ telegram_id: 2 }),
      ];
      mockUserQueries.listDigestEnabled.mockReturnValue(users);

      const count = await scheduler.sendAllDigests();

      expect(count).toBe(2);
      expect(mockNotify).toHaveBeenCalledTimes(2);
    });

    it('returns 0 when no users have digest enabled', async () => {
      mockUserQueries.listDigestEnabled.mockReturnValue([]);

      const count = await scheduler.sendAllDigests();

      expect(count).toBe(0);
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('continues sending to other users if one fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const users = [
        createMockUser({ telegram_id: 1 }),
        createMockUser({ telegram_id: 2 }),
      ];
      mockUserQueries.listDigestEnabled.mockReturnValue(users);
      mockNotify
        .mockRejectedValueOnce(new Error('Telegram blocked'))
        .mockResolvedValueOnce(undefined);

      const count = await scheduler.sendAllDigests();

      expect(count).toBe(1); // only second one succeeded
      expect(mockNotify).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // generateDigest
  // -----------------------------------------------------------------------

  describe('generateDigest', () => {
    it('generates digest with P&L summary', async () => {
      const user = createMockUser();

      // Yesterday trades: buy at 0.50, sell at 0.80
      mockTradeQueries.getByUserAndPeriod
        .mockReturnValueOnce([
          createMockTrade({ side: 'BUY', price: 0.50, size: 100 }),
          createMockTrade({ side: 'SELL', price: 0.80, size: 100 }),
        ])
        // Week trades
        .mockReturnValueOnce([
          createMockTrade({ side: 'BUY', price: 0.50, size: 200 }),
          createMockTrade({ side: 'SELL', price: 0.90, size: 200 }),
        ]);

      mockDataApi.getWalletPositions.mockResolvedValue([
        { market: '0xm1', outcome: 'Yes', size: 50, avgPrice: 0.6, currentValue: 60, cashPnl: 10, percentPnl: 20 },
        { market: '0xm2', outcome: 'No', size: 30, avgPrice: 0.7, currentValue: 35, cashPnl: 5, percentPnl: 15 },
      ]);

      const digest = await scheduler.generateDigest(user);

      expect(digest).toContain('Good morning');
      expect(digest).toContain('Yesterday:');
      expect(digest).toContain('This week:');
      expect(digest).toContain('Open positions: 2');
      expect(digest).toContain('/portfolio');
    });

    it('generates simplified digest for user with no trades', async () => {
      const user = createMockUser();

      const digest = await scheduler.generateDigest(user);

      expect(digest).toContain('Good morning');
      expect(digest).toContain('Yesterday: +$0.00');
      expect(digest).toContain('Open positions: 0');
    });

    it('includes copied whale performance', async () => {
      const user = createMockUser();

      mockCopyConfigQueries.getActiveByUser.mockReturnValue([
        { target_wallet: '0xWhale1ABC123DEF456' } as CopyConfig,
      ]);

      const now = new Date();
      mockDataApi.getWalletTrades.mockResolvedValue([
        {
          market: '0xm1',
          tokenId: 'tok1',
          side: 'SELL',
          price: 0.80,
          size: 500,
          timestamp: now.toISOString(),
          transactionHash: '0xtx1',
        },
      ]);

      const digest = await scheduler.generateDigest(user);

      expect(digest).toContain('Whales you\'re copying');
      expect(digest).toContain('0xWhal...F456');
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('starts and stops without error', () => {
      scheduler.start();
      scheduler.stop();
      scheduler.stop(); // double stop should be safe
    });

    it('does not start twice', () => {
      scheduler.start();
      scheduler.start(); // should be no-op
      scheduler.stop();
    });
  });
});
