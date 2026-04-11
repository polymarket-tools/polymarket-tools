import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../bot';
import { requireUser } from '../guards';
import { formatWallet } from '../format';
import { buildConfigKeyboard } from '../keyboards';

// ---------------------------------------------------------------------------
// /copy 0xWALLET — start or view copy config
// ---------------------------------------------------------------------------

export async function copyCommand(ctx: BotContext): Promise<void> {
  if (!(await requireUser(ctx))) return;

  const text = ctx.message?.text ?? '';
  const wallet = text.replace(/^\/copy\s*/, '').trim();

  if (!wallet || !wallet.startsWith('0x')) {
    await ctx.reply('Usage: /copy 0xWALLET_ADDRESS');
    return;
  }

  const copyConfigQueries = ctx.copyConfigQueries;
  if (!copyConfigQueries) {
    await ctx.reply('Copy trading is not available right now.');
    return;
  }

  // Check if already copying this wallet
  const existing = copyConfigQueries.getByUserAndWallet(
    ctx.user.telegram_id,
    wallet,
  );

  if (existing && existing.active) {
    const keyboard = new InlineKeyboard()
      .text('Edit', `copy_edit:${existing.id}`)
      .text('Stop', `copy_stop:${existing.id}`);

    await ctx.reply(
      `You are already copying ${formatWallet(wallet)}.\n` +
        `Sizing: ${formatSizing(existing.sizing_mode, existing.sizing_value)} | ` +
        `Direction: ${formatDirection(existing.direction)} | ` +
        `Max: ${existing.max_per_trade ? `$${existing.max_per_trade}` : 'No limit'}`,
      { reply_markup: keyboard },
    );
    return;
  }

  // Create a new inactive config with defaults
  const configId = copyConfigQueries.create({
    user_telegram_id: ctx.user.telegram_id,
    target_wallet: wallet,
    sizing_mode: 'percent',
    sizing_value: 25,
    direction: 'all',
    max_per_trade: null,
    smart_copy_enabled: false,
    smart_copy_min_confidence: 0.7,
    smart_copy_categories: null,
  });

  // Deactivate immediately -- it will be activated when user presses Start
  copyConfigQueries.deactivate(configId);

  const keyboard = buildConfigKeyboard(configId, 'percent', 25, 'all', null);

  await ctx.reply(
    `Copy trading: ${formatWallet(wallet)}\n\nConfigure your copy settings:`,
    { reply_markup: keyboard },
  );
}

// ---------------------------------------------------------------------------
// /stop 0xWALLET — deactivate copy config
// ---------------------------------------------------------------------------

export async function stopCommand(ctx: BotContext): Promise<void> {
  if (!(await requireUser(ctx))) return;

  const text = ctx.message?.text ?? '';
  const wallet = text.replace(/^\/stop\s*/, '').trim();

  if (!wallet || !wallet.startsWith('0x')) {
    await ctx.reply('Usage: /stop 0xWALLET_ADDRESS');
    return;
  }

  const copyConfigQueries = ctx.copyConfigQueries;
  if (!copyConfigQueries) {
    await ctx.reply('Copy trading is not available right now.');
    return;
  }

  const config = copyConfigQueries.getByUserAndWallet(
    ctx.user.telegram_id,
    wallet,
  );

  if (!config || !config.active) {
    await ctx.reply(`You are not copying ${formatWallet(wallet)}.`);
    return;
  }

  copyConfigQueries.deactivate(config.id);
  await ctx.reply(`Stopped copying ${formatWallet(wallet)}.`);
}

// ---------------------------------------------------------------------------
// /copies — list active copy configs
// ---------------------------------------------------------------------------

export async function copiesCommand(ctx: BotContext): Promise<void> {
  if (!(await requireUser(ctx))) return;

  const copyConfigQueries = ctx.copyConfigQueries;
  if (!copyConfigQueries) {
    await ctx.reply('Copy trading is not available right now.');
    return;
  }

  const configs = copyConfigQueries.getActiveByUser(ctx.user.telegram_id);

  if (configs.length === 0) {
    await ctx.reply('You have no active copy configs.\n\nUse /copy 0xWALLET to start copying a trader.');
    return;
  }

  let text = 'Your copy configs:\n';

  for (let i = 0; i < configs.length; i++) {
    const c = configs[i];
    text += `\n${i + 1}. ${formatWallet(c.target_wallet)}\n`;
    text += `   Sizing: ${formatSizing(c.sizing_mode, c.sizing_value)}`;
    text += ` | Direction: ${formatDirection(c.direction)}`;
    text += ` | Max: ${c.max_per_trade ? `$${c.max_per_trade}` : 'No limit'}\n`;
  }

  // Build keyboard with Stop buttons for each config
  const keyboard = new InlineKeyboard();
  for (const c of configs) {
    keyboard
      .text(`Edit ${formatWallet(c.target_wallet)}`, `copy_edit:${c.id}`)
      .text(`Stop ${formatWallet(c.target_wallet)}`, `copy_stop:${c.id}`)
      .row();
  }

  await ctx.reply(text, { reply_markup: keyboard });
}

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------

export { formatWallet } from '../format';
export { buildConfigKeyboard } from '../keyboards';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatSizing(mode: string, value: number): string {
  switch (mode) {
    case 'percent':
      return `${value}% of balance`;
    case 'fixed':
      return `$${value} fixed`;
    case 'mirror':
      return 'Mirror exact';
    default:
      return `${mode}:${value}`;
  }
}

export function formatDirection(direction: string): string {
  switch (direction) {
    case 'all':
      return 'All';
    case 'buys_only':
      return 'Buys only';
    case 'sells_only':
      return 'Sells only';
    default:
      return direction;
  }
}
