import type { BotContext } from '../bot';
import type { UserQueries } from '../db-queries';
import type { AlertPreferences } from '../types';
import { buildAlertToggleKeyboard, CATEGORY_LABELS } from '../keyboards';

// ---------------------------------------------------------------------------
// Callback data pattern: alert_toggle:{category}
// ---------------------------------------------------------------------------

const ALERT_TOGGLE_RE = /^alert_toggle:(whales|politics|movers|new_markets|risk_reward|smart_money)$/;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function createAlertToggleCallbackHandler(userQueries: UserQueries) {
  return async function alertToggleCallback(ctx: BotContext): Promise<void> {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith('alert_toggle:')) return;

    if (!ctx.user) {
      await ctx.answerCallbackQuery({ text: 'Run /start first.' });
      return;
    }

    const match = data.match(ALERT_TOGGLE_RE);
    if (!match) return;

    const category = match[1] as keyof AlertPreferences;

    // Read current preferences
    const prefs = { ...ctx.user.alert_preferences };

    // Toggle
    prefs[category] = !prefs[category];
    const newState = prefs[category];

    // Save to DB
    userQueries.updateAlertPreferences(ctx.user.telegram_id, prefs);

    // Update ctx.user so subsequent reads in the same request are correct
    ctx.user.alert_preferences = prefs;

    // Rebuild keyboard with updated state
    const keyboard = buildAlertToggleKeyboard(prefs);
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
    } catch {
      // Message may be too old to edit
    }

    const label = CATEGORY_LABELS[category] ?? category;
    await ctx.answerCallbackQuery({
      text: `${label}: ${newState ? 'ON' : 'OFF'}`,
    });
  };
}
