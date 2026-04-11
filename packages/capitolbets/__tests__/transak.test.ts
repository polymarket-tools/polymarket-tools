import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  generateTransakUrl,
  TransakWebhookHandler,
  type TransakWebhookPayload,
  type TransakNotifyFn,
} from '../src/transak';
import type { User } from '../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    telegram_id: 12345,
    privy_user_id: 'privy-1',
    privy_wallet_id: 'wallet-1',
    signer_address: '0xsigner',
    safe_address: '0xSafe123Abc',
    deposit_address: '0xSafe123Abc',
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

function signPayload(body: unknown, secret: string): string {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateTransakUrl', () => {
  it('generates a valid Transak URL', () => {
    const url = generateTransakUrl({
      apiKey: 'test-key',
      walletAddress: '0xABC',
      fiatAmount: 100,
    });

    expect(url).toContain('https://global.transak.com');
    expect(url).toContain('apiKey=test-key');
    expect(url).toContain('cryptoCurrencyCode=USDC');
    expect(url).toContain('network=polygon');
    expect(url).toContain('walletAddress=0xABC');
    expect(url).toContain('defaultFiatAmount=100');
  });

  it('defaults fiat amount to 50', () => {
    const url = generateTransakUrl({
      apiKey: 'test-key',
      walletAddress: '0xABC',
    });

    expect(url).toContain('defaultFiatAmount=50');
  });
});

describe('TransakWebhookHandler', () => {
  const WEBHOOK_SECRET = 'test-secret-123';
  let handler: TransakWebhookHandler;
  let mockNotify: ReturnType<typeof vi.fn<TransakNotifyFn>>;
  let mockUserQueries: any;

  beforeEach(() => {
    mockNotify = vi.fn<TransakNotifyFn>().mockResolvedValue(undefined);
    mockUserQueries = {
      listAll: vi.fn().mockReturnValue([
        createMockUser({ telegram_id: 12345, safe_address: '0xSafe123Abc' }),
        createMockUser({ telegram_id: 67890, safe_address: '0xOtherSafe' }),
      ]),
    };

    handler = new TransakWebhookHandler({
      userQueries: mockUserQueries,
      notify: mockNotify,
      webhookSecret: WEBHOOK_SECRET,
    });
  });

  // -----------------------------------------------------------------------
  // handleWebhook
  // -----------------------------------------------------------------------

  describe('handleWebhook', () => {
    it('notifies user on COMPLETED payment', async () => {
      const payload: TransakWebhookPayload = {
        eventId: 'evt-1',
        status: 'COMPLETED',
        walletAddress: '0xSafe123Abc',
        cryptoAmount: 100,
        cryptoCurrency: 'USDC',
        fiatAmount: 102.50,
        fiatCurrency: 'USD',
        transactionHash: '0xtx1',
      };

      await handler.handleWebhook(payload);

      expect(mockNotify).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('$100.00 USDC'),
      );
      expect(mockNotify).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('card payment'),
      );
    });

    it('notifies user on FAILED payment', async () => {
      const payload: TransakWebhookPayload = {
        eventId: 'evt-2',
        status: 'FAILED',
        walletAddress: '0xSafe123Abc',
        cryptoAmount: 0,
        cryptoCurrency: 'USDC',
        fiatAmount: 100,
        fiatCurrency: 'USD',
      };

      await handler.handleWebhook(payload);

      expect(mockNotify).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('failed'),
      );
    });

    it('does nothing for PROCESSING status', async () => {
      const payload: TransakWebhookPayload = {
        eventId: 'evt-3',
        status: 'PROCESSING',
        walletAddress: '0xSafe123Abc',
        cryptoAmount: 0,
        cryptoCurrency: 'USDC',
        fiatAmount: 100,
        fiatCurrency: 'USD',
      };

      await handler.handleWebhook(payload);

      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('logs warning for unknown wallet address', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const payload: TransakWebhookPayload = {
        eventId: 'evt-4',
        status: 'COMPLETED',
        walletAddress: '0xUnknownWallet',
        cryptoAmount: 50,
        cryptoCurrency: 'USDC',
        fiatAmount: 51,
        fiatCurrency: 'USD',
      };

      await handler.handleWebhook(payload);

      expect(mockNotify).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No user found'),
      );
      consoleSpy.mockRestore();
    });

    it('matches wallet address case-insensitively', async () => {
      const payload: TransakWebhookPayload = {
        eventId: 'evt-5',
        status: 'COMPLETED',
        walletAddress: '0xsafe123abc', // lowercase
        cryptoAmount: 75,
        cryptoCurrency: 'USDC',
        fiatAmount: 76.50,
        fiatCurrency: 'EUR',
      };

      await handler.handleWebhook(payload);

      expect(mockNotify).toHaveBeenCalledWith(12345, expect.any(String));
    });
  });

  // -----------------------------------------------------------------------
  // verifySignature
  // -----------------------------------------------------------------------

  describe('verifySignature', () => {
    it('accepts valid HMAC signature', () => {
      const body = { test: 'data' };
      const signature = signPayload(body, WEBHOOK_SECRET);

      expect(handler.verifySignature(body, signature)).toBe(true);
    });

    it('rejects invalid signature', () => {
      const body = { test: 'data' };

      expect(handler.verifySignature(body, 'invalid-sig')).toBe(false);
    });

    it('rejects missing signature', () => {
      expect(handler.verifySignature({}, undefined)).toBe(false);
    });

    it('rejects tampered body', () => {
      const originalBody = { amount: 100 };
      const signature = signPayload(originalBody, WEBHOOK_SECRET);
      const tamperedBody = { amount: 999 };

      expect(handler.verifySignature(tamperedBody, signature)).toBe(false);
    });
  });
});
