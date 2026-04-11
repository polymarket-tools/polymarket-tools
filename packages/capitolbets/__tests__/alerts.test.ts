import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AlertRouter,
  validateAlertPayload,
  type AlertRouterDeps,
  type AlertSendFn,
  type ChannelPostFn,
} from '../src/alerts';
import type { AlertPayload, User, AlertPreferences } from '../src/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
      movers: false,
      new_markets: false,
      risk_reward: false,
      smart_money: false,
    },
    referred_by: null,
    fee_rate: 0.005,
    fee_rate_expires: null,
    digest_enabled: true,
    ...overrides,
  };
}

function createValidPayload(overrides: Partial<AlertPayload> = {}): AlertPayload {
  return {
    category: 'whales',
    title: 'Whale Move',
    body: 'Top trader beachboy4 just bought $50K YES on "Will BTC hit $150K?"',
    market: {
      conditionId: '0xcondition123',
      question: 'Will BTC hit $150K by July?',
      tokenId: 'token-yes-123',
      currentPrice: 0.32,
    },
    metadata: {},
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<AlertRouterDeps> = {}): AlertRouterDeps {
  return {
    alertSentQueries: {
      existsRecent: vi.fn().mockReturnValue(false),
      insert: vi.fn(),
    } as any,
    userQueries: {
      listAll: vi.fn().mockReturnValue([createMockUser()]),
    } as any,
    sendMessage: vi.fn<AlertSendFn>().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: validateAlertPayload
// ---------------------------------------------------------------------------

describe('validateAlertPayload', () => {
  it('accepts a valid payload', () => {
    const result = validateAlertPayload(createValidPayload());
    expect(result.valid).toBe(true);
  });

  it('rejects null body', () => {
    const result = validateAlertPayload(null);
    expect(result.valid).toBe(false);
  });

  it('rejects invalid category', () => {
    const result = validateAlertPayload({
      ...createValidPayload(),
      category: 'invalid',
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('category');
  });

  it('rejects missing title', () => {
    const payload = createValidPayload();
    (payload as any).title = undefined;
    const result = validateAlertPayload(payload);
    expect(result.valid).toBe(false);
  });

  it('rejects missing body', () => {
    const payload = createValidPayload();
    (payload as any).body = undefined;
    const result = validateAlertPayload(payload);
    expect(result.valid).toBe(false);
  });

  it('rejects missing market', () => {
    const payload = createValidPayload();
    (payload as any).market = undefined;
    const result = validateAlertPayload(payload);
    expect(result.valid).toBe(false);
  });

  it('rejects missing market.conditionId', () => {
    const payload = createValidPayload();
    (payload.market as any).conditionId = undefined;
    const result = validateAlertPayload(payload);
    expect(result.valid).toBe(false);
  });

  it('rejects missing market.question', () => {
    const payload = createValidPayload();
    (payload.market as any).question = undefined;
    const result = validateAlertPayload(payload);
    expect(result.valid).toBe(false);
  });

  it('rejects missing market.tokenId', () => {
    const payload = createValidPayload();
    (payload.market as any).tokenId = undefined;
    const result = validateAlertPayload(payload);
    expect(result.valid).toBe(false);
  });

  it('rejects missing market.currentPrice', () => {
    const payload = createValidPayload();
    (payload.market as any).currentPrice = 'not-a-number';
    const result = validateAlertPayload(payload);
    expect(result.valid).toBe(false);
  });

  it('accepts all valid categories', () => {
    const categories = ['whales', 'politics', 'movers', 'new_markets', 'risk_reward', 'smart_money'];
    for (const category of categories) {
      const result = validateAlertPayload(createValidPayload({ category: category as any }));
      expect(result.valid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: AlertRouter.processAlert
// ---------------------------------------------------------------------------

describe('AlertRouter', () => {
  let router: AlertRouter;
  let deps: AlertRouterDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    router = new AlertRouter(deps);
  });

  describe('processAlert', () => {
    it('sends alert to subscribed users', async () => {
      const payload = createValidPayload();
      const result = await router.processAlert(payload);

      expect(result.delivered).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.deduplicated).toBe(false);
      expect(deps.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('records alert in alerts_sent table', async () => {
      const payload = createValidPayload();
      await router.processAlert(payload);

      expect(deps.alertSentQueries.insert).toHaveBeenCalledWith({
        category: 'whales',
        title: 'Whale Move',
        market_condition_id: '0xcondition123',
      });
    });

    it('deduplicates alerts within 30-minute window', async () => {
      (deps.alertSentQueries.existsRecent as any).mockReturnValue(true);
      const payload = createValidPayload();
      const result = await router.processAlert(payload);

      expect(result.delivered).toBe(0);
      expect(result.deduplicated).toBe(true);
      expect(deps.sendMessage).not.toHaveBeenCalled();
    });

    it('skips users with category disabled', async () => {
      const user = createMockUser({
        telegram_id: 999,
        alert_preferences: {
          whales: false,
          politics: false,
          movers: false,
          new_markets: false,
          risk_reward: false,
          smart_money: false,
        },
      });
      (deps.userQueries.listAll as any).mockReturnValue([user]);

      const payload = createValidPayload();
      const result = await router.processAlert(payload);

      expect(result.delivered).toBe(0);
      expect(deps.sendMessage).not.toHaveBeenCalled();
    });

    it('delivers to multiple subscribed users', async () => {
      const users = [
        createMockUser({ telegram_id: 111 }),
        createMockUser({ telegram_id: 222 }),
        createMockUser({ telegram_id: 333, alert_preferences: { ...createMockUser().alert_preferences, whales: false } }),
      ];
      (deps.userQueries.listAll as any).mockReturnValue(users);

      const payload = createValidPayload();
      const result = await router.processAlert(payload);

      expect(result.delivered).toBe(2); // 111 and 222, not 333
    });

    it('counts failed sends as skipped', async () => {
      (deps.sendMessage as any).mockRejectedValue(new Error('Bot blocked'));
      const payload = createValidPayload();
      const result = await router.processAlert(payload);

      expect(result.delivered).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('sends urgent alerts with notification enabled', async () => {
      const payload = createValidPayload({ urgent: true });
      await router.processAlert(payload);

      expect(deps.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(String),
        expect.objectContaining({ disable_notification: false }),
      );
    });

    it('sends normal alerts with notification disabled', async () => {
      const payload = createValidPayload({ urgent: false });
      await router.processAlert(payload);

      expect(deps.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(String),
        expect.objectContaining({ disable_notification: true }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // formatAlertMessage
  // -----------------------------------------------------------------------

  describe('formatAlertMessage', () => {
    it('includes category header', () => {
      const payload = createValidPayload({ category: 'whales' });
      const { text } = router.formatAlertMessage(payload);
      expect(text).toContain('Whale Move');
    });

    it('includes body text', () => {
      const payload = createValidPayload({ body: 'Big whale buy' });
      const { text } = router.formatAlertMessage(payload);
      expect(text).toContain('Big whale buy');
    });

    it('includes current price', () => {
      const payload = createValidPayload();
      payload.market.currentPrice = 0.32;
      const { text } = router.formatAlertMessage(payload);
      expect(text).toContain('$0.32');
    });

    it('uses URGENT prefix for urgent alerts', () => {
      const payload = createValidPayload({ urgent: true });
      const { text } = router.formatAlertMessage(payload);
      expect(text).toContain('URGENT:');
    });

    it('returns inline keyboard with trade buttons', () => {
      const payload = createValidPayload();
      const { keyboard } = router.formatAlertMessage(payload);
      expect(keyboard).toBeDefined();
    });

    it('formats politics alerts with Capitol Alert header', () => {
      const payload = createValidPayload({ category: 'politics' });
      const { text } = router.formatAlertMessage(payload);
      expect(text).toContain('Capitol Alert');
    });
  });

  // -----------------------------------------------------------------------
  // Channel broadcast
  // -----------------------------------------------------------------------

  describe('channel broadcast', () => {
    it('posts to signal channel when configured', async () => {
      const postToChannel = vi.fn<ChannelPostFn>().mockResolvedValue(undefined);
      const channelDeps = {
        ...deps,
        postToChannel,
        signalChannelId: '@CapitolBetsAlerts',
      };
      const channelRouter = new AlertRouter(channelDeps);

      await channelRouter.processAlert(createValidPayload());

      expect(postToChannel).toHaveBeenCalledTimes(1);
      expect(postToChannel).toHaveBeenCalledWith(
        '@CapitolBetsAlerts',
        expect.stringContaining('Trade this on @CapitolBetsBot'),
      );
    });

    it('does not post to channel when not configured', async () => {
      const postToChannel = vi.fn<ChannelPostFn>().mockResolvedValue(undefined);
      const channelDeps = {
        ...deps,
        postToChannel,
        // No signalChannelId
      };
      const channelRouter = new AlertRouter(channelDeps);

      await channelRouter.processAlert(createValidPayload());

      expect(postToChannel).not.toHaveBeenCalled();
    });

    it('handles channel post failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const postToChannel = vi.fn<ChannelPostFn>().mockRejectedValue(new Error('Channel error'));
      const channelDeps = {
        ...deps,
        postToChannel,
        signalChannelId: '@CapitolBetsAlerts',
      };
      const channelRouter = new AlertRouter(channelDeps);

      // Should not throw
      const result = await channelRouter.processAlert(createValidPayload());
      expect(result.delivered).toBe(1); // User delivery still succeeds
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // formatChannelMessage
  // -----------------------------------------------------------------------

  describe('formatChannelMessage', () => {
    it('includes Trade this on @CapitolBetsBot', () => {
      const payload = createValidPayload();
      const text = router.formatChannelMessage(payload);
      expect(text).toContain('Trade this on @CapitolBetsBot');
    });

    it('does not include inline keyboard data', () => {
      const payload = createValidPayload();
      const text = router.formatChannelMessage(payload);
      expect(text).not.toContain('trade:BUY');
    });
  });
});
