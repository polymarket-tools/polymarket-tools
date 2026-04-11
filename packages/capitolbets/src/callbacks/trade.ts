import { formatUnits, type Hex } from 'viem';
import type { BotContext } from '../bot';
import type { TradingEngine } from '../trading';
import type { DepositMonitor } from '../deposit-monitor';
import { USDC_DECIMALS } from '../constants';

// ---------------------------------------------------------------------------
// Alert header detection for source tracking
// ---------------------------------------------------------------------------

const ALERT_HEADERS = [
  'Whale Move',
  'Capitol Alert',
  'Big Mover',
  'New Market',
  'Risk/Reward Play',
  'Smart Money Consensus',
  'URGENT:',
];

/**
 * Detect whether the original message came from an alert.
 * If so, the trade source should be 'signal' instead of 'manual'.
 */
function detectTradeSource(ctx: BotContext): 'manual' | 'signal' {
  // Try to read the text of the message the callback button is on
  const messageText =
    (ctx.callbackQuery?.message as any)?.text ?? '';
  if (!messageText) return 'manual';

  for (const header of ALERT_HEADERS) {
    if (messageText.startsWith(header)) {
      return 'signal';
    }
  }
  return 'manual';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Regex to parse trade callback data.
 * Format: trade:SIDE:TOKEN_ID:CONDITION_ID:AMOUNT
 * Examples:
 *   trade:BUY:12345678901234567890:0xabc123:50
 *   trade:SELL:98765432109876543210:0xdef456:100
 */
const TRADE_CALLBACK_RE =
  /^trade:(BUY|SELL):([a-zA-Z0-9]+):([a-zA-Z0-9]+):(\d+(?:\.\d+)?)$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TradeCallbackDeps {
  tradingEngine: TradingEngine;
  depositMonitor: DepositMonitor;
}

interface ParsedTradeCallback {
  side: 'BUY' | 'SELL';
  tokenId: string;
  conditionId: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a trade callback data string.
 * Returns null if the format doesn't match.
 */
export function parseTradeCallback(data: string): ParsedTradeCallback | null {
  const match = data.match(TRADE_CALLBACK_RE);
  if (!match) return null;

  const side = match[1] as 'BUY' | 'SELL';
  const tokenId = match[2];
  const conditionId = match[3];
  const amount = parseFloat(match[4]);

  if (isNaN(amount) || amount <= 0) return null;

  return { side, tokenId, conditionId, amount };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Create the trade callback handler for inline button presses.
 *
 * Registered on the bot via:
 *   bot.on('callback_query:data', tradeCallbackHandler)
 *
 * Callback data format: trade:SIDE:TOKEN_ID:CONDITION_ID:AMOUNT
 */
export function createTradeCallbackHandler(deps: TradeCallbackDeps) {
  return async function tradeCallbackHandler(ctx: BotContext): Promise<void> {
    const data = ctx.callbackQuery?.data;
    if (!data) return;

    const parsed = parseTradeCallback(data);
    if (!parsed) return; // Not a trade callback; let other handlers try

    // Acknowledge the callback immediately to stop the loading spinner
    await ctx.answerCallbackQuery();

    const { side, tokenId, conditionId, amount } = parsed;

    // -- User check (ctx.user is loaded by bot middleware) -------------------
    const user = ctx.user;
    if (!user) {
      await editOrReply(ctx, 'You need to set up your wallet first. Type /start');
      return;
    }

    const telegramId = user.telegram_id;

    // -- Balance check ------------------------------------------------------
    try {
      const balanceRaw = await deps.depositMonitor.getUsdcBalance(
        user.safe_address as Hex,
      );
      const balanceUsdc = parseFloat(formatUnits(balanceRaw, USDC_DECIMALS));

      if (balanceUsdc < amount) {
        await editOrReply(
          ctx,
          `Insufficient balance. You have $${balanceUsdc.toFixed(2)} USDC but need $${amount.toFixed(2)}.\n\nDeposit USDC to: \`${user.safe_address}\``,
          'Markdown',
        );
        return;
      }
    } catch (error) {
      console.error(
        `[TradeCallback] Balance check failed for user ${telegramId}:`,
        error,
      );
      await editOrReply(
        ctx,
        'Could not check your balance. Please try again.',
      );
      return;
    }

    // -- Get current price --------------------------------------------------
    let currentPrice: number;
    try {
      currentPrice = await deps.tradingEngine.getCurrentPrice(tokenId);
    } catch (error) {
      console.error(
        `[TradeCallback] Price fetch failed for token ${tokenId}:`,
        error,
      );
      await editOrReply(ctx, 'Could not fetch current price. Please try again.');
      return;
    }

    // -- Detect source (signal vs manual) ------------------------------------
    const source = detectTradeSource(ctx);

    // -- Execute trade ------------------------------------------------------
    await editOrReply(ctx, `Placing ${side} order for $${amount.toFixed(2)}...`);

    try {
      const result = await deps.tradingEngine.executeTrade({
        user,
        tokenId,
        conditionId,
        side,
        amount,
        price: currentPrice,
        source,
      });

      if (result.success) {
        const shares = result.size.toFixed(2);
        const fee = result.feeAmount.toFixed(2);
        const priceStr = result.price.toFixed(2);
        const txLink = result.txHash
          ? `\n[View on Polygonscan](https://polygonscan.com/tx/${result.txHash})`
          : '';

        await editOrReply(
          ctx,
          `Trade executed!\n\n` +
            `${side} ${shares} shares @ $${priceStr}\n` +
            `Cost: $${(amount - result.feeAmount).toFixed(2)}\n` +
            `Fee: $${fee}\n` +
            `Order: ${result.orderId}${txLink}`,
          'Markdown',
        );
      } else {
        await editOrReply(
          ctx,
          `Trade failed. ${result.error ?? 'Check your balance -- a fee may have been charged.'}`,
        );
      }
    } catch (error) {
      console.error(
        `[TradeCallback] Trade execution failed for user ${telegramId}:`,
        error,
      );
      await editOrReply(
        ctx,
        'Trade failed. Check your balance -- a fee may have been charged.',
      );
    }
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Try to edit the original message. If that fails (e.g. message too old),
 * fall back to sending a new reply.
 */
async function editOrReply(
  ctx: BotContext,
  text: string,
  parseMode?: 'Markdown' | 'HTML',
): Promise<void> {
  try {
    await ctx.editMessageText(text, {
      parse_mode: parseMode,
    });
  } catch {
    await ctx.reply(text, {
      parse_mode: parseMode,
    });
  }
}
