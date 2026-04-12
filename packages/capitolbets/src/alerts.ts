import { InlineKeyboard } from 'grammy';
import type { Application, Request, Response } from 'express';
import type { AlertSentQueries, UserQueries } from './db-queries';
import type { AlertPayload, AlertPreferences, User } from './types';
import { buildTradeKeyboard } from './keyboards';

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
  /** Shared secret for authenticating webhook requests. n8n sends this as Bearer token. */
  webhookSecret: string;
  /** Raw better-sqlite3 db for transaction support. When provided, dedup check + insert runs atomically. */
  rawDb?: { prepare(sql: string): { run(...args: unknown[]): void }; transaction<T>(fn: () => T): () => T } | null;
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
  private rawDb?: AlertRouterDeps['rawDb'];

  constructor(deps: AlertRouterDeps) {
    this.alertSentQueries = deps.alertSentQueries;
    this.userQueries = deps.userQueries;
    this.sendMessage = deps.sendMessage;
    this.postToChannel = deps.postToChannel;
    this.signalChannelId = deps.signalChannelId;
    this.rawDb = deps.rawDb;
  }

  // -----------------------------------------------------------------------
  // Express route registration
  // -----------------------------------------------------------------------

  registerRoutes(app: Application): void {
    app.post('/api/alert', async (req: Request, res: Response) => {
      // Authenticate: n8n must send the shared secret in the Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${this.deps.webhookSecret}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

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
    // Atomic deduplication: check + insert inside a transaction to prevent
    // duplicate webhooks from both passing the check.
    const isDuplicate = this.dedupCheckAndInsert(payload);
    if (isDuplicate) {
      return { delivered: 0, skipped: 0, deduplicated: true };
    }

    // Get subscribed users
    const subscribedUsers = this.getSubscribedUsers(payload.category);

    let delivered = 0;
    let skipped = 0;

    const { text, keyboard } = this.formatAlertMessage(payload);
    const isUrgent = payload.urgent === true;

    // Sequential send with 35ms delay to stay under Telegram's 30 msgs/sec limit
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
      // Rate limit: ~30 msgs/sec = 33ms per message, use 35ms for safety
      if (subscribedUsers.length > 1) {
        await sleep(35);
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
  // Atomic deduplication
  // -----------------------------------------------------------------------

  /**
   * Check for duplicates and insert the alert record atomically.
   * When rawDb is available, uses a BEGIN IMMEDIATE transaction to prevent
   * race conditions between concurrent webhook calls.
   * Returns true if the alert is a duplicate (should be skipped).
   */
  private dedupCheckAndInsert(payload: AlertPayload): boolean {
    const check = () => {
      const isDuplicate = this.alertSentQueries.existsRecent(
        payload.category,
        payload.market.conditionId,
        DEDUP_WINDOW_MINUTES,
      );
      if (isDuplicate) return true;
      this.alertSentQueries.insert({
        category: payload.category,
        title: payload.title,
        market_condition_id: payload.market.conditionId,
      });
      return false;
    };

    if (this.rawDb) {
      // Wrap in an IMMEDIATE transaction for atomicity
      const txn = this.rawDb.transaction(check);
      return txn();
    }
    return check();
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
    // For alerts we only have the YES tokenId. NO buttons use the same tokenId
    // with SELL side as a workaround until AlertPayload includes noTokenId.
    const keyboard = buildTradeKeyboard(
      payload.market.tokenId,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
