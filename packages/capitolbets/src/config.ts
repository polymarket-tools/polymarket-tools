export interface AppConfig {
  telegramBotToken: string;
  privyAppId: string;
  privyAppSecret: string;
  feeCollectionAddress: string;
  databasePath: string;
  builderSignerUrl: string;
  polygonRpcUrl: string;
  port: number;
  transakApiKey?: string;
  openaiApiKey?: string;
  adminTelegramId?: string;
  signalChannelId?: string;
  /** Shared secret for authenticating webhook requests from n8n */
  webhookSecret: string;
}

export function loadConfig(): AppConfig {
  const required = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    PRIVY_APP_ID: process.env.PRIVY_APP_ID,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    FEE_COLLECTION_ADDRESS: process.env.FEE_COLLECTION_ADDRESS,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return {
    telegramBotToken: required.TELEGRAM_BOT_TOKEN!,
    privyAppId: required.PRIVY_APP_ID!,
    privyAppSecret: required.PRIVY_APP_SECRET!,
    feeCollectionAddress: required.FEE_COLLECTION_ADDRESS!,
    databasePath: process.env.DATABASE_PATH ?? './data/capitolbets.db',
    builderSignerUrl:
      process.env.BUILDER_SIGNER_URL ??
      'https://polymarket-builder-signer.polymarket-tool.workers.dev',
    polygonRpcUrl: process.env.POLYGON_RPC_URL ?? 'https://polygon-rpc.com',
    port: parseInt(process.env.PORT ?? '3000', 10),
    transakApiKey: process.env.TRANSAK_API_KEY || undefined,
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    adminTelegramId: process.env.ADMIN_TELEGRAM_ID || undefined,
    signalChannelId: process.env.SIGNAL_CHANNEL_ID || undefined,
    webhookSecret: required.WEBHOOK_SECRET!,
  };
}
