import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the core library ─────────────────────────────────────────────
const mockGetMidpoint = vi.fn();
const mockGetMarkets = vi.fn();

vi.mock('@polymarket-tools/core', () => ({
  ClobPublicClient: vi.fn().mockImplementation(() => ({
    getMidpoint: mockGetMidpoint,
  })),
  GammaClient: vi.fn().mockImplementation(() => ({
    getMarkets: mockGetMarkets,
  })),
}));

import { PolymarketTrigger } from '../nodes/PolymarketTrigger/PolymarketTrigger.node';

// ── Helper: build a mock IPollFunctions context ───────────────────────
function createMockPollContext(
  params: Record<string, unknown>,
  staticData: Record<string, unknown> = {},
  mode = 'trigger',
): unknown {
  return {
    getNodeParameter: (name: string, fallback?: unknown) =>
      params[name] ?? fallback,
    getWorkflowStaticData: () => staticData,
    getMode: () => mode,
    getCredentials: async () => ({}),
    helpers: {
      returnJsonArray: (items: unknown[]) =>
        items.map((item) => ({ json: item })),
    },
  };
}

describe('PolymarketTrigger.node poll()', () => {
  const trigger = new PolymarketTrigger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── priceChange ─────────────────────────────────────────────────────

  describe('priceChange', () => {
    it('first poll stores baseline and returns null', async () => {
      mockGetMidpoint.mockResolvedValue(0.5);
      const staticData: Record<string, unknown> = {};
      const ctx = createMockPollContext(
        { triggerWhen: 'priceChange', tokenId: 't1', changeAmount: 0.05 },
        staticData,
      );

      const result = await trigger.poll.call(ctx as any);

      expect(result).toBeNull();
      expect(staticData['priceChange_t1']).toBe(0.5);
    });

    it('returns null when price has not changed', async () => {
      mockGetMidpoint.mockResolvedValue(0.5);
      const staticData: Record<string, unknown> = { priceChange_t1: 0.5 };
      const ctx = createMockPollContext(
        { triggerWhen: 'priceChange', tokenId: 't1', changeAmount: 0.05 },
        staticData,
      );

      const result = await trigger.poll.call(ctx as any);

      expect(result).toBeNull();
    });

    it('returns null when change is below threshold', async () => {
      mockGetMidpoint.mockResolvedValue(0.52);
      const staticData: Record<string, unknown> = { priceChange_t1: 0.5 };
      const ctx = createMockPollContext(
        { triggerWhen: 'priceChange', tokenId: 't1', changeAmount: 0.05 },
        staticData,
      );

      const result = await trigger.poll.call(ctx as any);

      expect(result).toBeNull();
    });

    it('returns trigger data when change meets threshold', async () => {
      mockGetMidpoint.mockResolvedValue(0.56);
      const staticData: Record<string, unknown> = { priceChange_t1: 0.5 };
      const ctx = createMockPollContext(
        { triggerWhen: 'priceChange', tokenId: 't1', changeAmount: 0.05 },
        staticData,
      );

      const result = await trigger.poll.call(ctx as any);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      const items = result![0];
      expect(items).toHaveLength(1);

      const json = items[0].json;
      expect(json).toHaveProperty('tokenId', 't1');
      expect(json).toHaveProperty('price', 0.56);
      expect(json).toHaveProperty('previousPrice', 0.5);
      expect(json).toHaveProperty('direction', 'up');
      expect(json).toHaveProperty('percentChange', '12.00');
      expect(json.absChange).toBeGreaterThanOrEqual(0.05);

      // Verify stored price was updated
      expect(staticData['priceChange_t1']).toBe(0.56);
    });
  });

  // ── crossesThreshold ────────────────────────────────────────────────

  describe('crossesThreshold', () => {
    it('triggers when price crosses up through threshold', async () => {
      mockGetMidpoint.mockResolvedValue(0.55);
      const staticData: Record<string, unknown> = {
        crossesThreshold_t1: 0.45,
      };
      const ctx = createMockPollContext(
        { triggerWhen: 'crossesThreshold', tokenId: 't1', thresholdPrice: 0.5 },
        staticData,
      );

      const result = await trigger.poll.call(ctx as any);

      expect(result).not.toBeNull();
      const json = result![0][0].json;
      expect(json).toHaveProperty('direction', 'up');
      expect(json).toHaveProperty('thresholdPrice', 0.5);
      expect(json).toHaveProperty('price', 0.55);
      expect(json).toHaveProperty('previousPrice', 0.45);
    });

    it('returns null when price does not cross threshold', async () => {
      mockGetMidpoint.mockResolvedValue(0.48);
      const staticData: Record<string, unknown> = {
        crossesThreshold_t1: 0.45,
      };
      const ctx = createMockPollContext(
        { triggerWhen: 'crossesThreshold', tokenId: 't1', thresholdPrice: 0.5 },
        staticData,
      );

      const result = await trigger.poll.call(ctx as any);

      expect(result).toBeNull();
    });
  });

  // ── newMarket ───────────────────────────────────────────────────────

  describe('newMarket', () => {
    const market1 = {
      conditionId: 'abc',
      question: 'Test A?',
      slug: 'test-a',
      volume: 100,
      tokens: [{ tokenId: 't1', outcome: 'Yes', price: 0.6 }],
    };
    const market2 = {
      conditionId: 'def',
      question: 'Test B?',
      slug: 'test-b',
      volume: 200,
      tokens: [{ tokenId: 't2', outcome: 'Yes', price: 0.7 }],
    };

    it('first poll stores known IDs and returns null', async () => {
      mockGetMarkets.mockResolvedValue([market1]);
      const staticData: Record<string, unknown> = {};
      const ctx = createMockPollContext(
        { triggerWhen: 'newMarket', tag: '' },
        staticData,
      );

      const result = await trigger.poll.call(ctx as any);

      expect(result).toBeNull();
      expect(staticData.knownMarketIds).toEqual(['abc']);
    });

    it('triggers when a new market appears', async () => {
      mockGetMarkets.mockResolvedValue([market1, market2]);
      const staticData: Record<string, unknown> = {
        knownMarketIds: ['abc'],
      };
      const ctx = createMockPollContext(
        { triggerWhen: 'newMarket', tag: '' },
        staticData,
      );

      const result = await trigger.poll.call(ctx as any);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      const items = result![0];
      expect(items).toHaveLength(1);
      expect(items[0].json).toHaveProperty('conditionId', 'def');
      expect(items[0].json).toHaveProperty('question', 'Test B?');

      // Known IDs updated to include the new one
      expect(staticData.knownMarketIds).toEqual(
        expect.arrayContaining(['abc', 'def']),
      );
    });

    it('returns null when no new markets found', async () => {
      mockGetMarkets.mockResolvedValue([market1]);
      const staticData: Record<string, unknown> = {
        knownMarketIds: ['abc'],
      };
      const ctx = createMockPollContext(
        { triggerWhen: 'newMarket', tag: '' },
        staticData,
      );

      const result = await trigger.poll.call(ctx as any);

      expect(result).toBeNull();
    });
  });

  // ── Manual mode ─────────────────────────────────────────────────────

  describe('manual mode', () => {
    it('returns sample data for priceChange regardless of state', async () => {
      const ctx = createMockPollContext(
        { triggerWhen: 'priceChange', tokenId: 't1', changeAmount: 0.05 },
        {},
        'manual',
      );

      const result = await trigger.poll.call(ctx as any);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      const json = result![0][0].json;
      expect(json).toHaveProperty('tokenId', 't1');
      expect(json).toHaveProperty('direction');
      expect(json).toHaveProperty('price');
    });

    it('returns sample data for newMarket regardless of state', async () => {
      const ctx = createMockPollContext(
        { triggerWhen: 'newMarket', tag: '' },
        {},
        'manual',
      );

      const result = await trigger.poll.call(ctx as any);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      const json = result![0][0].json;
      expect(json).toHaveProperty('conditionId');
      expect(json).toHaveProperty('question');
    });
  });

  // ── State key namespacing ───────────────────────────────────────────

  describe('state key namespacing', () => {
    it('uses priceChange_{tokenId} as state key', async () => {
      mockGetMidpoint.mockResolvedValue(0.5);
      const staticData: Record<string, unknown> = {};
      const ctx = createMockPollContext(
        { triggerWhen: 'priceChange', tokenId: 't1', changeAmount: 0.05 },
        staticData,
      );

      await trigger.poll.call(ctx as any);

      expect(staticData).toHaveProperty('priceChange_t1');
      expect(staticData).not.toHaveProperty('lastPrice');
    });

    it('uses crossesThreshold_{tokenId} as state key', async () => {
      mockGetMidpoint.mockResolvedValue(0.5);
      const staticData: Record<string, unknown> = {};
      const ctx = createMockPollContext(
        { triggerWhen: 'crossesThreshold', tokenId: 't1', thresholdPrice: 0.5 },
        staticData,
      );

      await trigger.poll.call(ctx as any);

      expect(staticData).toHaveProperty('crossesThreshold_t1');
    });
  });
});
