import { InlineKeyboard } from 'grammy';
import type { Application, Request, Response } from 'express';
import type { AlertSentQueries, UserQueries } from './db-queries';
import type { AlertPayload, AlertPreferences, User } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSendFn = (
  telegramId: number,
  text: string,
  options?: { reply_markup?: InlineKeyboard; disable_notification?: boolean },
) => Promise<void>;

export type ChannelPostFn = (
  channelId: string,
  text: string,
) => Promise<void>;

export interface AlertRouterDeps {
  alertSentQueries: AlertSentQueries;
  userQueries: UserQueries;
  sendMessage: AlertSendFn;
  postToChannel?: ChannelPostFn;
  signalChannelId?: string;
}

export interface ProcessAlertResult {
  delivered: number;
  skipped: number;
  deduplicated: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEDUP_WINDOW_MINUTES = 30;

const VALID_CATEGORIES: Set<string> = new Set([
  'whales',
  'politics',
  'movers',
  'new_markets',
  'risk_reward',
  'smart_money',
]);

export const CATEGORY_HEADERS: Record<string, string> = {
  whales: 'Whale Move',
  politics: 'Capitol Alert',
  movers: 'Big Mover',
  new_markets: 'New Market',
  risk_reward: 'Risk/Reward Play',
  smart_money: 'Smart Money Consensus',
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateAlertPayload(
  body: unknown,
): { valid: true; payload: AlertPayload } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const obj = body as Record<string, unknown>;

  if (!obj.category || typeof obj.category !== 'string' || !VALID_CATEGORIES.has(obj.category)) {
    return {
      valid: false,
      error: `Invalid category. Must be one of: ${[...VALID_CATEGORIES].join(', ')}`,
    };
  }

  if (!obj.title || typeof obj.title !== 'string') {
    return { valid: false, error: 'Missing or invalid title.' };
  }

  if (!obj.body || typeof obj.body !== 'string') {
    return { valid: false, error: 'Missing or invalid body.' };
  }

  if (!obj.market || typeof obj.market !== 'object') {
    return { valid: false, error: 'Missing or invalid market object.' };
  }

  const market = obj.market as Record<string, unknown>;
  if (!market.conditionId || typeof market.conditionId !== 'string') {
    return { valid: false, error: 'Missing market.conditionId.' };
  }
  if (!market.question || typeof market.question !== 'string') {
    return { valid: false, error: 'Missing market.question.' };
  }
  if (!market.tokenId || typeof market.tokenId !== 'string') {
    return { valid: false, error: 'Missing market.tokenId.' };
  }
  if (typeof market.currentPrice !== 'number') {
    return { valid: false, error: 'Missing or invalid market.currentPrice.' };
  }

  return {
    valid: true,
    payload: body as AlertPayload,
  };
}

// ---------------------------------------------------------------------------
// AlertRouter
// ---------------------------------------------------------------------------

export class AlertRouter {
  private alertSentQueries: AlertSentQueries;
  private userQueries: UserQueries;
  private sendMessage: AlertSendFn;
  private postToChannel?: ChannelPostFn;
  private signalChannelId?: string;

  constructor(deps: AlertRouterDeps) {
    this.alertSentQueries = deps.alertSentQueries;
    this.userQueries = deps.userQueries;
    this.sendMessage = deps.sendMessage;
    this.postToChannel = deps.postToChannel;
    this.signalChannelId = deps.signalChannelId;
  }

  // -----------------------------------------------------------------------
  // Express route registration
  // -----------------------------------------------------------------------

  registerRoutes(app: Application): void {
    app.post('/api/alert', async (req: Request, res: Response) => {
      const validation = validateAlertPayload(req.body);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      try {
        const result = await this.processAlert(validation.payload);
        res.json(result);
      } catch (err) {
        console.error('[AlertRouter] Error processing alert:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  // -----------------------------------------------------------------------
  // Core processing
  // -----------------------------------------------------------------------

  async processAlert(payload: AlertPayload): Promise<ProcessAlertResult> {
    // Deduplication check
    const isDuplicate = this.alertSentQueries.existsRecent(
      payload.category,
      payload.market.conditionId,
      DEDUP_WINDOW_MINUTES,
    );

    if (isDuplicate) {
      return { delivered: 0, skipped: 0, deduplicated: true };
    }

    // Record in alerts_sent
    this.alertSentQueries.insert({
      category: payload.category,
      title: payload.title,
      market_condition_id: payload.market.conditionId,
    });

    // Get subscribed users
    const subscribedUsers = this.getSubscribedUsers(payload.category);

    let delivered = 0;
    let skipped = 0;

    const { text, keyboard } = this.formatAlertMessage(payload);
    const isUrgent = payload.urgent === true;

    for (const user of subscribedUsers) {
      try {
        await this.sendMessage(user.telegram_id, text, {
          reply_markup: keyboard,
          disable_notification: !isUrgent,
        });
        delivered++;
      } catch (err) {
        console.error(
          `[AlertRouter] Failed to send alert to user ${user.telegram_id}:`,
          err,
        );
        skipped++;
      }
    }

    // Channel broadcast
    if (this.signalChannelId && this.postToChannel) {
      try {
        const channelText = this.formatChannelMessage(payload);
        await this.postToChannel(this.signalChannelId, channelText);
      } catch (err) {
        console.error('[AlertRouter] Failed to post to signal channel:', err);
      }
    }

    return { delivered, skipped, deduplicated: false };
  }

  // -----------------------------------------------------------------------
  // Message formatting
  // -----------------------------------------------------------------------

  private buildAlertText(payload: AlertPayload): string {
    const header = CATEGORY_HEADERS[payload.category] ?? payload.category;
    const priceStr = `$${payload.market.currentPrice.toFixed(2)}`;

    if (payload.urgent) {
      return `URGENT: ${payload.body}\nCurrent price: ${priceStr}`;
    }
    return `${header}\n${payload.body}\nCurrent price: ${priceStr}`;
  }

  formatAlertMessage(payload: AlertPayload): {
    text: string;
    keyboard: InlineKeyboard;
  } {
    const text = this.buildAlertText(payload);
    const keyboard = buildAlertTradeKeyboard(
      payload.market.tokenId,
      payload.market.conditionId,
    );

    return { text, keyboard };
  }

  formatChannelMessage(payload: AlertPayload): string {
    return this.buildAlertText(payload) + '\n\nTrade this on @CapitolBetsBot';
  }

  // -----------------------------------------------------------------------
  // User lookup
  // -----------------------------------------------------------------------

  private getSubscribedUsers(category: string): User[] {
    // Get all users and filter by preference
    // In a production system we'd have a more efficient query,
    // but SQLite JSON queries are limited
    const allUsers = this.userQueries.listAll();
    return allUsers.filter((user) => {
      const prefs = user.alert_preferences;
      return prefs[category as keyof AlertPreferences] === true;
    });
  }
}

// ---------------------------------------------------------------------------
// Keyboard builder
// ---------------------------------------------------------------------------

function buildAlertTradeKeyboard(
  tokenId: string,
  conditionId: string,
): InlineKeyboard {
  const amounts = [25, 50, 100];
  const kb = new InlineKeyboard();

  for (const amount of amounts) {
    kb.text(
      `Buy YES $${amount}`,
      `trade:BUY:${tokenId}:${conditionId}:${amount}`,
    );
  }
  kb.row();

  for (const amount of amounts) {
    kb.text(
      `Buy NO $${amount}`,
      `trade:SELL:${tokenId}:${conditionId}:${amount}`,
    );
  }

  return kb;
}
