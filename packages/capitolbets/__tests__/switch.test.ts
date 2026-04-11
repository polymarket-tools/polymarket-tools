import { describe, it, expect, vi, beforeEach } from 'vitest';
import { switchCommand } from '../src/commands/switch';
import type { BotContext } from '../src/bot';
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

function createMockCtx(overrides: Partial<BotContext> = {}): BotContext {
  return {
    user: createMockUser(),
    message: { text: '/switch polycop' },
    reply: vi.fn().mockResolvedValue(undefined),
    userQueries: {
      setFeeRate: vi.fn(),
    },
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('switchCommand', () => {
  it('sets promotional rate for valid competitor "polycop"', async () => {
    const ctx = createMockCtx();
    await switchCommand(ctx);

    expect(ctx.userQueries!.setFeeRate).toHaveBeenCalledWith(
      12345,
      0.0025,
      expect.any(String),
    );
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Welcome from Polycop'),
    );
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('0.25%'),
    );
  });

  it('sets promotional rate for valid competitor "kreo"', async () => {
    const ctx = createMockCtx({
      message: { text: '/switch kreo' } as any,
    });
    await switchCommand(ctx);

    expect(ctx.userQueries!.setFeeRate).toHaveBeenCalledWith(
      12345,
      0.0025,
      expect.any(String),
    );
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Welcome from Kreo'),
    );
  });

  it('rejects invalid competitor name', async () => {
    const ctx = createMockCtx({
      message: { text: '/switch unknown' } as any,
    });
    await switchCommand(ctx);

    expect(ctx.userQueries!.setFeeRate).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Usage:'),
    );
  });

  it('rejects empty competitor name', async () => {
    const ctx = createMockCtx({
      message: { text: '/switch' } as any,
    });
    await switchCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Usage:'),
    );
  });

  it('blocks if user already has a promotional rate', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 15);

    const ctx = createMockCtx({
      user: createMockUser({
        fee_rate: 0.0025,
        fee_rate_expires: futureDate.toISOString(),
      }),
    } as any);
    await switchCommand(ctx);

    expect(ctx.userQueries!.setFeeRate).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('already have a promotional rate'),
    );
  });

  it('allows promo if previous promo has expired', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    const ctx = createMockCtx({
      user: createMockUser({
        fee_rate: 0.0025,
        fee_rate_expires: pastDate.toISOString(),
      }),
    } as any);
    await switchCommand(ctx);

    expect(ctx.userQueries!.setFeeRate).toHaveBeenCalled();
  });

  it('requires user to be registered', async () => {
    const ctx = createMockCtx({ user: null } as any);
    await switchCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('wallet first'),
    );
  });

  it('sets expiry to 30 days from now', async () => {
    const ctx = createMockCtx();
    const beforeCall = new Date();

    await switchCommand(ctx);

    const setFeeCall = (ctx.userQueries!.setFeeRate as any).mock.calls[0];
    const expiresStr = setFeeCall[2] as string;
    const expiresDate = new Date(expiresStr);

    // Should be roughly 30 days from now (within 1 minute)
    const expectedMin = new Date(beforeCall);
    expectedMin.setDate(expectedMin.getDate() + 29);
    const expectedMax = new Date(beforeCall);
    expectedMax.setDate(expectedMax.getDate() + 31);

    expect(expiresDate.getTime()).toBeGreaterThan(expectedMin.getTime());
    expect(expiresDate.getTime()).toBeLessThan(expectedMax.getTime());
  });
});
