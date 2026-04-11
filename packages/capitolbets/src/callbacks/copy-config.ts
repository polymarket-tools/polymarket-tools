import type { BotContext } from '../bot';
import type { CopyConfigQueries } from '../db-queries';
import { buildConfigKeyboard, formatWallet, formatSizing, formatDirection } from '../commands/copy';

// ---------------------------------------------------------------------------
// Callback data patterns
// ---------------------------------------------------------------------------
//
// copy_sizing:{configId}:percent:25
// copy_sizing:{configId}:fixed:100
// copy_sizing:{configId}:mirror:0
// copy_dir:{configId}:all
// copy_dir:{configId}:buys_only
// copy_dir:{configId}:sells_only
// copy_max:{configId}:50
// copy_max:{configId}:100
// copy_max:{configId}:250
// copy_max:{configId}:0        (no limit)
// copy_start:{configId}
// copy_cancel:{configId}
// copy_stop:{configId}
// copy_edit:{configId}

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

const SIZING_RE = /^copy_sizing:(\d+):(percent|fixed|mirror):(\d+)$/;
const DIR_RE = /^copy_dir:(\d+):(all|buys_only|sells_only)$/;
const MAX_RE = /^copy_max:(\d+):(\d+)$/;
const START_RE = /^copy_start:(\d+)$/;
const CANCEL_RE = /^copy_cancel:(\d+)$/;
const STOP_RE = /^copy_stop:(\d+)$/;
const EDIT_RE = /^copy_edit:(\d+)$/;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function createCopyConfigCallbackHandler(copyConfigQueries: CopyConfigQueries) {
  return async function copyConfigCallback(ctx: BotContext): Promise<void> {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith('copy_')) return;

    // All copy callbacks require a user
    if (!ctx.user) {
      await ctx.answerCallbackQuery({ text: 'Run /start first.' });
      return;
    }

    // -- Sizing ---------------------------------------------------------------
    let match = data.match(SIZING_RE);
    if (match) {
      const configId = parseInt(match[1], 10);
      const mode = match[2] as 'percent' | 'fixed' | 'mirror';
      const value = parseInt(match[3], 10);

      copyConfigQueries.updateSizing(configId, mode, value);
      const config = copyConfigQueries.getById(configId);
      if (config) {
        const keyboard = buildConfigKeyboard(
          configId,
          mode,
          value,
          config.direction,
          config.max_per_trade,
        );
        await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      }
      await ctx.answerCallbackQuery({ text: `Sizing: ${formatSizing(mode, value)}` });
      return;
    }

    // -- Direction -------------------------------------------------------------
    match = data.match(DIR_RE);
    if (match) {
      const configId = parseInt(match[1], 10);
      const direction = match[2] as 'all' | 'buys_only' | 'sells_only';

      copyConfigQueries.updateDirection(configId, direction);
      const config = copyConfigQueries.getById(configId);
      if (config) {
        const keyboard = buildConfigKeyboard(
          configId,
          config.sizing_mode,
          config.sizing_value,
          direction,
          config.max_per_trade,
        );
        await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      }
      await ctx.answerCallbackQuery({ text: `Direction: ${formatDirection(direction)}` });
      return;
    }

    // -- Max per trade --------------------------------------------------------
    match = data.match(MAX_RE);
    if (match) {
      const configId = parseInt(match[1], 10);
      const maxValue = parseInt(match[2], 10);
      const max = maxValue === 0 ? null : maxValue;

      copyConfigQueries.updateMaxPerTrade(configId, max);
      const config = copyConfigQueries.getById(configId);
      if (config) {
        const keyboard = buildConfigKeyboard(
          configId,
          config.sizing_mode,
          config.sizing_value,
          config.direction,
          max,
        );
        await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      }
      await ctx.answerCallbackQuery({
        text: max ? `Max: $${max}` : 'Max: No limit',
      });
      return;
    }

    // -- Start copying --------------------------------------------------------
    match = data.match(START_RE);
    if (match) {
      const configId = parseInt(match[1], 10);
      copyConfigQueries.activate(configId);
      const config = copyConfigQueries.getById(configId);
      const walletStr = config ? formatWallet(config.target_wallet) : `config #${configId}`;

      await ctx.editMessageText(
        `Now copying ${walletStr}.\n` +
          (config
            ? `Sizing: ${formatSizing(config.sizing_mode, config.sizing_value)} | ` +
              `Direction: ${formatDirection(config.direction)} | ` +
              `Max: ${config.max_per_trade ? `$${config.max_per_trade}` : 'No limit'}`
            : ''),
      );
      await ctx.answerCallbackQuery({ text: 'Copy trading started!' });
      return;
    }

    // -- Cancel ---------------------------------------------------------------
    match = data.match(CANCEL_RE);
    if (match) {
      const configId = parseInt(match[1], 10);
      copyConfigQueries.deactivate(configId);
      await ctx.editMessageText('Copy trading setup cancelled.');
      await ctx.answerCallbackQuery({ text: 'Cancelled' });
      return;
    }

    // -- Stop -----------------------------------------------------------------
    match = data.match(STOP_RE);
    if (match) {
      const configId = parseInt(match[1], 10);
      const config = copyConfigQueries.getById(configId);
      copyConfigQueries.deactivate(configId);
      const walletStr = config ? formatWallet(config.target_wallet) : `config #${configId}`;
      await ctx.editMessageText(`Stopped copying ${walletStr}.`);
      await ctx.answerCallbackQuery({ text: 'Stopped' });
      return;
    }

    // -- Edit -----------------------------------------------------------------
    match = data.match(EDIT_RE);
    if (match) {
      const configId = parseInt(match[1], 10);
      const config = copyConfigQueries.getById(configId);
      if (!config) {
        await ctx.answerCallbackQuery({ text: 'Config not found.' });
        return;
      }
      const keyboard = buildConfigKeyboard(
        configId,
        config.sizing_mode,
        config.sizing_value,
        config.direction,
        config.max_per_trade,
      );
      await ctx.editMessageText(
        `Edit copy config: ${formatWallet(config.target_wallet)}`,
      );
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery();
      return;
    }
  };
}
