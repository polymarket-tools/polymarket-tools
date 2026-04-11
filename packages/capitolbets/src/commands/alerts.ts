import type { BotContext } from '../bot';
import { requireUser } from '../guards';
import { buildAlertToggleKeyboard, CATEGORY_LABELS } from '../keyboards';

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------

export { buildAlertToggleKeyboard, CATEGORY_LABELS } from '../keyboards';

// ---------------------------------------------------------------------------
// /alerts — show preference keyboard
// ---------------------------------------------------------------------------

export async function alertsCommand(ctx: BotContext): Promise<void> {
  if (!(await requireUser(ctx))) return;

  const keyboard = buildAlertToggleKeyboard(ctx.user.alert_preferences);
  await ctx.reply('Your alerts:\n\nTap to toggle.', {
    reply_markup: keyboard,
  });
}
