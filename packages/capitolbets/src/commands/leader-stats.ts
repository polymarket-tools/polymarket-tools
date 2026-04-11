import type { BotContext } from '../bot';
import { requireUser } from '../guards';
import type { LeaderboardService } from '../leaderboard';

// ---------------------------------------------------------------------------
// /leader-stats — show copy leader earnings and stats
// ---------------------------------------------------------------------------

export function createLeaderStatsCommand(leaderboardService: LeaderboardService) {
  return async function leaderStatsCommand(ctx: BotContext): Promise<void> {
    if (!(await requireUser(ctx))) return;

    const stats = leaderboardService.getLeaderStats(ctx.user.telegram_id);

    const copyLink = `t.me/CapitolBetsBot?start=copy_${ctx.user.telegram_id}`;

    const text =
      `Your copy leader stats:\n\n` +
      `Copiers: ${stats.copierCount} active\n` +
      `Fees earned this week: $${stats.weeklyEarnings.toFixed(2)}\n` +
      `Total earned: $${stats.totalEarnings.toFixed(2)}\n\n` +
      `Your share link: ${copyLink}`;

    await ctx.reply(text);
  };
}
