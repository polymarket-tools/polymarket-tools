import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../bot';
import { requireUser } from '../guards';

// ---------------------------------------------------------------------------
// /digest — toggle daily P&L digest
// ---------------------------------------------------------------------------

export async function digestCommand(ctx: BotContext): Promise<void> {
  if (!requireUser(ctx)) return;

  const userQueries = ctx.userQueries;
  if (!userQueries) {
    await ctx.reply('This feature is not available right now.');
    return;
  }

  const currentlyEnabled = ctx.user.digest_enabled;
  const newState = !currentlyEnabled;

  userQueries.setDigestEnabled(ctx.user.telegram_id, newState);

  if (newState) {
    const keyboard = new InlineKeyboard().text(
      'Turn OFF',
      'digest_toggle:off',
    );
    await ctx.reply(
      'Daily P&L digest: ON\n\nYou\'ll receive a summary every morning at 9am ET.',
      { reply_markup: keyboard },
    );
  } else {
    const keyboard = new InlineKeyboard().text(
      'Turn ON',
      'digest_toggle:on',
    );
    await ctx.reply(
      'Daily P&L digest: OFF\n\nYou won\'t receive morning summaries.',
      { reply_markup: keyboard },
    );
  }
}
