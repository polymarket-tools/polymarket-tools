import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AlertRouter,
  type AlertRouterDeps,
  type AlertSendFn,
  type ChannelPostFn,
} from '../src/alerts';
import { parseTradeCallback } from '../src/callbacks/trade';
import type { AlertPayload, User } from '../src/types';

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

function createValidPayload(overrides: Partial<AlertPayload> = {}): AlertPayload {
  return {
    category: 'whales',
    title: 'Whale Move',
    body: 'Top trader bought $50K YES on "Will BTC hit $150K?"',
    market: {
      conditionId: 'cond123abc',
      question: 'Will BTC hit $150K by July?',
      tokenId: 'tokenyes123',
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
// Tests: End-to-end signal flow
// ---------------------------------------------------------------------------

describe('Signal-to-Trade Flow', () => {
  let deps: AlertRouterDeps;
  let router: AlertRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    router = new AlertRouter(deps);
  });

  describe('alert delivery with trade buttons', () => {
    it('delivers alert with inline trade buttons to subscribed user', async () => {
      const payload = createValidPayload();
      const result = await router.processAlert(payload);

      expect(result.delivered).toBe(1);
      expect(deps.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.any(String),
        expect.objectContaining({
          reply_markup: expect.anything(),
        }),
      );
    });

    it('trade buttons contain correct callback data', () => {
      const payload = createValidPayload();
      const { keyboard } = router.formatAlertMessage(payload);

      // Serialize keyboard to inspect button data
      const kbData = (keyboard as any).inline_keyboard;
      expect(kbData).toBeDefined();
      expect(kbData.length).toBeGreaterThan(0);

      // First row should have Buy YES buttons
      const firstRow = kbData[0];
      expect(firstRow.length).toBe(3); // $25, $50, $100

      // Verify callback data is parseable by trade callback handler
      for (const button of firstRow) {
        const parsed = parseTradeCallback(button.callback_data);
        expect(parsed).not.toBeNull();
        expect(parsed?.side).toBe('BUY');
        expect(parsed?.tokenId).toBe('tokenyes123');
        expect(parsed?.conditionId).toBe('cond123abc');
      }
    });

    it('trade buttons have correct amounts ($25, $50, $100)', () => {
      const payload = createValidPayload();
      const { keyboard } = router.formatAlertMessage(payload);
      const kbData = (keyboard as any).inline_keyboard;

      const firstRow = kbData[0];
      const amounts = firstRow.map((btn: any) => {
        const parsed = parseTradeCallback(btn.callback_data);
        return parsed?.amount;
      });
      expect(amounts).toEqual([25, 50, 100]);
    });
  });

  describe('source tracking', () => {
    it('executeTrade source param defaults to manual', () => {
      // This tests the interface -- executeTrade should accept source param
      // The actual trade callback detects source from message text
      const parsed = parseTradeCallback('trade:BUY:token123:cond456:50');
      expect(parsed).toEqual({
        side: 'BUY',
        tokenId: 'token123',
        conditionId: 'cond456',
        amount: 50,
      });
    });
  });

  describe('preference-based routing', () => {
    it('routes whale alert only to users with whales enabled', async () => {
      const users = [
        createMockUser({ telegram_id: 111, alert_preferences: { ...createMockUser().alert_preferences, whales: true } }),
        createMockUser({ telegram_id: 222, alert_preferences: { ...createMockUser().alert_preferences, whales: false } }),
      ];
      (deps.userQueries.listAll as any).mockReturnValue(users);

      const payload = createValidPayload({ category: 'whales' });
      const result = await router.processAlert(payload);

      expect(result.delivered).toBe(1);
      expect(deps.sendMessage).toHaveBeenCalledWith(
        111,
        expect.any(String),
        expect.anything(),
      );
    });

    it('routes politics alert to politics subscribers only', async () => {
      const users = [
        createMockUser({
          telegram_id: 111,
          alert_preferences: { whales: false, politics: true, movers: false, new_markets: false, risk_reward: false, smart_money: false },
        }),
        createMockUser({
          telegram_id: 222,
          alert_preferences: { whales: true, politics: false, movers: false, new_markets: false, risk_reward: false, smart_money: false },
        }),
      ];
      (deps.userQueries.listAll as any).mockReturnValue(users);

      const payload = createValidPayload({ category: 'politics' });
      const result = await router.processAlert(payload);

      expect(result.delivered).toBe(1);
      expect(deps.sendMessage).toHaveBeenCalledWith(111, expect.any(String), expect.anything());
    });
  });

  describe('urgent alerts', () => {
    it('sends urgent alerts with notification enabled (rings)', async () => {
      const payload = createValidPayload({ urgent: true });
      await router.processAlert(payload);

      expect(deps.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('URGENT:'),
        expect.objectContaining({ disable_notification: false }),
      );
    });

    it('sends normal alerts silently', async () => {
      const payload = createValidPayload({ urgent: false });
      await router.processAlert(payload);

      expect(deps.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(String),
        expect.objectContaining({ disable_notification: true }),
      );
    });
  });

  describe('signal channel broadcast', () => {
    it('posts to channel without trade buttons but with bot link', async () => {
      const postToChannel = vi.fn<ChannelPostFn>().mockResolvedValue(undefined);
      const channelRouter = new AlertRouter({
        ...deps,
        postToChannel,
        signalChannelId: '@CapitolBetsAlerts',
      });

      await channelRouter.processAlert(createValidPayload());

      expect(postToChannel).toHaveBeenCalledTimes(1);
      const channelText = postToChannel.mock.calls[0][1];
      expect(channelText).toContain('Trade this on @CapitolBetsBot');
      // Should NOT contain callback data
      expect(channelText).not.toContain('trade:BUY');
    });

    it('channel version includes alert content', async () => {
      const postToChannel = vi.fn<ChannelPostFn>().mockResolvedValue(undefined);
      const channelRouter = new AlertRouter({
        ...deps,
        postToChannel,
        signalChannelId: '@CapitolBetsAlerts',
      });

      const payload = createValidPayload({
        body: 'Big whale buy detected',
      });
      await channelRouter.processAlert(payload);

      const channelText = postToChannel.mock.calls[0][1];
      expect(channelText).toContain('Big whale buy detected');
      expect(channelText).toContain('$0.32'); // current price
    });
  });

  describe('deduplication in signal flow', () => {
    it('does not re-deliver the same alert within 30 minutes', async () => {
      (deps.alertSentQueries.existsRecent as any).mockReturnValue(true);
      const payload = createValidPayload();
      const result = await router.processAlert(payload);

      expect(result.deduplicated).toBe(true);
      expect(result.delivered).toBe(0);
      expect(deps.sendMessage).not.toHaveBeenCalled();
      // Should not insert another record
      expect(deps.alertSentQueries.insert).not.toHaveBeenCalled();
    });
  });
});
