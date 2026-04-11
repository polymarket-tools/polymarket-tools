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
// smart_copy_toggle:{configId}
// smart_conf:{configId}:60
// smart_conf:{configId}:70
// smart_conf:{configId}:80
// smart_conf:{configId}:90
// smart_cat:{configId}:all
// smart_cat:{configId}:politics
// smart_cat:{configId}:crypto
// smart_cat:{configId}:sports

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
const SMART_TOGGLE_RE = /^smart_copy_toggle:(\d+)$/;
const SMART_CONF_RE = /^smart_conf:(\d+):(\d+)$/;
const SMART_CAT_RE = /^smart_cat:(\d+):(all|politics|crypto|sports)$/;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function createCopyConfigCallbackHandler(copyConfigQueries: CopyConfigQueries) {
  /** Verify the config exists and belongs to the current user. */
  async function verifyOwnership(
    ctx: BotContext,
    configId: number,
  ): Promise<ReturnType<CopyConfigQueries['getById']>> {
    const config = copyConfigQueries.getById(configId);
    if (!config) {
      await ctx.answerCallbackQuery({ text: 'Config not found.' });
      return undefined;
    }
    if (config.user_telegram_id !== ctx.user!.telegram_id) {
      await ctx.answerCallbackQuery({ text: 'Not your config.' });
      return undefined;
    }
    return config;
  }

  return async function copyConfigCallback(ctx: BotContext): Promise<void> {
    const data = ctx.callbackQuery?.data;
    if (!data || !(data.startsWith('copy_') || data.startsWith('smart_'))) return;

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

      const config = await verifyOwnership(ctx, configId);
      if (!config) return;

      copyConfigQueries.updateSizing(configId, mode, value);
      const keyboard = buildConfigKeyboard(
        configId,
        mode,
        value,
        config.direction,
        config.max_per_trade,
        config.smart_copy_enabled,
        config.smart_copy_min_confidence,
        config.smart_copy_categories,
      );
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery({ text: `Sizing: ${formatSizing(mode, value)}` });
      return;
    }

    // -- Direction -------------------------------------------------------------
    match = data.match(DIR_RE);
    if (match) {
      const configId = parseInt(match[1], 10);
      const direction = match[2] as 'all' | 'buys_only' | 'sells_only';

      const config = await verifyOwnership(ctx, configId);
      if (!config) return;

      copyConfigQueries.updateDirection(configId, direction);
      const keyboard = buildConfigKeyboard(
        configId,
        config.sizing_mode,
        config.sizing_value,
        direction,
        config.max_per_trade,
        config.smart_copy_enabled,
        config.smart_copy_min_confidence,
        config.smart_copy_categories,
      );
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery({ text: `Direction: ${formatDirection(direction)}` });
      return;
    }

    // -- Max per trade --------------------------------------------------------
    match = data.match(MAX_RE);
    if (match) {
      const configId = parseInt(match[1], 10);
      const maxValue = parseInt(match[2], 10);
      const max = maxValue === 0 ? null : maxValue;

      const config = await verifyOwnership(ctx, configId);
      if (!config) return;

      copyConfigQueries.updateMaxPerTrade(configId, max);
      const keyboard = buildConfigKeyboard(
        configId,
        config.sizing_mode,
        config.sizing_value,
        config.direction,
        max,
        config.smart_copy_enabled,
        config.smart_copy_min_confidence,
        config.smart_copy_categories,
      );
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery({
        text: max ? `Max: $${max}` : 'Max: No limit',
      });
      return;
    }

    // -- Start copying --------------------------------------------------------
    match = data.match(START_RE);
    if (match) {
      const configId = parseInt(match[1], 10);

      const config = await verifyOwnership(ctx, configId);
      if (!config) return;

      copyConfigQueries.activate(configId);
      const walletStr = formatWallet(config.target_wallet);

      await ctx.editMessageText(
        `Now copying ${walletStr}.\n` +
          `Sizing: ${formatSizing(config.sizing_mode, config.sizing_value)} | ` +
          `Direction: ${formatDirection(config.direction)} | ` +
          `Max: ${config.max_per_trade ? `$${config.max_per_trade}` : 'No limit'}`,
      );
      await ctx.answerCallbackQuery({ text: 'Copy trading started!' });
      return;
    }

    // -- Cancel ---------------------------------------------------------------
    match = data.match(CANCEL_RE);
    if (match) {
      const configId = parseInt(match[1], 10);

      const config = await verifyOwnership(ctx, configId);
      if (!config) return;

      copyConfigQueries.deactivate(configId);
      await ctx.editMessageText('Copy trading setup cancelled.');
      await ctx.answerCallbackQuery({ text: 'Cancelled' });
      return;
    }

    // -- Stop -----------------------------------------------------------------
    match = data.match(STOP_RE);
    if (match) {
      const configId = parseInt(match[1], 10);

      const config = await verifyOwnership(ctx, configId);
      if (!config) return;

      copyConfigQueries.deactivate(configId);
      const walletStr = formatWallet(config.target_wallet);
      await ctx.editMessageText(`Stopped copying ${walletStr}.`);
      await ctx.answerCallbackQuery({ text: 'Stopped' });
      return;
    }

    // -- Edit -----------------------------------------------------------------
    match = data.match(EDIT_RE);
    if (match) {
      const configId = parseInt(match[1], 10);

      const config = await verifyOwnership(ctx, configId);
      if (!config) return;

      const keyboard = buildConfigKeyboard(
        configId,
        config.sizing_mode,
        config.sizing_value,
        config.direction,
        config.max_per_trade,
        config.smart_copy_enabled,
        config.smart_copy_min_confidence,
        config.smart_copy_categories,
      );
      await ctx.editMessageText(
        `Edit copy config: ${formatWallet(config.target_wallet)}`,
        { reply_markup: keyboard },
      );
      await ctx.answerCallbackQuery();
      return;
    }

    // -- Smart Copy Toggle ---------------------------------------------------
    match = data.match(SMART_TOGGLE_RE);
    if (match) {
      const configId = parseInt(match[1], 10);

      const config = await verifyOwnership(ctx, configId);
      if (!config) return;

      const newEnabled = !config.smart_copy_enabled;
      copyConfigQueries.updateSmartCopyEnabled(configId, newEnabled);

      const keyboard = buildConfigKeyboard(
        configId,
        config.sizing_mode,
        config.sizing_value,
        config.direction,
        config.max_per_trade,
        newEnabled,
        config.smart_copy_min_confidence,
        config.smart_copy_categories,
      );
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery({
        text: `Smart Copy: ${newEnabled ? 'ON' : 'OFF'}`,
      });
      return;
    }

    // -- Smart Copy Min Confidence -------------------------------------------
    match = data.match(SMART_CONF_RE);
    if (match) {
      const configId = parseInt(match[1], 10);
      const confidencePct = parseInt(match[2], 10);
      const confidence = confidencePct / 100; // store as 0-1

      const config = await verifyOwnership(ctx, configId);
      if (!config) return;

      copyConfigQueries.updateSmartCopyMinConfidence(configId, confidence);

      const keyboard = buildConfigKeyboard(
        configId,
        config.sizing_mode,
        config.sizing_value,
        config.direction,
        config.max_per_trade,
        config.smart_copy_enabled,
        confidence,
        config.smart_copy_categories,
      );
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery({ text: `Min confidence: ${confidencePct}%` });
      return;
    }

    // -- Smart Copy Categories -----------------------------------------------
    match = data.match(SMART_CAT_RE);
    if (match) {
      const configId = parseInt(match[1], 10);
      const catValue = match[2]; // 'all', 'politics', 'crypto', 'sports'

      const config = await verifyOwnership(ctx, configId);
      if (!config) return;

      const categories = catValue === 'all' ? null : [catValue];
      copyConfigQueries.updateSmartCopyCategories(configId, categories);

      const keyboard = buildConfigKeyboard(
        configId,
        config.sizing_mode,
        config.sizing_value,
        config.direction,
        config.max_per_trade,
        config.smart_copy_enabled,
        config.smart_copy_min_confidence,
        categories,
      );
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery({
        text: `Categories: ${catValue === 'all' ? 'All' : catValue.charAt(0).toUpperCase() + catValue.slice(1)}`,
      });
      return;
    }
  };
}
