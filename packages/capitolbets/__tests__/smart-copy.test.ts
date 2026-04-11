import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmartCopyScorer, type TradeScore, type CategoryStats } from '../src/smart-copy';
import type { WalletTrade, WalletPosition, Market } from '@polymarket-tools/core';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockTrade(overrides: Partial<WalletTrade> = {}): WalletTrade {
  return {
    market: '0xcondition1',
    tokenId: 'token-1',
    side: 'BUY',
    price: 0.65,
    size: 100,
    timestamp: '2024-01-01T00:00:00.000Z',
    transactionHash: '0xtx1',
    ...overrides,
  };
}

function createMockPosition(overrides: Partial<WalletPosition> = {}): WalletPosition {
  return {
    market: '0xcondition1',
    outcome: 'Yes',
    size: 100,
    avgPrice: 0.65,
    currentValue: 100,
    cashPnl: 35,
    percentPnl: 53.8,
    ...overrides,
  };
}

function createMockMarket(overrides: Partial<Market> = {}): Market {
  return {
    conditionId: '0xcondition1',
    question: 'Will fed cut rates?',
    slug: 'fed-rate-cut',
    description: 'Test market',
    active: true,
    closed: false,
    volume: 1000000,
    liquidity: 50000,
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    tokens: [],
    tags: ['Politics'],
    image: '',
    icon: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SmartCopyScorer', () => {
  let scorer: SmartCopyScorer;
  let mockDataApi: any;
  let mockGamma: any;

  beforeEach(() => {
    mockDataApi = {
      getWalletTrades: vi.fn().mockResolvedValue([]),
      getWalletPositions: vi.fn().mockResolvedValue([]),
    };
    mockGamma = {
      getMarket: vi.fn().mockResolvedValue(createMockMarket()),
    };
    scorer = new SmartCopyScorer(mockDataApi, mockGamma);
  });

  // -----------------------------------------------------------------------
  // scoreTrade
  // -----------------------------------------------------------------------

  describe('scoreTrade', () => {
    it('returns high confidence for a wallet with strong win rate', async () => {
      // 16 wins out of 22 politics trades (>20 triggers bonus)
      const trades: WalletTrade[] = [];
      const positions: WalletPosition[] = [];

      for (let i = 0; i < 22; i++) {
        const conditionId = `0xpolitics_${i}`;
        trades.push(createMockTrade({ market: conditionId }));
        positions.push(
          createMockPosition({
            market: conditionId,
            cashPnl: i < 16 ? 50 : -30, // 16 wins, 6 losses
          }),
        );
      }

      mockDataApi.getWalletTrades.mockResolvedValue(trades);
      mockDataApi.getWalletPositions.mockResolvedValue(positions);
      mockGamma.getMarket.mockResolvedValue(createMockMarket({ tags: ['Politics'] }));

      const score = await scorer.scoreTrade({
        walletAddress: '0xwhale',
        conditionId: '0xpolitics_0',
        side: 'BUY',
      });

      // ~73% win rate (16/22) + 5 bonus for >20 trades = 78
      expect(score.confidence).toBe(78);
      expect(score.category).toBe('Politics');
      expect(score.walletWinRate).toBeCloseTo(16 / 22, 2);
      expect(score.walletTradeCount).toBe(22);
      expect(score.recommendation).toBe('COPY');
      expect(score.reason).toContain('73%');
      expect(score.reason).toContain('Politics');
    });

    it('returns low confidence for a wallet with few trades in category', async () => {
      // 1 win out of 3 sports trades
      const trades = [
        createMockTrade({ market: '0xsport1' }),
        createMockTrade({ market: '0xsport2' }),
        createMockTrade({ market: '0xsport3' }),
      ];
      const positions = [
        createMockPosition({ market: '0xsport1', cashPnl: 10 }),
        createMockPosition({ market: '0xsport2', cashPnl: -20 }),
        createMockPosition({ market: '0xsport3', cashPnl: -15 }),
      ];

      mockDataApi.getWalletTrades.mockResolvedValue(trades);
      mockDataApi.getWalletPositions.mockResolvedValue(positions);
      mockGamma.getMarket.mockResolvedValue(createMockMarket({ tags: ['Sports'] }));

      const score = await scorer.scoreTrade({
        walletAddress: '0xwhale',
        conditionId: '0xsport1',
        side: 'BUY',
      });

      // 33% win rate - 20 penalty for <5 trades = ~13
      expect(score.confidence).toBe(13);
      expect(score.category).toBe('Sports');
      expect(score.recommendation).toBe('SKIP');
    });

    it('returns zero confidence when wallet has no trades in category', async () => {
      // Wallet has politics trades but we're scoring a crypto market
      const trades = [
        createMockTrade({ market: '0xpolitics1' }),
      ];
      const positions = [
        createMockPosition({ market: '0xpolitics1', cashPnl: 50 }),
      ];

      mockDataApi.getWalletTrades.mockResolvedValue(trades);
      mockDataApi.getWalletPositions.mockResolvedValue(positions);

      // First call for stats = Politics, second call for scoring = Crypto
      mockGamma.getMarket
        .mockResolvedValueOnce(createMockMarket({ conditionId: '0xcrypto1', tags: ['Crypto'] }))
        .mockResolvedValueOnce(createMockMarket({ conditionId: '0xpolitics1', tags: ['Politics'] }));

      const score = await scorer.scoreTrade({
        walletAddress: '0xwhale',
        conditionId: '0xcrypto1',
        side: 'BUY',
      });

      expect(score.confidence).toBe(0);
      expect(score.recommendation).toBe('SKIP');
      expect(score.reason).toContain('No trade history');
    });

    it('returns zero confidence when wallet has no trades at all', async () => {
      mockDataApi.getWalletTrades.mockResolvedValue([]);
      mockDataApi.getWalletPositions.mockResolvedValue([]);

      const score = await scorer.scoreTrade({
        walletAddress: '0xwhale',
        conditionId: '0xmarket1',
        side: 'BUY',
      });

      expect(score.confidence).toBe(0);
      expect(score.recommendation).toBe('SKIP');
    });

    it('clamps confidence between 0 and 100', async () => {
      // All wins with lots of trades -> should not exceed 100
      const trades: WalletTrade[] = [];
      const positions: WalletPosition[] = [];
      for (let i = 0; i < 25; i++) {
        const condId = `0xm_${i}`;
        trades.push(createMockTrade({ market: condId }));
        positions.push(createMockPosition({ market: condId, cashPnl: 100 }));
      }

      mockDataApi.getWalletTrades.mockResolvedValue(trades);
      mockDataApi.getWalletPositions.mockResolvedValue(positions);
      mockGamma.getMarket.mockResolvedValue(createMockMarket({ tags: ['Politics'] }));

      const score = await scorer.scoreTrade({
        walletAddress: '0xwhale',
        conditionId: '0xm_0',
        side: 'BUY',
      });

      // 100% + 5 bonus = clamped to 100
      expect(score.confidence).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // getWalletCategoryStats
  // -----------------------------------------------------------------------

  describe('getWalletCategoryStats', () => {
    it('groups trades by market category', async () => {
      const trades = [
        createMockTrade({ market: '0xpolitics1' }),
        createMockTrade({ market: '0xpolitics2' }),
        createMockTrade({ market: '0xcrypto1' }),
      ];
      const positions = [
        createMockPosition({ market: '0xpolitics1', cashPnl: 50 }),
        createMockPosition({ market: '0xpolitics2', cashPnl: -20 }),
        createMockPosition({ market: '0xcrypto1', cashPnl: 30 }),
      ];

      mockDataApi.getWalletTrades.mockResolvedValue(trades);
      mockDataApi.getWalletPositions.mockResolvedValue(positions);

      mockGamma.getMarket
        .mockResolvedValueOnce(createMockMarket({ tags: ['Politics'] }))
        .mockResolvedValueOnce(createMockMarket({ tags: ['Politics'] }))
        .mockResolvedValueOnce(createMockMarket({ tags: ['Crypto'] }));

      const stats = await scorer.getWalletCategoryStats('0xwhale');

      expect(stats).toHaveLength(2);

      const politics = stats.find((s) => s.category === 'Politics');
      expect(politics).toBeDefined();
      expect(politics!.tradeCount).toBe(2);
      expect(politics!.winRate).toBe(0.5);

      const crypto = stats.find((s) => s.category === 'Crypto');
      expect(crypto).toBeDefined();
      expect(crypto!.tradeCount).toBe(1);
      expect(crypto!.winRate).toBe(1);
    });

    it('caches results for the same wallet', async () => {
      mockDataApi.getWalletTrades.mockResolvedValue([]);
      mockDataApi.getWalletPositions.mockResolvedValue([]);

      await scorer.getWalletCategoryStats('0xwhale');
      await scorer.getWalletCategoryStats('0xwhale');

      // Should only call API once
      expect(mockDataApi.getWalletTrades).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Market category caching
  // -----------------------------------------------------------------------

  describe('market category caching', () => {
    it('caches market categories to avoid redundant Gamma lookups', async () => {
      const trades = [
        createMockTrade({ market: '0xsame' }),
        createMockTrade({ market: '0xsame' }),
      ];
      const positions = [
        createMockPosition({ market: '0xsame', cashPnl: 10 }),
      ];

      mockDataApi.getWalletTrades.mockResolvedValue(trades);
      mockDataApi.getWalletPositions.mockResolvedValue(positions);
      mockGamma.getMarket.mockResolvedValue(createMockMarket({ tags: ['Politics'] }));

      await scorer.getWalletCategoryStats('0xwhale');

      // getMarket should be called only once despite two trades with same conditionId
      expect(mockGamma.getMarket).toHaveBeenCalledTimes(1);
    });

    it('falls back to "Unknown" if Gamma lookup fails', async () => {
      const trades = [createMockTrade({ market: '0xfail' })];
      const positions = [createMockPosition({ market: '0xfail', cashPnl: 10 })];

      mockDataApi.getWalletTrades.mockResolvedValue(trades);
      mockDataApi.getWalletPositions.mockResolvedValue(positions);
      mockGamma.getMarket.mockRejectedValue(new Error('API error'));

      const stats = await scorer.getWalletCategoryStats('0xwhale');

      expect(stats).toHaveLength(1);
      expect(stats[0].category).toBe('Unknown');
    });
  });

  // -----------------------------------------------------------------------
  // clearCaches
  // -----------------------------------------------------------------------

  describe('clearCaches', () => {
    it('clears all caches', async () => {
      mockDataApi.getWalletTrades.mockResolvedValue([]);
      mockDataApi.getWalletPositions.mockResolvedValue([]);

      await scorer.getWalletCategoryStats('0xwhale');
      scorer.clearCaches();
      await scorer.getWalletCategoryStats('0xwhale');

      // Should call API twice after cache clear
      expect(mockDataApi.getWalletTrades).toHaveBeenCalledTimes(2);
    });
  });
});
