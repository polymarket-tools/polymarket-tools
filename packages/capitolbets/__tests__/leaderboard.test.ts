import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardService, type FeeSplit } from '../src/leaderboard';
import type { Trade, User, LeaderboardCache } from '../src/types';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    telegram_id: 1,
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
    user_telegram_id: 1,
    market_condition_id: '0xmarket1',
    token_id: 'token-1',
    side: 'BUY',
    price: 0.5,
    size: 100,
    fee_amount: 0.25,
    source: 'manual',
    tx_hash: '0xtx1',
    created_at: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let mockTradeQueries: any;
  let mockLeaderboardQueries: any;
  let mockLeaderEarningQueries: any;
  let mockUserQueries: any;

  beforeEach(() => {
    mockTradeQueries = {
      getByUser: vi.fn().mockReturnValue([]),
      getByUserAndPeriod: vi.fn().mockReturnValue([]),
    };
    mockLeaderboardQueries = {
      upsert: vi.fn(),
      getTop: vi.fn().mockReturnValue([]),
    };
    mockLeaderEarningQueries = {
      insert: vi.fn(),
      getTotalByLeader: vi.fn().mockReturnValue(0),
      getWeeklyByLeader: vi.fn().mockReturnValue(0),
      getCopierCount: vi.fn().mockReturnValue(0),
    };
    mockUserQueries = {
      listAll: vi.fn().mockReturnValue([]),
      getByTelegramId: vi.fn(),
    };

    service = new LeaderboardService({
      tradeQueries: mockTradeQueries,
      leaderboardQueries: mockLeaderboardQueries,
      leaderEarningQueries: mockLeaderEarningQueries,
      userQueries: mockUserQueries,
    });
  });

  // -----------------------------------------------------------------------
  // recalculate
  // -----------------------------------------------------------------------

  describe('recalculate', () => {
    it('upserts leaderboard entries for users with trades', () => {
      const users = [
        createMockUser({ telegram_id: 1 }),
        createMockUser({ telegram_id: 2 }),
      ];
      mockUserQueries.listAll.mockReturnValue(users);

      // User 1: buy at 0.50, sell at 0.80 -> profit
      mockTradeQueries.getByUserAndPeriod
        .mockReturnValueOnce([
          createMockTrade({ user_telegram_id: 1, side: 'BUY', price: 0.5, size: 100, market_condition_id: '0xm1' }),
          createMockTrade({ user_telegram_id: 1, side: 'SELL', price: 0.8, size: 100, market_condition_id: '0xm1' }),
        ])
        // User 2: no trades
        .mockReturnValueOnce([]);

      service.recalculate('7d');

      // Only user 1 should be upserted (user 2 has no trades)
      expect(mockLeaderboardQueries.upsert).toHaveBeenCalledTimes(1);
      expect(mockLeaderboardQueries.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_telegram_id: 1,
          period: '7d',
          trade_count: 2,
        }),
      );
    });

    it('calculates P&L correctly for buy/sell cycle', () => {
      const users = [createMockUser({ telegram_id: 1 })];
      mockUserQueries.listAll.mockReturnValue(users);

      mockTradeQueries.getByUserAndPeriod.mockReturnValue([
        createMockTrade({ side: 'BUY', price: 0.40, size: 100, market_condition_id: '0xm1' }),
        createMockTrade({ side: 'SELL', price: 0.70, size: 100, market_condition_id: '0xm1' }),
      ]);

      service.recalculate('7d');

      const call = mockLeaderboardQueries.upsert.mock.calls[0][0];
      // PnL = (-0.40*100) + (0.70*100) = -40 + 70 = 30
      expect(call.pnl).toBe(30);
      expect(call.win_rate).toBe(1); // 1 sell that was profitable
    });

    it('uses getByUser for "all" period', () => {
      const users = [createMockUser({ telegram_id: 1 })];
      mockUserQueries.listAll.mockReturnValue(users);
      mockTradeQueries.getByUser.mockReturnValue([]);

      service.recalculate('all');

      expect(mockTradeQueries.getByUser).toHaveBeenCalledWith(1);
      expect(mockTradeQueries.getByUserAndPeriod).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getTop
  // -----------------------------------------------------------------------

  describe('getTop', () => {
    it('delegates to leaderboard cache queries', () => {
      const mockResults: LeaderboardCache[] = [
        { user_telegram_id: 1, period: '7d', pnl: 500, win_rate: 0.8, trade_count: 20, calculated_at: '2024-01-01' },
      ];
      mockLeaderboardQueries.getTop.mockReturnValue(mockResults);

      const result = service.getTop('7d', 10);

      expect(result).toEqual(mockResults);
      expect(mockLeaderboardQueries.getTop).toHaveBeenCalledWith('7d', 10);
    });
  });

  // -----------------------------------------------------------------------
  // Leader earnings
  // -----------------------------------------------------------------------

  describe('recordLeaderEarning', () => {
    it('inserts earning record', () => {
      service.recordLeaderEarning({
        leaderTelegramId: 100,
        copierTelegramId: 200,
        feeAmount: 0.05,
        tradeId: 42,
      });

      expect(mockLeaderEarningQueries.insert).toHaveBeenCalledWith({
        leader_telegram_id: 100,
        copier_telegram_id: 200,
        fee_earned: 0.05,
        trade_id: 42,
      });
    });
  });

  describe('getLeaderStats', () => {
    it('returns aggregated stats', () => {
      mockLeaderEarningQueries.getCopierCount.mockReturnValue(23);
      mockLeaderEarningQueries.getWeeklyByLeader.mockReturnValue(48.20);
      mockLeaderEarningQueries.getTotalByLeader.mockReturnValue(312.50);

      const stats = service.getLeaderStats(100);

      expect(stats).toEqual({
        copierCount: 23,
        weeklyEarnings: 48.20,
        totalEarnings: 312.50,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Fee split
  // -----------------------------------------------------------------------

  describe('calculateFeeSplit', () => {
    it('splits fee with both leader and referrer', () => {
      const split = service.calculateFeeSplit(0.50, 100, 200);

      expect(split.capitolBets).toBe(0.38); // 75%
      expect(split.leader).toBe(0.05);      // 10%
      expect(split.referrer).toBe(0.08);    // 15%
      // Total should equal original fee (within rounding)
      expect(split.capitolBets + split.leader + split.referrer).toBeCloseTo(0.50, 1);
    });

    it('gives leader share to CapitolBets when no leader', () => {
      const split = service.calculateFeeSplit(0.50, null, 200);

      expect(split.leader).toBe(0);
      expect(split.referrer).toBe(0.08);
      expect(split.capitolBets).toBe(0.43); // 75% + leader's 10%
    });

    it('gives referrer share to CapitolBets when no referrer', () => {
      const split = service.calculateFeeSplit(0.50, 100, null);

      expect(split.referrer).toBe(0);
      expect(split.leader).toBe(0.05);
      expect(split.capitolBets).toBe(0.45); // 75% + referrer's 15%
    });

    it('gives all to CapitolBets when no leader and no referrer', () => {
      const split = service.calculateFeeSplit(0.50, null, null);

      expect(split.capitolBets).toBe(0.50);
      expect(split.leader).toBe(0);
      expect(split.referrer).toBe(0);
    });

    it('handles $100 trade at 0.5% fee correctly', () => {
      // $100 * 0.005 = $0.50 fee
      const split = service.calculateFeeSplit(0.50, 100, 200);

      expect(split.capitolBets).toBe(0.38);  // $0.375 rounded
      expect(split.leader).toBe(0.05);        // $0.05
      expect(split.referrer).toBe(0.08);      // $0.075 rounded
    });
  });
});
