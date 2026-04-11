// ---------------------------------------------------------------------------
// Shareable Trade Cards
// ---------------------------------------------------------------------------
//
// Generates text-based trade cards for winning trades. When a trade resolves
// profitably, the user gets a formatted message with a "Share" button that
// lets them forward it to any chat via Telegram's switchInlineQuery.
//

import { InlineKeyboard } from 'grammy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TradeCardParams {
  question: string;
  entryPrice: number;
  resolvedPrice: number;    // 1 for YES resolution, 0 for NO
  profit: number;
  returnPercent: number;
  username?: string;
}

export interface TradeCardResult {
  text: string;
  keyboard: InlineKeyboard;
}

// ---------------------------------------------------------------------------
// TradeCardGenerator
// ---------------------------------------------------------------------------

/**
 * Generates text-based "trade cards" for profitable resolved trades.
 * The card includes market question, entry/resolution details, profit,
 * and CapitolBets branding. A share button lets users forward to other chats.
 */
export class TradeCardGenerator {
  /**
   * Generate a trade card for a profitable trade.
   * Returns null if the trade was not profitable (profit <= 0).
   */
  generateCard(params: TradeCardParams): TradeCardResult | null {
    if (params.profit <= 0) return null;

    const {
      question,
      entryPrice,
      resolvedPrice,
      profit,
      returnPercent,
      username,
    } = params;

    const outcome = resolvedPrice >= 0.5 ? 'YES' : 'NO';
    const entryStr = `$${entryPrice.toFixed(2)}`;
    const profitStr = `$${profit.toFixed(2)}`;
    const pctStr = `${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(0)}%`;

    const lines = [
      'Called it.',
      '',
      `"${question}"`,
      `at ${entryStr} -> Resolved ${outcome}`,
      '',
      `+${profitStr} profit | ${pctStr} return`,
    ];

    if (username) {
      lines.push('', `@${username} on @CapitolBetsBot`);
    } else {
      lines.push('', 'Powered by @CapitolBetsBot');
    }

    const text = lines.join('\n');

    // Share button: uses switchInlineQuery to let user forward to any chat
    const shareText = `Called it! "${question}" +${profitStr} (${pctStr}). Try @CapitolBetsBot`;
    const keyboard = new InlineKeyboard().switchInline('Share', shareText);

    return { text, keyboard };
  }

  /**
   * Format a quick share text for a profitable trade (no keyboard needed).
   * Useful for channel broadcasts.
   */
  formatShareText(params: TradeCardParams): string | null {
    if (params.profit <= 0) return null;

    const outcome = params.resolvedPrice >= 0.5 ? 'YES' : 'NO';
    const entryStr = `$${params.entryPrice.toFixed(2)}`;
    const profitStr = `$${params.profit.toFixed(2)}`;
    const pctStr = `+${params.returnPercent.toFixed(0)}%`;

    return (
      `Called it. "${params.question}" at ${entryStr} -> Resolved ${outcome}. ` +
      `+${profitStr} (${pctStr}). Powered by @CapitolBetsBot`
    );
  }
}
