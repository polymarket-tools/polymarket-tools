import express from 'express';
import pino from 'pino';
import { DataApiClient } from '@polymarket-tools/core';
import { loadConfig } from './config';
import { Database } from './db';
import { UserQueries, TradeQueries, CopyConfigQueries, AlertSentQueries } from './db-queries';
import { createBot } from './bot';
import { AlertRouter } from './alerts';
import { DepositMonitor } from './deposit-monitor';
import { WalletManager } from './wallet';

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
  const db = new Database(config.databasePath);
  db.migrate();
  logger.info('Database initialized and migrated');

  // -- Query objects ------------------------------------------------------
  const userQueries = new UserQueries(db);
  const tradeQueries = new TradeQueries(db);
  const copyConfigQueries = new CopyConfigQueries(db);
  const alertSentQueries = new AlertSentQueries(db);

  // -- Wallet Manager -----------------------------------------------------
  const walletManager = new WalletManager({
    privyAppId: config.privyAppId,
    privyAppSecret: config.privyAppSecret,
    polygonRpcUrl: config.polygonRpcUrl,
  });

  // -- Deposit Monitor ----------------------------------------------------
  const notifyViaTelegram = async (telegramId: number, message: string) => {
    try {
      await bot.api.sendMessage(telegramId, message);
    } catch (err) {
      logger.error({ err, telegramId }, 'Failed to send Telegram notification');
    }
  };

  const depositMonitor = new DepositMonitor(
    notifyViaTelegram,
    db,
    config.polygonRpcUrl,
  );

  // -- Bot ----------------------------------------------------------------
  const bot = createBot(config, db, {
    walletManager,
    userQueries,
    depositMonitor,
    tradeQueries,
    copyConfigQueries,
  });

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

  // -- Alert Router -------------------------------------------------------
  const alertRouter = new AlertRouter({
    alertSentQueries,
    userQueries,
    sendMessage: async (telegramId, text, options) => {
      await bot.api.sendMessage(telegramId, text, {
        reply_markup: options?.reply_markup,
        disable_notification: options?.disable_notification,
      });
    },
    postToChannel: config.signalChannelId
      ? async (channelId, text) => {
          await bot.api.sendMessage(channelId, text);
        }
      : undefined,
    signalChannelId: config.signalChannelId,
    rawDb: db.raw,
  });
  alertRouter.registerRoutes(app);

  // -- Deposit Monitor start ----------------------------------------------
  depositMonitor.start().catch((err) => {
    logger.error({ err }, 'DepositMonitor failed to start');
  });

  // Transak fiat on-ramp webhook (POST /api/transak/webhook)
  // TODO: When Transak is configured (TRANSAK_WEBHOOK_SECRET env var),
  // create TransakWebhookHandler and call transakHandler.registerRoutes(app).

  // Daily P&L digest scheduler
  // TODO: When digest scheduling env vars are confirmed, create DigestScheduler
  // and call digestScheduler.start(). Requires DataApiClient to be configured.
  // import { DigestScheduler } from './digest';
  // const dataApi = new DataApiClient();
  // const digestScheduler = new DigestScheduler({ userQueries, tradeQueries, copyConfigQueries, dataApi, notify: notifyViaTelegram });
  // digestScheduler.start();

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
    depositMonitor.stop();
    server.close(() => {
      logger.info('HTTP server closed');
      db.close();
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
