import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { TradingEngine, type ExecuteTradeParams } from '../src/trading';
import type { User, TradeResult } from '../src/types';
import type { WalletManager } from '../src/wallet';
import type { TradeQueries } from '../src/db-queries';

// ---------------------------------------------------------------------------
// Mock @polymarket/clob-client
// ---------------------------------------------------------------------------

const mockCreateOrder = vi.fn();
const mockPostOrder = vi.fn();
const mockCreateOrDeriveApiKey = vi.fn();

vi.mock('@polymarket/clob-client', () => ({
  ClobClient: vi.fn().mockImplementation(() => ({
    createOrder: mockCreateOrder,
    postOrder: mockPostOrder,
    createOrDeriveApiKey: mockCreateOrDeriveApiKey,
  })),
  SignatureType: {
    EOA: 0,
    POLY_PROXY: 1,
    POLY_GNOSIS_SAFE: 2,
  },
}));

// ---------------------------------------------------------------------------
// Mock @polymarket/builder-signing-sdk
// ---------------------------------------------------------------------------

vi.mock('@polymarket/builder-signing-sdk', () => ({
  BuilderConfig: vi.fn().mockImplementation(() => ({})),
}));

// ---------------------------------------------------------------------------
// Mock @polymarket-tools/core
// ---------------------------------------------------------------------------

const mockGetPrice = vi.fn();

vi.mock('@polymarket-tools/core', () => ({
  ClobPublicClient: vi.fn().mockImplementation(() => ({
    getPrice: mockGetPrice,
  })),
}));

// ---------------------------------------------------------------------------
// Mock viem
// ---------------------------------------------------------------------------

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createWalletClient: vi.fn().mockReturnValue({
      sendTransaction: vi.fn(),
    }),
    http: vi.fn().mockReturnValue('mock-transport'),
  };
});

vi.mock('viem/chains', () => ({
  polygon: { id: 137, name: 'Polygon' },
}));

// ---------------------------------------------------------------------------
// Mock Safe
// ---------------------------------------------------------------------------

const mockSafeCreateTransaction = vi.fn();
const mockSafeExecuteTransaction = vi.fn();

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    telegram_id: 12345,
    privy_user_id: 'privy-user-123',
    privy_wallet_id: 'wallet-abc',
    signer_address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    safe_address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    deposit_address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
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

function createMockWalletManager(): WalletManager {
  return {
    getSignerForUser: vi.fn().mockReturnValue({
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      signMessage: vi.fn(),
      signTransaction: vi.fn(),
      signTypedData: vi.fn(),
    }),
    getSafe: vi.fn().mockResolvedValue({
      createTransaction: mockSafeCreateTransaction,
      executeTransaction: mockSafeExecuteTransaction,
    }),
    createWallet: vi.fn(),
    deploySafe: vi.fn(),
    getPrivyClient: vi.fn(),
  } as unknown as WalletManager;
}

function createMockTradeQueries(): TradeQueries {
  return {
    insert: vi.fn().mockReturnValue(1),
    getByUser: vi.fn().mockReturnValue([]),
    getByUserAndPeriod: vi.fn().mockReturnValue([]),
  } as unknown as TradeQueries;
}

function createEngine(overrides?: {
  walletManager?: WalletManager;
  tradeQueries?: TradeQueries;
}): TradingEngine {
  return new TradingEngine({
    feeCollectionAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    walletManager: overrides?.walletManager ?? createMockWalletManager(),
    tradeQueries: overrides?.tradeQueries ?? createMockTradeQueries(),
    builderSignerUrl: 'https://builder-signer.test',
    polygonRpcUrl: 'https://polygon-rpc.test',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TradingEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path mocks
    mockCreateOrDeriveApiKey.mockResolvedValue({
      key: 'test-key',
      secret: 'test-secret',
      passphrase: 'test-passphrase',
    });

    mockSafeCreateTransaction.mockResolvedValue({ data: 'mock-safe-tx' });
    mockSafeExecuteTransaction.mockResolvedValue({
      hash: '0xFEE_TX_HASH',
    });

    mockCreateOrder.mockResolvedValue({ signed: true });
    mockPostOrder.mockResolvedValue({
      orderID: 'order-123',
      status: 'matched',
      transactionsHashes: ['0xTRADE_TX_HASH'],
    });

    mockGetPrice.mockResolvedValue(0.65);
  });

  // -----------------------------------------------------------------------
  // calculateFee
  // -----------------------------------------------------------------------

  describe('calculateFee', () => {
    it('calculates standard fee (100 * 0.005 = 0.50)', () => {
      const engine = createEngine();
      expect(engine.calculateFee(100, 0.005)).toBe(0.5);
    });

    it('calculates switcher/referral fee (100 * 0.0025 = 0.25)', () => {
      const engine = createEngine();
      expect(engine.calculateFee(100, 0.0025)).toBe(0.25);
    });

    it('rounds to cents (33.33 * 0.005 = 0.17)', () => {
      const engine = createEngine();
      // 33.33 * 0.005 = 0.16665, rounds to 0.17
      expect(engine.calculateFee(33.33, 0.005)).toBe(0.17);
    });

    it('handles zero amount', () => {
      const engine = createEngine();
      expect(engine.calculateFee(0, 0.005)).toBe(0);
    });

    it('handles zero fee rate', () => {
      const engine = createEngine();
      expect(engine.calculateFee(100, 0)).toBe(0);
    });

    it('calculates fee for large amounts', () => {
      const engine = createEngine();
      expect(engine.calculateFee(10000, 0.005)).toBe(50);
    });
  });

  // -----------------------------------------------------------------------
  // getCurrentPrice
  // -----------------------------------------------------------------------

  describe('getCurrentPrice', () => {
    it('returns the buy price for a token', async () => {
      const engine = createEngine();
      const price = await engine.getCurrentPrice('token-abc');
      expect(mockGetPrice).toHaveBeenCalledWith('token-abc', 'buy');
      expect(price).toBe(0.65);
    });
  });

  // -----------------------------------------------------------------------
  // executeTrade — happy path
  // -----------------------------------------------------------------------

  describe('executeTrade', () => {
    it('executes a successful trade with fee collection', async () => {
      const mockTradeQueries = createMockTradeQueries();
      const mockWalletManager = createMockWalletManager();
      const engine = createEngine({
        walletManager: mockWalletManager,
        tradeQueries: mockTradeQueries,
      });

      const user = createMockUser();
      const result = await engine.executeTrade({
        user,
        tokenId: 'token-yes',
        conditionId: 'condition-123',
        side: 'BUY',
        amount: 100,
        price: 0.65,
      });

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order-123');
      expect(result.feeAmount).toBe(0.5); // 100 * 0.005
      expect(result.txHash).toBe('0xTRADE_TX_HASH');
    });

    it('order size equals amount minus fee', async () => {
      const engine = createEngine();
      const user = createMockUser({ fee_rate: 0.005 });

      const result = await engine.executeTrade({
        user,
        tokenId: 'token-yes',
        conditionId: 'condition-123',
        side: 'BUY',
        amount: 100,
        price: 0.50,
      });

      // Net amount = 100 - 0.50 = 99.50
      // Size in shares = 99.50 / 0.50 = 199.00
      expect(result.success).toBe(true);
      expect(result.size).toBe(199);
      expect(result.feeAmount).toBe(0.5);
    });

    it('collects fee via Safe USDC transfer', async () => {
      const mockWalletManager = createMockWalletManager();
      const engine = createEngine({ walletManager: mockWalletManager });
      const user = createMockUser();

      await engine.executeTrade({
        user,
        tokenId: 'token-yes',
        conditionId: 'condition-123',
        side: 'BUY',
        amount: 100,
        price: 0.65,
      });

      // Verify getSafe was called with user's Safe and signer addresses
      expect(mockWalletManager.getSafe).toHaveBeenCalledWith(
        user.safe_address,
        user.signer_address,
      );

      // Verify a Safe transaction was created
      expect(mockSafeCreateTransaction).toHaveBeenCalledWith({
        transactions: [
          expect.objectContaining({
            to: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
            value: '0',
          }),
        ],
      });

      // Verify the Safe tx was executed
      expect(mockSafeExecuteTransaction).toHaveBeenCalled();
    });

    it('records trade in database', async () => {
      const mockTradeQueries = createMockTradeQueries();
      const engine = createEngine({ tradeQueries: mockTradeQueries });
      const user = createMockUser();

      await engine.executeTrade({
        user,
        tokenId: 'token-yes',
        conditionId: 'condition-123',
        side: 'BUY',
        amount: 100,
        price: 0.65,
      });

      expect(mockTradeQueries.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_telegram_id: 12345,
          market_condition_id: 'condition-123',
          token_id: 'token-yes',
          side: 'BUY',
          source: 'manual',
        }),
      );
    });

    it('uses reduced fee for switcher/referral users', async () => {
      const engine = createEngine();
      const user = createMockUser({ fee_rate: 0.0025 });

      const result = await engine.executeTrade({
        user,
        tokenId: 'token-yes',
        conditionId: 'condition-123',
        side: 'BUY',
        amount: 100,
        price: 0.65,
      });

      expect(result.feeAmount).toBe(0.25); // 100 * 0.0025
    });

    it('places CLOB order with correct parameters', async () => {
      const engine = createEngine();
      const user = createMockUser();

      await engine.executeTrade({
        user,
        tokenId: 'token-yes',
        conditionId: 'condition-123',
        side: 'BUY',
        amount: 100,
        price: 0.65,
      });

      // createOrder should be called with user order details
      expect(mockCreateOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenID: 'token-yes',
          side: 'BUY',
          price: 0.65,
        }),
        undefined,
      );

      // postOrder should use FOK (fill-or-kill) for instant execution
      expect(mockPostOrder).toHaveBeenCalledWith(
        expect.anything(),
        'FOK',
      );
    });
  });

  // -----------------------------------------------------------------------
  // executeTrade — error cases
  // -----------------------------------------------------------------------

  describe('executeTrade — errors', () => {
    it('returns error when amount is too small after fee', async () => {
      const engine = createEngine();
      const user = createMockUser({ fee_rate: 1.0 }); // 100% fee

      const result = await engine.executeTrade({
        user,
        tokenId: 'token-yes',
        conditionId: 'condition-123',
        side: 'BUY',
        amount: 1,
        price: 0.50,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('too small');
      expect(result.feeAmount).toBeGreaterThan(0);
    });

    it('returns error and zero fee when fee collection fails', async () => {
      mockSafeExecuteTransaction.mockRejectedValue(
        new Error('Safe execution reverted'),
      );

      const engine = createEngine();
      const user = createMockUser();

      const result = await engine.executeTrade({
        user,
        tokenId: 'token-yes',
        conditionId: 'condition-123',
        side: 'BUY',
        amount: 50,
        price: 0.50,
      });

      expect(result.success).toBe(false);
      expect(result.feeAmount).toBe(0); // No fee charged on failure
      expect(result.error).toContain('Fee collection failed');
    });

    it('reports fee was charged when CLOB order fails after fee collection', async () => {
      mockPostOrder.mockResolvedValue({
        orderID: '',
        status: '403',
      });

      const engine = createEngine();
      const user = createMockUser();

      const result = await engine.executeTrade({
        user,
        tokenId: 'token-yes',
        conditionId: 'condition-123',
        side: 'BUY',
        amount: 50,
        price: 0.50,
      });

      expect(result.success).toBe(false);
      expect(result.feeAmount).toBe(0.25); // Fee was charged
      expect(result.error).toContain('Fee was charged');
    });

    it('reports fee was charged when CLOB client throws after fee collection', async () => {
      mockCreateOrder.mockRejectedValue(
        new Error('Insufficient allowance'),
      );

      const engine = createEngine();
      const user = createMockUser();

      const result = await engine.executeTrade({
        user,
        tokenId: 'token-yes',
        conditionId: 'condition-123',
        side: 'BUY',
        amount: 50,
        price: 0.50,
      });

      expect(result.success).toBe(false);
      expect(result.feeAmount).toBe(0.25); // Fee was charged
      expect(result.error).toContain('Order failed');
    });

    it('still returns success even if DB insert fails', async () => {
      const mockTradeQueries = createMockTradeQueries();
      (mockTradeQueries.insert as Mock).mockImplementation(() => {
        throw new Error('DB write error');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const engine = createEngine({ tradeQueries: mockTradeQueries });
      const user = createMockUser();

      const result = await engine.executeTrade({
        user,
        tokenId: 'token-yes',
        conditionId: 'condition-123',
        side: 'BUY',
        amount: 100,
        price: 0.65,
      });

      // Trade succeeded even though DB write failed
      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Credential caching
  // -----------------------------------------------------------------------

  describe('credential caching', () => {
    it('derives credentials once and caches them', async () => {
      const engine = createEngine();
      const user = createMockUser();

      // Execute two trades
      await engine.executeTrade({
        user,
        tokenId: 'token-a',
        conditionId: 'cond-a',
        side: 'BUY',
        amount: 50,
        price: 0.50,
      });

      await engine.executeTrade({
        user,
        tokenId: 'token-b',
        conditionId: 'cond-b',
        side: 'BUY',
        amount: 50,
        price: 0.50,
      });

      // createOrDeriveApiKey should only be called once (cached after first call)
      expect(mockCreateOrDeriveApiKey).toHaveBeenCalledTimes(1);
    });

    it('re-derives credentials after cache clear', async () => {
      const engine = createEngine();
      const user = createMockUser();

      await engine.executeTrade({
        user,
        tokenId: 'token-a',
        conditionId: 'cond-a',
        side: 'BUY',
        amount: 50,
        price: 0.50,
      });

      engine.clearCredentialCache(user.telegram_id);

      await engine.executeTrade({
        user,
        tokenId: 'token-b',
        conditionId: 'cond-b',
        side: 'BUY',
        amount: 50,
        price: 0.50,
      });

      expect(mockCreateOrDeriveApiKey).toHaveBeenCalledTimes(2);
    });
  });
});
