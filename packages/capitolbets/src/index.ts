import express from 'express';
import { loadConfig } from './config';
import { createBot } from './bot';

async function main() {
  // -- Config -------------------------------------------------------------
  const config = loadConfig();

  // -- Database -----------------------------------------------------------
  // TODO: initialize Database and run migrations once db.ts lands (Task 1.2)
  const db = null;

  // -- Bot ----------------------------------------------------------------
  const bot = createBot(config, db);

  // -- Express (webhook endpoint + health) --------------------------------
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Webhook endpoint will be added in Task 2.3
  // app.post(`/bot${config.telegramBotToken}`, webhookCallback(bot, 'express'));

  const server = app.listen(config.port, () => {
    console.log(`CapitolBets server listening on port ${config.port}`);
  });

  // -- Start bot (long polling) -------------------------------------------
  console.log('Starting CapitolBets bot with long polling...');
  bot.start({
    onStart: () => console.log('Bot is running.'),
  });

  // -- Graceful shutdown --------------------------------------------------
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    bot.stop();
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
