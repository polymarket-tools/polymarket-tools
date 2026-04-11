import { Bot, Context } from 'grammy';
import type { AppConfig } from './config';
import type { User } from './types';
import { startCommand } from './commands/start';
import { helpCommand } from './commands/help';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface BotContext extends Context {
  user: User | null;
  config: AppConfig;
  // db will be typed properly once db.ts lands (Task 1.2)
  db: unknown;
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

export function createBot(config: AppConfig, db: unknown): Bot<BotContext> {
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
    if (telegramId) {
      // TODO: look up user from DB once db-queries.ts lands (Task 1.2)
      // ctx.user = db.getUserByTelegramId(telegramId) ?? null;
      ctx.user = null;
    }
    await next();
  });

  // -- Commands -----------------------------------------------------------
  bot.command('start', startCommand);
  bot.command('help', helpCommand);

  return bot;
}
