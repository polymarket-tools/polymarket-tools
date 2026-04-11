import { Bot, Context } from 'grammy';
import type { AppConfig } from './config';
import type { User } from './types';
import type { Database } from './db';
import type { WalletManager } from './wallet';
import type { DepositMonitor } from './deposit-monitor';
import type { UserQueries, TradeQueries, CopyConfigQueries } from './db-queries';
import { startCommand } from './commands/start';
import { helpCommand } from './commands/help';
import { searchCommand } from './commands/search';
import { balanceCommand } from './commands/balance';
import { portfolioCommand } from './commands/portfolio';
import { withdrawCommand } from './commands/withdraw';
import { historyCommand } from './commands/history';
import { depositCommand } from './commands/deposit';
import { copyCommand, stopCommand, copiesCommand } from './commands/copy';
import { alertsCommand } from './commands/alerts';
import { switchCommand } from './commands/switch';
import { digestCommand } from './commands/digest';
import { requireUser } from './guards';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface BotContext extends Context {
  user: User | null;
  config: AppConfig;
  db: Database | null;
  walletManager: WalletManager | null;
  userQueries: UserQueries | null;
  depositMonitor: DepositMonitor | null;
  tradeQueries: TradeQueries | null;
  copyConfigQueries: CopyConfigQueries | null;
}

// ---------------------------------------------------------------------------
// Rate limiter (in-memory, per-user)
// ---------------------------------------------------------------------------

const MAX_MESSAGES_PER_MINUTE = 30;

interface RateEntry {
  timestamps: number[];
}

function createRateLimiter() {
  const entries = new Map<number, RateEntry>();

  return {
    check(userId: number): boolean {
      const now = Date.now();
      const windowStart = now - 60_000;

      let entry = entries.get(userId);
      if (!entry) {
        entry = { timestamps: [] };
        entries.set(userId, entry);
      }

      // Prune old timestamps
      entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

      if (entry.timestamps.length >= MAX_MESSAGES_PER_MINUTE) {
        return false; // rate limited
      }

      entry.timestamps.push(now);
      return true;
    },

    /** Periodic cleanup to prevent memory leaks from inactive users */
    cleanup() {
      const now = Date.now();
      const windowStart = now - 60_000;
      for (const [userId, entry] of entries) {
        entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
        if (entry.timestamps.length === 0) {
          entries.delete(userId);
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Bot factory
// ---------------------------------------------------------------------------

export interface BotDependencies {
  walletManager?: WalletManager | null;
  userQueries?: UserQueries | null;
  depositMonitor?: DepositMonitor | null;
  tradeQueries?: TradeQueries | null;
  copyConfigQueries?: CopyConfigQueries | null;
}

export function createBot(
  config: AppConfig,
  db: Database | null,
  deps: BotDependencies = {}
): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.telegramBotToken);
  const rateLimiter = createRateLimiter();

  // Periodic cleanup every 5 minutes
  const cleanupInterval = setInterval(() => rateLimiter.cleanup(), 5 * 60_000);
  cleanupInterval.unref?.(); // don't keep process alive

  // -- Middleware: attach config & db to context -------------------------
  bot.use(async (ctx, next) => {
    ctx.config = config;
    ctx.db = db;
    ctx.user = null;
    ctx.walletManager = deps.walletManager ?? null;
    ctx.userQueries = deps.userQueries ?? null;
    ctx.depositMonitor = deps.depositMonitor ?? null;
    ctx.tradeQueries = deps.tradeQueries ?? null;
    ctx.copyConfigQueries = deps.copyConfigQueries ?? null;
    await next();
  });

  // -- Middleware: error boundary -----------------------------------------
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`, err.error);
    ctx.reply('Something went wrong. Please try again.').catch(() => {
      // Swallow reply errors (e.g. user blocked bot)
    });
  });

  // -- Middleware: rate limiter -------------------------------------------
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId && !rateLimiter.check(userId)) {
      await ctx.reply('Slow down! You are sending too many messages.');
      return;
    }
    await next();
  });

  // -- Middleware: user loader --------------------------------------------
  bot.use(async (ctx, next) => {
    const telegramId = ctx.from?.id;
    if (telegramId && ctx.userQueries) {
      ctx.user = ctx.userQueries.getByTelegramId(telegramId) ?? null;
    }
    await next();
  });

  // -- Commands -----------------------------------------------------------
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  bot.command('search', searchCommand);
  bot.command('balance', balanceCommand);
  bot.command('portfolio', portfolioCommand);
  bot.command('withdraw', withdrawCommand);
  bot.command('history', historyCommand);
  bot.command('deposit', depositCommand);
  bot.command('copy', copyCommand);
  bot.command('stop', stopCommand);
  bot.command('copies', copiesCommand);
  bot.command('alerts', alertsCommand);
  bot.command('switch', switchCommand);
  bot.command('digest', digestCommand);

  // -- Callback queries --------------------------------------------------
  bot.callbackQuery('deposit:manual', async (ctx) => {
    if (!(await requireUser(ctx))) {
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `Send USDC (Polygon) to your deposit address:\n\n\`${ctx.user.safe_address}\`\n\nOnly send USDC on the Polygon network.`,
      { parse_mode: 'Markdown' }
    );
  });

  return bot;
}
