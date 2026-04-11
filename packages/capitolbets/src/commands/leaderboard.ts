import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../bot';
import { requireUser } from '../guards';
import type { LeaderboardService } from '../leaderboard';
import type { UserQueries } from '../db-queries';

// ---------------------------------------------------------------------------
// /leaderboard — show top 10 traders
// ---------------------------------------------------------------------------

export function createLeaderboardCommand(deps: {
  leaderboardService: LeaderboardService;
  userQueries: UserQueries;
}) {
  return async function leaderboardCommand(ctx: BotContext): Promise<void> {
    if (!requireUser(ctx)) return;

    const top = deps.leaderboardService.getTop('7d', 10);

    if (top.length === 0) {
      await ctx.reply('No leaderboard data yet. Start trading to appear here!');
      return;
    }

    let text = 'CapitolBets Top Traders (7 days):\n';

    const keyboard = new InlineKeyboard();

    for (let i = 0; i < top.length; i++) {
      const entry = top[i];
      const pnlStr = entry.pnl >= 0 ? `+$${entry.pnl.toFixed(0)}` : `-$${Math.abs(entry.pnl).toFixed(0)}`;
      const winStr = `${Math.round(entry.win_rate * 100)}%`;

      const user = deps.userQueries.getByTelegramId(entry.user_telegram_id);
      const displayName = `Trader #${entry.user_telegram_id}`;

      text += `\n${i + 1}. ${displayName}   ${pnlStr}   ${winStr} win rate`;

      // Add Copy button for each leader
      if (user) {
        keyboard.text(
          `Copy #${i + 1}`,
          `copy_leader:${entry.user_telegram_id}:${user.safe_address}`,
        );
        if ((i + 1) % 2 === 0) keyboard.row();
      }
    }

    if (keyboard.inline_keyboard.length > 0) {
      await ctx.reply(text, { reply_markup: keyboard });
    } else {
      await ctx.reply(text);
    }
  };
}
