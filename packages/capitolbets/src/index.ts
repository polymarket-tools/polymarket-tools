import express from 'express';
import pino from 'pino';
import { loadConfig } from './config';
import { createBot } from './bot';

const VERSION = '1.0.0';
const startTime = Date.now();

async function main() {
  // -- Config -------------------------------------------------------------
  const config = loadConfig();

  // -- Logger -------------------------------------------------------------
  const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    ...(process.env.NODE_ENV !== 'production' && {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    }),
  });

  logger.info(
    { port: config.port, databasePath: config.databasePath, version: VERSION },
    'CapitolBets starting'
  );

  // -- Database -----------------------------------------------------------
  // TODO: initialize Database and run migrations once db.ts lands (Task 1.2)
  const db = null;

  // -- Bot ----------------------------------------------------------------
  const bot = createBot(config, db);

  // -- Express (webhook endpoint + health) --------------------------------
  const app = express();
  app.use(express.json());

  // Request logging
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, url: req.url }, 'request');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: VERSION,
    });
  });

  // Webhook endpoint will be added in Task 2.3
  // app.post(`/bot${config.telegramBotToken}`, webhookCallback(bot, 'express'));

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server listening');
  });

  // -- Start bot (long polling) -------------------------------------------
  logger.info('Starting CapitolBets bot with long polling...');
  bot.start({
    onStart: () => logger.info('Bot connected and running'),
  });

  // -- Error alerting -----------------------------------------------------
  const alertAdmin = async (error: Error, context: string) => {
    logger.fatal({ err: error, context }, 'Unhandled error');
    if (config.adminTelegramId) {
      try {
        await bot.api.sendMessage(
          config.adminTelegramId,
          `[CapitolBets ALERT] ${context}\n\n${error.message}`
        );
      } catch (alertErr) {
        logger.error({ err: alertErr }, 'Failed to send admin alert');
      }
    }
  };

  process.on('unhandledRejection', (reason) => {
    const error =
      reason instanceof Error ? reason : new Error(String(reason));
    alertAdmin(error, 'unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    alertAdmin(error, 'uncaughtException').finally(() => {
      process.exit(1);
    });
  });

  // -- Graceful shutdown --------------------------------------------------
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    bot.stop();
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // Logger may not be initialized yet, fall back to console
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
