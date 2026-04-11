import type { BotContext } from '../bot';
import type { Trade } from '../types';
import { requireUser } from '../guards';

/**
 * Format a timestamp as a relative time string: "2h ago", "1d ago", etc.
 */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (isNaN(diffMs) || diffMs < 0) return dateStr;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatTrade(trade: Trade): string {
  const cost = (trade.price * trade.size).toFixed(2);
  const fee = trade.fee_amount.toFixed(2);
  const time = formatRelativeTime(trade.created_at);
  const marketId = trade.market_condition_id.slice(0, 8);

  return `${trade.side} | ${marketId}... | $${cost} at $${trade.price.toFixed(2)} | Fee: $${fee} | ${time}`;
}

export async function historyCommand(ctx: BotContext): Promise<void> {
  if (!(await requireUser(ctx))) return;

  if (!ctx.tradeQueries) {
    await ctx.reply('Trade history is temporarily unavailable. Please try again later.');
    return;
  }

  try {
    const trades = ctx.tradeQueries.getByUser(ctx.user.telegram_id, 10);

    if (trades.length === 0) {
      await ctx.reply('No trades yet.');
      return;
    }

    const lines = trades.map(formatTrade);
    await ctx.reply(`Recent trades:\n\n${lines.join('\n')}`);
  } catch (error) {
    console.error(`History fetch failed for telegram_id=${ctx.user.telegram_id}:`, error);
    await ctx.reply('Could not fetch your trade history. Please try again.');
  }
}
