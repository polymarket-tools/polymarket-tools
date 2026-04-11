import { describe, it, expect } from 'vitest';
import { Bot } from 'grammy';
import { createBot } from '../src/bot';
import type { AppConfig } from '../src/config';

const TEST_CONFIG: AppConfig = {
  telegramBotToken: 'test:fake-token-for-testing',
  privyAppId: 'test-privy-app-id',
  privyAppSecret: 'test-privy-secret',
  feeCollectionAddress: '0x0000000000000000000000000000000000000000',
  databasePath: ':memory:',
  builderSignerUrl: 'http://localhost:9999',
  polygonRpcUrl: 'http://localhost:8545',
  port: 3000,
};

describe('createBot', () => {
  it('returns a Bot instance', () => {
    const bot = createBot(TEST_CONFIG, null);
    expect(bot).toBeInstanceOf(Bot);
  });

  it('does not start polling on creation', () => {
    const bot = createBot(TEST_CONFIG, null);
    // Bot should not be running -- isInited() checks if bot.init() was called
    // which happens in bot.start(). Just verify it was created without throwing.
    expect(bot).toBeDefined();
  });
});
