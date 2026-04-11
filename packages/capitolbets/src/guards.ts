import type { BotContext } from './bot';
import type { User } from './types';

/**
 * Type guard that checks if ctx.user is set.
 * Replies with a setup prompt if not. Use in command handlers:
 *
 *   if (!requireUser(ctx)) return;
 *   // ctx.user is now narrowed to User
 */
export function requireUser(ctx: BotContext): ctx is BotContext & { user: User } {
  if (!ctx.user) {
    ctx.reply('You need to set up your wallet first. Type /start');
    return false;
  }
  return true;
}
