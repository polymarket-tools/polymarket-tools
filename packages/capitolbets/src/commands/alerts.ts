import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../bot';
import { requireUser } from '../guards';
import type { AlertPreferences } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<keyof AlertPreferences, string> = {
  whales: 'Whale Moves',
  politics: 'Political Scanner',
  movers: 'Big Price Movers',
  new_markets: 'New Markets',
  risk_reward: 'Risk/Reward Plays',
  smart_money: 'Smart Money Consensus',
};

const CATEGORY_ORDER: (keyof AlertPreferences)[] = [
  'whales',
  'politics',
  'movers',
  'new_markets',
  'risk_reward',
  'smart_money',
];

// ---------------------------------------------------------------------------
// /alerts — show preference keyboard
// ---------------------------------------------------------------------------

export async function alertsCommand(ctx: BotContext): Promise<void> {
  if (!requireUser(ctx)) return;

  const keyboard = buildAlertToggleKeyboard(ctx.user.alert_preferences);
  await ctx.reply('Your alerts:\n\nTap to toggle.', {
    reply_markup: keyboard,
  });
}

// ---------------------------------------------------------------------------
// Keyboard builder (exported for callbacks)
// ---------------------------------------------------------------------------

export function buildAlertToggleKeyboard(
  prefs: AlertPreferences,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const category of CATEGORY_ORDER) {
    const enabled = prefs[category];
    const label = `${enabled ? '[V]' : '[ ]'} ${CATEGORY_LABELS[category]}`;
    kb.text(label, `alert_toggle:${category}`).row();
  }

  return kb;
}

export { CATEGORY_LABELS };
