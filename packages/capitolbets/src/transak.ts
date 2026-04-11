// ---------------------------------------------------------------------------
// Transak URL generator for fiat-to-USDC onramp
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import type { Application, Request, Response } from 'express';
import type { UserQueries } from './db-queries';

export interface TransakUrlParams {
  apiKey: string;
  walletAddress: string;
  fiatAmount?: number;
}

/**
 * Generate a Transak onramp URL pre-configured for USDC on Polygon.
 *
 * Opens in Telegram's WebView when used with an inline keyboard url button.
 */
export function generateTransakUrl(params: TransakUrlParams): string {
  const url = new URL('https://global.transak.com/');
  url.searchParams.set('apiKey', params.apiKey);
  url.searchParams.set('cryptoCurrencyCode', 'USDC');
  url.searchParams.set('network', 'polygon');
  url.searchParams.set('walletAddress', params.walletAddress);
  url.searchParams.set('defaultFiatAmount', String(params.fiatAmount ?? 50));
  return url.toString();
}

// ---------------------------------------------------------------------------
// Transak webhook types
// ---------------------------------------------------------------------------

export interface TransakWebhookPayload {
  eventId: string;
  status: 'COMPLETED' | 'FAILED' | 'PROCESSING';
  walletAddress: string;
  cryptoAmount: number;
  cryptoCurrency: string;
  fiatAmount: number;
  fiatCurrency: string;
  transactionHash?: string;
}

// ---------------------------------------------------------------------------
// Transak webhook notification callback
// ---------------------------------------------------------------------------

export type TransakNotifyFn = (
  telegramId: number,
  message: string,
) => Promise<void>;

// ---------------------------------------------------------------------------
// TransakWebhookHandler
// ---------------------------------------------------------------------------

/**
 * Handles POST /api/transak/webhook for deposit confirmations.
 *
 * When Transak completes a card-to-USDC payment, it sends a webhook
 * to our server. We look up the user by wallet address and notify them.
 */
export class TransakWebhookHandler {
  private userQueries: UserQueries;
  private notify: TransakNotifyFn;
  private webhookSecret: string;

  constructor(deps: {
    userQueries: UserQueries;
    notify: TransakNotifyFn;
    webhookSecret: string;
  }) {
    this.userQueries = deps.userQueries;
    this.notify = deps.notify;
    this.webhookSecret = deps.webhookSecret;
  }

  /**
   * Register webhook route on the Express app.
   */
  registerRoutes(app: Application): void {
    app.post('/api/transak/webhook', async (req: Request, res: Response) => {
      // Verify signature
      const signature = req.headers['x-transak-signature'] as string | undefined;
      if (!this.verifySignature(req.body, signature)) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const payload = req.body as TransakWebhookPayload;

      try {
        await this.handleWebhook(payload);
        res.json({ ok: true });
      } catch (err) {
        console.error('[TransakWebhook] Error handling webhook:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * Process an incoming Transak webhook payload.
   */
  async handleWebhook(payload: TransakWebhookPayload): Promise<void> {
    const { status, walletAddress, cryptoAmount, fiatAmount, fiatCurrency } = payload;

    // Look up user by safe_address (wallet address = user's Safe)
    const user = this.findUserByWallet(walletAddress);
    if (!user) {
      console.warn(
        `[TransakWebhook] No user found for wallet ${walletAddress}`,
      );
      return;
    }

    if (status === 'COMPLETED') {
      await this.notify(
        user.telegram_id,
        `Received $${cryptoAmount.toFixed(2)} USDC via card payment (${fiatCurrency} ${fiatAmount.toFixed(2)}). Ready to trade!\n\nType /balance to check your balance.`,
      );
    } else if (status === 'FAILED') {
      await this.notify(
        user.telegram_id,
        'Card payment failed. Please try again via /deposit.',
      );
    }
    // PROCESSING status is ignored (no user notification needed)
  }

  /**
   * Verify webhook signature using HMAC-SHA256.
   */
  verifySignature(body: unknown, signature: string | undefined): boolean {
    if (!signature || !this.webhookSecret) return false;

    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);

    if (sigBuf.length !== expBuf.length) return false;

    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Find a user by their Safe wallet address.
   */
  private findUserByWallet(walletAddress: string): { telegram_id: number } | null {
    const allUsers = this.userQueries.listAll();
    const normalized = walletAddress.toLowerCase();
    const user = allUsers.find(
      (u) => u.safe_address.toLowerCase() === normalized,
    );
    return user ?? null;
  }
}
