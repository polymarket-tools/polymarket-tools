import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the core library ─────────────────────────────────────────────
const mockSearchMarkets = vi.fn().mockResolvedValue([
  {
    conditionId: 'abc',
    question: 'Test?',
    tokens: [{ tokenId: 't1', outcome: 'Yes', price: 0.65 }],
    slug: 'test',
    description: '',
    active: true,
    closed: false,
    volume: 1000,
    liquidity: 500,
    startDate: '',
    endDate: '',
    tags: [],
    image: '',
    icon: '',
  },
]);
const mockGetMarket = vi.fn().mockResolvedValue({
  conditionId: 'abc',
  question: 'Test?',
  tokens: [],
  slug: 'test',
  description: '',
  active: true,
  closed: false,
  volume: 0,
  liquidity: 0,
  startDate: '',
  endDate: '',
  tags: [],
  image: '',
  icon: '',
});
const mockGetMarketBySlug = vi.fn().mockResolvedValue({
  conditionId: 'abc',
  question: 'Test?',
  tokens: [],
  slug: 'test',
  description: '',
  active: true,
  closed: false,
  volume: 0,
  liquidity: 0,
  startDate: '',
  endDate: '',
  tags: [],
  image: '',
  icon: '',
});
const mockGetPrice = vi.fn().mockResolvedValue(0.65);
const mockGetMidpoint = vi.fn().mockResolvedValue(0.63);
const mockGetSpread = vi.fn().mockResolvedValue({ bid: 0.6, ask: 0.65, spread: 0.05 });
const mockGetOrderBook = vi.fn().mockResolvedValue({ bids: [], asks: [] });
const mockPlaceOrder = vi.fn().mockResolvedValue({
  id: 'ord1',
  status: 'live',
  tokenId: 't1',
  side: 'BUY',
  price: '0.50',
  size: '10',
  createdAt: '2026-01-01T00:00:00Z',
});
const mockCancelOrder = vi.fn().mockResolvedValue(undefined);
const mockGetOpenOrders = vi.fn().mockResolvedValue([]);

vi.mock('@polymarket-tools/core', () => ({
  GammaClient: vi.fn().mockImplementation(() => ({
    searchMarkets: mockSearchMarkets,
    getMarket: mockGetMarket,
    getMarketBySlug: mockGetMarketBySlug,
  })),
  ClobPublicClient: vi.fn().mockImplementation(() => ({
    getPrice: mockGetPrice,
    getMidpoint: mockGetMidpoint,
    getSpread: mockGetSpread,
    getOrderBook: mockGetOrderBook,
  })),
  ClobTradingClient: vi.fn().mockImplementation(() => ({
    placeOrder: mockPlaceOrder,
    cancelOrder: mockCancelOrder,
    getOpenOrders: mockGetOpenOrders,
  })),
  DEFAULT_CLOB_HOST: 'https://clob.polymarket.com',
}));

import { Polymarket } from '../nodes/Polymarket/Polymarket.node';

// ── Helper: build a mock IExecuteFunctions context ────────────────────
function createMockContext(
  params: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    getInputData: () => [{ json: {} }],
    getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
      params[name] ?? fallback,
    getCredentials: async () => ({
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      apiPassphrase: 'test-pass',
      privateKey: '0xabc',
      builderCode: '',
    }),
    getNode: () => ({ name: 'Polymarket', type: 'polymarket' }),
    continueOnFail: () => false,
    helpers: {},
    ...overrides,
  };
}

describe('Polymarket.node execute()', () => {
  const node = new Polymarket();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Market search routing ──────────────────────────────────────
  it('routes market/search and returns market data', async () => {
    const ctx = createMockContext({
      resource: 'market',
      operation: 'search',
      query: 'bitcoin',
      filters: { active: true },
    });

    const result = await node.execute.call(ctx as any);

    expect(mockSearchMarkets).toHaveBeenCalledWith({
      query: 'bitcoin',
      active: true,
      tag: undefined,
      limit: undefined,
      offset: undefined,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json).toHaveProperty('conditionId', 'abc');
    expect(result[0][0].json).toHaveProperty('question', 'Test?');
  });

  // ── 2. Market get by conditionId ──────────────────────────────────
  it('routes market/get by conditionId', async () => {
    const ctx = createMockContext({
      resource: 'market',
      operation: 'get',
      lookupBy: 'conditionId',
      conditionId: 'abc123',
    });

    const result = await node.execute.call(ctx as any);

    expect(mockGetMarket).toHaveBeenCalledWith('abc123');
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json).toHaveProperty('conditionId', 'abc');
  });

  // ── 3. Market get by slug ─────────────────────────────────────────
  it('routes market/get by slug', async () => {
    const ctx = createMockContext({
      resource: 'market',
      operation: 'get',
      lookupBy: 'slug',
      slug: 'test-market',
    });

    const result = await node.execute.call(ctx as any);

    expect(mockGetMarketBySlug).toHaveBeenCalledWith('test-market');
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json).toHaveProperty('slug', 'test');
  });

  // ── 4. Price get with midpoint and spread ─────────────────────────
  it('routes price/get and returns price + midpoint + spread', async () => {
    const ctx = createMockContext({
      resource: 'price',
      operation: 'get',
      tokenId: 't1',
      includeData: ['midpoint', 'spread'],
    });

    const result = await node.execute.call(ctx as any);

    expect(mockGetPrice).toHaveBeenCalledWith('t1');
    expect(mockGetMidpoint).toHaveBeenCalledWith('t1');
    expect(mockGetSpread).toHaveBeenCalledWith('t1');
    expect(mockGetOrderBook).not.toHaveBeenCalled();

    const json = result[0][0].json;
    expect(json).toHaveProperty('price', 0.65);
    expect(json).toHaveProperty('midpoint', 0.63);
    expect(json).toHaveProperty('bid', 0.6);
    expect(json).toHaveProperty('ask', 0.65);
    expect(json).toHaveProperty('spread', 0.05);
  });

  // ── 5. Trading placeOrder ─────────────────────────────────────────
  it('routes trading/placeOrder with credentials', async () => {
    const ctx = createMockContext({
      resource: 'trading',
      operation: 'placeOrder',
      tokenId: 't1',
      side: 'BUY',
      price: 0.5,
      size: 10,
      timeInForce: 'GTC',
      validateOnly: false,
    });

    const result = await node.execute.call(ctx as any);

    const { ClobTradingClient } = await import('@polymarket-tools/core');
    expect(ClobTradingClient).toHaveBeenCalledWith({
      host: 'https://clob.polymarket.com',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      apiPassphrase: 'test-pass',
      privateKey: '0xabc',
      builderCode: undefined,
    });

    expect(mockPlaceOrder).toHaveBeenCalledWith({
      tokenId: 't1',
      side: 'BUY',
      orderType: 'LIMIT',
      price: 0.5,
      size: 10,
      timeInForce: 'GTC',
      validateOnly: false,
    });

    expect(result[0][0].json).toHaveProperty('id', 'ord1');
    expect(result[0][0].json).toHaveProperty('status', 'live');
  });

  // ── 6. Unknown resource/operation throws NodeOperationError ───────
  it('throws NodeOperationError for unknown resource/operation', async () => {
    const ctx = createMockContext({
      resource: 'unknown',
      operation: 'nope',
    });

    await expect(node.execute.call(ctx as any)).rejects.toThrow(
      'Unknown resource/operation: unknown/nope',
    );
  });

  // ── 7. continueOnFail returns error item instead of throwing ──────
  it('returns error item when continueOnFail is true', async () => {
    const ctx = createMockContext(
      {
        resource: 'unknown',
        operation: 'nope',
      },
      {
        continueOnFail: () => true,
      },
    );

    const result = await node.execute.call(ctx as any);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json).toHaveProperty('error');
    expect(result[0][0].json.error).toContain('Unknown resource/operation');
  });
});
