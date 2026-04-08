import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClobTradingClient } from '../clob-trading';
import { PolymarketError } from '../types';
import type { ClobTradingConfig, PlaceOrderParams } from '../types';

// ── Mock @polymarket/clob-client ────────────────────────────────

const {
  mockCreateOrder,
  mockPostOrder,
  mockCancelOrder,
  mockCancelAll,
  mockGetOpenOrders,
  mockGetBalanceAllowance,
  MockClobClient,
  MockBuilderConfig,
} = vi.hoisted(() => {
  const mockCreateOrder = vi.fn();
  const mockPostOrder = vi.fn();
  const mockCancelOrder = vi.fn();
  const mockCancelAll = vi.fn();
  const mockGetOpenOrders = vi.fn();
  const mockGetBalanceAllowance = vi.fn();

  const MockClobClient = vi.fn().mockImplementation(() => ({
    createOrder: mockCreateOrder,
    postOrder: mockPostOrder,
    cancelOrder: mockCancelOrder,
    cancelAll: mockCancelAll,
    getOpenOrders: mockGetOpenOrders,
    getBalanceAllowance: mockGetBalanceAllowance,
  }));

  const MockBuilderConfig = vi.fn().mockImplementation(() => ({
    isValid: () => true,
    getBuilderType: () => 'LOCAL',
  }));

  return {
    mockCreateOrder,
    mockPostOrder,
    mockCancelOrder,
    mockCancelAll,
    mockGetOpenOrders,
    mockGetBalanceAllowance,
    MockClobClient,
    MockBuilderConfig,
  };
});

vi.mock('@polymarket/clob-client', () => ({
  ClobClient: MockClobClient,
  Chain: { POLYGON: 137, AMOY: 80002 },
  Side: { BUY: 'BUY', SELL: 'SELL' },
  OrderType: { GTC: 'GTC', GTD: 'GTD', FOK: 'FOK', FAK: 'FAK' },
}));

vi.mock('@polymarket/builder-signing-sdk', () => ({
  BuilderConfig: MockBuilderConfig,
}));

// ── Fixtures ────────────────────────────────────────────────────

const BASE_CONFIG: ClobTradingConfig = {
  host: 'https://clob.polymarket.com',
  apiKey: 'test-api-key',
  apiSecret: 'test-api-secret',
  apiPassphrase: 'test-passphrase',
  privateKey: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
};

const SIGNED_ORDER = {
  salt: 12345,
  maker: '0xmaker',
  signer: '0xsigner',
  taker: '0x0000000000000000000000000000000000000000',
  tokenId: 'token-123',
  makerAmount: '1000000',
  takerAmount: '650000',
  expiration: '0',
  nonce: '0',
  feeRateBps: '0',
  side: 'BUY',
  signatureType: 0,
  signature: '0xsignature',
};

const ORDER_RESPONSE = {
  success: true,
  errorMsg: '',
  orderID: 'order-abc-123',
  transactionsHashes: [],
  status: 'live',
  takingAmount: '650000',
  makingAmount: '1000000',
};

const OPEN_ORDERS = [
  {
    id: 'order-1',
    status: 'live',
    owner: '0xowner',
    maker_address: '0xmaker',
    market: 'market-abc',
    asset_id: 'token-123',
    side: 'BUY',
    original_size: '10',
    size_matched: '0',
    price: '0.65',
    associate_trades: [],
    outcome: 'Yes',
    created_at: 1712000000,
    expiration: '0',
    order_type: 'GTC',
  },
  {
    id: 'order-2',
    status: 'live',
    owner: '0xowner',
    maker_address: '0xmaker',
    market: 'market-def',
    asset_id: 'token-456',
    side: 'SELL',
    original_size: '5',
    size_matched: '2',
    price: '0.80',
    associate_trades: [],
    outcome: 'No',
    created_at: 1712001000,
    expiration: '0',
    order_type: 'GTC',
  },
];

// ── Tests ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Re-apply the mock implementation since clearAllMocks removes it
  MockClobClient.mockImplementation(() => ({
    createOrder: mockCreateOrder,
    postOrder: mockPostOrder,
    cancelOrder: mockCancelOrder,
    cancelAll: mockCancelAll,
    getOpenOrders: mockGetOpenOrders,
    getBalanceAllowance: mockGetBalanceAllowance,
  }));

  MockBuilderConfig.mockImplementation(() => ({
    isValid: () => true,
    getBuilderType: () => 'LOCAL',
  }));
});

describe('ClobTradingClient', () => {
  describe('lazy initialization', () => {
    it('does not create ClobClient in constructor', () => {
      new ClobTradingClient(BASE_CONFIG);
      expect(MockClobClient).not.toHaveBeenCalled();
    });

    it('creates ClobClient on first method call', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockGetOpenOrders.mockResolvedValueOnce([]);

      await client.getOpenOrders();

      expect(MockClobClient).toHaveBeenCalledTimes(1);
    });

    it('reuses ClobClient on subsequent calls', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockGetOpenOrders.mockResolvedValue([]);

      await client.getOpenOrders();
      await client.getOpenOrders();

      expect(MockClobClient).toHaveBeenCalledTimes(1);
    });

    it('passes correct params to ClobClient constructor', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockGetOpenOrders.mockResolvedValueOnce([]);

      await client.getOpenOrders();

      expect(MockClobClient).toHaveBeenCalledWith(
        'https://clob.polymarket.com',
        137, // default chainId
        BASE_CONFIG.privateKey,
        { key: 'test-api-key', secret: 'test-api-secret', passphrase: 'test-passphrase' },
        undefined, // signatureType
        undefined, // funderAddress
        undefined, // geoBlockToken
        undefined, // useServerTime
        undefined, // builderConfig (no builderCode provided)
      );
    });

    it('uses custom chainId when provided', async () => {
      const client = new ClobTradingClient({ ...BASE_CONFIG, chainId: '80002' });
      mockGetOpenOrders.mockResolvedValueOnce([]);

      await client.getOpenOrders();

      expect(MockClobClient).toHaveBeenCalledWith(
        expect.anything(),
        80002,
        expect.anything(),
        expect.anything(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined, // no builderConfig
      );
    });

    it('retries client creation on auth error (#311)', async () => {
      const authError = new Error('Unauthorized');
      (authError as any).status = 401;

      // First two attempts fail with auth error, third succeeds
      MockClobClient
        .mockImplementationOnce(() => { throw authError; })
        .mockImplementationOnce(() => { throw authError; })
        .mockImplementationOnce(() => ({
          createOrder: mockCreateOrder,
          postOrder: mockPostOrder,
          cancelOrder: mockCancelOrder,
          cancelAll: mockCancelAll,
          getOpenOrders: mockGetOpenOrders,
          getBalanceAllowance: mockGetBalanceAllowance,
        }));

      const client = new ClobTradingClient(BASE_CONFIG);
      mockGetOpenOrders.mockResolvedValueOnce([]);

      await client.getOpenOrders();

      expect(MockClobClient).toHaveBeenCalledTimes(3);
    });
  });

  describe('placeOrder', () => {
    let client: ClobTradingClient;

    beforeEach(() => {
      client = new ClobTradingClient(BASE_CONFIG);
      mockCreateOrder.mockResolvedValue(SIGNED_ORDER);
      mockPostOrder.mockResolvedValue(ORDER_RESPONSE);
    });

    it('calls createOrder with correct params', async () => {
      const params: PlaceOrderParams = {
        tokenId: 'token-123',
        side: 'BUY',
        orderType: 'LIMIT',
        price: 0.65,
        size: 10,
      };

      await client.placeOrder(params);

      expect(mockCreateOrder).toHaveBeenCalledWith(
        {
          tokenID: 'token-123',
          side: 'BUY',
          price: 0.65,
          size: 10,
        },
        undefined,
      );
    });

    it('calls postOrder with signed result', async () => {
      const params: PlaceOrderParams = {
        tokenId: 'token-123',
        side: 'BUY',
        orderType: 'LIMIT',
        price: 0.65,
        size: 10,
      };

      await client.placeOrder(params);

      expect(mockPostOrder).toHaveBeenCalledWith(SIGNED_ORDER, 'GTC');
    });

    it('returns normalized Order', async () => {
      const params: PlaceOrderParams = {
        tokenId: 'token-123',
        side: 'BUY',
        orderType: 'LIMIT',
        price: 0.65,
        size: 10,
      };

      const result = await client.placeOrder(params);

      expect(result).toEqual({
        id: 'order-abc-123',
        status: 'live',
        tokenId: 'token-123',
        side: 'BUY',
        price: '0.65',
        size: '10',
        createdAt: expect.any(String),
      });
    });

    it('maps timeInForce to SDK OrderType correctly', async () => {
      const params: PlaceOrderParams = {
        tokenId: 'token-123',
        side: 'SELL',
        orderType: 'LIMIT',
        price: 0.80,
        size: 5,
        timeInForce: 'GTD',
      };

      await client.placeOrder(params);

      expect(mockPostOrder).toHaveBeenCalledWith(SIGNED_ORDER, 'GTD');
    });

    it('does NOT call postOrder when validateOnly is true', async () => {
      const params: PlaceOrderParams = {
        tokenId: 'token-123',
        side: 'BUY',
        orderType: 'LIMIT',
        price: 0.65,
        size: 10,
        validateOnly: true,
      };

      const result = await client.placeOrder(params);

      expect(mockCreateOrder).toHaveBeenCalled();
      expect(mockPostOrder).not.toHaveBeenCalled();
      // Should still return an order (unsigned/unsubmitted)
      expect(result.id).toBe('');
      expect(result.status).toBe('validated');
    });

    it('passes builder config when builderCode is provided', async () => {
      const configWithBuilder: ClobTradingConfig = {
        ...BASE_CONFIG,
        builderCode: 'builder-api-key-123',
      };
      const builderClient = new ClobTradingClient(configWithBuilder);
      mockGetOpenOrders.mockResolvedValueOnce([]);

      await builderClient.getOpenOrders();

      // Verify BuilderConfig was created
      expect(MockBuilderConfig).toHaveBeenCalledWith({
        localBuilderCreds: {
          key: 'builder-api-key-123',
          secret: '',
          passphrase: '',
        },
      });
      // Verify it was passed to ClobClient
      expect(MockClobClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined,
        undefined,
        undefined,
        undefined,
        expect.any(Object), // builderConfig present
      );
    });
  });

  describe('cancelOrder', () => {
    it('calls cancelOrder with correct payload', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockCancelOrder.mockResolvedValueOnce({ success: true });

      await client.cancelOrder('order-abc-123');

      expect(mockCancelOrder).toHaveBeenCalledWith({ orderID: 'order-abc-123' });
    });
  });

  describe('cancelAllOrders', () => {
    it('calls cancelAll', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockCancelAll.mockResolvedValueOnce({ success: true });

      await client.cancelAllOrders();

      expect(mockCancelAll).toHaveBeenCalled();
    });
  });

  describe('getOpenOrders', () => {
    it('returns normalized orders', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockGetOpenOrders.mockResolvedValueOnce(OPEN_ORDERS);

      const result = await client.getOpenOrders();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'order-1',
        status: 'live',
        tokenId: 'token-123',
        side: 'BUY',
        price: '0.65',
        size: '10',
        createdAt: expect.any(String),
      });
      expect(result[1]).toEqual({
        id: 'order-2',
        status: 'live',
        tokenId: 'token-456',
        side: 'SELL',
        price: '0.80',
        size: '5',
        createdAt: expect.any(String),
      });
    });

    it('filters by marketId when provided', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockGetOpenOrders.mockResolvedValueOnce(OPEN_ORDERS);

      const result = await client.getOpenOrders('market-abc');

      expect(mockGetOpenOrders).toHaveBeenCalledWith({ market: 'market-abc' });
      // Should still normalize
      expect(result).toHaveLength(2);
    });

    it('passes no params when marketId not provided', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockGetOpenOrders.mockResolvedValueOnce([]);

      await client.getOpenOrders();

      expect(mockGetOpenOrders).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getBalanceAllowance', () => {
    it('returns balance and allowance', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockGetBalanceAllowance.mockResolvedValueOnce({
        balance: '1000000',
        allowance: '999999',
      });

      const result = await client.getBalanceAllowance('token-123');

      expect(mockGetBalanceAllowance).toHaveBeenCalledWith({
        asset_type: 'CONDITIONAL',
        token_id: 'token-123',
      });
      expect(result).toEqual({
        balance: 1000000,
        allowance: 999999,
      });
    });

    it('retries on inconsistent returns (#300)', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);

      // First call returns 0 (inconsistent), second returns correct value
      mockGetBalanceAllowance
        .mockResolvedValueOnce({ balance: '0', allowance: '0' })
        .mockResolvedValueOnce({ balance: '1000000', allowance: '999999' });

      const result = await client.getBalanceAllowance('token-123');

      expect(mockGetBalanceAllowance).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        balance: 1000000,
        allowance: 999999,
      });
    });

    it('returns zero after max retries if consistently zero', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);

      // All calls return 0
      mockGetBalanceAllowance
        .mockResolvedValueOnce({ balance: '0', allowance: '0' })
        .mockResolvedValueOnce({ balance: '0', allowance: '0' })
        .mockResolvedValueOnce({ balance: '0', allowance: '0' });

      const result = await client.getBalanceAllowance('token-123');

      expect(mockGetBalanceAllowance).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ balance: 0, allowance: 0 });
    });
  });

  describe('error sanitization', () => {
    it('strips auth headers from thrown errors', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockGetOpenOrders.mockRejectedValueOnce(
        new Error('Request failed: apiKey=secret123 apiSecret=supersecret'),
      );

      try {
        await client.getOpenOrders();
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(PolymarketError);
        const error = e as PolymarketError;
        expect(error.message).not.toContain('secret123');
        expect(error.message).not.toContain('supersecret');
        expect(error.message).toContain('[REDACTED]');
      }
    });

    it('sanitizes errors from placeOrder', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockCreateOrder.mockRejectedValueOnce(
        new Error('Auth failed: Authorization=Bearer eyJtoken123'),
      );

      const params: PlaceOrderParams = {
        tokenId: 'token-123',
        side: 'BUY',
        orderType: 'LIMIT',
        price: 0.65,
        size: 10,
      };

      try {
        await client.placeOrder(params);
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as PolymarketError;
        expect(error.message).not.toContain('eyJtoken123');
        expect(error.message).toContain('[REDACTED]');
      }
    });

    it('sanitizes errors from cancelOrder', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockCancelOrder.mockRejectedValueOnce(
        new Error('POLY_HMAC_AUTH=abc123secret'),
      );

      try {
        await client.cancelOrder('order-1');
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as PolymarketError;
        expect(error.message).not.toContain('abc123secret');
        expect(error.message).toContain('[REDACTED]');
      }
    });

    it('sanitizes errors from getBalanceAllowance', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      mockGetBalanceAllowance.mockRejectedValueOnce(
        new Error('apiPassphrase=hunter2 invalid'),
      );

      try {
        await client.getBalanceAllowance('token-123');
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as PolymarketError;
        expect(error.message).not.toContain('hunter2');
        expect(error.message).toContain('[REDACTED]');
      }
    });

    it('preserves PolymarketError instances', async () => {
      const client = new ClobTradingClient(BASE_CONFIG);
      const original = new PolymarketError('already wrapped', 429, '/orders');
      mockGetOpenOrders.mockRejectedValueOnce(original);

      try {
        await client.getOpenOrders();
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBe(original);
      }
    });
  });
});
