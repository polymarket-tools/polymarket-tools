import type { BotContext } from '../bot';
import { requireUser } from '../guards';
import type { ReferralService } from '../referrals';

// ---------------------------------------------------------------------------
// /referrals — show referral earnings and share link
// ---------------------------------------------------------------------------

export function createReferralsCommand(referralService: ReferralService) {
  return async function referralsCommand(ctx: BotContext): Promise<void> {
    if (!requireUser(ctx)) return;

    const stats = referralService.getReferralStats(ctx.user.telegram_id);

    const text =
      `Your referral stats:\n\n` +
      `Referred: ${stats.referralCount} trader${stats.referralCount !== 1 ? 's' : ''}\n` +
      `Earnings this week: $${stats.weeklyEarnings.toFixed(2)}\n` +
      `Total earned: $${stats.totalEarnings.toFixed(2)}\n\n` +
      `Your link: ${stats.referralLink}\n\n` +
      `Share and earn 25% of your referrals' trading fees.`;

    await ctx.reply(text);
  };
}
