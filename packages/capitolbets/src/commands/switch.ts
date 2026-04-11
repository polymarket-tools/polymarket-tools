import type { BotContext } from '../bot';
import { requireUser } from '../guards';

// ---------------------------------------------------------------------------
// /switch <competitor> — half-price fee match for 30 days
// ---------------------------------------------------------------------------

const VALID_COMPETITORS = ['polycop', 'kreo'];
const PROMO_FEE_RATE = 0.0025; // 0.25% (half the normal 0.5%)
const PROMO_DURATION_DAYS = 30;

export async function switchCommand(ctx: BotContext): Promise<void> {
  if (!requireUser(ctx)) return;

  const text = ctx.message?.text ?? '';
  const competitor = text.replace(/^\/switch\s*/, '').trim().toLowerCase();

  if (!competitor || !VALID_COMPETITORS.includes(competitor)) {
    await ctx.reply(
      `Usage: /switch <competitor>\n\nValid options: ${VALID_COMPETITORS.join(', ')}`,
    );
    return;
  }

  const userQueries = ctx.userQueries;
  if (!userQueries) {
    await ctx.reply('This feature is not available right now.');
    return;
  }

  // Check if user already has a promotional rate
  if (
    ctx.user.fee_rate < 0.005 &&
    ctx.user.fee_rate_expires &&
    new Date(ctx.user.fee_rate_expires) > new Date()
  ) {
    const expiresDate = new Date(ctx.user.fee_rate_expires).toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric', year: 'numeric' },
    );
    await ctx.reply(
      `You already have a promotional rate of ${(ctx.user.fee_rate * 100).toFixed(2)}% until ${expiresDate}.`,
    );
    return;
  }

  // Set promotional rate
  const expires = new Date();
  expires.setDate(expires.getDate() + PROMO_DURATION_DAYS);
  const expiresStr = expires.toISOString();

  userQueries.setFeeRate(ctx.user.telegram_id, PROMO_FEE_RATE, expiresStr);

  const competitorDisplay = competitor.charAt(0).toUpperCase() + competitor.slice(1);

  await ctx.reply(
    `Welcome from ${competitorDisplay}! Your fees are now 0.25% (half price) for the next 30 days.\n\n` +
      'Same copy trading, plus political intelligence signals they don\'t have.',
  );
}
