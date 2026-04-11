import type { BotContext } from './bot';
import type { User } from './types';

/**
 * Type guard that checks if ctx.user is set.
 * Replies with a setup prompt if not. Use in command handlers:
 *
 *   if (!(await requireUser(ctx))) return;
 *   // ctx.user is now narrowed to User
 */
export async function requireUser(ctx: BotContext): Promise<boolean> {
  if (!ctx.user) {
    await ctx.reply('You need to set up your wallet first. Type /start');
    return false;
  }
  return true;
}
